import http from 'node:http';
import { Readable } from 'node:stream';

// ──────────────────────────────────────────────────────────────────────────────
//  Hacky Streaming — Hugging Face Spaces Stream Proxy (Unmetered Engine)
//  Bypasses Ravenflix/DCloud WAF blocks (runs on AWS datacenter).
//  Unmetered 24/7 bandwidth with native HLS manifest rewriting and byte-range seeking.
// ──────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 7860;
const API_SECRET = process.env.API_SECRET || 'hky-aGFja3lzdHJl';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, User-Agent',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const UPSTREAM_HEADERS = {
  'Referer': 'https://vidlove.cc/',
  'Origin': 'https://vidlove.cc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
};

const server = http.createServer(async (req, res) => {
  // ── 1. CORS Preflight ─────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    return res.end('Method Not Allowed');
  }

  // Parse URL & query
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const reqUrl = new URL(req.url, `${proto}://${host}`);

  // ── 2. Health Check / Status ──────────────────────────────────────────────
  const fullSearch = reqUrl.search;
  const match = fullSearch.match(/[?&]url=([^]*)/);
  if (!match || !match[1]) {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    return res.end('Hacky Streaming HF Spaces Stream Proxy Active. Usage: /?url=<stream_url>');
  }

  // ── 3. Token Auth ─────────────────────────────────────────────────────────
  if (API_SECRET) {
    const token = reqUrl.searchParams.get('_t') || '';
    if (token !== API_SECRET) {
      res.writeHead(401, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
      return res.end('Unauthorized');
    }
  }

  // ── 4. Target URL Extraction ──────────────────────────────────────────────
  let targetUrlStr = match[1];
  try {
    targetUrlStr = decodeURIComponent(targetUrlStr);
  } catch (_) {}

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlStr);
  } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    return res.end('Invalid url parameter');
  }

  // ── 5. Prepare Upstream Request ───────────────────────────────────────────
  const fetchHeaders = { ...UPSTREAM_HEADERS };
  if (req.headers.range) {
    fetchHeaders['Range'] = req.headers.range;
  }

  const abortCtrl = new AbortController();
  req.on('close', () => abortCtrl.abort());

  let upstream;
  try {
    upstream = await fetch(targetUrl.href, {
      method: req.method,
      headers: fetchHeaders,
      signal: abortCtrl.signal,
    });
  } catch (err) {
    if (abortCtrl.signal.aborted) return;
    res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    return res.end(`Upstream fetch failed: ${err.message}`);
  }

  if (!upstream.ok && upstream.status !== 206) {
    const errText = await upstream.text().catch(() => '');
    res.writeHead(upstream.status, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    return res.end(`Upstream error ${upstream.status}: ${errText || 'Forbidden'}`);
  }

  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  const isM3U8 = targetUrl.pathname.toLowerCase().endsWith('.m3u8')
              || ct.includes('mpegurl')
              || targetUrl.href.includes('.m3u8')
              || (ct.includes('text') && !targetUrl.pathname.endsWith('.mp4'));

  const proxyBase = `${proto}://${host}${reqUrl.pathname}`;
  const tParam = API_SECRET ? `&_t=${encodeURIComponent(API_SECRET)}` : '';

  // ── 6. HLS Manifest Rewriting ─────────────────────────────────────────────
  if (isM3U8) {
    try {
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
              } catch {
                return m;
              }
            });
          }

          if (trimmed.startsWith('#')) return line;

          try {
            const absUrl = new URL(trimmed, targetUrl.href).href;
            return `${proxyBase}?url=${encodeURIComponent(absUrl)}${tParam}`;
          } catch {
            return line;
          }
        }).filter(line => line !== null).join('\n');

        res.writeHead(200, {
          ...CORS_HEADERS,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        });
        return res.end(rewritten);
      }
    } catch (e) {
      // Fall through to binary piping if text read fails
    }
  }

  // ── 7. Binary Video Stream (TS Chunks & MP4) ──────────────────────────────
  const outHeaders = {
    ...CORS_HEADERS,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  for (const [k, v] of upstream.headers.entries()) {
    const key = k.toLowerCase();
    if (!key.startsWith('access-control-') && key !== 'content-encoding') {
      outHeaders[k] = v;
    }
  }

  res.writeHead(upstream.status, outHeaders);

  if (upstream.body) {
    const stream = Readable.fromWeb(upstream.body);
    stream.pipe(res);
    stream.on('error', () => {
      abortCtrl.abort();
      res.destroy();
    });
  } else {
    res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 Hugging Face Stream Proxy listening on port ${PORT}`);
});
