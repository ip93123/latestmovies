// /api/subtitles.js — Baiscope.lk Sinhala subtitle proxy
// Fetches ZIP from baiscope.lk, extracts SRT, converts to VTT, returns text/vtt
// Query params:
//   title   — show/movie title (e.g. "The Mentalist")
//   season  — season number (TV only)
//   episode — episode number (TV only)
//   year    — release year (movies, optional for TV)

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const { title, season, episode, year } = req.query;

  if (!title) {
    return res.status(400).json({ error: 'Missing title parameter' });
  }

  try {
    // ── Step 1: Build candidate Baiscope page URLs ────────────────────────
    const slug = slugify(title);
    let candidateUrls = [];

    if (season && episode) {
      // TV episode — zero-pad season/episode
      const ss = String(season).padStart(2, '0');
      const ee = String(episode).padStart(2, '0');
      candidateUrls = [
        `https://www.baiscope.lk/${slug}-s${ss}-e${ee}-sinhala-subtitle/`,
        `https://www.baiscope.lk/${slug}-s${ss}e${ee}-sinhala-subtitle/`,
        `https://www.baiscope.lk/${slug}-season-${+season}-episode-${+episode}-sinhala-subtitle/`,
      ];
    } else {
      // Movie
      const yr = year || '';
      candidateUrls = [
        `https://www.baiscope.lk/${slug}-${yr}-sinhala-subtitles/`,
        `https://www.baiscope.lk/${slug}-sinhala-subtitles/`,
        `https://www.baiscope.lk/${slug}-${yr}-sinhala-subtitle/`,
      ];
    }

    // ── Step 2: Find working page and extract download link ───────────────
    let downloadUrl = null;
    const HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9,si;q=0.8',
      'Referer': 'https://www.baiscope.lk/',
    };

    for (const url of candidateUrls) {
      try {
        const pageRes = await fetch(url, { headers: HEADERS });
        if (!pageRes.ok) continue;
        const html = await pageRes.text();
        // Find dlm-buttons download link: href="/Downloads/12345/"
        const match = html.match(/href="(https?:\/\/www\.baiscope\.lk\/Downloads\/\d+\/[^"]*)"/i);
        if (match) { downloadUrl = match[1]; break; }
      } catch { continue; }
    }

    // ── Step 2b: Fallback — search baiscope.lk ───────────────────────────
    if (!downloadUrl) {
      const searchQuery = season && episode
        ? `${title} S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`
        : `${title} ${year || ''}`.trim();
      const searchUrl = `https://www.baiscope.lk/?s=${encodeURIComponent(searchQuery)}`;
      try {
        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        if (searchRes.ok) {
          const html = await searchRes.text();
          // Pick first post link that matches
          const postMatch = html.match(/href="(https?:\/\/www\.baiscope\.lk\/[^"]+sinhala-subtitle[^"]*)"/i);
          if (postMatch) {
            const postRes = await fetch(postMatch[1], { headers: HEADERS });
            if (postRes.ok) {
              const postHtml = await postRes.text();
              const dlMatch = postHtml.match(/href="(https?:\/\/www\.baiscope\.lk\/Downloads\/\d+\/[^"]*)"/i);
              if (dlMatch) downloadUrl = dlMatch[1];
            }
          }
        }
      } catch { /* ignore */ }
    }

    if (!downloadUrl) {
      return res.status(404).json({ error: 'Subtitle not found on Baiscope for this title/episode' });
    }

    // ── Step 3: Download the ZIP file ─────────────────────────────────────
    const zipRes = await fetch(downloadUrl, {
      headers: { ...HEADERS, Referer: 'https://www.baiscope.lk/' },
      redirect: 'follow',
    });
    if (!zipRes.ok) {
      return res.status(502).json({ error: 'Failed to download subtitle ZIP from Baiscope' });
    }

    const zipBuffer = Buffer.from(await zipRes.arrayBuffer());

    // ── Step 4: Extract SRT from ZIP (pure JS, no extra deps) ────────────
    const srtContent = extractSrtFromZip(zipBuffer);
    if (!srtContent) {
      return res.status(502).json({ error: 'No SRT file found inside ZIP' });
    }

    // ── Step 5: Convert SRT → WebVTT ──────────────────────────────────────
    const vttContent = srtToVtt(srtContent);

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(vttContent);

  } catch (err) {
    console.error('Subtitle proxy error:', err);
    return res.status(500).json({ error: 'Internal error fetching subtitle' });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function srtToVtt(srt) {
  return 'WEBVTT\n\n' + srt
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')  // commas → dots in timestamps
    .trim();
}

// Minimal ZIP parser — finds the first .srt or .ass file inside a ZIP buffer
// ZIP format: each local file header starts with PK\x03\x04
function extractSrtFromZip(buf) {
  const SIG = 0x04034b50; // local file header signature
  let offset = 0;
  let bestSrt = null;

  while (offset < buf.length - 30) {
    // Check local file header signature
    if (buf.readUInt32LE(offset) !== SIG) { offset++; continue; }

    const compression    = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const fnameLen       = buf.readUInt16LE(offset + 26);
    const extraLen       = buf.readUInt16LE(offset + 28);
    const fname          = buf.slice(offset + 30, offset + 30 + fnameLen).toString('utf8');
    const dataOffset     = offset + 30 + fnameLen + extraLen;

    if (/\.(srt|ass|ssa|vtt)$/i.test(fname) && compression === 0) {
      // Stored (uncompressed) — read directly
      const data = buf.slice(dataOffset, dataOffset + compressedSize);
      bestSrt = data.toString('utf8');
      break;
    } else if (/\.(srt|ass|ssa|vtt)$/i.test(fname) && compression === 8) {
      // Deflate compressed — use built-in zlib
      try {
        const { inflateRawSync } = require('zlib');
        const compressed = buf.slice(dataOffset, dataOffset + compressedSize);
        bestSrt = inflateRawSync(compressed).toString('utf8');
        break;
      } catch { /* skip */ }
    }

    offset = dataOffset + compressedSize;
  }

  return bestSrt;
}
