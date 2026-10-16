import fs from 'fs';
import path from 'path';
import { getR2Config, getR2ObjectText, putR2Object } from '../lib/r2-helper.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};

const R2_STORE_KEY = 'comments/comments_store.json';
const LOCAL_STORE_PATH = path.join(process.cwd(), 'data', 'comments.json');

let _storeCache = null;
let _storeCacheTime = 0;
const CACHE_TTL_MS = 15000; // 15s in-memory cache

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

async function loadStore() {
  const now = Date.now();
  if (_storeCache && (now - _storeCacheTime < CACHE_TTL_MS)) {
    return _storeCache;
  }

  let store = {};

  // 1. Try local filesystem fallback
  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      const localRaw = fs.readFileSync(LOCAL_STORE_PATH, 'utf8');
      if (localRaw) Object.assign(store, JSON.parse(localRaw));
    }
  } catch (_) {}

  // 2. Fetch from Cloudflare R2 if configured
  try {
    const r2Config = getR2Config();
    if (r2Config.isConfigured) {
      const r2Text = await getR2ObjectText(R2_STORE_KEY);
      if (r2Text) {
        const r2Data = JSON.parse(r2Text);
        Object.assign(store, r2Data);
      }
    }
  } catch (err) {
    console.warn('[comments-api] R2 load error:', err.message);
  }

  _storeCache = store;
  _storeCacheTime = now;
  return store;
}

async function persistStore(store) {
  _storeCache = store;
  _storeCacheTime = Date.now();

  const jsonStr = JSON.stringify(store);

  // 1. Write local filesystem if writable
  try {
    const dir = path.dirname(LOCAL_STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (_) {}

  // 2. Write to Cloudflare R2
  try {
    const r2Config = getR2Config();
    if (r2Config.isConfigured) {
      await putR2Object({
        key: R2_STORE_KEY,
        body: jsonStr,
        contentType: 'application/json; charset=utf-8'
      });
    }
  } catch (err) {
    console.error('[comments-api] R2 save error:', err.message);
  }
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const store = await loadStore();

    // ── GET: Fetch comments & recommendations for a title ───────────────────
    if (req.method === 'GET') {
      const { tmdbId, type = 'movie' } = req.query;
      if (!tmdbId) {
        return res.status(400).json({ success: false, error: 'Missing tmdbId parameter' });
      }

      const key = String(tmdbId);
      const data = store[key] || { recommendationsCount: 0, comments: [] };

      // Cache headers for fast client/CDN responses
      res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=10, stale-while-revalidate=60');
      return res.status(200).json({
        success: true,
        tmdbId: key,
        type,
        recommendationsCount: data.recommendationsCount || 0,
        commentsCount: (data.comments || []).length,
        comments: data.comments || []
      });
    }

    // ── POST: Post a new comment or toggle recommendation ───────────────────
    if (req.method === 'POST') {
      const body = req.body || {};
      const { action = 'comment', tmdbId, type = 'movie' } = body;

      if (!tmdbId) {
        return res.status(400).json({ success: false, error: 'Missing tmdbId' });
      }

      const key = String(tmdbId);
      if (!store[key]) {
        store[key] = { recommendationsCount: 0, comments: [] };
      }

      // Action A: Toggle or Increment Recommendation
      if (action === 'recommend') {
        const delta = Number(body.delta ?? 1);
        const currentCount = store[key].recommendationsCount || 0;
        store[key].recommendationsCount = Math.max(0, currentCount + delta);

        await persistStore(store);

        return res.status(200).json({
          success: true,
          action: 'recommend',
          tmdbId: key,
          recommendationsCount: store[key].recommendationsCount
        });
      }

      // Action B: Post a Comment
      if (action === 'comment') {
        const rawUsername = sanitize(body.username || '');
        const rawComment = sanitize(body.comment || '');
        const recommended = Boolean(body.recommended);

        if (!rawComment) {
          return res.status(400).json({ success: false, error: 'Comment text cannot be empty' });
        }

        const username = (rawUsername || 'Anonymous').slice(0, 30);
        const comment = rawComment.slice(0, 500);

        const newComment = {
          id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          username,
          comment,
          recommended,
          createdAt: Date.now()
        };

        if (!Array.isArray(store[key].comments)) {
          store[key].comments = [];
        }

        // Add to beginning of list
        store[key].comments.unshift(newComment);

        // Cap at 150 comments per title to conserve space
        if (store[key].comments.length > 150) {
          store[key].comments = store[key].comments.slice(0, 150);
        }

        // If comment was marked as recommended, increment recommendations count
        if (recommended) {
          store[key].recommendationsCount = (store[key].recommendationsCount || 0) + 1;
        }

        await persistStore(store);

        return res.status(200).json({
          success: true,
          action: 'comment',
          tmdbId: key,
          comment: newComment,
          recommendationsCount: store[key].recommendationsCount,
          commentsCount: store[key].comments.length
        });
      }

      return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[comments-api] Unhandled error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error' });
  }
}
