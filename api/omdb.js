// Vercel Serverless Function: Multi-Key OMDb Pool + Direct Rotten Tomatoes Scraper Fallback
// Provides unlimited Rotten Tomatoes & IMDb scores with global Edge CDN caching (7 days)

async function scrapeRottenTomatoes(title, year, type) {
  try {
    const url = `https://www.rottentomatoes.com/search?search=${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    const isTv = type === 'tv' || type === 'series';
    const targetSectionType = isTv ? 'tvSeries' : 'movie';
    const sectionMatch = html.match(new RegExp(`<search-page-result[\\s\\S]*?type="${targetSectionType}"[\\s\\S]*?>([\\s\\S]*?)<\\/search-page-result>`, 'i'));
    const searchScope = sectionMatch ? sectionMatch[1] : html;

    const rows = [];
    const rowMatches = [...searchScope.matchAll(/<search-page-media-row([\s\S]*?)<\/search-page-media-row>/gi)];
    for (const rm of rowMatches) {
      const rowContent = rm[0];
      const rYear = (rowContent.match(/(?:release-?year|start-?year)="([^"]*)"/i) || [])[1] || '';
      const rScore = (rowContent.match(/tomatometer-?score="([^"]*)"/i) || [])[1] || '';
      const rSentiment = (rowContent.match(/tomatometer-?sentiment="([^"]*)"/i) || [])[1] || '';
      const rTitle = (rowContent.match(/slot="title"[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || '';
      if (rTitle) {
        rows.push({
          year: rYear.trim(),
          score: rScore.trim(),
          sentiment: rSentiment.trim(),
          title: rTitle.trim()
        });
      }
    }

    let candidate = rows.find(r => (r.year === String(year) || !year) && r.score);
    if (!candidate && rows.length > 0) {
      candidate = rows.find(r => r.score);
    }
    return candidate || null;
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  const { id, title, year, type } = req.query;
  if (!id && !title) {
    return res.status(400).json({ error: 'Missing id or title query parameter' });
  }

  // Parse OMDb Key Pool (supports OMDB_KEYS="key1,key2,key3" or OMDB_KEY="key1")
  const rawKeys = process.env.OMDB_KEYS || process.env.OMDB_KEY || '';
  const keys = rawKeys.split(/[\s,]+/).map(k => k.trim()).filter(Boolean);

  let omdbData = null;
  let omdbError = null;

  // Try OMDb API with Key Rotation
  if (keys.length > 0) {
    // Shuffle or offset keys so all keys get even distribution
    const startIndex = Math.floor(Math.random() * keys.length);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[(startIndex + i) % keys.length];
      let url = '';
      if (id && String(id).startsWith('tt')) {
        url = `https://www.omdbapi.com/?i=${encodeURIComponent(id)}&apikey=${key}`;
      } else if (title) {
        const omdbType = (type === 'tv' || type === 'series') ? 'series' : 'movie';
        url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}${year ? `&y=${encodeURIComponent(year)}` : ''}&type=${omdbType}&apikey=${key}`;
      }

      if (!url) break;

      try {
        const fetchRes = await fetch(url);
        if (fetchRes.ok) {
          const json = await fetchRes.json();
          // If key hit rate limit or invalid, try next key
          if (json.Response === 'False' && (json.Error?.includes('limit') || json.Error?.includes('Invalid API key'))) {
            omdbError = json.Error;
            continue;
          }
          if (json.Response === 'True') {
            omdbData = json;
            break;
          }
        }
      } catch (err) {
        omdbError = err.message;
      }
    }
  }

  // Extract ratings if OMDb succeeded
  if (omdbData) {
    const rtItem = (omdbData.Ratings || []).find(r => r.Source === 'Rotten Tomatoes');
    const rtVal = rtItem ? rtItem.Value : null; // e.g. "86%"
    const scoreNum = rtVal ? parseInt(rtVal, 10) : null;

    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).json({
      success: true,
      source: 'omdb',
      title: omdbData.Title || title,
      year: omdbData.Year || year,
      imdbRating: omdbData.imdbRating || null,
      rottenTomatoes: rtVal,
      rottenTomatoesScore: scoreNum,
      rottenTomatoesSentiment: (scoreNum && scoreNum >= 60) ? 'POSITIVE' : (scoreNum ? 'NEGATIVE' : null)
    });
  }

  // Fallback: Scrape Rotten Tomatoes directly (Unlimited, 0 key required)
  const queryTitle = title || id;
  const rtDirect = await scrapeRottenTomatoes(queryTitle, year, type);
  if (rtDirect && rtDirect.score) {
    const scoreNum = parseInt(rtDirect.score, 10);
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).json({
      success: true,
      source: 'rt_direct',
      title: rtDirect.title || queryTitle,
      year: rtDirect.year || year,
      imdbRating: null,
      rottenTomatoes: `${scoreNum}%`,
      rottenTomatoesScore: scoreNum,
      rottenTomatoesSentiment: rtDirect.sentiment || ((scoreNum >= 60) ? 'POSITIVE' : 'NEGATIVE')
    });
  }

  // Fallback: not found, but cache the 404 for 1 hour so we don't spam
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=1800');
  return res.status(200).json({
    success: false,
    source: 'none',
    error: omdbError || 'Rating not found',
    rottenTomatoes: null
  });
}
