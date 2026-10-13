// ──────────────────────────────────────────────────────────────────────────────
//  Hacky Streaming — Deno Deploy Stream Proxy (Hardened & Protected)
//  Bypasses Ravenflix/DCloud WAF blocks (runs on AWS/GCP edge).
//
//  Protection Rules (Prevents Suspensions & Abuse):
//    1. Token Authentication: Only requests with ?_t=... from your app are accepted
//    2. Target Whitelist: Only streaming CDNs (ravenflix/vidlove) can be proxied
//    3. Anti-Open-Proxy: Bots and scrapers cannot abuse your bandwidth
// ──────────────────────────────────────────────────────────────────────────────

const API_SECRET = Deno.env.get('API_SECRET') || 'hky-aGFja3lzdHJl';

// Only allow movie stream CDNs (prevents open-proxy abuse suspensions)
const ALLOWED_HOSTS = ['ravenflix.st', 'vidlove.cc', 'dcloud'];

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, User-Agent',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);

  // ── 1. Secret Token Auth (Protects your 100 GB quota from bots) ────────────
  const token = reqUrl.searchParams.get('_t') || '';
  if (API_SECRET && token !== API_SECRET) {
    return new Response('Unauthorized: Missing or invalid token', { status: 401, headers: corsHeaders });
  }

  // ── 2. URL Extraction ──────────────────────────────────────────────────────
  const match = reqUrl.search.match(/[?&]url=([^]*)/);
  if (!match || !match[1]) {
    return new Response('Hacky Streaming Proxy Active. Usage: /?url=<stream_url>', { status: 200, headers: corsHeaders });
  }

  let targetStr = match[1];
  try {
    targetStr = decodeURIComponent(targetStr);
  } catch (_) {}

  let targetUrl;
  try {
    targetUrl = new URL(targetStr);
  } catch {
    return new Response('Invalid target URL', { status: 400, headers: corsHeaders });
  }

  // ── 3. Host Whitelist (Prevents Deno from flagging as an open proxy) ────────
  const isAllowedHost = ALLOWED_HOSTS.some(h => targetUrl.hostname.endsWith(h));
  if (!isAllowedHost) {
    return new Response('Forbidden: Target domain not permitted', { status: 403, headers: corsHeaders });
  }

  // ── 4. Authenticated Upstream Headers ──────────────────────────────────────
  const upHeaders = {
    'Referer': 'https://vidlove.cc/',
    'Origin': 'https://vidlove.cc',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const range = req.headers.get('Range');
  if (range) upHeaders['Range'] = range;

  let upstream;
  try {
    upstream = await fetch(targetUrl.href, {
      method: req.method,
      headers: upHeaders,
    });
  } catch (err) {
    return new Response(`Upstream fetch error: ${err.message}`, { status: 502, headers: corsHeaders });
  }

  if (!upstream.ok && upstream.status !== 206) {
    const errText = await upstream.text().catch(() => '');
    return new Response(`Upstream error ${upstream.status}: ${errText || 'Forbidden'}`, {
      status: upstream.status,
      headers: corsHeaders,
    });
  }

  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  const isM3U8 = targetUrl.pathname.toLowerCase().endsWith('.m3u8')
              || ct.includes('mpegurl')
              || targetUrl.href.includes('.m3u8');

  const proxyBase = `${reqUrl.origin}${reqUrl.pathname}`;
  const tParam = API_SECRET ? `&_t=${encodeURIComponent(API_SECRET)}` : '';

  // ── 5. Rewrite HLS Manifest ────────────────────────────────────────────────
  if (isM3U8) {
    const text = await upstream.text();
    if (text.startsWith('#EXTM3U')) {
      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // Rewrite subtitle tracks if English or Sinhala
        if (trimmed.startsWith('#EXT-X-MEDIA:') && /TYPE=SUBTITLES/i.test(trimmed)) {
          const isAllowedLang = /LANGUAGE=["']?(en|eng|si|sin)["']?/i.test(trimmed) ||
                                /NAME=["']?(English|Sinhala)["']?/i.test(trimmed);
          if (!isAllowedLang) return null;

          return trimmed.replace(/URI=["']([^"']+)["']/i, (m, subUri) => {
            try {
              const abs = new URL(subUri, targetUrl.href).href;
              return `URI="${proxyBase}?url=${encodeURIComponent(abs)}${tParam}"`;
            } catch { return m; }
          });
        }

        if (trimmed.startsWith('#')) return line;

        try {
          const abs = new URL(trimmed, targetUrl.href).href;
          return `${proxyBase}?url=${encodeURIComponent(abs)}${tParam}`;
        } catch { return line; }
      }).filter(l => l !== null).join('\n');

      return new Response(rewritten, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }
  }

  // ── 6. Stream Binary Body (TS Chunks / MP4) ────────────────────────────────
  const resHeaders = new Headers(corsHeaders);
  for (const [key, val] of upstream.headers.entries()) {
    const k = key.toLowerCase();
    if (!['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods'].includes(k)) {
      resHeaders.set(key, val);
    }
  }
  resHeaders.set('Access-Control-Allow-Origin', '*');
  resHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
  resHeaders.set('Accept-Ranges', 'bytes');
  resHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  resHeaders.set('Pragma', 'no-cache');
  resHeaders.set('Expires', '0');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
});
