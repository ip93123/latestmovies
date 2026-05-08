export default async function handler(req, res) {
  const target = req.query.target;
  if (!target || typeof target !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid target' });
  }

  // Security: Prevent path traversal
  if (target.includes('..')) {
    return res.status(403).json({ error: 'Forbidden path traversal' });
  }

  // Security: Restrict access to read-only endpoints (prevent account manipulation)
  const allowedPaths = ['/movie', '/tv', '/search', '/trending', '/discover'];
  const isAllowed = allowedPaths.some(p => target.startsWith(p));
  
  if (!isAllowed) {
    return res.status(403).json({ error: 'Endpoint not permitted' });
  }

  const url = `https://api.themoviedb.org/3${target}`;

  try {
    const fetchRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!fetchRes.ok) {
      return res.status(fetchRes.status).json({ error: 'Failed to fetch from TMDB' });
    }

    const data = await fetchRes.json();
    
    // Set cache headers so Vercel caches the response at the edge
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
