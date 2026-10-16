import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createPresignedPutUrl, createPresignedGetUrl, getR2Config, putR2Object, getR2ObjectText, deleteR2Object } from '../lib/r2-helper.js';
import { extractZipEntries, autoSelectBestSrt } from '../lib/sub-extractor.js';

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

const JWT_SECRET = (process.env.SUB_AUTH_SECRET || process.env.API_SECRET || 'hackymax_sub_secret_key_2026').trim();

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getContributors() {
  const envContributors = process.env.SUB_CONTRIBUTORS;
  const map = {};

  if (envContributors) {
    try {
      if (envContributors.trim().startsWith('{')) {
        return JSON.parse(envContributors);
      }
      envContributors.split(',').forEach(pair => {
        const [u, p] = pair.split(':');
        if (u && p) map[u.trim()] = p.trim();
      });
    } catch (e) {
      console.error('[sub-auth] Error parsing SUB_CONTRIBUTORS:', e);
    }
  }

  // Ensure default accounts exist if env is unconfigured
  if (Object.keys(map).length === 0) {
    map['hacky'] = 'hacky2026';
    map['admin'] = 'hackymax2026';
    map['kalan'] = 'kalan2026';
    map['friend1'] = 'friend123';
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
    if (Object.keys(contributors).length === 0) {
      return res.status(503).json({ error: 'Contributor accounts are not configured. Set SUB_CONTRIBUTORS in Vercel environment variables.' });
    }

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();
    const expectedPass = contributors[cleanUser];

    if (expectedPass && safeCompare(cleanPass, expectedPass)) {
      const isSuper = cleanUser.toLowerCase() === 'admin' || cleanUser.toLowerCase() === 'hacky';
      const role = isSuper ? 'admin' : 'contributor';
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
let _catalogCacheTime = 0;

export function getCatalogFilePath() {
  return path.join(process.cwd(), 'Subtitle', 'catalog.json');
}

export async function loadCatalogAsync(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && _catalogCache && (now - _catalogCacheTime < 3000)) {
    return _catalogCache;
  }
  const catalog = { ...SEED_TITLES };

  try {
    const p = getCatalogFilePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      Object.assign(catalog, data);
    }
  } catch (_) {}

  try {
    const r2Config = getR2Config();
    if (r2Config.isConfigured) {
      const r2Json = await getR2ObjectText('subtitles/catalog.json');
      if (r2Json) {
        const r2Data = JSON.parse(r2Json);
        Object.assign(catalog, r2Data);
      }
    }
  } catch (err) {
    console.warn('[sub-catalog] Failed to load catalog from R2:', err.message);
  }

  // Tombstone suppression: any key marked in _deletedKeys is permanently suppressed
  if (Array.isArray(catalog._deletedKeys)) {
    for (const delKey of catalog._deletedKeys) {
      delete catalog[delKey];
    }
  }

  _catalogCache = catalog;
  _catalogCacheTime = now;
  return catalog;
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
  if (Array.isArray(catalog._deletedKeys)) {
    for (const delKey of catalog._deletedKeys) {
      delete catalog[delKey];
    }
  }
  _catalogCache = catalog;
  return catalog;
}

export async function saveCatalog(catalog) {
  _catalogCache = catalog;
  _catalogCacheTime = Date.now();

  try {
    const p = getCatalogFilePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(catalog, null, 2), 'utf8');
  } catch (err) {
    console.warn('[sub-catalog] Local write skipped (read-only filesystem on serverless)');
  }

  try {
    const r2Config = getR2Config();
    if (r2Config.isConfigured) {
      await putR2Object({
        key: 'subtitles/catalog.json',
        body: JSON.stringify(catalog, null, 2),
        contentType: 'application/json'
      });
      console.log('[sub-catalog] Successfully synced catalog to Cloudflare R2!');
    }
  } catch (r2Err) {
    console.error('[sub-catalog] Error syncing catalog to R2:', r2Err.message);
  }
}

