// HLS stream proxy — rewrites manifest so all segment URLs also route through this proxy
// This sidesteps CORS restrictions on external CDN (ravenflix, etc.)

const PROXY_HEADERS = {
  'Referer': 'https://vidlove.cc/',
  'Origin': 'https://vidlove.cc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl); // validate
  } catch {
    return res.status(400).send('Invalid url parameter');
  }

  try {
    const upstream = await fetch(targetUrl, { headers: PROXY_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream error: ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isM3U8 = contentType.includes('mpegurl') || targetUrl.includes('.m3u8');

    if (isM3U8) {
      // Rewrite manifest — proxy all segment and child playlist URLs
      const text = await upstream.text();
      const base = new URL(targetUrl);

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;

        // Resolve relative URLs against the base m3u8 URL
        let absUrl;
        try {
          absUrl = new URL(trimmed, base).href;
        } catch {
          return line;
        }

        return `/api/hls-proxy?url=${encodeURIComponent(absUrl)}`;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(rewritten);
    }

    // For TS segments / key files — stream bytes through
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Type', contentType || 'video/MP2T');

    const buffer = await upstream.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    return res.status(502).send('Proxy error: ' + err.message);
  }
}
