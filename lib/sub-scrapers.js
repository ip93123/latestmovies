import { extractZipEntries, autoSelectBestSrt } from './sub-extractor.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Searches Baiscope.lk for a movie / series subtitle and extracts the best Sinhala SRT.
 * @param {string} query - Movie / Series title
 * @param {string} [preferredQuality]
 * @returns {Promise<{ source: string, postTitle: string, postUrl: string, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } } | null>}
 */
export async function searchAndExtractBaiscope(query, preferredQuality = '') {
  try {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return null;

    // 1. Search Baiscope
    const searchUrl = 'https://baiscopelk.com/?s=' + encodeURIComponent(cleanQuery);
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000)
    });
    if (!searchRes.ok) return null;

    const searchHtml = await searchRes.text();
    // Look for article post links
    const postMatch = searchHtml.match(/<article[^>]*>\s*<a\s+href="([^"]+)"/i) ||
                      searchHtml.match(/href="(\/(?:movies|tv)\/[^"]+sinhala-subtitle[^"]*)"/i);
    if (!postMatch) return null;

    const postPath = postMatch[1];
    const postUrl = postPath.startsWith('http') ? postPath : 'https://baiscopelk.com' + postPath;

    // 2. Fetch article page to extract download page link
    const articleRes = await fetch(postUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000)
    });
    if (!articleRes.ok) return null;

    const articleHtml = await articleRes.text();
    const titleMatch = articleHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const postTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : cleanQuery;

    const dlMatch = articleHtml.match(/href="(\/download\/[^"]+)"/i);
    if (!dlMatch) return null;

    const dlLandingUrl = 'https://www.baiscope.lk' + dlMatch[1];

    // 3. Fetch download landing page to get gate token
    const landingRes = await fetch(dlLandingUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000)
    });
    if (!landingRes.ok) return null;

    const landingHtml = await landingRes.text();
    const gateMatch = landingHtml.match(/data-gate\s+data-id="([^"]+)"\s+data-slug="([^"]+)"\s+data-token="([^"]+)"/);
    if (!gateMatch) return null;

    const [, id, post, token] = gateMatch;

    // 4. Redeem download ticket
    const redeemRes = await fetch('https://www.baiscope.lk/api/download/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
        'Referer': dlLandingUrl,
        'Origin': 'https://www.baiscope.lk'
      },
      body: JSON.stringify({ token, id: Number(id), post }),
      signal: AbortSignal.timeout(7000)
    });
    if (!redeemRes.ok) return null;

    const redeemData = await redeemRes.json();
    if (!redeemData?.data?.url) return null;

    const fileUrl = 'https://www.baiscope.lk' + redeemData.data.url;

    // 5. Download ZIP archive into memory
    const fileRes = await fetch(fileUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': dlLandingUrl
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!fileRes.ok) return null;

    const zipBuf = Buffer.from(await fileRes.arrayBuffer());
    const files = extractZipEntries(zipBuf);
    const bestSrt = autoSelectBestSrt(files, preferredQuality);
    if (!bestSrt) return null;

    return {
      source: 'baiscope.lk',
      postTitle,
      postUrl,
      archiveName: redeemData.data.file_name || 'subtitle.zip',
      srt: bestSrt
    };
  } catch (err) {
    console.error('[sub-scrapers] Baiscope search error:', err.message);
    return null;
  }
}

/**
 * Searches Zoom.lk for a movie / series subtitle and extracts the best Sinhala SRT.
 * @param {string} query - Movie / Series title
 * @param {string} [preferredQuality]
 * @returns {Promise<{ source: string, postTitle: string, postUrl: string, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } } | null>}
 */
export async function searchAndExtractZoom(query, preferredQuality = '') {
  try {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return null;

    // 1. Search Zoom.lk
    const searchUrl = 'https://zoom.lk/?s=' + encodeURIComponent(cleanQuery);
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return null;

    const searchHtml = await res.text();
    const matches = [...searchHtml.matchAll(/<h[23][^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a\s+href=["']([^"']+)["']/gi)].map(m => m[1]);
    if (matches.length === 0) return null;

    const postUrl = matches[0];

    // 2. Fetch Zoom article page
    const postRes = await fetch(postUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(7000)
    });
    if (!postRes.ok) return null;

    const postHtml = await postRes.text();
    const titleMatch = postHtml.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    const postTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : cleanQuery;

    // Look for sub-download link or direct zip link
    const dlMatch = postHtml.match(/href=["'](https:\/\/zoom\.lk\/sub-download\/[^"']+)["']/i) ||
                    postHtml.match(/href=["']([^"']+\.zip)["']/i);
    if (!dlMatch) return null;

    const dlUrl = dlMatch[1];

    // 3. Download ZIP into memory
    const fileRes = await fetch(dlUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': postUrl
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!fileRes.ok) return null;

    const zipBuf = Buffer.from(await fileRes.arrayBuffer());
    const files = extractZipEntries(zipBuf);
    const bestSrt = autoSelectBestSrt(files, preferredQuality);
    if (!bestSrt) return null;

    return {
      source: 'zoom.lk',
      postTitle,
      postUrl,
      archiveName: 'zoom-subtitle.zip',
      srt: bestSrt
    };
  } catch (err) {
    console.error('[sub-scrapers] Zoom search error:', err.message);
    return null;
  }
}

/**
 * Unified Auto-Fetch Runner: Searches Baiscope and Zoom concurrently.
 * Returns the best candidate.
 */
export async function autoFetchSinhalaSubtitle(query, preferredQuality = '') {
  // Launch both scrapers concurrently
  const [baiscopeResult, zoomResult] = await Promise.allSettled([
    searchAndExtractBaiscope(query, preferredQuality),
    searchAndExtractZoom(query, preferredQuality)
  ]);

  if (baiscopeResult.status === 'fulfilled' && baiscopeResult.value) {
    return baiscopeResult.value;
  }

  if (zoomResult.status === 'fulfilled' && zoomResult.value) {
    return zoomResult.value;
  }

  return null;
}
