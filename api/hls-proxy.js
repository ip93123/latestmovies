// Stream proxy — handles HLS playlists, TS segments, and direct MP4 streams
// Sidesteps ravenflix referer check and CORS restrictions

import { Readable } from 'stream';

const PROXY_HEADERS = {
  'Referer': 'https://vidlove.cc/',
  'Origin': 'https://vidlove.cc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// Safe chunk size for Vercel Serverless (Hobby plan = 10s max execution)
// 4MB at slowest CDN speed (0.77 MB/s) = 5.2s + ~1s latency = ~6.2s — comfortably within 10s
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

export default async function handler(req, res) {
  // ── Secret Token Auth ─────────────────────────────────────────────────────
  const secret = process.env.API_SECRET;
  if (secret) {
    const token = (req.query && req.query._t) || (req.headers && req.headers['x-hacky-token']);
    if (token !== secret) {
      return res.status(401).send('Unauthorized');
    }
  }

  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  // If a Cloudflare Worker stream proxy is configured, redirect to it immediately
  // This bypasses Vercel Serverless Function egress completely and saves 100% bandwidth!
  if (process.env.CF_PROXY_URL) {
    const cfBase = process.env.CF_PROXY_URL.replace(/\/$/, '');
    const _tParam = process.env.API_SECRET ? `&_t=${encodeURIComponent(process.env.API_SECRET)}` : '';
    return res.redirect(307, `${cfBase}?url=${encodeURIComponent(url)}${_tParam}`);
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl); // validate
  } catch {
    return res.status(400).send('Invalid url parameter');
  }

  try {
    const upstreamHeaders = { ...PROXY_HEADERS };
    const clean = targetUrl.toLowerCase().split('?')[0];
    const isM3U8 = clean.endsWith('.m3u8') || targetUrl.includes('.m3u8');

    // For binary streams/segments: chunk open-ended ranges to prevent Vercel Serverless timeouts & hangs
    if (!isM3U8) {
      const clientRange = req.headers && req.headers['range'];
      if (clientRange) {
        const match = clientRange.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          let end = match[2] ? parseInt(match[2], 10) : start + MAX_CHUNK_BYTES - 1;
          if (end - start + 1 > MAX_CHUNK_BYTES) {
            end = start + MAX_CHUNK_BYTES - 1;
          }
          upstreamHeaders['Range'] = `bytes=${start}-${end}`;
        } else {
          upstreamHeaders['Range'] = clientRange;
        }
      }
    }

    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(15000)
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).send(`Upstream error: ${upstream.status}`);
    }

    const contentType = upstream.headers.get('content-type') || '';
    const isPlaylistManifest = isM3U8 || contentType.includes('mpegurl') || targetUrl.includes('.m3u8');

    if (isPlaylistManifest) {
      // Rewrite manifest — proxy all segment and child playlist URLs
      const text = await upstream.text();
      const base = new URL(targetUrl);

      const _tParam = secret ? `&_t=${encodeURIComponent(secret)}` : '';

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
              const absSub = new URL(subUri, base).href;
              return `URI="/api/hls-proxy?url=${encodeURIComponent(absSub)}${_tParam}"`;
            } catch {
              return match;
            }
          });
        }

        if (trimmed.startsWith('#')) return line;

        // Resolve relative URLs against the base m3u8 URL
        let absUrl;
        try {
          absUrl = new URL(trimmed, base).href;
        } catch {
          return line;
        }

        return `/api/hls-proxy?url=${encodeURIComponent(absUrl)}${_tParam}`;
      }).filter(line => line !== null).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
      return res.status(200).send(rewritten);
    }

    // Direct MP4 or TS segment streaming with Range support
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800, immutable');

    let finalContentType = contentType || 'video/mp4';
    if (finalContentType.includes('image/') || finalContentType.includes('webp')) {
      finalContentType = 'video/mp2t';
    }
    res.setHeader('Content-Type', finalContentType);

    if (upstream.headers.has('content-range')) {
      res.setHeader('Content-Range', upstream.headers.get('content-range'));
    }
    if (upstream.headers.has('content-length')) {
      res.setHeader('Content-Length', upstream.headers.get('content-length'));
    }

    res.status(upstream.status);

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      return res.status(502).send('Proxy error: ' + err.message);
    }
  }
}
