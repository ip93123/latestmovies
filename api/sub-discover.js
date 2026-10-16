import { loadCatalogAsync, verifyToken } from './sub-api.js';

const TMDB_KEY = process.env.TMDB_API_KEY || '8265bd1679663a7ea12ac168da84d2e8';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const queryParams = req.method === 'GET' ? req.query : (req.body || {});

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '') || queryParams.token;
  const verified = verifyToken(token);

  if (!verified) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Please log in at /sub first to access Sub Hunter'
    });
  }
  const {
    year = 'all',
    rating = 'all',
    sort = 'popularity.desc',
    language = 'all',
    status = 'missing', // 'missing', 'has_sub', 'all'
    limit = 20,
    page = 1,
    q = ''
  } = queryParams;

  const targetLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 5), 100);
  const startPage = Math.max(parseInt(page, 10) || 1, 1);
  const cleanQ = String(q || '').trim();

  try {
    const catalog = await loadCatalogAsync();
    let accumulatedMovies = [];
    let currentPage = startPage;
    let maxPagesToScan = cleanQ ? 1 : Math.ceil(targetLimit / 15) + 2;
    if (maxPagesToScan > 6) maxPagesToScan = 6;

    let totalTmdbResults = 0;

    for (let i = 0; i < maxPagesToScan; i++) {
      let tmdbUrl = '';

      if (cleanQ) {
        tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(cleanQ)}&page=${currentPage}`;
      } else if (sort === 'trending_day' || sort === 'trending_week') {
        const timeWindow = sort === 'trending_day' ? 'day' : 'week';
        tmdbUrl = `https://api.themoviedb.org/3/trending/movie/${timeWindow}?api_key=${TMDB_KEY}&page=${currentPage}`;
      } else if (sort === 'now_playing') {
        tmdbUrl = `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&page=${currentPage}`;
      } else {
        const p = new URLSearchParams({
          api_key: TMDB_KEY,
          sort_by: sort,
          page: String(currentPage)
        });

        if (year && year !== 'all') {
          if (year.includes('-')) {
            const [yStart, yEnd] = year.split('-');
            p.set('primary_release_date.gte', `${yStart}-01-01`);
            p.set('primary_release_date.lte', `${yEnd}-12-31`);
          } else {
            p.set('primary_release_year', year);
          }
        }

        if (rating && rating !== 'all') {
          p.set('vote_average.gte', String(rating));
          p.set('vote_count.gte', '5');
        }

        if (language && language !== 'all') {
          p.set('with_original_language', language);
        }

        tmdbUrl = `https://api.themoviedb.org/3/discover/movie?${p.toString()}`;
      }

      const tmdbRes = await fetch(tmdbUrl, { signal: AbortSignal.timeout(6000) });
      if (!tmdbRes.ok) break;

      const tmdbData = await tmdbRes.json();
      const pageResults = tmdbData.results || [];
      totalTmdbResults = tmdbData.total_results || 0;
      if (pageResults.length === 0) break;

      for (const m of pageResults) {
        if (!m.id) continue;
        if (accumulatedMovies.some(x => x.id === m.id)) continue;

        // Year / Language post-filter for trending endpoints which don't support query filters natively
        const mYear = (m.release_date || '').slice(0, 4);
        if (year && year !== 'all' && (sort === 'trending_day' || sort === 'trending_week' || cleanQ)) {
          if (year.includes('-')) {
            const [yStart, yEnd] = year.split('-');
            if (mYear < yStart || mYear > yEnd) continue;
          } else if (mYear !== year) {
            continue;
          }
        }

        if (language && language !== 'all' && (sort === 'trending_day' || sort === 'trending_week' || cleanQ)) {
          if (m.original_language !== language) continue;
        }

        if (rating && rating !== 'all' && (sort === 'trending_day' || sort === 'trending_week' || cleanQ)) {
          if ((m.vote_average || 0) < parseFloat(rating)) continue;
        }

        const subKey = String(m.id);
        const existingSub = catalog[subKey] || null;
        const hasSubtitle = Boolean(existingSub);

        if (status === 'missing' && hasSubtitle) continue;
        if (status === 'has_sub' && !hasSubtitle) continue;

        accumulatedMovies.push({
          id: m.id,
          title: m.title || m.original_title || 'Untitled',
          original_title: m.original_title || m.title || '',
          year: mYear,
          release_date: m.release_date || '',
          vote_average: m.vote_average ? Number(m.vote_average.toFixed(1)) : 0,
          vote_count: m.vote_count || 0,
          original_language: m.original_language || 'en',
          overview: m.overview || '',
          poster_path: m.poster_path ? `https://img.hackymax.fun/t/p/w500${m.poster_path}` : null,
          backdrop_path: m.backdrop_path ? `https://img.hackymax.fun/t/p/w1280${m.backdrop_path}` : null,
          hasSubtitle,
          existingSub: existingSub ? {
            source: existingSub.source,
            uploader: existingSub.uploader,
            format: existingSub.format,
            originalFile: existingSub.originalFile,
            url: existingSub.url
          } : null
        });

        if (accumulatedMovies.length >= targetLimit) break;
      }

      if (accumulatedMovies.length >= targetLimit || currentPage >= (tmdbData.total_pages || 1)) {
        break;
      }
      currentPage++;
    }

    return res.status(200).json({
      success: true,
      count: accumulatedMovies.length,
      limit: targetLimit,
      page: startPage,
      totalTmdbResults,
      filters: {
        year,
        rating,
        sort,
        language,
        status,
        q: cleanQ
      },
      movies: accumulatedMovies
    });

  } catch (err) {
    console.error('[sub-discover] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover movies'
    });
  }
}
