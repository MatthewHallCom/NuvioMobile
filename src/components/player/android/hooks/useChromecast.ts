import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useRemoteMediaClient,
  useMediaStatus,
  useStreamPosition,
  useCastSession,
  CastContext,
  MediaPlayerState,
} from 'react-native-google-cast';
import type { MediaStatus } from 'react-native-google-cast';
import { toast } from '@backpackapp-io/react-native-toast';

export const useChromecast = (streamUrl: string, title: string) => {
  const client = useRemoteMediaClient();
  const mediaStatus = useMediaStatus();
  const streamPosition = useStreamPosition();
  const castSession = useCastSession();

  const [isCasting, setIsCasting] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const lastPositionRef = useRef<number>(0);
  const wasCastingRef = useRef(false);
  const onDisconnectRef = useRef<((position: number) => void) | null>(null);

  // Track stream position for resume on disconnect
  useEffect(() => {
    if (streamPosition != null) {
      lastPositionRef.current = streamPosition;
    }
  }, [streamPosition]);

  // Detect cast session connect/disconnect
  useEffect(() => {
    if (client && castSession) {
      // Session is active — if we were already casting, stay casting
      // If not, we'll start casting when startCasting is called
    } else if (wasCastingRef.current && !castSession) {
      // Session dropped while we were casting (external disconnect)
      setIsCasting(false);
      wasCastingRef.current = false;
      if (onDisconnectRef.current) {
        onDisconnectRef.current(lastPositionRef.current);
      }
    }
  }, [client, castSession]);

  const castPlayerState = mediaStatus?.playerState ?? null;

  const showCastPicker = useCallback(() => {
    CastContext.showCastDialog();
  }, []);

  const startCasting = useCallback(async (currentTime: number) => {
    if (!client) {
      toast.error('No Chromecast connected');
      return;
    }

    setCastError(null);
    try {
      await client.loadMedia({
        autoplay: true,
        startTime: currentTime,
        mediaInfo: {
          contentUrl: streamUrl,
          contentType: 'video/mp4',
          metadata: {
            type: 'movie',
            title,
          },
        },
      });
      setIsCasting(true);
      wasCastingRef.current = true;
    } catch (err: any) {
      const message = err?.message || 'Failed to cast video';
      setCastError(message);
      toast.error(`Cast failed: ${message}`);
    }
  }, [client, streamUrl, title]);

  const stopCasting = useCallback(async (): Promise<number> => {
    const position = lastPositionRef.current;
    try {
      if (client) {
        await client.stop();
      }
      await CastContext.sessionManager.endCurrentSession(true);
    } catch {
      // Ignore errors during cleanup
    }
    setIsCasting(false);
    wasCastingRef.current = false;
    return position;
  }, [client]);

  const castPlay = useCallback(async () => {
    if (client) {
      try { await client.play(); } catch {}
    }
  }, [client]);

  const castPause = useCallback(async () => {
    if (client) {
      try { await client.pause(); } catch {}
    }
  }, [client]);

  const castSeek = useCallback(async (position: number) => {
    if (client) {
      try { await client.seek({ position }); } catch {}
    }
  }, [client]);

  // Register a disconnect callback
  const setOnDisconnect = useCallback((cb: (position: number) => void) => {
    onDisconnectRef.current = cb;
  }, []);

  return {
    isCasting,
    castStreamPosition: streamPosition,
    castPlayerState,
    showCastPicker,
    startCasting,
    stopCasting,
    castPlay,
    castPause,
    castSeek,
    castError,
    setOnDisconnect,
    client,
  };
};
