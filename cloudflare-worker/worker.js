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

    const reqUrl = new URL(request.url);

    // ── 1c. Cloudflare Edge CDN Image Proxy & Cache ───────────────────────────
    // Fast edge-cached delivery for TMDB movie card posters, backdrops, and logos
    const isImgPath = reqUrl.pathname.startsWith('/img/');
    const urlMatch = reqUrl.search.match(/[?&]url=([^]*)/);
    let targetUrlStr = urlMatch && urlMatch[1] ? urlMatch[1] : '';
    try { if (targetUrlStr) targetUrlStr = decodeURIComponent(targetUrlStr); } catch (_) {}

    const isTmdbImage = isImgPath || (targetUrlStr && (targetUrlStr.includes('image.tmdb.org') || /\.(jpe?g|png|webp|avif)$/i.test(targetUrlStr)));

    if (isTmdbImage) {
      let imgTarget = targetUrlStr;
      if (isImgPath) {
        const cleanPath = reqUrl.pathname.replace(/^\/img\/?/, '');
        imgTarget = `https://image.tmdb.org/t/p/${cleanPath}`;
      }

      if (imgTarget) {
        const cache = caches.default;
        const cacheKey = new Request(request.url, request);
        let cachedRes = await cache.match(cacheKey);
        if (cachedRes) {
          return cachedRes;
        }

        try {
          const upstreamImg = await fetch(imgTarget, {
            cf: { cacheTtl: 31536000, cacheEverything: true },
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            }
          });

          if (!upstreamImg.ok) {
            return new Response('Image not found', { status: upstreamImg.status, headers: CORS });
          }

          const imgHeaders = new Headers(CORS);
          imgHeaders.set('Content-Type', upstreamImg.headers.get('content-type') || 'image/jpeg');
          imgHeaders.set('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=604800, immutable');
          imgHeaders.set('CF-Cache-Status', 'HIT');

          const response = new Response(upstreamImg.body, {
            status: 200,
            headers: imgHeaders,
          });

          ctx.waitUntil(cache.put(cacheKey, response.clone()));
          return response;
        } catch (err) {
          return new Response(`Image fetch failed: ${err.message}`, { status: 502, headers: CORS });
        }
      }
    }

    // ── 1b. Secret Token Auth for Video Streams ──────────────────────────────
    // Set API_SECRET in Cloudflare Worker env vars.
    // Vercel API appends ?_t=TOKEN to every worker URL it builds server-side.
    // HLS.js player can't send custom headers, so we use a query param instead.
    // Bots calling the worker directly without ?_t get 401 — quota protected.
    const secret = env.API_SECRET;
    if (secret) {
      const token = reqUrl.searchParams.get('_t') || '';
      if (token !== secret) {
        return new Response('Unauthorized', { status: 401, headers: CORS });
      }
    }

    // ── 2. Robust URL Extraction (Preserves ALL query params like internal_token) ──
    const fullSearch = reqUrl.search;

    // ?direct=1 → segments served directly from CDN (no worker bandwidth used)
    // Only the manifest itself passes through the worker — saves ~99% bandwidth!
    const directMode = reqUrl.searchParams.get('direct') === '1';
    
    if (!urlMatch || !urlMatch[1]) {
      return new Response('Missing ?url= parameter', { status: 400 });
    }

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
    // Carry the auth token into all rewritten segment/playlist URLs
    const tParam = reqUrl.searchParams.get('_t') ? `&_t=${encodeURIComponent(reqUrl.searchParams.get('_t'))}` : '';

    // ── 5. HLS Manifest Rewriting ─────────────────────────────────────────────
    if (isM3U8) {
      const text = await upstream.text();

      // Check if it's an actual HLS playlist
      if (text.startsWith('#EXTM3U')) {
        // Detect if this is a master playlist (has #EXT-X-STREAM-INF) or media playlist (has segments)
        const isMasterPlaylist = text.includes('#EXT-X-STREAM-INF');

        const rewritten = text.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          // Rewrite subtitle tracks if English or Sinhala
          if (trimmed.startsWith('#EXT-X-MEDIA:') && /TYPE=SUBTITLES/i.test(trimmed)) {
            const isAllowedLang = /LANGUAGE=["']?(en|eng|si|sin)["']?/i.test(trimmed) ||
                                  /NAME=["']?(English|Sinhala)["']?/i.test(trimmed);
            if (!isAllowedLang) return null;

          // Rewrite subtitle URI — always proxied (needs rewriting too)
            return trimmed.replace(/URI=["']([^"']+)["']/i, (match, subUri) => {
              try {
                const absSub = new URL(subUri, targetUrl.href).href;
                return `URI="${proxyBase}?url=${encodeURIComponent(absSub)}${tParam}"`;
              } catch {
                return match;
              }
            });
          }

          if (trimmed.startsWith('#')) return line;

          try {
            const absUrl = new URL(trimmed, targetUrl.href).href;
            // Normal mode: all segments proxied through worker
            return `${proxyBase}?url=${encodeURIComponent(absUrl)}${tParam}`;
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
    // Prevent Smart TV / browser from caching hundreds of megabytes of video chunks to flash disk
    resHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    resHeaders.set('Pragma', 'no-cache');
    resHeaders.set('Expires', '0');
    resHeaders.set('Vary', 'Accept-Encoding, CF-Device-Type, User-Agent');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  }
};
