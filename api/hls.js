// Predefined subtitle mapping by TMDB ID
// Format:
// 'TMDB_ID': 'https://...',
// Or for TV shows:
// 'TMDB_ID_S1_E1': 'https://...'
const SUBTITLE_MAP = {
  // Movie: DC (Coolie / Deva 2026)
  '1479832': '/Subtitle/DC-2026-Tamil-HQ-HDRip.srt',
  '1479832-dc': '/Subtitle/DC-2026-Tamil-HQ-HDRip.srt',
};

export default async function handler(req, res) {
  const { id, type = 'movie', season = 1, episode = 1, sub } = req.query;

  if (!id) return res.status(400).json({ error: 'Missing id parameter' });

  res.setHeader('Cache-Control', 'no-store');

  const subKey = type === 'tv' ? `${id}_S${season}_E${episode}` : `${id}`;
  const subtitleUrl = sub || SUBTITLE_MAP[subKey] || SUBTITLE_MAP[id] || null;

  const headers = {
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
      const resp = await fetch(url, { headers, redirect: 'follow' });
      if (!resp.ok) continue;
      const html = await resp.text();
      const match = html.match(M3U8_RE);
      if (match) {
        return res.status(200).json({ url: match[1], subtitle: subtitleUrl });
      }
    } catch (_) {
      // Try next provider
    }
  }

  return res.status(404).json({ error: 'No HLS stream found', subtitle: subtitleUrl });
}
