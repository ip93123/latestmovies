import { extractZipEntries, autoSelectBestSrt } from './sub-extractor.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Searches Baiscope.lk for a movie / series subtitle and extracts the best Sinhala SRT.
 * @param {string} query - Movie / Series title
 * @param {string} [preferredQuality]
 * @returns {Promise<{ source: string, postTitle: string, postUrl: string, archiveName: string, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } } | null>}
 */
export async function searchAndExtractBaiscope(query, preferredQuality = '') {
  try {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return null;

    // 1. Search Baiscope
    const searchUrl = 'https://baiscopelk.com/?s=' + encodeURIComponent(cleanQuery);
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000)
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
      signal: AbortSignal.timeout(8000)
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
      signal: AbortSignal.timeout(8000)
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
      signal: AbortSignal.timeout(8000)
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
      signal: AbortSignal.timeout(9000)
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
      archiveName: redeemData.data.file_name || 'baiscope-subtitle.zip',
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
 * @returns {Promise<{ source: string, postTitle: string, postUrl: string, archiveName: string, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } } | null>}
 */
export async function searchAndExtractZoom(query, preferredQuality = '') {
  try {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return null;

    // 1. Search Zoom.lk
    const searchUrl = 'https://zoom.lk/?s=' + encodeURIComponent(cleanQuery);
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;

    const searchHtml = await res.text();
    const allMatches = [...searchHtml.matchAll(/<h[23][^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>\s*<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => ({
        url: m[1],
        title: m[2].replace(/<[^>]+>/g, '').trim()
      }));
    if (allMatches.length === 0) return null;

    // Filter relevant matches against query words to avoid picking sidebar/featured posts
    const queryWords = cleanQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const targetMatch = allMatches.find(m => {
      const text = (m.title + ' ' + m.url).toLowerCase();
      return queryWords.some(w => text.includes(w));
    }) || allMatches[0];

    const postUrl = targetMatch.url;
    const postTitle = targetMatch.title || cleanQuery;

    // 2. Fetch Zoom article page
    const postRes = await fetch(postUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000)
    });
    if (!postRes.ok) return null;

    const postHtml = await postRes.text();

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
      signal: AbortSignal.timeout(9000)
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
 * Searches Subz.lk for a movie / series subtitle and extracts the best Sinhala SRT.
 * @param {string} query - Movie / Series title
 * @param {string} [preferredQuality]
 * @returns {Promise<{ source: string, postTitle: string, postUrl: string, archiveName: string, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } } | null>}
 */
export async function searchAndExtractSubz(query, preferredQuality = '') {
  try {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return null;

    // 1. Fetch homepage to retrieve search_nonce token
    const homeRes = await fetch('https://subz.lk/', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000)
    });
    if (!homeRes.ok) return null;

    const homeHtml = await homeRes.text();
    const nonceMatch = homeHtml.match(/name=["']search_nonce["']\s+value=["']([^"']+)["']/i) ||
                       homeHtml.match(/value=["']([^"']+)["']\s+name=["']search_nonce["']/i);
    const nonce = nonceMatch ? nonceMatch[1] : '';

    // 2. Query search endpoint with search_nonce
    const searchUrl = `https://subz.lk/?s=${encodeURIComponent(cleanQuery)}&search_nonce=${nonce}&_wp_http_referer=%2F`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://subz.lk/'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!searchRes.ok) return null;

    const searchHtml = await searchRes.text();
    const matches = [...searchHtml.matchAll(/<a\s+href=["'](https:\/\/subz\.lk\/[^"']+)["']\s+class=["']subz-title-link["'][^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
    if (matches.length === 0) return null;

    // Filter relevant match
    const queryWords = cleanQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let targetMatch = matches[0];
    for (const m of matches) {
      const title = m[2].toLowerCase();
      if (queryWords.some(w => title.includes(w))) {
        targetMatch = m;
        break;
      }
    }

    const postUrl = targetMatch[1];
    const postTitle = targetMatch[2].replace(/<[^>]+>/g, '').trim();

    // 3. Fetch article page to extract download link
    const articleRes = await fetch(postUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000)
    });
    if (!articleRes.ok) return null;

    const articleHtml = await articleRes.text();
    const dlMatch = articleHtml.match(/href=["'](https:\/\/subz\.lk\/wp-admin\/admin-ajax\.php\?action=sub_download[^"']+)["']/i) ||
                    articleHtml.match(/href=["']([^"']+\.zip)["']/i);
    if (!dlMatch) return null;

    const rawDlUrl = dlMatch[1].replace(/&#038;/g, '&').replace(/&amp;/g, '&');
    const dlUrl = rawDlUrl.startsWith('http') ? rawDlUrl : 'https://subz.lk' + rawDlUrl;

    // 4. Download ZIP into memory
    const fileRes = await fetch(dlUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': postUrl
      },
      signal: AbortSignal.timeout(9000)
    });
    if (!fileRes.ok) return null;

    const zipBuf = Buffer.from(await fileRes.arrayBuffer());
    const files = extractZipEntries(zipBuf);
    const bestSrt = autoSelectBestSrt(files, preferredQuality);
    if (!bestSrt) return null;

    return {
      source: 'subz.lk',
      postTitle,
      postUrl,
      archiveName: 'subz-subtitle.zip',
      srt: bestSrt
    };
  } catch (err) {
    console.error('[sub-scrapers] Subz search error:', err.message);
    return null;
  }
}

/**
 * Searches Baiscope, Zoom, and Subz concurrently and returns all successful candidates.
 * @param {string} query
 * @param {string} [preferredQuality]
 * @returns {Promise<Array<{ source: string, postTitle: string, postUrl: string, archiveName: string, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } }>>}
 */
export async function searchAllSinhalaSubtitles(query, preferredQuality = '') {
  const settled = await Promise.allSettled([
    searchAndExtractBaiscope(query, preferredQuality),
    searchAndExtractZoom(query, preferredQuality),
    searchAndExtractSubz(query, preferredQuality)
  ]);

  const results = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value && item.value.srt) {
      results.push(item.value);
    }
  }

  return results;
}

/**
 * Unified Auto-Fetch Runner: Searches all sources and returns the first/best candidate.
 */
export async function autoFetchSinhalaSubtitle(query, preferredQuality = '') {
  const all = await searchAllSinhalaSubtitles(query, preferredQuality);
  if (all.length > 0) {
    // Prefer one with verified Sinhala script detected
    const withSinhala = all.find(r => r.srt?.sinhalaDetected);
    return withSinhala || all[0];
  }
  return null;
}
