import fs from 'fs';
import path from 'path';
import { verifyToken } from './sub-auth.js';
import { createPresignedPutUrl, getR2Config } from './r2-helper.js';
import { loadCatalog, saveCatalog } from './sub-catalog.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    }
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Verify Contributor Authorization
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '') || req.body?.token;
  const verified = verifyToken(token);

  if (!verified) {
    return res.status(401).json({ error: 'Unauthorized: Please log in with contributor credentials' });
  }

  const { action = 'presigned' } = req.body || req.query || {};

  // Action A: Request Presigned Upload URL (or direct fallback)
  if (action === 'presigned') {
    const { tmdbId, type = 'movie', season = 1, episode = 1, fileName, fileSize } = req.body || {};

    if (!tmdbId || !fileName) {
      return res.status(400).json({ error: 'Missing tmdbId or fileName' });
    }

    // Validate file size limit (20MB)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (fileSize && fileSize > MAX_SIZE) {
      return res.status(400).json({ error: 'File size exceeds 20MB limit' });
    }

    // Validate extension
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
        expiresIn: 900 // 15 mins
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

    // Fallback: If R2 is not configured yet, direct API upload
    return res.status(200).json({
      mode: 'direct',
      uploadUrl: '/api/sub-upload?action=direct',
      fileKey,
      publicUrl: `/Subtitle/uploads/${subKey}.${ext}`,
      key: subKey
    });
  }

  // Action B: Direct Fallback Upload (e.g. for local testing or small files)
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

    // Save into catalog
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
