import { Platform } from 'react-native';

export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'av1' | 'xvid' | 'mpeg2';
export type CodecSupport = 'yes' | 'partial' | 'no';

/**
 * Codec support per platform.
 * Android marks everything 'yes' because MPV fallback handles all codecs ExoPlayer can't.
 * iOS has no fallback player — KSPlayer/AVFoundation is the only option.
 */
const CODEC_SUPPORT: Record<string, Record<VideoCodec, CodecSupport>> = {
  ios: {
    h264: 'yes',
    h265: 'yes',
    vp9: 'no',
    av1: 'partial',
    xvid: 'no',
    mpeg2: 'no',
  },
  android: {
    h264: 'yes',
    h265: 'yes',
    vp9: 'yes',
    av1: 'yes',
    xvid: 'yes',
    mpeg2: 'yes',
  },
};

/**
 * Parse video codec from stream title/name string.
 * Returns null when no codec info is detected (common case — no warning shown).
 *
 * Match priority order matters: HEVC checked before H.264 since "x265" contains "265".
 * Does NOT match bare "mpeg4" to avoid false positives with H.264 (MPEG-4 Part 10).
 */
export function parseCodecFromTitle(title?: string, name?: string, filename?: string): VideoCodec | null {
  if (!title && !name && !filename) return null;
  const combined = [title, name, filename].filter(Boolean).join(' ').toLowerCase();

  // H.265 / HEVC (check before H.264)
  if (/\bhevc\b/.test(combined) || /\bx\.?265\b/.test(combined) || /\bh\.?265\b/.test(combined)) return 'h265';

  // H.264 / AVC
  if (/\bavc\b/.test(combined) || /\bx\.?264\b/.test(combined) || /\bh\.?264\b/.test(combined)) return 'h264';

  // AV1
  if (/\bav1\b/.test(combined) || /\bav-1\b/.test(combined)) return 'av1';

  // VP9
  if (/\bvp-?9\b/.test(combined)) return 'vp9';

  // XviD / DivX (legacy MPEG-4 Part 2 — NOT H.264)
  if (/\bxvid\b/.test(combined) || /\bdivx\b/.test(combined)) return 'xvid';

  // MPEG-2
  if (/\bmpeg-?2\b/.test(combined)) return 'mpeg2';

  return null;
}

/**
 * Get codec support level for current platform.
 */
export function getCodecSupport(codec: VideoCodec): CodecSupport {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return CODEC_SUPPORT[platform]?.[codec] ?? 'yes';
}

/**
 * Human-readable codec name for display.
 */
export function getCodecDisplayName(codec: VideoCodec): string {
  switch (codec) {
    case 'h264': return 'H.264';
    case 'h265': return 'HEVC';
    case 'vp9': return 'VP9';
    case 'av1': return 'AV1';
    case 'xvid': return 'XviD';
    case 'mpeg2': return 'MPEG-2';
  }
}

/**
 * Get warning message for a codec on current platform, or null if no warning needed.
 */
export function getCodecWarning(codec: VideoCodec): string | null {
  const support = getCodecSupport(codec);
  const name = getCodecDisplayName(codec);
  if (support === 'no') {
    return `${name} is not supported on this device and will likely fail to play.`;
  }
  if (support === 'partial') {
    return `${name} may not be supported on older devices.`;
  }
  return null;
}
