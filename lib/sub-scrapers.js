import { extractZipEntries, autoSelectBestSrt } from './sub-extractor.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by']);

/**
 * Multi-Factor Scoring Algorithm for Subtitle Candidates.
 * Evaluates candidate using 3 distinct filters:
 *  1. Release Year Filter: Exact match (+65) vs 1-yr boundary (-20) vs wrong year (-80)
 *  2. Title Exactness & Sequel Filter: Token overlap + severe penalty for sequels/subtitles (e.g. "The Revenge", "Chapter 2")
 *  3. Confidence Threshold Filter: Discards candidates with score < 35
 *
 * @param {string} postTitle
 * @param {string} targetTitle
 * @param {string|number} [targetYear]
 * @param {string} [postUrl]
 * @returns {{ score: number, isAccepted: boolean, postYear: string|null, yearMatch: boolean|null }}
 */
export function scoreSubtitleCandidate(postTitle, targetTitle, targetYear = '', postUrl = '') {
  let score = 0;
  const cleanPost = (postTitle || '').toLowerCase();
  const cleanUrl = (postUrl || '').toLowerCase();
  const combinedText = `${cleanPost} ${cleanUrl}`;
  const cleanTarget = (targetTitle || '').toLowerCase().trim();
  const targetYearStr = targetYear ? String(targetYear).trim() : '';

  // 1. Extract 4-digit years (1900-2099) from postTitle and URL
  const yearMatches = [...combinedText.matchAll(/\b(19\d\d|20\d\d)\b/g)].map(m => m[1]);
  const postYear = yearMatches.length > 0 ? yearMatches[0] : null;

  // ── FILTER 1: Release Year Match Filter ──────────────────────────────────────
  if (targetYearStr && postYear) {
    if (postYear === targetYearStr) {
      score += 65; // Exact release year match
    } else {
      const diff = Math.abs(Number(postYear) - Number(targetYearStr));
      if (diff === 1) {
        score -= 20; // 1-year boundary difference (festival vs theatrical)
      } else {
        score -= 80; // Definite different year / different film / prequel / sequel
      }
    }
  } else if (!targetYearStr && postYear) {
    score += 5;
  }

  // ── FILTER 2: Title Exactness & Sequel / Spin-off Penalty ───────────────────
  const strippedPost = cleanPost
    .replace(/\b(19\d\d|20\d\d)\b/g, '')
    .replace(/sinhala\s*subtitles?/gi, '')
    .replace(/[\[\(][^\]\)]*[\]\)]/g, '')
    .replace(/[\u0D80-\u0DFF]/g, '') // remove Sinhala characters
    .replace(/[|:·\-_/\\]/g, ' ')
    .replace(/\b(complete|bluray|web\s*dl|hdrip|brrip|dvdrip|hq|hd|hindi|english|tamil|telugu|malayalam|korean|movie)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const strippedTarget = cleanTarget
    .replace(/\b(19\d\d|20\d\d)\b/g, '')
    .replace(/[\[\(][^\]\)]*[\]\)]/g, '')
    .replace(/[|:·\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const allTargetWords = strippedTarget.split(/\s+/).filter(w => w.length > 1);
  const sigTargetWords = allTargetWords.filter(w => !STOP_WORDS.has(w));
  const targetWords = sigTargetWords.length > 0 ? sigTargetWords : allTargetWords;

  const postWords = strippedPost.split(/\s+/).filter(w => w.length > 1);

  // Check matched words
  const matchedTargetWords = targetWords.filter(tw =>
    postWords.some(pw => pw === tw || (pw.length >= 4 && tw.length >= 4 && (pw.startsWith(tw) || tw.startsWith(pw))))
  );

  // MANDATORY REQUIREMENT: If 0 significant target words match, REJECT IMMEDIATELY!
  if (matchedTargetWords.length === 0) {
    return {
      score: -999,
      isAccepted: false,
      postYear,
      yearMatch: targetYearStr && postYear ? postYear === targetYearStr : null
    };
  }

  // For multi-word titles, require at least 50% of significant words to match
  const matchRatio = matchedTargetWords.length / targetWords.length;
  if (targetWords.length > 1 && matchRatio < 0.5) {
    return {
      score: -999,
      isAccepted: false,
      postYear,
      yearMatch: targetYearStr && postYear ? postYear === targetYearStr : null
    };
  }

  const allTargetWordsPresent = matchedTargetWords.length === targetWords.length;
  if (allTargetWordsPresent) {
    score += 45;

    // Detect extra words that indicate a sequel / subtitle
    const extraWords = postWords.filter(pw => !targetWords.some(tw => tw === pw || pw.startsWith(tw) || tw.startsWith(pw)));
    if (extraWords.length > 0) {
      score -= extraWords.length * 15;
    }

    // Heavy penalty for sequel keywords if target title didn't have them
    const sequelKeywords = ['revenge', 'chapter', 'part', 'returns', 'reloaded', 'resurrection', 'legacy', 'origin', 'origins', 'rising', 'vol', 'volume', 'sequel', 'prequel', 'side', '2', 'ii', '3', 'iii', '4', 'iv', '5', 'v'];
    for (const kw of sequelKeywords) {
      if (extraWords.includes(kw) && !targetWords.includes(kw)) {
        score -= 35; // Heavy sequel mismatch penalty
      }
    }
  } else {
    score += Math.round(matchRatio * 25);
  }

  // TV / Season check: If target does not specify season/episode, but post is a TV episode
  const isPostTv = /\b(s\d+|season\s*\d+|e\d+|episode\s*\d+)\b/i.test(postTitle);
  const isTargetTv = /\b(s\d+|season\s*\d+|e\d+|episode\s*\d+)\b/i.test(targetTitle);
  if (isPostTv && !isTargetTv) {
    score -= 50; // Heavy penalty: TV episode matched against a movie
  }

  // Exact title bonus
  if (allTargetWordsPresent && targetWords.length === postWords.filter(pw => !STOP_WORDS.has(pw)).length) {
    score += 20;
  }

  // ── FILTER 3: Confidence Threshold ─────────────────────────────────────────
  const isAccepted = score >= 35;

  return {
    score,
    isAccepted,
    postYear,
    yearMatch: targetYearStr && postYear ? postYear === targetYearStr : null
  };
}

/**
 * Searches Baiscope.lk for a movie / series subtitle and extracts the best Sinhala SRT.
 * @param {string} query - Movie / Series title
 * @param {string} [preferredQuality]
 * @param {string|number} [year] - Release year
 * @returns {Promise<{ source: string, postTitle: string, postUrl: string, archiveName: string, matchedYear: string|null, matchScore: number, yearMatch: boolean|null, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } } | null>}
 */
export async function searchAndExtractBaiscope(query, preferredQuality = '', year = '') {
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
    
    // Parse all article cards
    const articles = [...searchHtml.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)];
    const candidates = [];
    for (const art of articles) {
      const content = art[1];
      const linkMatches = [...content.matchAll(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      for (const l of linkMatches) {
        const rawPath = l[1];
        const text = l[2].replace(/<[^>]+>/g, '').trim();
        if (text.length > 5 && (rawPath.includes('/movies/') || rawPath.includes('/tv/') || rawPath.includes('sinhala-subtitle'))) {
          const fullUrl = rawPath.startsWith('http') ? rawPath : 'https://baiscopelk.com' + rawPath;
          candidates.push({ url: fullUrl, title: text });
          break; // First relevant link in each article
        }
      }
    }

    if (candidates.length === 0) return null;

    // Apply 3-filter evaluation and rank candidates
    const scoredCandidates = candidates
      .map(c => ({
        ...c,
        ...scoreSubtitleCandidate(c.title, cleanQuery, year, c.url)
      }))
      .filter(c => c.isAccepted)
      .sort((a, b) => b.score - a.score);

    if (scoredCandidates.length === 0) return null;

    // Try candidates in order of highest score
    for (const targetCandidate of scoredCandidates.slice(0, 3)) {
      try {
        const postUrl = targetCandidate.url;

        // 2. Fetch article page to extract download page link
        const articleRes = await fetch(postUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000)
        });
        if (!articleRes.ok) continue;

        const articleHtml = await articleRes.text();
        const dlMatch = articleHtml.match(/href="(\/download\/[^"]+)"/i);
        if (!dlMatch) continue;

        const dlLandingUrl = 'https://www.baiscope.lk' + dlMatch[1];

        // 3. Fetch download landing page to get gate token
        const landingRes = await fetch(dlLandingUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000)
        });
        if (!landingRes.ok) continue;

        const landingHtml = await landingRes.text();
        const gateMatch = landingHtml.match(/data-gate\s+data-id="([^"]+)"\s+data-slug="([^"]+)"\s+data-token="([^"]+)"/);
        if (!gateMatch) continue;

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
        if (!redeemRes.ok) continue;

        const redeemData = await redeemRes.json();
        if (!redeemData?.data?.url) continue;

        const fileUrl = 'https://www.baiscope.lk' + redeemData.data.url;

        // 5. Download ZIP archive into memory
        const fileRes = await fetch(fileUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Referer': dlLandingUrl
          },
          signal: AbortSignal.timeout(9000)
        });
        if (!fileRes.ok) continue;

        const zipBuf = Buffer.from(await fileRes.arrayBuffer());
        const files = extractZipEntries(zipBuf);
        const bestSrt = autoSelectBestSrt(files, preferredQuality);
        if (!bestSrt) continue;

        return {
          source: 'baiscope.lk',
          postTitle: targetCandidate.title,
          postUrl: targetCandidate.url,
          archiveName: redeemData.data.file_name || 'baiscope-subtitle.zip',
          matchedYear: targetCandidate.postYear,
          matchScore: targetCandidate.score,
          yearMatch: targetCandidate.yearMatch,
          srt: bestSrt
        };
      } catch (err) {
        console.warn(`[sub-scrapers] Baiscope candidate ${targetCandidate.url} failed:`, err.message);
      }
    }

    return null;
  } catch (err) {
    console.error('[sub-scrapers] Baiscope search error:', err.message);
    return null;
  }
}

