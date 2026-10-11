// ──────────────────────────────────────────────────────────────────────────────
//  Hacky Streaming — Cloudflare Worker Stream Proxy
//  Proxies ravenflix/DCloud CDN streams with required Referer & Origin headers.
//
//  Advantages over Vercel Serverless:
//    • Runs at 200+ Cloudflare edge PoPs (much closer to viewers in SL/India)
//    • No execution timeout for I/O (only 10ms CPU budget on free plan)
//    • No chunking needed — ReadableStream pipes natively
//    • Free plan: 100,000 req/day, unlimited bandwidth
//    • Always warm — zero cold starts
//
//  Deploy: https://dash.cloudflare.com → Workers → Create → paste this file
//  Your worker URL will be: https://<name>.<account>.workers.dev
// ──────────────────────────────────────────────────────────────────────────────

const UPSTREAM_HEADERS = {
  'Referer':    'https://vidlove.cc/',
  'Origin':     'https://vidlove.cc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const CORS = {
  'Access-Control-Allow-Origin':   '*',
  'Access-Control-Allow-Methods':  'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers':  'Range, Content-Type, Accept',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
  'Access-Control-Max-Age':        '86400',
};

export default {
  async fetch(request, env, ctx) {

    // ── CORS preflight ────────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // ── Parse target URL ──────────────────────────────────────────────────────
    const reqUrl   = new URL(request.url);
    const rawParam = reqUrl.searchParams.get('url');

    if (!rawParam) {
      return new Response('Missing ?url= parameter', { status: 400 });
    }

    let targetUrl;
    try {
      targetUrl = new URL(decodeURIComponent(rawParam));
    } catch {
      return new Response('Invalid url parameter', { status: 400 });
    }

    // Only proxy ravenflix / known CDN hostnames (security allowlist)
    const ALLOWED = ['ravenflix.st', 'a2.ravenflix.st', 'c.ravenflix.st', 'd.ravenflix.st',
                     'e.ravenflix.st', 'f.ravenflix.st', 'g.ravenflix.st', 'vidlove.cc'];
    const hostOk = ALLOWED.some(h => targetUrl.hostname === h || targetUrl.hostname.endsWith('.' + h));
    if (!hostOk) {
      // Allow any ravenflix subdomain dynamically
      if (!targetUrl.hostname.endsWith('.ravenflix.st') && !targetUrl.hostname.endsWith('.vidlove.cc')) {
        return new Response('Forbidden target host', { status: 403 });
      }
    }

    // ── Build upstream request ────────────────────────────────────────────────
    const upHeaders = { ...UPSTREAM_HEADERS };

    // Pass Range header through for seekable MP4 streaming
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) upHeaders['Range'] = rangeHeader;

    let upstream;
    try {
      upstream = await fetch(targetUrl.href, {
        method:  request.method,
        headers: upHeaders,
        // cf: { cacheEverything: false }  // uncomment to disable CF caching of upstream
      });
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 });
    }

    if (!upstream.ok && upstream.status !== 206) {
      return new Response(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
        headers: CORS,
      });
    }

    const ct      = upstream.headers.get('content-type') || '';
    const isM3U8  = targetUrl.pathname.toLowerCase().endsWith('.m3u8')
                 || ct.toLowerCase().includes('mpegurl')
                 || targetUrl.href.includes('.m3u8');

    // ── HLS Manifest: rewrite segment URLs to go through this worker ─────────
    if (isM3U8) {
      const text        = await upstream.text();
      // Construct the base proxy URL (this worker's URL without search params)
      const proxyBase   = `${reqUrl.origin}${reqUrl.pathname}`;

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // Filter and rewrite #EXT-X-MEDIA:TYPE=SUBTITLES
        if (trimmed.startsWith('#EXT-X-MEDIA:') && /TYPE=SUBTITLES/i.test(trimmed)) {
          const isAllowedLang = /LANGUAGE=["']?(en|eng|si|sin)["']?/i.test(trimmed) ||
                                /NAME=["']?(English|Sinhala)["']?/i.test(trimmed);
          if (!isAllowedLang) {
            // Strip out non-English, non-Sinhala subtitle tracks (e.g. Arabic, Persian, etc.)
            return null;
          }
          // Rewrite URI if present for allowed subtitles
          return trimmed.replace(/URI=["']([^"']+)["']/i, (match, subUri) => {
            try {
              const absSub = new URL(subUri, targetUrl.href).href;
              return `URI="${proxyBase}?url=${encodeURIComponent(absSub)}"`;
            } catch {
              return match;
            }
          });
        }

        if (trimmed.startsWith('#')) return line;

        // Resolve relative segment URLs against the manifest's URL
        let absUrl;
        try {
          absUrl = new URL(trimmed, targetUrl.href).href;
        } catch {
          return line;  // keep as-is if un-parseable
        }

        return `${proxyBase}?url=${encodeURIComponent(absUrl)}`;
      }).filter(line => line !== null).join('\n');

      return new Response(rewritten, {
        headers: {
          ...CORS,
          'Content-Type':  'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store, no-cache',
        },
      });
    }

    // ── Binary stream (MP4 / TS segment) ─────────────────────────────────────
    // Cloudflare Workers stream the body natively — no buffering, no chunking.
    // The ReadableStream from upstream is piped directly to the browser.
    const respHeaders = new Headers(CORS);
    let finalCt = ct || 'video/mp4';
    if (finalCt.includes('image/') || finalCt.includes('webp')) {
      finalCt = 'video/mp2t';
    }
    respHeaders.set('Content-Type',   finalCt);
    respHeaders.set('Accept-Ranges',  'bytes');

    const passThrough = ['Content-Range', 'Content-Length', 'Last-Modified', 'ETag'];
    for (const h of passThrough) {
      const v = upstream.headers.get(h);
      if (v) respHeaders.set(h, v);
    }

    return new Response(upstream.body, {
      status:  upstream.status,   // 200 or 206
      headers: respHeaders,
    });
  },
};
