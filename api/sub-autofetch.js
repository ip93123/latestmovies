import { autoFetchSinhalaSubtitle, searchAndExtractBaiscope, searchAndExtractZoom } from '../lib/sub-scrapers.js';
import { loadCatalogAsync, saveCatalog, verifyToken } from './sub-api.js';
import { getR2Config, putR2Object } from '../lib/r2-helper.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const queryParams = req.method === 'GET' ? req.query : (req.body || {});
  const {
    q,
    title,
    tmdbId,
    type = 'movie',
    season = 1,
    episode = 1,
    quality = '720p',
    source = 'all', // 'all', 'baiscope', 'zoom'
    save = false
  } = queryParams;

  const searchQuery = String(q || title || '').trim();

  if (!searchQuery && !tmdbId) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter "q" (movie/series title) or "tmdbId" is required.'
    });
  }

  let finalQuery = searchQuery;

  // If query is missing but tmdbId is given, resolve title via TMDB API
  if (!finalQuery && tmdbId) {
    try {
      const tmdbKey = process.env.TMDB_API_KEY || '4f298a53e5522830c82f789f0e00568e';
      const endpoint = type === 'tv'
        ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbKey}`
        : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbKey}`;
      const tmdbRes = await fetch(endpoint);
      if (tmdbRes.ok) {
        const data = await tmdbRes.json();
        finalQuery = data.title || data.name || '';
      }
    } catch (_) {}
  }

  if (!finalQuery) {
    return res.status(400).json({
      success: false,
      error: 'Could not determine movie/series title to search.'
    });
  }

  try {
    let result = null;

    if (source === 'baiscope') {
      result = await searchAndExtractBaiscope(finalQuery, quality);
    } else if (source === 'zoom') {
      result = await searchAndExtractZoom(finalQuery, quality);
    } else {
      result = await autoFetchSinhalaSubtitle(finalQuery, quality);
    }

    if (!result || !result.srt) {
      return res.status(200).json({
        success: true,
        found: false,
        query: finalQuery,
        message: `No Sinhala subtitle found on ${source === 'all' ? 'Baiscope.lk or Zoom.lk' : source} for "${finalQuery}".`
      });
    }

    const { srt, postTitle, postUrl, archiveName } = result;
    const lineCount = (srt.content.match(/-->/g) || []).length;
    let savedToR2 = false;
    let catalogKey = null;

    // Optional Auto-Save to R2 and Catalog if requested & tmdbId exists
    const shouldSave = save === true || save === 'true' || save === '1';
    if (shouldSave && tmdbId) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '') || queryParams.token;
      const verified = verifyToken(token);

      if (verified) {
        try {
          const r2Config = getR2Config();
          catalogKey = type === 'tv' ? `${tmdbId}_S${season}_E${episode}` : `${tmdbId}`;
          const r2Path = type === 'tv'
            ? `subtitles/${tmdbId}/S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}.srt`
            : `subtitles/${tmdbId}.srt`;

          if (r2Config.isConfigured) {
            await putR2Object({
              key: r2Path,
              body: srt.content,
              contentType: 'text/plain; charset=utf-8'
            });

            // Update catalog
            const catalog = await loadCatalogAsync();
            catalog[catalogKey] = {
              title: finalQuery,
              tmdbId: String(tmdbId),
              mediaType: type,
              season: type === 'tv' ? Number(season) : undefined,
              episode: type === 'tv' ? Number(episode) : undefined,
              format: 'srt',
              source: result.source,
              originalFile: srt.name,
              sizeBytes: Buffer.byteLength(srt.content, 'utf8'),
              uploader: verified.u || 'AutoBot',
              uploadedAt: Date.now(),
              url: r2Config.publicDomain ? `${r2Config.publicDomain.replace(/\/$/, '')}/${r2Path}` : `/api/sub-api?action=download&key=${catalogKey}`
            };
            await saveCatalog(catalog);
            savedToR2 = true;
          }
        } catch (saveErr) {
          console.error('[sub-autofetch] Failed to auto-save to R2/catalog:', saveErr.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      found: true,
      query: finalQuery,
      source: result.source,
      postTitle,
      postUrl,
      archiveName,
      srt: {
        filename: srt.name,
        format: srt.format,
        sinhalaDetected: srt.sinhalaDetected,
        lineCount,
        sizeBytes: Buffer.byteLength(srt.content, 'utf8'),
        preview: srt.content.slice(0, 1000),
        content: srt.content
      },
      savedToR2,
      catalogKey
    });

  } catch (err) {
    console.error('[sub-autofetch] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error while autofetching subtitle.'
    });
  }
}
