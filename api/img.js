// Cloudflare CDN Image Delivery Handler for TMDB Media
// Proxies and edge-caches movie posters, backdrops, and logos with immutable cache headers

export default async function handler(req, res) {
  let targetPath = req.query.p || req.query.path || '';
  if (!targetPath) {
    const urlObj = new URL(req.url, 'http://localhost');
    targetPath = urlObj.searchParams.get('url') || urlObj.pathname.replace(/^\/api\/img\/?/, '');
  }

  if (!targetPath) {
    return res.status(400).send('Missing image path');
  }

  // Sanitize path
  let tmdbUrl;
  if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
    if (!targetPath.includes('image.tmdb.org')) {
      return res.status(403).send('Only TMDB images permitted');
    }
    tmdbUrl = targetPath;
  } else {
    const clean = targetPath.replace(/\.\./g, '').replace(/^\/+/, '');
    tmdbUrl = `https://image.tmdb.org/t/p/${clean}`;
  }

  try {
    const upstream = await fetch(tmdbUrl, {
      headers: {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream image error');
    }

    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    // Cloudflare Edge & Browser 1-year immutable caching
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=604800, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const buffer = await upstream.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    return res.status(502).send('Error fetching image: ' + err.message);
  }
}
