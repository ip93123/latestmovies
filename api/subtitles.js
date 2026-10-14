import fs from 'fs';
import path from 'path';

// Subtitle API & Proxy — handles subtitle catalog (Sinhala & OpenSubtitles) and proxying

// Predefined Sinhala Subtitle Mapping
const SUBTITLE_MAP = {
  '1506736': '/Subtitle/1506736.srt', // Thudakkam (2026)
  '646097': '/Subtitle/646097.srt', // Rebel Ridge (2024)
  '1542187': '/Subtitle/1542187.srt', // Varavu (2026)
  '1419406': '/Subtitle/1419406.srt', // The Shadow's Edge (2025)
  '1071215': '/Subtitle/1071215.srt', // Thanksgiving (2023)
  '1213243': '/Subtitle/1213243.srt', // Toxic (2026)
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
  '155518': '/Subtitle/155518.srt', // Annayum Rasoolum (2013)
  '341895': '/Subtitle/341895.srt', // Premam (2015)
  '337375': '/Subtitle/337375.srt', // Premam (2015) (alt)
  '859987': '/Subtitle/859987.srt', // Home (2021)
  '863675': '/Subtitle/863675.srt', // Home (2021) (alt)
  '854291': '/Subtitle/854291.srt', // Home (2021) (alt2)
  '360648': '/Subtitle/360648.srt', // Ennu Ninte Moideen (2015)
  '349479': '/Subtitle/349479.srt', // Ennu Ninte Moideen (2015) (alt)
  '618435': '/Subtitle/618435.srt', // Thanneer Mathan Dinangal (2019)
  '609503': '/Subtitle/609503.srt', // Thanneer Mathan Dinangal (2019) (alt)
  '372297': '/Subtitle/372297.srt', // Charlie (2015)
  '371900': '/Subtitle/371900.srt', // Charlie (2015) (alt)
  '117751': '/Subtitle/117751.srt', // Ustad Hotel (2012)
  '109012': '/Subtitle/109012.srt', // Ustad Hotel (2012) (alt)
  '268660': '/Subtitle/268660.srt', // Bangalore Days (2014)
  '274092': '/Subtitle/274092.srt', // Bangalore Days (2014) (alt)
  '575351': '/Subtitle/575351.srt', // Kumbalangi Nights (2019)
  '574465': '/Subtitle/574465.srt', // Kumbalangi Nights (2019) (alt)

  // Banshee (2013–2016) [TMDB: 41727]
  '41727': '/Subtitle/Banshee/S01E01.srt',
  '41727_S1_E1': '/Subtitle/Banshee/S01E01.srt',
  '41727_S1_E2': '/Subtitle/Banshee/S01E02.srt',
  '41727_S1_E3': '/Subtitle/Banshee/S01E03.srt',
  '41727_S1_E4': '/Subtitle/Banshee/S01E04.srt',
  '41727_S1_E5': '/Subtitle/Banshee/S01E05.srt',
  '41727_S1_E6': '/Subtitle/Banshee/S01E06.srt',
  '41727_S1_E7': '/Subtitle/Banshee/S01E07.srt',
  '41727_S1_E8': '/Subtitle/Banshee/S01E08.srt',
  '41727_S1_E9': '/Subtitle/Banshee/S01E09.srt',
  '41727_S1_E10': '/Subtitle/Banshee/S01E10.srt',
  '41727_S2_E1': '/Subtitle/Banshee/S02E01.srt',
  '41727_S2_E2': '/Subtitle/Banshee/S02E02.srt',
  '41727_S2_E3': '/Subtitle/Banshee/S02E03.srt',
  '41727_S2_E4': '/Subtitle/Banshee/S02E04.srt',
  '41727_S2_E5': '/Subtitle/Banshee/S02E05.srt',
  '41727_S2_E6': '/Subtitle/Banshee/S02E06.srt',
  '41727_S2_E7': '/Subtitle/Banshee/S02E07.srt',
  '41727_S2_E8': '/Subtitle/Banshee/S02E08.srt',
  '41727_S2_E9': '/Subtitle/Banshee/S02E09.srt',
  '41727_S2_E10': '/Subtitle/Banshee/S02E10.srt',
  '41727_S3_E1': '/Subtitle/Banshee/S03E01.srt',
  '41727_S3_E2': '/Subtitle/Banshee/S03E02.srt',
  '41727_S3_E3': '/Subtitle/Banshee/S03E03.srt',
  '41727_S3_E4': '/Subtitle/Banshee/S03E04.srt',
  '41727_S3_E5': '/Subtitle/Banshee/S03E05.srt',
  '41727_S3_E6': '/Subtitle/Banshee/S03E06.srt',
  '41727_S3_E7': '/Subtitle/Banshee/S03E07.srt',
  '41727_S3_E8': '/Subtitle/Banshee/S03E08.srt',
  '41727_S3_E9': '/Subtitle/Banshee/S03E09.srt',
  '41727_S3_E10': '/Subtitle/Banshee/S03E10.srt',
  '41727_S4_E1': '/Subtitle/Banshee/S04E01.srt',
  '41727_S4_E2': '/Subtitle/Banshee/S04E02.srt',
  '41727_S4_E3': '/Subtitle/Banshee/S04E03.srt',
  '41727_S4_E4': '/Subtitle/Banshee/S04E04.srt',
  '41727_S4_E5': '/Subtitle/Banshee/S04E05.srt',
  '41727_S4_E6': '/Subtitle/Banshee/S04E06.srt',
  '41727_S4_E7': '/Subtitle/Banshee/S04E07.srt',
  '41727_S4_E8': '/Subtitle/Banshee/S04E08.srt',
};

