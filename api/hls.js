// Predefined subtitle mapping by TMDB ID
// Format for movies:  'TMDB_ID': '/Subtitle/filename.srt'
// Format for TV:      'TMDB_ID_S1_E1': '/Subtitle/filename.srt'
const SUBTITLE_MAP = {
  // DC (2026) — Sinhala dubbed from Tamil HQ HDRip
  '1479832': '/Subtitle/DC%20%282026%29%20Tamil%20HQ%20HDRip.srt',
};

const VIDLOVE_HEADERS = {
  'Accept': 'application/json',
  'Referer': 'https://vidlove.cc/',
  'Origin': 'https://vidlove.cc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const M3U8_HEADERS = {
  'Referer': 'https://vidlove.cc/',
  'Origin': 'https://vidlove.cc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// Try to get direct HLS stream URL via vidlove API (server-side only, no CORS issue)
async function getVidloveStream(id, type, season, episode) {
  const isTv = type === 'tv';
  const sources = ['dcloud', 'moviebox2', 'moviebox'];

  for (const src of sources) {
    try {
      const apiUrl = isTv
        ? `https://api.vidlove.cc/tv?id=${id}&season=${season}&episode=${episode}&mode=json&sources=${src}`
        : `https://api.vidlove.cc/movie?id=${id}&mode=json&sources=${src}`;

      const res = await fetch(apiUrl, { headers: VIDLOVE_HEADERS });
      if (!res.ok) continue;

      const data = await res.json();
      const streamUrl = data && data.source && data.source.url;
      if (!streamUrl) continue;

      // Verify the m3u8 is accessible from Vercel (server-side)
      const probe = await fetch(streamUrl, { headers: M3U8_HEADERS });
      if (probe.ok) {
        const text = await probe.text();
        if (text.includes('#EXTM3U')) {
          return streamUrl;
        }
      }
    } catch (_) {
      // Try next source
    }
  }
  return null;
}

export default async function handler(req, res) {
  const { id, type = 'movie', season = 1, episode = 1 } = req.query;

  if (!id) return res.status(400).json({ error: 'Missing id parameter' });

  res.setHeader('Cache-Control', 'no-store');

  const subKey = type === 'tv' ? `${id}_S${season}_E${episode}` : `${id}`;
  const subtitleUrl = SUBTITLE_MAP[subKey] || SUBTITLE_MAP[id] || null;

  // ── 1. Try vidlove API for direct HLS stream ──────────────────────────
  let streamUrl = await getVidloveStream(id, type, season, episode);

  // ── 2. Fallback: scrape .m3u8 link from embed providers ──────────────
  if (!streamUrl) {
    const legacyHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/',
    };

    const providers = type === 'tv'
      ? [
          `https://vidsrc.me/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`,
          `https://vidsrc.pm/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`,
        ]
      : [
          `https://vidsrc.me/embed/movie?tmdb=${id}`,
          `https://vidsrc.pm/embed/movie?tmdb=${id}`,
        ];

    const M3U8_RE = /["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)[`"']/;

    for (const url of providers) {
      try {
        const resp = await fetch(url, { headers: legacyHeaders, redirect: 'follow' });
        if (!resp.ok) continue;
        const html = await resp.text();
        const match = html.match(M3U8_RE);
        if (match) {
          streamUrl = match[1];
          break;
        }
      } catch (_) {}
    }
  }

  if (streamUrl) {
    return res.status(200).json({ url: streamUrl, subtitle: subtitleUrl });
  }

  return res.status(404).json({ error: 'No HLS stream found', subtitle: subtitleUrl });
}
