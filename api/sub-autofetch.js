import {
  autoFetchSinhalaSubtitle,
  searchAndExtractBaiscope,
  searchAndExtractZoom,
  searchAndExtractSubz,
  searchAndExtractCineru,
  searchAllSinhalaSubtitles
} from '../lib/sub-scrapers.js';
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
    year,
    tmdbId,
    type = 'movie',
    season = 1,
    episode = 1,
    quality = '720p',
    source = 'all', // 'all', 'baiscope', 'zoom', 'subz', 'cineru'
    save = false
  } = queryParams;

  const searchQuery = String(q || title || '').trim();
  let finalYear = String(year || '').trim();

  if (!searchQuery && !tmdbId) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter "q" (movie/series title) or "tmdbId" is required.'
    });
  }

  let finalQuery = searchQuery;

  // If query is missing or year is missing, resolve via TMDB API if tmdbId is provided
  if ((!finalQuery || !finalYear) && tmdbId) {
    try {
      const tmdbKey = process.env.TMDB_API_KEY || '4f298a53e5522830c82f789f0e00568e';
      const endpoint = type === 'tv'
        ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbKey}`
        : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbKey}`;
      const tmdbRes = await fetch(endpoint);
      if (tmdbRes.ok) {
        const data = await tmdbRes.json();
        if (!finalQuery) finalQuery = data.title || data.name || '';
        if (!finalYear) finalYear = (data.release_date || data.first_air_date || '').slice(0, 4);
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
    let rawResults = [];

    if (source === 'baiscope') {
      const r = await searchAndExtractBaiscope(finalQuery, quality, finalYear);
      if (r) rawResults.push(r);
    } else if (source === 'zoom') {
      const r = await searchAndExtractZoom(finalQuery, quality, finalYear);
      if (r) rawResults.push(r);
    } else if (source === 'subz') {
      const r = await searchAndExtractSubz(finalQuery, quality, finalYear);
      if (r) rawResults.push(r);
    } else if (source === 'cineru') {
      const r = await searchAndExtractCineru(finalQuery, quality, finalYear);
      if (r) rawResults.push(r);
    } else {
      rawResults = await searchAllSinhalaSubtitles(finalQuery, quality, finalYear);
    }

    if (!rawResults || rawResults.length === 0) {
      return res.status(200).json({
        success: true,
        found: false,
        count: 0,
        results: [],
        query: finalQuery,
        year: finalYear,
        message: `No Sinhala subtitle found across sources (${source}) for "${finalQuery}"${finalYear ? ` (${finalYear})` : ''}.`
      });
    }

    const formattedResults = rawResults.map(item => {
      const lineCount = (item.srt?.content?.match(/-->/g) || []).length;
      return {
        source: item.source,
        postTitle: item.postTitle,
        postUrl: item.postUrl,
        archiveName: item.archiveName,
        matchedYear: item.matchedYear,
        matchScore: item.matchScore,
        yearMatch: item.yearMatch,
        srt: {
          filename: item.srt.name,
          format: item.srt.format,
          sinhalaDetected: item.srt.sinhalaDetected,
          lineCount,
          sizeBytes: Buffer.byteLength(item.srt.content || '', 'utf8'),
          preview: (item.srt.content || '').slice(0, 1000),
          content: item.srt.content
        }
      };
    });

    const primaryResult = formattedResults[0];
    let savedToR2 = false;
    let catalogKey = null;

    // Optional Auto-Save to R2 and Catalog if requested & tmdbId exists
    const shouldSave = save === true || save === 'true' || save === '1';
    if (shouldSave && tmdbId && primaryResult?.srt?.content) {
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
              body: primaryResult.srt.content,
              contentType: 'text/plain; charset=utf-8'
            });

            // Update catalog
            const catalog = await loadCatalogAsync();
            if (Array.isArray(catalog._deletedKeys)) {
              catalog._deletedKeys = catalog._deletedKeys.filter(k => k !== catalogKey && k !== String(tmdbId));
            }
            catalog[catalogKey] = {
              title: finalQuery,
              tmdbId: String(tmdbId),
              mediaType: type,
              season: type === 'tv' ? Number(season) : undefined,
              episode: type === 'tv' ? Number(episode) : undefined,
              format: 'srt',
              source: primaryResult.source,
              originalFile: primaryResult.srt.filename,
              sizeBytes: primaryResult.srt.sizeBytes,
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
      year: finalYear,
      count: formattedResults.length,
      results: formattedResults,
      // Backward-compatible fields
      source: primaryResult.source,
      postTitle: primaryResult.postTitle,
      postUrl: primaryResult.postUrl,
      archiveName: primaryResult.archiveName,
      matchedYear: primaryResult.matchedYear,
      matchScore: primaryResult.matchScore,
      yearMatch: primaryResult.yearMatch,
      srt: primaryResult.srt,
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
