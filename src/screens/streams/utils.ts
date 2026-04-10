import { Stream } from '../../types/metadata';
import { parseCodecFromTitle, getCodecSupport } from '../../services/codecService';

/**
 * Language variations for filtering
 */
const LANGUAGE_VARIATIONS: Record<string, string[]> = {
  latin: ['latino', 'latina', 'lat'],
  spanish: ['español', 'espanol', 'spa'],
  german: ['deutsch', 'ger'],
  french: ['français', 'francais', 'fre'],
  portuguese: ['português', 'portugues', 'por'],
  italian: ['ita'],
  english: ['eng'],
  japanese: ['jap'],
  korean: ['kor'],
  chinese: ['chi', 'cn'],
  arabic: ['ara'],
  russian: ['rus'],
  turkish: ['tur'],
  hindi: ['hin'],
};

/**
 * Get all variations of a language name
 */
const getLanguageVariations = (language: string): string[] => {
  const langLower = language.toLowerCase();
  const variations = [langLower];
  
  if (LANGUAGE_VARIATIONS[langLower]) {
    variations.push(...LANGUAGE_VARIATIONS[langLower]);
  }
  
  return variations;
};

/**
 * Filter streams by excluded quality settings
 */
export const filterStreamsByQuality = (
  streams: Stream[],
  excludedQualities: string[]
): Stream[] => {
  if (!excludedQualities || excludedQualities.length === 0) {
    return streams;
  }

  return streams.filter(stream => {
    const streamTitle = stream.title || stream.name || '';

    const hasExcludedQuality = excludedQualities.some(excludedQuality => {
      if (excludedQuality === 'Auto') {
        return /\b(auto|adaptive)\b/i.test(streamTitle);
      } else {
        const pattern = new RegExp(excludedQuality.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return pattern.test(streamTitle);
      }
    });

    return !hasExcludedQuality;
  });
};

/**
 * Filter streams by excluded language settings
 */
export const filterStreamsByLanguage = (
  streams: Stream[],
  excludedLanguages: string[]
): Stream[] => {
  if (!excludedLanguages || excludedLanguages.length === 0) {
    return streams;
  }

  return streams.filter(stream => {
    const streamName = stream.name || '';
    const streamTitle = stream.title || '';
    const streamDescription = stream.description || '';
    const searchText = `${streamName} ${streamTitle} ${streamDescription}`.toLowerCase();

    const hasExcludedLanguage = excludedLanguages.some(excludedLanguage => {
      const variations = getLanguageVariations(excludedLanguage);
      return variations.some(variant => searchText.includes(variant));
    });

    return !hasExcludedLanguage;
  });
};

/**
 * Extract numeric quality from stream title
 */
export const getQualityNumeric = (title: string | undefined): number => {
  if (!title) return 0;

  // Check for 4K first (treat as 2160p)
  if (/\b4k\b/i.test(title)) {
    return 2160;
  }

  const matchWithP = title.match(/(\d+)p/i);
  if (matchWithP) return parseInt(matchWithP[1], 10);

  const qualityPatterns = [/\b(240|360|480|720|1080|1440|2160|4320|8000)\b/i];

  for (const pattern of qualityPatterns) {
    const match = title.match(pattern);
    if (match) {
      const quality = parseInt(match[1], 10);
      if (quality >= 240 && quality <= 8000) return quality;
    }
  }
  return 0;
};

/**
 * Extract size in bytes from a stream, checking multiple sources
 */
export const getStreamSizeInBytes = (stream: Stream): number => {
  // Direct size field
  if (stream.size && typeof stream.size === 'number' && stream.size > 0) {
    return stream.size;
  }

  // behaviorHints.videoSize
  if (stream.behaviorHints?.videoSize && stream.behaviorHints.videoSize > 0) {
    return stream.behaviorHints.videoSize;
  }

  // Parse from title (legacy format: 💾 2.5 GB or just 2.5 GB)
  const title = stream.title || stream.name || '';
  const sizeMatch = title.match(/([\d.]+)\s*(GB|MB)/i);
  if (sizeMatch) {
    const value = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toUpperCase();
    if (unit === 'GB') return value * 1024 * 1024 * 1024;
    if (unit === 'MB') return value * 1024 * 1024;
  }

  return 0;
};

/**
 * Sort streams by size
 */
export const sortStreamsBySize = (
  streams: Stream[],
  direction: 'asc' | 'desc'
): Stream[] => {
  return [...streams].sort((a, b) => {
    const sizeA = getStreamSizeInBytes(a);
    const sizeB = getStreamSizeInBytes(b);

    // Streams with no size info go to the end
    if (sizeA === 0 && sizeB === 0) return 0;
    if (sizeA === 0) return 1;
    if (sizeB === 0) return 1;

    return direction === 'asc' ? sizeA - sizeB : sizeB - sizeA;
  });
};

/**
 * Sort streams by quality (highest first)
 */
export const sortStreamsByQuality = (streams: Stream[]): Stream[] => {
  return [...streams].sort((a, b) => {
    const titleA = (a.name || a.title || '').toLowerCase();
    const titleB = (b.name || b.title || '').toLowerCase();

    // Check for "Auto" quality - always prioritize it
    const isAutoA = /\b(auto|adaptive)\b/i.test(titleA);
    const isAutoB = /\b(auto|adaptive)\b/i.test(titleB);

    if (isAutoA && !isAutoB) return -1;
    if (!isAutoA && isAutoB) return 1;

    const qualityA = getQualityNumeric(a.name || a.title);
    const qualityB = getQualityNumeric(b.name || b.title);

    if (qualityA !== qualityB) {
      return qualityB - qualityA;
    }

    // If quality is the same, sort by provider name, then stream name
    const providerA = a.addonId || a.addonName || '';
    const providerB = b.addonId || b.addonName || '';

    if (providerA !== providerB) {
      return providerA.localeCompare(providerB);
    }

    const nameA = (a.name || a.title || '').toLowerCase();
    const nameB = (b.name || b.title || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
};

/**
 * Check if a stream is Chromecast-compatible (whitelist approach).
 * Only allows codecs/containers known to work on all Chromecast devices:
 *   Video codecs: H.264/x264, VP8, VP9
 *   Containers: MP4, WebM, HLS (m3u8), DASH (mpd)
 *
 * Streams with no detectable codec info are treated as compatible (benefit of the doubt).
 * Streams with a detected codec that is NOT in the whitelist are filtered out.
 */
export const isChromecastCompatible = (stream: Stream): boolean => {
  const sources = [
    stream.url,
    stream.title,
    stream.name,
    stream.behaviorHints?.filename,
  ].filter(Boolean).join(' ').toLowerCase();

  if (!sources) return true;

  // Incompatible containers — always reject
  if (/\.mkv(\b|$)/.test(sources) || /\bmkv\b/.test(sources)) return false;
  if (/\.avi(\b|$)/.test(sources) || /\bavi\b/.test(sources)) return false;

  // If we can detect a codec, only allow whitelisted ones
  const hasCodecInfo = /\b(h[.\s]?26[45]|x[.\s]?26[45]|hevc|avc|vp[89]|xvid|divx|mpeg[24]|av1)\b/.test(sources);

  if (hasCodecInfo) {
    // Whitelisted codecs that work on all Chromecast devices
    const isCompatibleCodec = /\b(h[.\s]?264|x[.\s]?264|avc|vp8|vp9)\b/.test(sources);
    return isCompatibleCodec;
  }

  // No codec detected — allow (benefit of the doubt)
  return true;
};

/**
 * Infer video type from URL
 */
export const inferVideoTypeFromUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  const lower = url.toLowerCase();
  // HLS
  if (/(\.|ext=)(m3u8)(\b|$)/i.test(lower) || /\.m3u8(\b|$)/i.test(lower)) return 'm3u8';
  if (/(^|[?&])type=(m3u8|hls)(\b|$)/i.test(lower)) return 'm3u8';
  if (/\b(m3u8|m3u)\b/i.test(lower) || /\bhls\b/i.test(lower)) return 'm3u8';
  // Some providers serve HLS playlists behind extensionless endpoints.
  // Example: https://<host>/playlist/<id>?token=...&expires=...
  if (/\/playlist\//i.test(lower) && (/(^|[?&])token=/.test(lower) || /(^|[?&])expires=/.test(lower))) return 'm3u8';

  // DASH
  if (/(\.|ext=)(mpd)(\b|$)/i.test(lower) || /\.mpd(\b|$)/i.test(lower)) return 'mpd';

  // Progressive (mp4, mkv, avi, webm)
  if (/(\.|ext=)(mp4)(\b|$)/i.test(lower) || /\.mp4(\b|$)/i.test(lower)) return 'mp4';
  if (/(\.|ext=)(mkv)(\b|$)/i.test(lower) || /\.mkv(\b|$)/i.test(lower)) return 'mp4';
  if (/(\.|ext=)(avi)(\b|$)/i.test(lower) || /\.avi(\b|$)/i.test(lower)) return 'mp4';
  if (/(\.|ext=)(webm)(\b|$)/i.test(lower) || /\.webm(\b|$)/i.test(lower)) return 'mp4';

  return undefined;
};

/**
 * Probe a URL via HEAD request to determine video type from Content-Type header.
 * Returns 'mp4' for progressive downloads, 'm3u8' for HLS, 'mpd' for DASH, or undefined.
 * Times out after 3 seconds to avoid blocking playback.
 */
export const probeVideoType = async (url: string, headers?: Record<string, string>): Promise<string | undefined> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(url, {
      method: 'HEAD',
      headers: headers || {},
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('mpegurl') || ct.includes('x-mpegurl')) return 'm3u8';
    if (ct.includes('dash+xml')) return 'mpd';
    if (ct.includes('video/') || ct.includes('octet-stream') || ct.includes('matroska')) return 'mp4';
    // If Content-Disposition has a filename with extension, use that
    const cd = (resp.headers.get('content-disposition') || '').toLowerCase();
    if (/\.mkv/i.test(cd) || /\.mp4/i.test(cd) || /\.avi/i.test(cd) || /\.webm/i.test(cd)) return 'mp4';
    if (/\.m3u8/i.test(cd)) return 'm3u8';
    return undefined;
  } catch {
    return undefined;
  }
};

/**
 * Auto-select the best stream for downloading:
 * 1. Filter to HTTP-downloadable (no HLS/DASH) — same logic as isDownloadableUrl in DownloadsContext
 * 2. Filter to compatible codecs (not 'no' support); null codec (unknown) is treated as compatible
 * 3. Sort by size ascending
 * 4. Pick smallest with known size; fallback to first available
 *
 * Returns { stream, isCodecFallback } where isCodecFallback=true means
 * no compatible streams were available and we fell back to an incompatible one.
 */
export const autoSelectDownloadStream = (streams: Stream[]): {
  stream: Stream | null;
  isCodecFallback: boolean;
} => {
  if (!streams.length) return { stream: null, isCodecFallback: false };

  // Filter to downloadable URLs (no HLS/DASH streaming formats)
  const downloadable = streams.filter(s => {
    const url = (s.url || '').toLowerCase();
    if (!url) return false;
    return !url.includes('m3u8') && !url.includes('.mpd') && !url.includes('mpd');
  });

  if (!downloadable.length) return { stream: null, isCodecFallback: false };

  // Filter to compatible codecs; null codec (no info in title) is treated as compatible
  const compatible = downloadable.filter(s => {
    const codec = parseCodecFromTitle(s.title, s.name);
    if (codec === null) return true;
    return getCodecSupport(codec) !== 'no';
  });

  const isCodecFallback = compatible.length === 0;
  const candidates = compatible.length > 0 ? compatible : downloadable;

  // Sort by size ascending, pick smallest with known size
  // Filter out streams under 100MB — these are almost always samples/previews
  const MIN_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
  const withSize = candidates
    .map(s => ({ stream: s, size: getStreamSizeInBytes(s) }))
    .filter(s => s.size > 0)
    .sort((a, b) => a.size - b.size);

  const fullSize = withSize.filter(s => s.size >= MIN_SIZE_BYTES);
  if (fullSize.length > 0) return { stream: fullSize[0].stream, isCodecFallback };

  // If everything is under 100MB, still pick the largest (most likely to be real content)
  if (withSize.length > 0) return { stream: withSize[withSize.length - 1].stream, isCodecFallback };

  // Fallback: first candidate
  return { stream: candidates[0], isCodecFallback };
};

/**
 * Filter headers for Vidrock compatibility
 */
export const filterHeadersForVidrock = (
  headers: Record<string, string> | undefined
): Record<string, string> | undefined => {
  if (!headers) return undefined;

  const essentialHeaders: Record<string, string> = {};
  if (headers['User-Agent']) essentialHeaders['User-Agent'] = headers['User-Agent'];
  if (headers['Referer']) essentialHeaders['Referer'] = headers['Referer'];
  if (headers['Origin']) essentialHeaders['Origin'] = headers['Origin'];

  return Object.keys(essentialHeaders).length > 0 ? essentialHeaders : undefined;
};
