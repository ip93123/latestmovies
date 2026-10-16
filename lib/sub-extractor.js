import zlib from 'zlib';

/**
 * In-memory Zero-Dependency ZIP Archive Extractor for Node.js
 * Parses Local File Headers and Central Directory Records
 * @param {Buffer} buf - ZIP file buffer
 * @returns {Array<{ name: string, content: string, size: number }>}
 */
export function extractZipEntries(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) return [];
  const files = [];
  let offset = 0;

  // Attempt 1: Parse Local File Headers (0x04034b50)
  while (offset < buf.length - 30) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) {
      offset++;
      continue;
    }

    const compMethod = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);

    const filename = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    offset = dataStart;

    if (compSize > 0 && offset + compSize <= buf.length) {
      const compressedData = buf.slice(offset, offset + compSize);
      let contentBuf;
      try {
        if (compMethod === 0) {
          contentBuf = compressedData;
        } else if (compMethod === 8) {
          contentBuf = zlib.inflateRawSync(compressedData);
        }
      } catch (_) {
        // Fallback to Central Directory if local header is corrupted or streaming
      }

      if (contentBuf && !filename.endsWith('/')) {
        let text = contentBuf.toString('utf8');
        text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        files.push({ name: filename, content: text, size: uncompSize || text.length });
      }

      offset += compSize;
    }
  }

  // Attempt 2: If local headers had data descriptors (streaming), parse Central Directory (0x02014b50)
  if (files.length === 0) {
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        const cdOffset = buf.readUInt32LE(i + 16);
        let cdPos = cdOffset;
        while (cdPos < buf.length && buf.readUInt32LE(cdPos) === 0x02014b50) {
          const compMethod = buf.readUInt16LE(cdPos + 10);
          const compSize = buf.readUInt32LE(cdPos + 20);
          const uncompSize = buf.readUInt32LE(cdPos + 24);
          const nameLen = buf.readUInt16LE(cdPos + 28);
          const extraLen = buf.readUInt16LE(cdPos + 30);
          const commentLen = buf.readUInt16LE(cdPos + 32);
          const localHeaderOffset = buf.readUInt32LE(cdPos + 42);

          const filename = buf.slice(cdPos + 46, cdPos + 46 + nameLen).toString('utf8');
          cdPos += 46 + nameLen + extraLen + commentLen;

          if (!filename.endsWith('/')) {
            const locNameLen = buf.readUInt16LE(localHeaderOffset + 26);
            const locExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
            const locDataStart = localHeaderOffset + 30 + locNameLen + locExtraLen;
            const compressedData = buf.slice(locDataStart, locDataStart + compSize);
            let contentBuf;
            try {
              if (compMethod === 0) contentBuf = compressedData;
              else if (compMethod === 8) contentBuf = zlib.inflateRawSync(compressedData);
            } catch (_) {}

            if (contentBuf) {
              let text = contentBuf.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
              files.push({ name: filename, content: text, size: uncompSize || text.length });
            }
          }
        }
        break;
      }
    }
  }

  return files;
}

/**
 * Smart SRT Auto-Selector
 * Filters junk files, prioritizes Sinhala Unicode text, and matches release qualities
 * @param {Array<{ name: string, content: string }>} files
 * @param {string} [preferredQuality] - Optional quality preference (e.g. '720p', 'web-dl')
 * @returns {{ name: string, content: string, format: string, sinhalaDetected: boolean } | null}
 */
export function autoSelectBestSrt(files, preferredQuality = '') {
  if (!Array.isArray(files) || files.length === 0) return null;

  // 1. Filter out non-subtitle files (.txt, .url, .htm, .jpg, etc.)
  const srtCandidates = files.filter(f => f.name.toLowerCase().endsWith('.srt'));
  const fallbackCandidates = files.filter(f => f.name.match(/\.(vtt|sub)$/i));
  const pool = srtCandidates.length > 0 ? srtCandidates : fallbackCandidates;

  if (pool.length === 0) return null;

  // 2. If exactly one candidate exists, return it immediately
  const sinhalaRegex = /[\u0D80-\u0DFF]/;
  if (pool.length === 1) {
    const single = pool[0];
    return {
      name: single.name,
      content: single.content,
      format: single.name.split('.').pop().toLowerCase(),
      sinhalaDetected: sinhalaRegex.test(single.content)
    };
  }

  // 3. Multi-file selection: Check Sinhala Unicode glyphs
  const sinhalaMatches = pool.filter(f => sinhalaRegex.test(f.content));
  const targetGroup = sinhalaMatches.length > 0 ? sinhalaMatches : pool;

  if (targetGroup.length === 1) {
    const single = targetGroup[0];
    return {
      name: single.name,
      content: single.content,
      format: single.name.split('.').pop().toLowerCase(),
      sinhalaDetected: sinhalaMatches.length > 0
    };
  }

  // 4. Quality & Release matching if multiple Sinhala files exist (e.g., 720p vs 1080p)
  let chosen = null;
  if (preferredQuality) {
    const cleanPref = preferredQuality.toLowerCase().replace(/[^a-z0-9]/g, '');
    chosen = targetGroup.find(f => f.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanPref));
  }

  // Common high-priority web releases
  if (!chosen) {
    chosen = targetGroup.find(f => /web-?dl|webrip/i.test(f.name)) ||
             targetGroup.find(f => /720p/i.test(f.name)) ||
             targetGroup.find(f => /hdrip/i.test(f.name)) ||
             targetGroup.find(f => /bluray/i.test(f.name));
  }

  // Fallback: Pick the file with the most subtitle cues or largest content
  if (!chosen) {
    chosen = targetGroup.sort((a, b) => (b.content.length || 0) - (a.content.length || 0))[0];
  }

  return {
    name: chosen.name,
    content: chosen.content,
    format: chosen.name.split('.').pop().toLowerCase(),
    sinhalaDetected: sinhalaRegex.test(chosen.content)
  };
}