async function handleCatalog(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { id, type = 'movie', season = 1, episode = 1, recent, all, fresh } = req.query;
  const catalog = await loadCatalogAsync(fresh === '1' || fresh === 'true');

  if (all === '1' || all === 'true') {
    const safeCatalog = { ...catalog };
    const deletedKeys = Array.isArray(catalog._deletedKeys) ? [...catalog._deletedKeys] : [];
    delete safeCatalog._deletedKeys;
    safeCatalog._deletedKeys = deletedKeys;
    return res.status(200).json({
      total: Object.keys(safeCatalog).filter(k => k !== '_deletedKeys').length,
      catalog: safeCatalog,
      deletedKeys
    });
  }

  if (recent === '1' || recent === 'true') {
    const list = Object.entries(catalog)
      .filter(([k]) => k !== '_deletedKeys')
      .map(([k, item]) => ({
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

    const MAX_SIZE = 150 * 1024 * 1024;
    if (fileSize && fileSize > MAX_SIZE) {
      return res.status(400).json({ error: 'File size exceeds 150MB limit' });
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
        : `/api/subtitles?id=${tmdbId}&type=${type}${season ? `&season=${season}` : ''}${episode ? `&episode=${episode}` : ''}&serve=1`;

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
    let ext = extMatch ? extMatch[1].toLowerCase() : 'srt';
    let fileBuffer = Buffer.from(fileBase64, 'base64');

    // Auto-extract ZIP archive if uploaded
    if ((fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B) || ext === 'zip') {
      try {
        const extracted = extractZipEntries(fileBuffer);
        const best = autoSelectBestSrt(extracted);
        if (best && best.content) {
          fileBuffer = Buffer.from(best.content, 'utf8');
          ext = 'srt';
        }
      } catch (zipErr) {
        console.warn('[sub-upload] Auto-extract zip warning:', zipErr.message);
      }
    }

    const subKey = type === 'tv' ? `${tmdbId}_S${season}_E${episode}` : `${tmdbId}`;
    const targetFile = `${subKey}.${ext}`;

    let publicUrl = `/Subtitle/uploads/${targetFile}`;
    const r2Config = getR2Config();

    if (r2Config.isConfigured) {
      const fileKey = `subtitles/${targetFile}`;
      try {
        const ok = await putR2Object({
          key: fileKey,
          body: fileBuffer,
          contentType: ext === 'vtt' ? 'text/vtt' : 'text/plain; charset=utf-8'
        });
        if (ok) {
          publicUrl = r2Config.publicDomain
            ? `${r2Config.publicDomain.replace(/\/$/, '')}/${fileKey}`
            : `/api/subtitles?id=${tmdbId}&type=${type}${season ? `&season=${season}` : ''}${episode ? `&episode=${episode}` : ''}&serve=1`;
        }
      } catch (r2Err) {
        console.error('[sub-upload] Server failed to upload to R2 directly:', r2Err.message);
      }
    }

    try {
      const uploadsDir = path.join(process.cwd(), 'Subtitle', 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filePath = path.join(uploadsDir, targetFile);
      fs.writeFileSync(filePath, fileBuffer);
    } catch (_) {}

    const catalog = await loadCatalogAsync();
    if (Array.isArray(catalog._deletedKeys)) {
      catalog._deletedKeys = catalog._deletedKeys.filter(k => k !== subKey && k !== String(tmdbId));
    }
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
    await saveCatalog(catalog);

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
    const catalog = await loadCatalogAsync();
    if (Array.isArray(catalog._deletedKeys)) {
      catalog._deletedKeys = catalog._deletedKeys.filter(k => k !== subKey && k !== String(tmdbId));
    }

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
      url: (publicUrl && !publicUrl.includes('.r2.cloudflarestorage.com'))
        ? publicUrl
        : `/api/subtitles?id=${tmdbId}&type=${type}${season ? `&season=${season}` : ''}${episode ? `&episode=${episode}` : ''}&serve=1`
    };
    await saveCatalog(catalog);

    return res.status(200).json({
      success: true,
      key: subKey,
      item: catalog[subKey]
    });
  }

  // Action D: Batch Upload for Full Season Packs
  if (action === 'batch_direct') {
    const { tmdbId, type = 'tv', season = 1, episodes = [], title, year } = req.body || {};
    if (!tmdbId || !Array.isArray(episodes) || episodes.length === 0) {
      return res.status(400).json({ error: 'Missing tmdbId or episodes array' });
    }

    const r2Config = getR2Config();
    const catalog = await loadCatalogAsync();
    const savedEpisodes = [];

    for (const ep of episodes) {
      const epNum = Number(ep.episode);
      if (!epNum || !ep.fileBase64) continue;

      const epSeason = Number(ep.season || season || 1);
      const subKey = `${tmdbId}_S${epSeason}_E${epNum}`;
      const targetFile = `${subKey}.srt`;
      const fileBuffer = Buffer.from(ep.fileBase64, 'base64');
      const fileKey = `subtitles/${targetFile}`;

      let publicUrl = `/Subtitle/uploads/${targetFile}`;
      if (r2Config.isConfigured) {
        try {
          const ok = await putR2Object({
            key: fileKey,
            body: fileBuffer,
            contentType: 'text/plain; charset=utf-8'
          });
          if (ok) {
            publicUrl = r2Config.publicDomain
              ? `${r2Config.publicDomain.replace(/\/$/, '')}/${fileKey}`
              : `/api/subtitles?id=${tmdbId}&type=tv&season=${epSeason}&episode=${epNum}&serve=1`;
          }
        } catch (r2Err) {
          console.error(`[sub-batch] Error saving ${fileKey} to R2:`, r2Err.message);
        }
      }

      try {
        const uploadsDir = path.join(process.cwd(), 'Subtitle', 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        const filePath = path.join(uploadsDir, targetFile);
        fs.writeFileSync(filePath, fileBuffer);
      } catch (_) {}

      if (Array.isArray(catalog._deletedKeys)) {
        catalog._deletedKeys = catalog._deletedKeys.filter(k => k !== subKey && k !== String(tmdbId));
      }

      catalog[subKey] = {
        tmdbId: String(tmdbId),
        mediaType: 'tv',
        season: epSeason,
        episode: epNum,
        title: title || `TV Series ${tmdbId}`,
        year: year || '',
        format: 'srt',
        fileSize: fileBuffer.length,
        uploader: verified.u,
        uploadedAt: Date.now(),
        url: publicUrl
      };

      savedEpisodes.push({ season: epSeason, episode: epNum, key: subKey, publicUrl });
    }

    await saveCatalog(catalog);

    return res.status(200).json({
      success: true,
      count: savedEpisodes.length,
      savedEpisodes
    });
  }

  if (action === 'delete') {
    return handleDelete(req, res);
  }

  return res.status(400).json({ error: 'Unknown action' });
}

// ══════════════════════════════════════════════════════════════════════════
// 4. DELETE / REMOVE MODULE
// ══════════════════════════════════════════════════════════════════════════

async function handleDelete(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '') || req.body?.token || req.query?.token;
  const verified = verifyToken(token);

  if (!verified) {
    return res.status(401).json({ error: 'Unauthorized: Please log in with contributor credentials' });
  }

  const { key, tmdbId, type, season, episode } = req.body || req.query || {};
  let targetKey = key;
  if (!targetKey && tmdbId) {
    targetKey = (type === 'tv' && season && episode) ? `${tmdbId}_S${season}_E${episode}` : `${tmdbId}`;
  }

  if (!targetKey) {
    return res.status(400).json({ error: 'Missing subtitle key or tmdbId' });
  }

  const catalog = await loadCatalogAsync();
  const cleanTmdbId = String(tmdbId || targetKey.split('_')[0] || '');
  const item = catalog[targetKey] || (cleanTmdbId ? catalog[cleanTmdbId] : null);

  // 1. Gather all possible Cloudflare R2 file key variants to thoroughly purge
  const r2KeysToDelete = new Set();
  const ext = item?.format || 'srt';

  r2KeysToDelete.add(`subtitles/${targetKey}.${ext}`);
  r2KeysToDelete.add(`subtitles/${targetKey}.srt`);
  r2KeysToDelete.add(`subtitles/${targetKey}.vtt`);

  if (cleanTmdbId) {
    r2KeysToDelete.add(`subtitles/${cleanTmdbId}.${ext}`);
    r2KeysToDelete.add(`subtitles/${cleanTmdbId}.srt`);
    r2KeysToDelete.add(`subtitles/${cleanTmdbId}.vtt`);
    const sNum = season || 1;
    const eNum = episode || 1;
    r2KeysToDelete.add(`subtitles/${cleanTmdbId}/S${String(sNum).padStart(2, '0')}E${String(eNum).padStart(2, '0')}.srt`);
    r2KeysToDelete.add(`subtitles/${cleanTmdbId}/S${sNum}E${eNum}.srt`);
    r2KeysToDelete.add(`subtitles/${cleanTmdbId}_S${sNum}_E${eNum}.srt`);
    r2KeysToDelete.add(`subtitles/${cleanTmdbId}_S${sNum}_E${eNum}.vtt`);
  }

  if (item?.url && typeof item.url === 'string') {
    if (item.url.includes('subtitles/')) {
      const parts = item.url.split('subtitles/');
      if (parts[1]) {
        r2KeysToDelete.add(`subtitles/${parts[1].split('?')[0]}`);
      }
    }
  }

  // Attempt Cloudflare R2 file removal across all candidate keys
  try {
    const deletePromises = Array.from(r2KeysToDelete).map(k => deleteR2Object({ key: k }).catch(err => {
      console.warn(`[sub-delete] Non-fatal R2 delete error for ${k}:`, err.message);
    }));
    await Promise.allSettled(deletePromises);
  } catch (err) {
    console.warn('[sub-delete] Failed during R2 batch delete:', err.message);
  }

  // 2. Attempt local file removal (if exists)
  try {
    const localUploadsDir = path.join(process.cwd(), 'Subtitle', 'uploads');
    const localCandidates = [
      path.join(localUploadsDir, `${targetKey}.${ext}`),
      path.join(localUploadsDir, `${targetKey}.srt`),
      path.join(localUploadsDir, `${targetKey}.vtt`),
      cleanTmdbId ? path.join(localUploadsDir, `${cleanTmdbId}.${ext}`) : null,
      cleanTmdbId ? path.join(localUploadsDir, `${cleanTmdbId}.srt`) : null
    ].filter(Boolean);

    for (const p of localCandidates) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (_) {}
      }
    }
  } catch (_) {}

  // 3. Mark in catalog tombstones so hardcoded/cached seeds never revive it
  if (!Array.isArray(catalog._deletedKeys)) {
    catalog._deletedKeys = [];
  }
  if (!catalog._deletedKeys.includes(targetKey)) {
    catalog._deletedKeys.push(targetKey);
  }
  if (cleanTmdbId && !catalog._deletedKeys.includes(cleanTmdbId)) {
    catalog._deletedKeys.push(cleanTmdbId);
  }

  // Remove entries from in-memory catalog and persist
  delete catalog[targetKey];
  if (cleanTmdbId) {
    delete catalog[cleanTmdbId];
  }
  await saveCatalog(catalog);

  return res.status(200).json({
    success: true,
    message: `Subtitle for "${item?.title || targetKey}" successfully removed.`,
    key: targetKey
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// 5. COMMENTS & RECOMMENDATIONS MODULE (Cloudflare R2 + Local fallback)
// ══════════════════════════════════════════════════════════════════════════

const R2_COMMENTS_STORE_KEY = 'comments/comments_store.json';
const LOCAL_COMMENTS_STORE_PATH = path.join(process.cwd(), 'data', 'comments.json');

let _commentsStoreCache = null;
let _commentsStoreCacheTime = 0;
const COMMENTS_CACHE_TTL_MS = 15000;

function sanitizeCommentText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

async function loadCommentsStore() {
  const now = Date.now();
  if (_commentsStoreCache && (now - _commentsStoreCacheTime < COMMENTS_CACHE_TTL_MS)) {
    return _commentsStoreCache;
  }

  let store = {};

  // 1. Try local filesystem fallback
  try {
    if (fs.existsSync(LOCAL_COMMENTS_STORE_PATH)) {
      const localRaw = fs.readFileSync(LOCAL_COMMENTS_STORE_PATH, 'utf8');
      if (localRaw) Object.assign(store, JSON.parse(localRaw));
    }
  } catch (_) {}

  // 2. Fetch from Cloudflare R2 if configured
  try {
    const r2Config = getR2Config();
    if (r2Config.isConfigured) {
      const r2Text = await getR2ObjectText(R2_COMMENTS_STORE_KEY);
      if (r2Text) {
        const r2Data = JSON.parse(r2Text);
        Object.assign(store, r2Data);
      }
    }
  } catch (err) {
    console.warn('[comments-api] R2 load error:', err.message);
  }

  _commentsStoreCache = store;
  _commentsStoreCacheTime = now;
  return store;
}

async function persistCommentsStore(store) {
  _commentsStoreCache = store;
  _commentsStoreCacheTime = Date.now();

  const jsonStr = JSON.stringify(store);

  // 1. Write local filesystem if writable
  try {
    const dir = path.dirname(LOCAL_COMMENTS_STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_COMMENTS_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (_) {}

  // 2. Write to Cloudflare R2
  try {
    const r2Config = getR2Config();
    if (r2Config.isConfigured) {
      await putR2Object({
        key: R2_COMMENTS_STORE_KEY,
        body: jsonStr,
        contentType: 'application/json; charset=utf-8'
      });
    }
  } catch (err) {
    console.error('[comments-api] R2 save error:', err.message);
  }
}

async function handleComments(req, res) {
  try {
    const store = await loadCommentsStore();

    if (req.method === 'GET') {
      const { tmdbId, type = 'movie' } = req.query;
      if (!tmdbId) {
        return res.status(400).json({ success: false, error: 'Missing tmdbId parameter' });
      }

      const key = String(tmdbId);
      const data = store[key] || { recommendationsCount: 0, comments: [] };

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

        await persistCommentsStore(store);

        return res.status(200).json({
          success: true,
          action: 'recommend',
          tmdbId: key,
          recommendationsCount: store[key].recommendationsCount
        });
      }

      // Action B: Post a Comment
      if (action === 'comment') {
        const rawUsername = sanitizeCommentText(body.username || '');
        const rawComment = sanitizeCommentText(body.comment || '');
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

        store[key].comments.unshift(newComment);

        if (store[key].comments.length > 150) {
          store[key].comments = store[key].comments.slice(0, 150);
        }

        if (recommended) {
          store[key].recommendationsCount = (store[key].recommendationsCount || 0) + 1;
        }

        await persistCommentsStore(store);

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

// ══════════════════════════════════════════════════════════════════════════
// 6. UNIFIED ROUTER (Routes based on req.url / req.query / body)
// ══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  req.query = req.query || {};
  req.body = req.body || {};

  const url = req.url || '';
  const qAction = req.query.action || '';
  const bAction = req.body.action || '';

  // Comments routing
  if (url.includes('comments') || qAction === 'comments' || bAction === 'comment' || bAction === 'recommend') {
    return handleComments(req, res);
  }

  // Auth routing
  if (url.includes('sub-auth') || qAction === 'auth' || bAction === 'login' || bAction === 'verify') {
    return handleAuth(req, res);
  }

  // Delete routing
  if (url.includes('sub-delete') || qAction === 'delete' || bAction === 'delete') {
    return handleDelete(req, res);
  }

  // Catalog routing
  if (url.includes('sub-catalog') || qAction === 'catalog' || req.query.all !== undefined || req.query.recent !== undefined) {
    return handleCatalog(req, res);
  }

  // Upload routing
  if (url.includes('sub-upload') || qAction === 'upload' || bAction === 'presigned' || bAction === 'direct' || bAction === 'batch_direct' || bAction === 'confirm') {
    return handleUpload(req, res);
  }

  // Fallback: If GET request with 'id', route to catalog
  if (req.method === 'GET' && req.query.id) {
    return handleCatalog(req, res);
  }

  return res.status(400).json({ error: 'Unknown sub-api request route' });
}
