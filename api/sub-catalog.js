import fs from 'fs';
import path from 'path';

// Seed titles from existing hardcoded collection
const SEED_TITLES = {
  '1235877': { title: 'Jana Nayagan', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1235877.srt' },
  '869227': { title: 'Super Sharanya', year: '2022', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/869227.srt' },
  '1506736': { title: 'Thudakkam', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1506736.srt' },
  '646097': { title: 'Rebel Ridge', year: '2024', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/646097.srt' },
  '1542187': { title: 'Varavu', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1542187.srt' },
  '1419406': { title: "The Shadow's Edge", year: '2025', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1419406.srt' },
  '1071215': { title: 'Thanksgiving', year: '2023', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1071215.srt' },
  '1213243': { title: 'Toxic', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1213243.srt' },
  '1479832': { title: 'DC', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1479832.srt' },
  '1321108': { title: 'Dude', year: '2025', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1321108.srt' },
  '1433117': { title: 'Kara', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1433117.srt' },
  '1408162': { title: 'Vishwanath & Sons', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1408162.srt' },
  '1508564': { title: 'With Love', year: '2026', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1508564.srt' },
  '1069945': { title: 'Manjummel Boys', year: '2024', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1069945.srt' },
  '1149791': { title: 'Premalu', year: '2024', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/1149791.srt' },
  '360648': { title: 'Ennu Ninte Moideen', year: '2015', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/360648.srt' },
  '341895': { title: 'Premam', year: '2015', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/341895.srt' },
  '575351': { title: 'Kumbalangi Nights', year: '2019', mediaType: 'movie', format: 'srt', uploader: 'System', url: '/Subtitle/575351.srt' },
  '41727': { title: 'Banshee', year: '2013', mediaType: 'tv', format: 'srt', uploader: 'System', url: '/Subtitle/Banshee/S01E01.srt' }
};

// Global in-memory cache
let _catalogCache = null;

export function getCatalogFilePath() {
  return path.join(process.cwd(), 'Subtitle', 'catalog.json');
}

export function loadCatalog() {
  if (_catalogCache) return _catalogCache;

  const catalog = { ...SEED_TITLES };
  try {
    const p = getCatalogFilePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      Object.assign(catalog, data);
    }
  } catch (err) {
    console.error('[sub-catalog] Error loading catalog.json:', err.message);
  }

  _catalogCache = catalog;
  return catalog;
}

export function saveCatalog(catalog) {
  _catalogCache = catalog;
  try {
    const p = getCatalogFilePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(catalog, null, 2), 'utf8');
  } catch (err) {
    console.error('[sub-catalog] Error writing catalog.json:', err.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { id, type = 'movie', season = 1, episode = 1, recent, all } = req.query;
  const catalog = loadCatalog();

  // Return full catalog
  if (all === '1' || all === 'true') {
    return res.status(200).json({ total: Object.keys(catalog).length, catalog });
  }

  // Return recent uploads
  if (recent === '1' || recent === 'true') {
    const list = Object.entries(catalog).map(([k, item]) => ({
      key: k,
      ...item
    })).sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0)).slice(0, 25);
    return res.status(200).json({ recent: list });
  }

  // Check specific item
  if (!id) {
    return res.status(400).json({ error: 'Missing id query parameter' });
  }

  const subKey = type === 'tv' ? `${id}_S${season}_E${episode}` : `${id}`;
  const item = catalog[subKey] || (type === 'tv' ? catalog[id] : null);

  if (item) {
    return res.status(200).json({
      exists: true,
      key: subKey,
      item
    });
  }

  return res.status(200).json({
    exists: false,
    key: subKey,
    item: null
  });
}
