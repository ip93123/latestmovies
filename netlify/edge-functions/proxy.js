// ──────────────────────────────────────────────────────────────────────────────
//  Hacky Streaming — Netlify Edge Function Stream Proxy
//  Bypasses Ravenflix/DCloud Cloudflare Worker blocks (runs on AWS/GCP edge).
//
//  Strategy (bandwidth-saving):
//    • For HLS streams: Netlify ONLY serves the tiny rewritten manifest (~5 KB).
//      Segment URLs in the manifest are rewritten to point directly at the CF
//      Worker (CF_PROXY_URL env var), so ALL heavy TS traffic bypasses Netlify.
//    • When CF_PROXY_URL is not set, falls back to self-proxying everything.
//    • For MP4 / TS direct hits (non-manifest): still proxied here (rare path).
//
//  Result: Netlify bandwidth usage drops from ~100% → ~0%.
// ──────────────────────────────────────────────────────────────────────────────

export default async (request, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const reqUrl = new URL(request.url);
  const match = reqUrl.search.match(/[?&]url=([^]*)/);
  if (!match || !match[1]) {
    return new Response('Hacky Streaming Netlify Edge Proxy Active. Usage: /proxy?url=<stream_url>', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
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

  // ── Resolve the segment proxy base ──────────────────────────────────────────
  // Prefer CF Worker for segments — Netlify only handles the tiny manifest text.
  // CF_PROXY_URL and API_SECRET are set in Netlify environment variables.
  const cfProxyUrl = (Deno.env.get('CF_PROXY_URL') || '').replace(/\/$/, '');
  const apiSecret  = Deno.env.get('API_SECRET') || '';
  const tParam     = apiSecret ? `&_t=${encodeURIComponent(apiSecret)}` : '';

  // segmentBase: where rewritten segment/child-playlist URLs will point.
  // If CF Worker is configured → offload all segments to it (saves Netlify bandwidth).
  // Otherwise → fall back to self (this Netlify proxy).
  const segmentBase = cfProxyUrl || `${reqUrl.origin}${reqUrl.pathname}`;

  const upHeaders = {
    'Referer': 'https://vidlove.cc/',
    'Origin': 'https://vidlove.cc',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  const range = request.headers.get('Range');
  if (range) upHeaders['Range'] = range;

  let upstream;
  try {
    upstream = await fetch(targetUrl.href, {
      method: request.method,
      headers: upHeaders,
    });
  } catch (err) {
    return new Response(`Upstream fetch error: ${err.message}`, { status: 502, headers: corsHeaders });
  }

  if (!upstream.ok && upstream.status !== 206) {
    const errText = await upstream.text().catch(() => '');
    return new Response(`Upstream error ${upstream.status}: ${errText}`, {
      status: upstream.status,
      headers: corsHeaders,
    });
  }

  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  const isM3U8 = targetUrl.pathname.toLowerCase().endsWith('.m3u8')
              || ct.includes('mpegurl')
              || targetUrl.href.includes('.m3u8');

  // ── HLS Manifest Rewriting ───────────────────────────────────────────────────
  // Netlify fetches the manifest once, rewrites segment lines → CF Worker URLs,
  // then returns the tiny rewritten text. hls.js fetches all segments from CF
  // directly — Netlify never touches a single byte of video data after this.
  if (isM3U8) {
    const text = await upstream.text();
    if (text.startsWith('#EXTM3U')) {
      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // Strip all non-English / non-Sinhala subtitle & CC tracks
        if (trimmed.startsWith('#EXT-X-MEDIA:') &&
            (/TYPE=SUBTITLES/i.test(trimmed) || /TYPE=CLOSED-CAPTIONS/i.test(trimmed))) {
          return null;
        }

        if (trimmed.startsWith('#')) return line;

        // Rewrite segment / child-playlist URL → CF Worker (or self as fallback)
        try {
          const abs = new URL(trimmed, targetUrl.href).href;
          return `${segmentBase}?url=${encodeURIComponent(abs)}${tParam}`;
        } catch { return line; }
      }).filter(l => l !== null).join('\n');

      return new Response(rewritten, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store, no-cache',
        },
      });
    }
  }

  // ── Binary stream pass-through (MP4 / TS direct hit) ────────────────────────
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

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
};
