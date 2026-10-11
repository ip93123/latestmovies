// Subtitle API & Proxy — handles subtitle catalog (Sinhala & OpenSubtitles) and proxying

// Predefined Sinhala Subtitle Mapping
const SUBTITLE_MAP = {
  '1479832': '/Subtitle/1479832.srt', // DC (2026)
  '1321108': '/Subtitle/1321108.srt', // Dude (2025)
  '1433117': '/Subtitle/1433117.srt', // Kara (2026)
  '1408162': '/Subtitle/1408162.srt', // Vishwanath & Sons (2026)
  '1508564': '/Subtitle/1508564.srt', // With Love (2026)
  '1069945': '/Subtitle/1069945.srt', // Manjummel Boys (2024)
  '1149791': '/Subtitle/1149791.srt', // Premalu (2024)
  '1508168': '/Subtitle/1508168.srt', // Bethlehem Kudumba Unit (2026)
  '1314279': '/Subtitle/1314279.srt', // Hi (2026)
  '1544847': '/Subtitle/1544847.srt', // Pradhama Drishtiya Kuttakkar (2026)
  '1473354': '/Subtitle/1473354.srt', // Sarvam Maya (2025)
};

const LANG_MAP = {
  eng: { label: 'English', flag: '🇬🇧' },
  spa: { label: 'Spanish', flag: '🇪🇸' },
  fre: { label: 'French', flag: '🇫🇷' },
  fra: { label: 'French', flag: '🇫🇷' },
  ger: { label: 'German', flag: '🇩🇪' },
  deu: { label: 'German', flag: '🇩🇪' },
  ita: { label: 'Italian', flag: '🇮🇹' },
  por: { label: 'Portuguese', flag: '🇵🇹' },
  pob: { label: 'Portuguese (BR)', flag: '🇧🇷' },
  rus: { label: 'Russian', flag: '🇷🇺' },
  hin: { label: 'Hindi', flag: '🇮🇳' },
  tam: { label: 'Tamil', flag: '🇮🇳' },
  mal: { label: 'Malayalam', flag: '🇮🇳' },
  tel: { label: 'Telugu', flag: '🇮🇳' },
  ara: { label: 'Arabic', flag: '🇸🇦' },
  kor: { label: 'Korean', flag: '🇰🇷' },
  chi: { label: 'Chinese', flag: '🇨🇳' },
  zho: { label: 'Chinese', flag: '🇨🇳' },
  jpn: { label: 'Japanese', flag: '🇯🇵' },
  tur: { label: 'Turkish', flag: '🇹🇷' },
  ind: { label: 'Indonesian', flag: '🇮🇩' },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Mode 1: Proxy remote subtitle file (CORS / charset bypass)
  const { url } = req.query;
  if (url) {
    try {
      const fetchRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).send('Failed to fetch subtitle');
      }

      const text = await fetchRes.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(text);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to proxy subtitle: ' + err.message });
    }
  }

  // Mode 2: Get available subtitle tracks catalog for movie or episode
  const { id, imdb, type = 'movie', season = 1, episode = 1 } = req.query;
  if (!id && !imdb) {
    return res.status(400).json({ error: 'Missing id, imdb, or url parameter' });
  }

  const subKey = type === 'tv' ? `${id}_S${season}_E${episode}` : `${id}`;
  const localSinhalaSub = SUBTITLE_MAP[subKey] || SUBTITLE_MAP[id] || null;

  const tracks = [];

  // Priority 1: Sinhala Master subtitle (if available locally)
  if (localSinhalaSub) {
    tracks.push({
      id: 'sinhala',
      lang: 'si',
      label: 'Sinhala 🇱🇰',
      url: localSinhalaSub,
      isDefault: true,
      source: 'master'
    });
  }

  // Priority 2: Query OpenSubtitles for English and other language tracks
  if (imdb) {
    try {
      const openSubPath = type === 'tv'
        ? `series/${imdb}:${season}:${episode}`
        : `movie/${imdb}`;
      const osRes = await fetch(`https://opensubtitles-v3.strem.io/subtitles/${openSubPath}.json`, {
        signal: AbortSignal.timeout(4000)
      });
      if (osRes.ok) {
        const osData = await osRes.json();
        const rawSubs = osData.subtitles || [];
        const seenLangs = new Set();

        // Add English track first
        const enSubs = rawSubs.filter(s => s.lang === 'eng');
        if (enSubs.length > 0) {
          tracks.push({
            id: 'english',
            lang: 'en',
            label: 'English 🇬🇧',
            url: enSubs[0].url,
            isDefault: !localSinhalaSub, // Defaults to English if no Sinhala subtitle exists!
            source: 'opensubtitles'
          });
          seenLangs.add('eng');
        }

        // Add top remaining languages
        for (const s of rawSubs) {
          const l = (s.lang || '').toLowerCase();
          if (seenLangs.has(l) || l === 'eng') continue;
          seenLangs.add(l);
          const meta = LANG_MAP[l] || { label: l.toUpperCase(), flag: '🌐' };
          tracks.push({
            id: `os_${l}`,
            lang: l,
            label: `${meta.label} ${meta.flag}`,
            url: s.url,
            isDefault: false,
            source: 'opensubtitles'
          });
          if (tracks.length >= 12) break; // Limit to 12 clean choices
        }
      }
    } catch (_) {}
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({
    id,
    imdb,
    defaultLang: localSinhalaSub ? 'si' : (tracks.some(t => t.lang === 'en') ? 'en' : null),
    tracks
  });
}
