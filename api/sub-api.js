import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createPresignedPutUrl, getR2Config } from '../lib/r2-helper.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    }
  }
};

// ══════════════════════════════════════════════════════════════════════════
// 1. AUTHENTICATION MODULE (HMAC-SHA256)
// ══════════════════════════════════════════════════════════════════════════

const JWT_SECRET = process.env.SUB_AUTH_SECRET || process.env.API_SECRET || 'hackymax_sub_secret_key_2026';

function getContributors() {
  const envContributors = process.env.SUB_CONTRIBUTORS;
  const map = {
    'admin': 'hackymax2026',
    'kalan': 'kalan2026',
    'friend1': 'friend123',
    'friend2': 'friend456',
    'friend3': 'friend789'
  };

  if (envContributors) {
    try {
      if (envContributors.trim().startsWith('{')) {
        return { ...map, ...JSON.parse(envContributors) };
      }
      envContributors.split(',').forEach(pair => {
        const [u, p] = pair.split(':');
        if (u && p) map[u.trim()] = p.trim();
      });
    } catch (e) {
      console.error('[sub-auth] Error parsing SUB_CONTRIBUTORS:', e);
    }
  }

  return map;
}

export function signToken(username, role = 'contributor') {
  const payload = {
    u: username,
    r: role,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14 // 14 days valid
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

async function handleAuth(req, res) {
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '') || req.query.token;
    const verified = verifyToken(token);
    if (!verified) {
      return res.status(401).json({ authenticated: false, error: 'Invalid or expired session' });
    }
    return res.status(200).json({ authenticated: true, user: verified.u, role: verified.r });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action = 'login', username, password, token } = req.body || {};

  if (action === 'verify') {
    const verified = verifyToken(token);
    if (!verified) {
      return res.status(401).json({ authenticated: false, error: 'Session expired' });
    }
    return res.status(200).json({ authenticated: true, user: verified.u, role: verified.r });
  }

  if (action === 'login') {
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const contributors = getContributors();
    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    if (contributors[cleanUser] && contributors[cleanUser] === cleanPass) {
      const role = cleanUser === 'admin' ? 'admin' : 'contributor';
      const sessionToken = signToken(cleanUser, role);
      return res.status(200).json({
        success: true,
        user: cleanUser,
        role,
        token: sessionToken
      });
    }

    return res.status(401).json({ error: 'Invalid username or password' });
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ══════════════════════════════════════════════════════════════════════════
// 2. CATALOG MODULE
// ══════════════════════════════════════════════════════════════════════════

const SEED_TITLES = {
  '1235877': { title: 'Jana Nayagan', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1235877.srt' },
  '869227': { title: 'Super Sharanya', year: '2022', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/869227.srt' },
  '1506736': { title: 'Thudakkam', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1506736.srt' },
  '646097': { title: 'Rebel Ridge', year: '2024', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/646097.srt' },
  '1542187': { title: 'Varavu', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1542187.srt' },
  '1419406': { title: "The Shadow's Edge", year: '2025', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1419406.srt' },
  '1071215': { title: 'Thanksgiving', year: '2023', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1071215.srt' },
  '1213243': { title: 'Toxic', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1213243.srt' },
  '1479832': { title: 'DC', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1479832.srt' },
  '1321108': { title: 'Dude', year: '2025', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1321108.srt' },
  '1433117': { title: 'Kara', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1433117.srt' },
  '1408162': { title: 'Vishwanath & Sons', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1408162.srt' },
  '1508564': { title: 'With Love', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1508564.srt' },
  '1069945': { title: 'Manjummel Boys', year: '2024', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1069945.srt' },
  '1149791': { title: 'Premalu', year: '2024', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1149791.srt' },
  '360648': { title: 'Ennu Ninte Moideen', year: '2015', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/360648.srt' },
  '341895': { title: 'Premam', year: '2015', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/341895.srt' },
  '575351': { title: 'Kumbalangi Nights', year: '2019', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/575351.srt' },
  '41727': { title: 'Banshee', year: '2013', mediaType: 'tv', format: 'srt', uploader: 'System', url: '/Subtitle/Banshee/S01E01.srt' }
};

let _catalogCache = null;

export function getCatalogFilePath() {
  return path.join(process.cwd(), 'Subtitle', 'catalog.json');
}

export function loadCatalog() {
  if (_catalogCache) return _catalogCache;
  const catalog = { ...SEED_TITLES };
  try {
    const p = getCatalogFilePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      Object.assign(catalog, data);
    }
  } catch (err) {
    console.error('[sub-catalog] Error loading catalog.json:', err.message);
  }
  _catalogCache = catalog;
  return catalog;
}

export function saveCatalog(catalog) {
  _catalogCache = catalog;
  try {
    const p = getCatalogFilePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(catalog, null, 2), 'utf8');
  } catch (err) {
    console.error('[sub-catalog] Error writing catalog.json:', err.message);
  }
}

async function handleCatalog(req, res) {
  const { id, type = 'movie', season = 1, episode = 1, recent, all } = req.query;
  const catalog = loadCatalog();

  if (all === '1' || all === 'true') {
    return res.status(200).json({ total: Object.keys(catalog).length, catalog });
  }

  if (recent === '1' || recent === 'true') {
    const list = Object.entries(catalog).map(([k, item]) => ({
      key: k,
      ...item
    })).sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0)).slice(0, 25);
    return res.status(200).json({ recent: list });
  }

  if (!id) {
    return res.status(400).json({ error: 'Missing id query parameter' });
  }

  const subKey = type === 'tv' ? `${id}_S${season}_E${episode}` : `${id}`;
  const item = catalog[subKey] || (type === 'tv' ? catalog[id] : null);

  if (item) {
    return res.status(200).json({ exists: true, key: subKey, item });
  }

  return res.status(200).json({ exists: false, key: subKey, item: null });
}

// ══════════════════════════════════════════════════════════════════════════
// 3. UPLOAD MODULE
// ══════════════════════════════════════════════════════════════════════════

async function handleUpload(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '') || req.body?.token;
  const verified = verifyToken(token);

  if (!verified) {
    return res.status(401).json({ error: 'Unauthorized: Please log in with contributor credentials' });
  }

  const { action = 'presigned' } = req.body || req.query || {};

  // Action A: Presigned R2 URL
  if (action === 'presigned') {
    const { tmdbId, type = 'movie', season = 1, episode = 1, fileName, fileSize } = req.body || {};
    if (!tmdbId || !fileName) {
      return res.status(400).json({ error: 'Missing tmdbId or fileName' });
    }

    const MAX_SIZE = 20 * 1024 * 1024;
    if (fileSize && fileSize > MAX_SIZE) {
      return res.status(400).json({ error: 'File size exceeds 20MB limit' });
    }

    const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'srt';
    const allowed = ['srt', 'vtt', 'sub', 'idx'];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: `File type .${ext} not supported. Allowed: .srt, .vtt, .sub, .idx` });
    }

    const subKey = type === 'tv' ? `${tmdbId}_S${season}_E${episode}` : `${tmdbId}`;
    const fileKey = `subtitles/${subKey}.${ext}`;

    const r2Config = getR2Config();
    if (r2Config.isConfigured) {
      const presignedUrl = createPresignedPutUrl({
        key: fileKey,
        contentType: ext === 'vtt' ? 'text/vtt' : 'text/plain; charset=utf-8',
        expiresIn: 900
      });

      const publicUrl = r2Config.publicDomain
        ? `${r2Config.publicDomain.replace(/\/$/, '')}/${fileKey}`
        : `https://${r2Config.bucket}.${r2Config.accountId}.r2.cloudflarestorage.com/${fileKey}`;

      return res.status(200).json({
        mode: 'r2_presigned',
        uploadUrl: presignedUrl,
        fileKey,
        publicUrl,
        key: subKey
      });
    }

    // Direct fallback
    return res.status(200).json({
      mode: 'direct',
      uploadUrl: '/api/sub-upload?action=direct',
      fileKey,
      publicUrl: `/Subtitle/uploads/${subKey}.${ext}`,
      key: subKey
    });
  }

  // Action B: Direct Server Upload
  if (action === 'direct') {
    const { tmdbId, type = 'movie', season = 1, episode = 1, fileName, fileBase64, title, year } = req.body || {};
    if (!tmdbId || !fileBase64) {
      return res.status(400).json({ error: 'Missing tmdbId or file content' });
    }

    const extMatch = (fileName || '').match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'srt';
    const subKey = type === 'tv' ? `${tmdbId}_S${season}_E${episode}` : `${tmdbId}`;
    const targetFile = `${subKey}.${ext}`;

    const uploadsDir = path.join(process.cwd(), 'Subtitle', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const filePath = path.join(uploadsDir, targetFile);
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    fs.writeFileSync(filePath, fileBuffer);

    const catalog = loadCatalog();
    const publicUrl = `/Subtitle/uploads/${targetFile}`;
    catalog[subKey] = {
      tmdbId,
      mediaType: type,
      season: type === 'tv' ? Number(season) : null,
      episode: type === 'tv' ? Number(episode) : null,
      title: title || `Title ${tmdbId}`,
      year: year || '',
      format: ext,
      fileSize: fileBuffer.length,
      uploader: verified.u,
      uploadedAt: Date.now(),
      url: publicUrl
    };
    saveCatalog(catalog);

    return res.status(200).json({
      success: true,
      key: subKey,
      publicUrl,
      item: catalog[subKey]
    });
  }

  // Action C: Confirm R2 Direct Upload
  if (action === 'confirm') {
    const { tmdbId, type = 'movie', season = 1, episode = 1, title, year, format = 'srt', fileSize = 0, publicUrl } = req.body || {};
    if (!tmdbId || !publicUrl) {
      return res.status(400).json({ error: 'Missing tmdbId or publicUrl' });
    }

    const subKey = type === 'tv' ? `${tmdbId}_S${season}_E${episode}` : `${tmdbId}`;
    const catalog = loadCatalog();

    catalog[subKey] = {
      tmdbId,
      mediaType: type,
      season: type === 'tv' ? Number(season) : null,
      episode: type === 'tv' ? Number(episode) : null,
      title: title || `Title ${tmdbId}`,
      year: year || '',
      format,
      fileSize: Number(fileSize),
      uploader: verified.u,
      uploadedAt: Date.now(),
      url: publicUrl
    };
    saveCatalog(catalog);

    return res.status(200).json({
      success: true,
      key: subKey,
      item: catalog[subKey]
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ══════════════════════════════════════════════════════════════════════════
// 4. UNIFIED ROUTER (Routes based on req.url / req.query / body)
// ══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = req.url || '';
  const qAction = (req.query && req.query.action) || '';
  const bAction = (req.body && req.body.action) || '';

  // Auth routing
  if (url.includes('sub-auth') || qAction === 'auth' || bAction === 'login' || bAction === 'verify') {
    return handleAuth(req, res);
  }

  // Catalog routing
  if (url.includes('sub-catalog') || qAction === 'catalog' || req.query.all !== undefined || req.query.recent !== undefined) {
    return handleCatalog(req, res);
  }

  // Upload routing
  if (url.includes('sub-upload') || qAction === 'upload' || bAction === 'presigned' || bAction === 'direct' || bAction === 'confirm') {
    return handleUpload(req, res);
  }

  // Fallback: If GET request with 'id', route to catalog
  if (req.method === 'GET' && req.query.id) {
    return handleCatalog(req, res);
  }

  return res.status(400).json({ error: 'Unknown sub-api request route' });
}
