// HackyMax Player Stream Engine & Subtitles (Default Player)
// Powered by HackyMax HLS Adaptive Multi-Bitrate Engine & VidSrc Scraper Pipeline

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
  // Annayum Rasoolum (2013)
  '155518': '/Subtitle/155518.srt',
  '154983': '/Subtitle/154983.srt',
  // Premam (2015)
  '341895': '/Subtitle/341895.srt',
  '337375': '/Subtitle/337375.srt',
  // Home (2021)
  '859987': '/Subtitle/859987.srt',
  '863675': '/Subtitle/863675.srt',
  '854291': '/Subtitle/854291.srt',
  // Ennu Ninte Moideen (2015)
  '360648': '/Subtitle/360648.srt',
  '349479': '/Subtitle/349479.srt',
  // Thanneer Mathan Dinangal (2019)
  '618435': '/Subtitle/618435.srt',
  '609503': '/Subtitle/609503.srt',
  // Charlie (2015)
  '372297': '/Subtitle/372297.srt',
  '371900': '/Subtitle/371900.srt',
  // Ustad Hotel (2012)
  '117751': '/Subtitle/117751.srt',
  '109012': '/Subtitle/109012.srt',
  // Bangalore Days (2014)
  '268660': '/Subtitle/268660.srt',
  '274092': '/Subtitle/274092.srt',
  // Kumbalangi Nights (2019)
  '575351': '/Subtitle/575351.srt',
  '574465': '/Subtitle/574465.srt',
};

const VIDLOVE_HEADERS = {
  'Accept': 'application/json',
  'Referer': 'https://vidlove.cc/',
  'Origin': 'https://vidlove.cc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// HackyMax stream priority: DCloud (Adaptive HLS) first, then MovieBox, then Auto, then embed scrapers
async function getHackyMaxStream(id, type, season, episode) {
  const isTv = type === 'tv';
  const sources = ['dcloud', 'moviebox'];

  for (const src of sources) {
    try {
      const apiUrl = isTv
        ? `https://api.vidlove.cc/tv?id=${id}&season=${season}&episode=${episode}&mode=json&sources=${src}`
        : `https://api.vidlove.cc/movie?id=${id}&mode=json&sources=${src}`;

      const res = await fetch(apiUrl, {
        headers: VIDLOVE_HEADERS,
        signal: AbortSignal.timeout(4500)
      });
      if (!res.ok) continue;

      const data = await res.json();
      const streamUrl = data && data.source && data.source.url;
      if (!streamUrl) continue;

      const isDcloud = (data.source && (data.source.label === 'DCloud' || data.source.source === 'dcloud')) || streamUrl.includes('dcloud');
      const format = (streamUrl.includes('.m3u8') || isDcloud) ? 'hls' : 'mp4';
      return {
        streamUrl,
        format,
        label: `HackyMax (${data.source.label || src})`,
        qualities: (data.source && data.source.qualities) || null,
        imdbId: (data.meta && data.meta.imdb_id) || null
      };
    } catch (_) {
      // Try next
    }
  }

  // Fallback: query without explicit sources parameter to grab best available
  try {
    const autoUrl = isTv
      ? `https://api.vidlove.cc/tv?id=${id}&season=${season}&episode=${episode}&mode=json`
      : `https://api.vidlove.cc/movie?id=${id}&mode=json`;
    const res = await fetch(autoUrl, {
      headers: VIDLOVE_HEADERS,
      signal: AbortSignal.timeout(4500)
    });
    if (res.ok) {
      const data = await res.json();
      const streamUrl = data && data.source && data.source.url;
      if (streamUrl) {
        const isDcloud = (data.source && (data.source.label === 'DCloud' || data.source.source === 'dcloud')) || streamUrl.includes('dcloud');
        const format = (streamUrl.includes('.m3u8') || isDcloud) ? 'hls' : 'mp4';
        return {
          streamUrl,
          format,
          label: `HackyMax (${data.source.label || data.source.source || 'Auto'})`,
          qualities: (data.source && data.source.qualities) || null,
          imdbId: (data.meta && data.meta.imdb_id) || null
        };
      }
    }
  } catch (_) {}

  return null;
}

export default async function handler(req, res) {
  const { id, type = 'movie', season = 1, episode = 1, imdb } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id parameter' });

  res.setHeader('Cache-Control', 'no-store');

  const subKey = type === 'tv' ? `${id}_S${season}_E${episode}` : `${id}`;
  let subtitleUrl = SUBTITLE_MAP[subKey] || SUBTITLE_MAP[id] || null;
  let subtitleLang = subtitleUrl ? 'si' : null;

  // 1. Fetch stream from HackyMax HLS pipeline
  let streamInfo = await getHackyMaxStream(id, type, season, episode);

  // 2. Fallback: scrape from embed providers
  if (!streamInfo) {
    const legacyHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
          streamInfo = { streamUrl: match[1], format: 'hls', label: 'HackyMax (HLS Stream)' };
          break;
        }
      } catch (_) {}
    }
  }

  const effectiveImdb = (streamInfo && streamInfo.imdbId) || imdb || null;

  // 3. Auto fallback to OpenSubtitles Sinhala or English subtitle ONLY
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
        const raw = osData.subtitles || [];
        const sinSub = raw.find(s => s.lang === 'sin' || s.lang === 'si');
        if (sinSub && sinSub.url) {
          subtitleUrl = sinSub.url;
          subtitleLang = 'si';
        } else {
          const enSub = raw.find(s => s.lang === 'eng' || s.lang === 'en');
          if (enSub && enSub.url) {
            subtitleUrl = enSub.url;
            subtitleLang = 'en';
          }
        }
      }
    } catch (_) {}
  }

  if (streamInfo && streamInfo.streamUrl) {
    const rawProxy = process.env.CF_PROXY_URL || '';
    const PROXY_BASE = (rawProxy && !rawProxy.includes('onrender.com'))
      ? rawProxy
      : 'https://latestmovies.ip93123.deno.net';
    const finalUrl = `${PROXY_BASE}?url=${encodeURIComponent(streamInfo.streamUrl)}`;

    let proxiedQualities = null;
    if (Array.isArray(streamInfo.qualities)) {
      proxiedQualities = streamInfo.qualities.map(q => ({
        ...q,
        url: `${PROXY_BASE}?url=${encodeURIComponent(q.url)}`
      }));
    }

    return res.status(200).json({
      url: finalUrl,
      qualities: proxiedQualities,
      format: streamInfo.format,
      source: streamInfo.label || 'HackyMax',
      subtitle: subtitleUrl,
      subtitleLang: subtitleLang,
      imdb: effectiveImdb
    });
  }

  return res.status(404).json({ error: 'No stream found for HackyMax', subtitle: subtitleUrl, subtitleLang: subtitleLang, imdb: effectiveImdb });
}