/**
 * Searches Zoom.lk for a movie / series subtitle and extracts the best Sinhala SRT.
 * @param {string} query - Movie / Series title
 * @param {string} [preferredQuality]
 * @param {string|number} [year] - Release year
 * @returns {Promise<{ source: string, postTitle: string, postUrl: string, archiveName: string, matchedYear: string|null, matchScore: number, yearMatch: boolean|null, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } } | null>}
 */
export async function searchAndExtractZoom(query, preferredQuality = '', year = '') {
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

    // Apply 3-filter evaluation and rank candidates
    const scoredCandidates = allMatches
      .map(c => ({
        ...c,
        ...scoreSubtitleCandidate(c.title, cleanQuery, year, c.url)
      }))
      .filter(c => c.isAccepted)
      .sort((a, b) => b.score - a.score);

    if (scoredCandidates.length === 0) return null;

    // Try candidates in order of highest score
    for (const targetCandidate of scoredCandidates.slice(0, 3)) {
      try {
        const postUrl = targetCandidate.url;

        // 2. Fetch Zoom article page
        const postRes = await fetch(postUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000)
        });
        if (!postRes.ok) continue;

        const postHtml = await postRes.text();

        // Look for sub-download link or direct zip link
        const dlMatch = postHtml.match(/href=["'](https:\/\/zoom\.lk\/sub-download\/[^"']+)["']/i) ||
                        postHtml.match(/href=["']([^"']+\.zip)["']/i);
        if (!dlMatch) continue;

        const dlUrl = dlMatch[1];

        // 3. Download ZIP into memory
        const fileRes = await fetch(dlUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Referer': postUrl
          },
          signal: AbortSignal.timeout(9000)
        });
        if (!fileRes.ok) continue;

        const zipBuf = Buffer.from(await fileRes.arrayBuffer());
        const files = extractZipEntries(zipBuf);
        const bestSrt = autoSelectBestSrt(files, preferredQuality);
        if (!bestSrt) continue;

        return {
          source: 'zoom.lk',
          postTitle: targetCandidate.title,
          postUrl: targetCandidate.url,
          archiveName: 'zoom-subtitle.zip',
          matchedYear: targetCandidate.postYear,
          matchScore: targetCandidate.score,
          yearMatch: targetCandidate.yearMatch,
          srt: bestSrt
        };
      } catch (err) {
        console.warn(`[sub-scrapers] Zoom candidate ${targetCandidate.url} failed:`, err.message);
      }
    }

    return null;
  } catch (err) {
    console.error('[sub-scrapers] Zoom search error:', err.message);
    return null;
  }
}

