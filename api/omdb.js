export default async function handler(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  if (!process.env.OMDB_KEY) {
    return res.status(500).json({ error: 'SERVER CONFIG ERROR: OMDB_KEY environment variable is missing on Vercel!' });
  }

  const url = `https://www.omdbapi.com/?i=${id}&apikey=${process.env.OMDB_KEY.trim()}`;

  try {
    const fetchRes = await fetch(url);
    
    if (!fetchRes.ok) {
      return res.status(fetchRes.status).json({ error: 'Failed to fetch from OMDB' });
    }

    const data = await fetchRes.json();
    
    // Set cache headers so Vercel caches the response at the edge
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
