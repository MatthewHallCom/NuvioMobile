// FastImage web stub — maps to standard RNW Image.
// @d11/react-native-fast-image is used in 53 files.
import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface FastImageSource {
  uri?: string;
  headers?: Record<string, string>;
  priority?: string;
  cache?: string;
}

interface FastImageProps {
  source: FastImageSource | number;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
  onLoad?: () => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onError?: () => void;
  onProgress?: (event: any) => void;
  fallback?: boolean;
  defaultSource?: number;
  tintColor?: string;
  children?: React.ReactNode;
  [key: string]: any;
}

const FastImage = React.forwardRef<any, FastImageProps>(
  ({ source, resizeMode, onLoadStart, onLoadEnd, onProgress, fallback, ...rest }, ref) => {
    const src = typeof source === 'object' && source !== null ? { uri: source.uri } : source;
    return <Image ref={ref} source={src as any} resizeMode={resizeMode} {...rest} />;
  },
);
FastImage.displayName = 'FastImage';

// Attach static properties (accessed as FastImage.priority.high etc.)
(FastImage as any).priority = {
  low: 'low',
  normal: 'normal',
  high: 'high',
};
(FastImage as any).resizeMode = {
  contain: 'contain',
  cover: 'cover',
  stretch: 'stretch',
  center: 'center',
};
(FastImage as any).cacheControl = {
  immutable: 'immutable',
  web: 'web',
  cacheOnly: 'cacheOnly',
};
(FastImage as any).preload = (_sources: FastImageSource[]) => Promise.resolve();
(FastImage as any).clearMemoryCache = () => Promise.resolve();
(FastImage as any).clearDiskCache = () => Promise.resolve();

export default FastImage;

export const priority = {
  low: 'low' as const,
  normal: 'normal' as const,
  high: 'high' as const,
};

export const resizeMode = {
  contain: 'contain' as const,
  cover: 'cover' as const,
  stretch: 'stretch' as const,
  center: 'center' as const,
};

export const cacheControl = {
  immutable: 'immutable' as const,
  web: 'web' as const,
  cacheOnly: 'cacheOnly' as const,
};

export const preload = (_sources: FastImageSource[]) => {};
export const clearMemoryCache = () => Promise.resolve();
export const clearDiskCache = () => Promise.resolve();