/**
 * Searches Subz.lk for a movie / series subtitle and extracts the best Sinhala SRT.
 * @param {string} query - Movie / Series title
 * @param {string} [preferredQuality]
 * @param {string|number} [year] - Release year
 * @returns {Promise<{ source: string, postTitle: string, postUrl: string, archiveName: string, matchedYear: string|null, matchScore: number, yearMatch: boolean|null, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } } | null>}
 */
export async function searchAndExtractSubz(query, preferredQuality = '', year = '') {
  try {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return null;

    // 1. Fetch homepage to retrieve search_nonce token and session cookies
    const homeRes = await fetch('https://subz.lk/', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000)
    });
    if (!homeRes.ok) return null;

    const subzCookies = homeRes.headers.get('set-cookie') || '';
    const homeHtml = await homeRes.text();
    const nonceMatch = homeHtml.match(/name=["']search_nonce["']\s+value=["']([^"']+)["']/i) ||
                       homeHtml.match(/value=["']([^"']+)["']\s+name=["']search_nonce["']/i);
    const nonce = nonceMatch ? nonceMatch[1] : '';

    // 2. Query search endpoint with search_nonce and cookies
    const searchUrl = `https://subz.lk/?s=${encodeURIComponent(cleanQuery)}&search_nonce=${nonce}&_wp_http_referer=%2F`;
    const searchHeaders = {
      'User-Agent': USER_AGENT,
      'Referer': 'https://subz.lk/'
    };
    if (subzCookies) searchHeaders['Cookie'] = subzCookies;
    const searchRes = await fetch(searchUrl, {
      headers: searchHeaders,
      signal: AbortSignal.timeout(8000)
    });
    if (!searchRes.ok) return null;

    const searchHtml = await searchRes.text();
    const allMatches = [...searchHtml.matchAll(/<a\s+href=["'](https:\/\/subz\.lk\/[^"']+)["']\s+class=["']subz-title-link["'][^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/gi)]
      .map(m => ({
        url: m[1],
        title: m[2].replace(/<[^>]+>/g, '').trim()
      }));

    if (allMatches.length === 0) return null;

    // Apply 3-filter evaluation and rank candidates
    const scoredCandidates = allMatches
      .map(c => ({
        ...c,
        ...scoreSubtitleCandidate(c.title, cleanQuery, year, c.url)
      }))
      .filter(c => c.isAccepted)
      .sort((a, b) => b.score - a.score);

    if (scoredCandidates.length === 0) return null;

    // Try candidates in order of highest score
    for (const targetCandidate of scoredCandidates.slice(0, 3)) {
      try {
        const postUrl = targetCandidate.url;

        // 3. Fetch article page to extract download link
        const articleRes = await fetch(postUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000)
        });
        if (!articleRes.ok) continue;

        const articleHtml = await articleRes.text();
        const dlMatch = articleHtml.match(/href=["'](https:\/\/subz\.lk\/wp-admin\/admin-ajax\.php\?action=sub_download[^"']+)["']/i) ||
                        articleHtml.match(/href=["']([^"']+\.zip)["']/i);
        if (!dlMatch) continue;

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
        if (!fileRes.ok) continue;

        const zipBuf = Buffer.from(await fileRes.arrayBuffer());
        const files = extractZipEntries(zipBuf);
        const bestSrt = autoSelectBestSrt(files, preferredQuality);
        if (!bestSrt) continue;

        return {
          source: 'subz.lk',
          postTitle: targetCandidate.title,
          postUrl: targetCandidate.url,
          archiveName: 'subz-subtitle.zip',
          matchedYear: targetCandidate.postYear,
          matchScore: targetCandidate.score,
          yearMatch: targetCandidate.yearMatch,
          srt: bestSrt
        };
      } catch (err) {
        console.warn(`[sub-scrapers] Subz candidate ${targetCandidate.url} failed:`, err.message);
      }
    }

    return null;
  } catch (err) {
    console.error('[sub-scrapers] Subz search error:', err.message);
    return null;
  }
}

/**
 * Searches Baiscope, Zoom, and Subz concurrently and returns all successful candidates.
 * Candidates are ranked by multi-factor score (highest match confidence first).
 * @param {string} query
 * @param {string} [preferredQuality]
 * @param {string|number} [year]
 * @returns {Promise<Array<{ source: string, postTitle: string, postUrl: string, archiveName: string, matchedYear: string|null, matchScore: number, yearMatch: boolean|null, srt: { name: string, content: string, format: string, sinhalaDetected: boolean } }>>}
 */
export async function searchAllSinhalaSubtitles(query, preferredQuality = '', year = '') {
  const settled = await Promise.allSettled([
    searchAndExtractBaiscope(query, preferredQuality, year),
    searchAndExtractZoom(query, preferredQuality, year),
    searchAndExtractSubz(query, preferredQuality, year)
  ]);

  const results = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value && item.value.srt) {
      results.push(item.value);
    }
  }

  // Rank by matchScore descending (exact year matches & high confidence appear first)
  results.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  return results;
}

/**
 * Unified Auto-Fetch Runner: Searches all sources and returns the first/best candidate.
 * Prioritizes exact year matches with Sinhala detected.
 * @param {string} query
 * @param {string} [preferredQuality]
 * @param {string|number} [year]
 */
export async function autoFetchSinhalaSubtitle(query, preferredQuality = '', year = '') {
  const all = await searchAllSinhalaSubtitles(query, preferredQuality, year);
  if (all.length > 0) {
    // 1. Prefer exact year match with Sinhala script verified
    const bestVerified = all.find(r => r.yearMatch && r.srt?.sinhalaDetected);
    if (bestVerified) return bestVerified;

    // 2. Prefer any candidate with Sinhala script verified
    const withSinhala = all.find(r => r.srt?.sinhalaDetected);
    if (withSinhala) return withSinhala;

    return all[0];
  }
  return null;
}
