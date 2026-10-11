// Predefined subtitle mapping by TMDB ID
// Format for movies:  'TMDB_ID': '/Subtitle/filename.srt'
// Format for TV:      'TMDB_ID_S1_E1': '/Subtitle/filename.srt'
const SUBTITLE_MAP = {
  // DC (2026)
  '1479832': '/Subtitle/1479832.srt',
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
  // Hi (2026)
  '1314279': '/Subtitle/1314279.srt',
  // Pradhama Drishtiya Kuttakkar (2026)
  '1544847': '/Subtitle/1544847.srt',
  // Sarvam Maya (2025)
  '1473354': '/Subtitle/1473354.srt',
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

// Prioritize MovieBox (pure clean 1080p, no burned-in Persian/Arabic subs)
// Falls back to DCloud only if MovieBox is unavailable
async function getVidloveStream(id, type, season, episode) {
  const isTv = type === 'tv';
  const sources = ['moviebox', 'dcloud'];

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

      const format = (streamUrl.includes('.m3u8') || (data.source && data.source.label === 'DCloud')) ? 'hls' : 'mp4';
      return {
        streamUrl,
        format,
        label: data.source.label || src,
        imdbId: (data.meta && data.meta.imdb_id) || null
      };
    } catch (_) {
      // Try next source
    }
  }
  return null;
}

export default async function handler(req, res) {
  const { id, type = 'movie', season = 1, episode = 1, imdb } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id parameter' });

  res.setHeader('Cache-Control', 'no-store');

  const subKey = type === 'tv' ? `${id}_S${season}_E${episode}` : `${id}`;
  let subtitleUrl = SUBTITLE_MAP[subKey] || SUBTITLE_MAP[id] || null;
  let subtitleLang = subtitleUrl ? 'si' : null;

  // ── 1. Try vidlove API for stream (MovieBox clean master prioritized) ───
  let streamInfo = await getVidloveStream(id, type, season, episode);

  // ── 2. Fallback: scrape .m3u8 link from embed providers with short timeout ──
  if (!streamInfo) {
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
          streamInfo = { streamUrl: match[1], format: 'hls', label: 'Legacy' };
          break;
        }
      } catch (_) {}
    }
  }

  const effectiveImdb = (streamInfo && streamInfo.imdbId) || imdb || null;

  // ── Auto fallback to OpenSubtitles English subtitle if no Sinhala subtitle ──
  if (!subtitleUrl && effectiveImdb) {
    try {
      const openSubPath = type === 'tv'
        ? `series/${effectiveImdb}:${season}:${episode}`
        : `movie/${effectiveImdb}`;
      const osRes = await fetch(`https://opensubtitles-v3.strem.io/subtitles/${openSubPath}.json`, {
        signal: AbortSignal.timeout(3000)
      });
      if (osRes.ok) {
        const osData = await osRes.json();
        const enSub = (osData.subtitles || []).find(s => s.lang === 'eng');
        if (enSub && enSub.url) {
          subtitleUrl = enSub.url;
          subtitleLang = 'en';
        }
      }
    } catch (_) {}
  }

  if (streamInfo && streamInfo.streamUrl) {
    // Wrap through our stream proxy
    const proxied = `/api/hls-proxy?url=${encodeURIComponent(streamInfo.streamUrl)}`;
    return res.status(200).json({
      url: proxied,
      format: streamInfo.format,
      source: streamInfo.label,
      subtitle: subtitleUrl,
      subtitleLang: subtitleLang,
      imdb: effectiveImdb
    });
  }

  return res.status(404).json({ error: 'No stream found', subtitle: subtitleUrl, subtitleLang: subtitleLang, imdb: effectiveImdb });
}
