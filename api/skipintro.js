// /api/skipintro.js — Fetch intro/outro timestamps for TV episodes
// Uses IntroDB (api.introdb.app) + SkipDB (api.skipdb.tv) as fallback
// Both require IMDb ID — we fetch that from TMDB first (same pattern as servers.js)
// Query params: id (TMDB), season, episode

export default async function handler(req, res) {
  const { id, season = 1, episode = 1 } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing TMDB id' });

  // ── Step 1: Get IMDb ID from TMDB ─────────────────────────────────────────
  let imdbId = null;
  try {
    const tmdbRes = await fetch(
      `https://api.themoviedb.org/3/tv/${id}/external_ids`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_TOKEN}` } }
    );
    if (tmdbRes.ok) {
      const data = await tmdbRes.json();
      imdbId = data.imdb_id || null;
    }
  } catch { /* continue without imdbId */ }

  // ── Step 2: Try IntroDB (api.introdb.app) ─────────────────────────────────
  if (imdbId) {
    try {
      const url = `https://api.introdb.app/intro?imdb=${imdbId}&season=${season}&episode=${episode}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'HackyMax/1.0' },
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const data = await r.json();
        // IntroDB returns { start, end } in seconds, or array of segments
        if (data && (data.start !== undefined || Array.isArray(data))) {
          const intro = Array.isArray(data)
            ? data.find(s => s.type === 'intro' || s.type === 'opening')
            : data;
          if (intro && intro.end) {
            const result = {
              introStart: Math.round(intro.start ?? 0),
              introEnd:   Math.round(intro.end),
              source:     'introdb',
            };
            res.setHeader('Cache-Control', 's-maxage=86400');
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.status(200).json(result);
          }
        }
      }
    } catch { /* fall through to SkipDB */ }
  }

  // ── Step 3: Try SkipDB (api.skipdb.tv) ────────────────────────────────────
  if (imdbId) {
    try {
      const url = `https://api.skipdb.tv/api/segments?imdb_id=${imdbId}&season=${season}&episode=${episode}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'HackyMax/1.0' },
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const data = await r.json();
        const intro = data?.segments?.intro;
        if (intro?.end_ms) {
          const result = {
            introStart: Math.round((intro.start_ms ?? 0) / 1000),
            introEnd:   Math.round(intro.end_ms / 1000),
            outroStart: data?.segments?.outro?.start_ms ? Math.round(data.segments.outro.start_ms / 1000) : null,
            source:     'skipdb',
          };
          res.setHeader('Cache-Control', 's-maxage=86400');
          res.setHeader('Access-Control-Allow-Origin', '*');
          return res.status(200).json(result);
        }
      }
    } catch { /* no data */ }
  }

  return res.status(404).json({ error: 'No intro data found' });
}