const LANG_MAP = {
  sin: { label: 'Sinhala', flag: '🇱🇰' },
  si: { label: 'Sinhala', flag: '🇱🇰' },
};

function srtToVtt(srt) {
  let vtt = 'WEBVTT\n\n';
  srt = srt.replace(/^\uFEFF/, '');
  srt = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  vtt += srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return vtt;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id, imdb, type = 'movie', season = 1, episode = 1, format, vtt, url } = req.query;
  const isVtt = format === 'vtt' || vtt === '1' || vtt === 'true' || (req.url && req.url.includes('.vtt'));

  // Mode 1: Proxy remote subtitle file (CORS / charset bypass / VTT conversion)
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

      let text = await fetchRes.text();
      if (isVtt && !text.startsWith('WEBVTT')) {
        text = srtToVtt(text);
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      } else {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(text);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to proxy subtitle: ' + err.message });
    }
  }

  // Mode 2: Serve local subtitle directly as WebVTT for embed players (VidLink, etc.)
  if (id && isVtt) {
    const subKey = type === 'tv' ? `${id}_S${season}_E${episode}` : `${id}`;
    const localSub = SUBTITLE_MAP[subKey] || SUBTITLE_MAP[id] || null;
    if (localSub) {
      try {
        const filePath = path.join(process.cwd(), localSub);
        if (fs.existsSync(filePath)) {
          const buf = fs.readFileSync(filePath);
          let srtContent = (buf[0] === 0xFF && buf[1] === 0xFE)
            ? buf.toString('utf16le')
            : buf.toString('utf8');
          if (srtContent.charCodeAt(0) === 0xFEFF) srtContent = srtContent.slice(1);
          srtContent = srtContent.replace(/\x00/g, '');
          res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.status(200).send(srtToVtt(srtContent));
        }
      } catch (err) {
        console.error('[VTT serving error]', err);
      }
    }
  }

  // Mode 3: Get available subtitle tracks catalog for movie or episode
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

  // Resolve IMDB ID from Vidlove metadata if missing
  let resolvedImdb = imdb || null;
  if (!resolvedImdb && id) {
    try {
      const vUrl = type === 'tv'
        ? `https://api.vidlove.cc/tv?id=${id}&season=${season}&episode=${episode}&mode=json&sources=moviebox`
        : `https://api.vidlove.cc/movie?id=${id}&mode=json&sources=moviebox`;
      const vRes = await fetch(vUrl, {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://vidlove.cc/',
          'Origin': 'https://vidlove.cc',
          'User-Agent': 'Mozilla/5.0'
        },
        signal: AbortSignal.timeout(3500)
      });
      if (vRes.ok) {
        const vData = await vRes.json();
        if (vData.meta && vData.meta.imdb_id) {
          resolvedImdb = vData.meta.imdb_id;
        }
      }
    } catch (_) {}
  }

  // Priority 2: Query OpenSubtitles for Sinhala track ONLY (English removed per request)
  if (resolvedImdb) {
    try {
      const openSubPath = type === 'tv'
        ? `series/${resolvedImdb}:${season}:${episode}`
        : `movie/${resolvedImdb}`;
      const osRes = await fetch(`https://opensubtitles-v3.strem.io/subtitles/${openSubPath}.json`, {
        signal: AbortSignal.timeout(4000)
      });
      if (osRes.ok) {
        const osData = await osRes.json();
        const rawSubs = osData.subtitles || [];

        const isNotArabic = s => s.url && !s.url.includes('/ar/') && !s.url.includes('/ara/') && s.lang !== 'ar' && s.lang !== 'ara';

        // Check for Sinhala from OpenSubtitles if no local Sinhala sub exists
        if (!localSinhalaSub) {
          const sinSubs = rawSubs.filter(s => (s.lang === 'sin' || s.lang === 'si') && isNotArabic(s));
          if (sinSubs.length > 0) {
            tracks.push({
              id: 'sinhala',
              lang: 'si',
              label: 'Sinhala 🇱🇰',
              url: sinSubs[0].url,
              isDefault: true,
              source: 'opensubtitles'
            });
          }
        }
      }
    } catch (_) {}
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({
    id,
    imdb: resolvedImdb,
    defaultLang: tracks.length > 0 ? 'si' : null,
    tracks
  });
}
