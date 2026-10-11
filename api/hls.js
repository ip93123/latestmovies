// Predefined subtitle mapping by TMDB ID
// Format for movies:  'TMDB_ID': '/Subtitle/filename.srt'
// Format for TV:      'TMDB_ID_S1_E1': '/Subtitle/filename.srt'
const SUBTITLE_MAP = {
  // DC (2026)
  '1479832': '/Subtitle/1479832.srt',
  // Hitler (2024/2026)
  '1185591': '/Subtitle/1185591.srt',
  // Dude (2025)
  '1321108': '/Subtitle/1321108.srt',
  // Kara (2026)
  '1433117': '/Subtitle/1433117.srt',
  // Vishwanath & Sons (2026)
  '1408162': '/Subtitle/1408162.srt',
  // With Love (2026)
  '1508564': '/Subtitle/1508564.srt',
  // Manjummel Boys (2024)
  '1069945': '/Subtitle/1069945.srt',
  // Premalu (2024)
  '1149791': '/Subtitle/1149791.srt',
  // Bethlehem Kudumba Unit (2026)
  '1508168': '/Subtitle/1508168.srt',
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

// Get direct HLS (.m3u8) stream URL via vidlove API with fast timeouts
async function getVidloveStream(id, type, season, episode) {
  const isTv = type === 'tv';
  const sources = ['dcloud'];

  for (const src of sources) {
    try {
      const apiUrl = isTv
        ? `https://api.vidlove.cc/tv?id=${id}&season=${season}&episode=${episode}&mode=json&sources=${src}`
        : `https://api.vidlove.cc/movie?id=${id}&mode=json&sources=${src}`;

      const res = await fetch(apiUrl, {
        headers: VIDLOVE_HEADERS,
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) continue;

      const data = await res.json();
      const streamUrl = data && data.source && data.source.url;
      if (!streamUrl) continue;

      // Fast HEAD probe to verify the stream URL is responsive
      const probe = await fetch(streamUrl, {
        method: 'HEAD',
        headers: M3U8_HEADERS,
        signal: AbortSignal.timeout(3000)
      });
      if (probe.ok) {
        return streamUrl;
      }
    } catch (_) {
      // Try next
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

  // ── 1. Try vidlove API for direct HLS stream (fast, resolves in ~1s) ───
  let streamUrl = await getVidloveStream(id, type, season, episode);

  // ── 2. Fallback: scrape .m3u8 link from embed providers with short timeout ──
  if (!streamUrl) {
    const legacyHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
        const resp = await fetch(url, {
          headers: legacyHeaders,
          redirect: 'follow',
          signal: AbortSignal.timeout(2500)
        });
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
    // Wrap through our HLS proxy so browser bypasses ravenflix referer/CORS check
    const proxied = `/api/hls-proxy?url=${encodeURIComponent(streamUrl)}`;
    return res.status(200).json({ url: proxied, subtitle: subtitleUrl });
  }

  return res.status(404).json({ error: 'No HLS stream found', subtitle: subtitleUrl });
}
