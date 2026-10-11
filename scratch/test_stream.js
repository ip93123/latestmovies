// Quick local simulation of api/hls.js logic
const VIDLOVE_HEADERS = {
  'Accept': 'application/json',
  'Referer': 'https://vidlove.cc/',
  'Origin': 'https://vidlove.cc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
};
const M3U8_HEADERS = {
  'Referer': 'https://vidlove.cc/',
  'Origin': 'https://vidlove.cc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
};

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
      const probe = await fetch(streamUrl, { headers: M3U8_HEADERS });
      if (probe.ok) {
        const text = await probe.text();
        if (text.includes('#EXTM3U')) {
          return streamUrl;
        }
      }
    } catch (e) { console.warn(src, e.message); }
  }
  return null;
}

async function run() {
  console.log('Testing movie 1479832 (DC 2026)...');
  const url = await getVidloveStream(1479832, 'movie', null, null);
  console.log('  Result:', url ? '✅ Stream found: ' + url.slice(0, 80) + '...' : '❌ No stream');

  console.log('Testing TV 1399 S1E1 (Game of Thrones)...');
  const tvUrl = await getVidloveStream(1399, 'tv', 1, 1);
  console.log('  Result:', tvUrl ? '✅ Stream found: ' + tvUrl.slice(0, 80) + '...' : '❌ No stream');
}
run();
