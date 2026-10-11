// ──────────────────────────────────────────────────────────────────────────────
//  Hacky Streaming — Cloudflare Worker Stream Proxy (High-Performance Engine)
//  Proxies ravenflix/DCloud CDN streams with complete parameter preservation,
//  browser-authentic headers, and native HLS playlist segment rewriting.
//
//  Deploy: Paste into your Cloudflare Worker (tight-rain-5c22.hackyirl.workers.dev)
// ──────────────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':   '*',
  'Access-Control-Allow-Methods':  'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers':  'Range, Content-Type, Accept, User-Agent',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
  'Access-Control-Max-Age':        '86400',
};

export default {
  async fetch(request, env, ctx) {

    // ── 1. CORS Preflight ─────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // ── 2. Robust URL Extraction (Preserves ALL query params like internal_token) ──
    const reqUrl = new URL(request.url);
    const fullSearch = reqUrl.search;
    const urlMatch = fullSearch.match(/[?&]url=([^]*)/);
    
    if (!urlMatch || !urlMatch[1]) {
      return new Response('Missing ?url= parameter', { status: 400 });
    }

    let targetUrlStr = urlMatch[1];
    try {
      targetUrlStr = decodeURIComponent(targetUrlStr);
    } catch (_) {}

    let targetUrl;
    try {
      targetUrl = new URL(targetUrlStr);
    } catch {
      return new Response('Invalid url parameter', { status: 400 });
    }

    // ── 3. Authenticated Browser Headers ───────────────────────────────────────
    const upHeaders = {
      'Referer': 'https://vidlove.cc/',
      'Origin': 'https://vidlove.cc',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
    };

    // Forward Range header for video seeking
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      upHeaders['Range'] = rangeHeader;
    }

    // ── 4. Fetch Upstream Stream ──────────────────────────────────────────────
    let upstream;
    try {
      upstream = await fetch(targetUrl.href, {
        method: request.method,
        headers: upHeaders,
      });
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err.message}`, { status: 502, headers: CORS });
    }

    if (!upstream.ok && upstream.status !== 206) {
      const errBody = await upstream.text().catch(() => '');
      return new Response(`Upstream error ${upstream.status}: ${errBody || 'Forbidden'}`, {
        status: upstream.status,
        headers: CORS,
      });
    }

    const ct = (upstream.headers.get('content-type') || '').toLowerCase();
    const isM3U8 = targetUrl.pathname.toLowerCase().endsWith('.m3u8')
                || ct.includes('mpegurl')
                || targetUrl.href.includes('.m3u8')
                || (ct.includes('text') && !targetUrl.pathname.endsWith('.mp4'));

    const proxyBase = `${reqUrl.origin}${reqUrl.pathname}`;

    // ── 5. HLS Manifest Rewriting ─────────────────────────────────────────────
    if (isM3U8) {
      const text = await upstream.text();

      // Check if it's an actual HLS playlist
      if (text.startsWith('#EXTM3U')) {
        const rewritten = text.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          // Rewrite subtitle tracks if English or Sinhala
          if (trimmed.startsWith('#EXT-X-MEDIA:') && /TYPE=SUBTITLES/i.test(trimmed)) {
            const isAllowedLang = /LANGUAGE=["']?(en|eng|si|sin)["']?/i.test(trimmed) ||
                                  /NAME=["']?(English|Sinhala)["']?/i.test(trimmed);
            if (!isAllowedLang) return null;

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

          // Rewrite segment URLs to stream through this worker
          try {
            const absUrl = new URL(trimmed, targetUrl.href).href;
            return `${proxyBase}?url=${encodeURIComponent(absUrl)}`;
          } catch {
            return line;
          }
        }).filter(line => line !== null).join('\n');

        return new Response(rewritten, {
          status: 200,
          headers: {
            ...CORS,
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        });
      }
    }

    // ── 6. Binary Video Stream (TS Segments & MP4 Streams) ────────────────────
    const resHeaders = new Headers(CORS);
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
  }
};
