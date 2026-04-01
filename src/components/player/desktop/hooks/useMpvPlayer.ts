// Desktop MPV player hook — communicates with Rust backend via Tauri IPC.
// Maps to the same interface as the mobile player hooks.

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

interface MpvPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  volume: number;
  speed: number;
}

interface ProgressUpdate {
  time_pos: number;
  duration: number;
  is_playing: boolean;
  is_buffering: boolean;
}

interface EndFileEvent {
  reason: string;
}

interface PropertyChange {
  name: string;
  value: any;
}

export function useMpvPlayer() {
  const [state, setState] = useState<MpvPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isBuffering: false,
    volume: 100,
    speed: 1.0,
  });
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  // Check if MPV is available on this system
  useEffect(() => {
    invoke<boolean>('mpv_available')
      .then(setIsAvailable)
      .catch(() => setIsAvailable(false));
  }, []);

  // Set up event listeners
  useEffect(() => {
    const setupListeners = async () => {
      const unlisteners: UnlistenFn[] = [];

      unlisteners.push(
        await listen<ProgressUpdate>('mpv-progress-update', (event) => {
          setState((prev) => ({
            ...prev,
            currentTime: event.payload.time_pos,
            duration: event.payload.duration,
            isPlaying: event.payload.is_playing,
            isBuffering: event.payload.is_buffering,
          }));
        }),
      );

      unlisteners.push(
        await listen<EndFileEvent>('mpv-end-file', (event) => {
          setState((prev) => ({ ...prev, isPlaying: false }));
          if (event.payload.reason === 'error') {
            setError('Playback error');
          }
        }),
      );

      unlisteners.push(
        await listen('mpv-file-loaded', () => {
          setError(null);
        }),
      );

      unlisteners.push(
        await listen('mpv-playback-restart', () => {
          setState((prev) => ({ ...prev, isBuffering: false }));
        }),
      );

      unlistenersRef.current = unlisteners;
    };

    setupListeners();

    return () => {
      unlistenersRef.current.forEach((unlisten) => unlisten());
      unlistenersRef.current = [];
    };
  }, []);

  // --- Player Controls ---

  const loadFile = useCallback(async (url: string, resumePos?: number) => {
    try {
      setError(null);
      setState((prev) => ({ ...prev, isBuffering: true }));
      await invoke('load_file', { path: url, resumePos });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, []);

  const togglePause = useCallback(async () => {
    try {
      await invoke('cycle_pause');
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, []);

  const seek = useCallback(async (position: number) => {
    try {
      await invoke('seek_video', { position });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, []);

  const setVolume = useCallback(async (volume: number) => {
    try {
      await invoke('mpv_set_property', { name: 'volume', value: String(volume) });
      setState((prev) => ({ ...prev, volume }));
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, []);

  const setSpeed = useCallback(async (speed: number) => {
    try {
      await invoke('mpv_set_property', { name: 'speed', value: String(speed) });
      setState((prev) => ({ ...prev, speed }));
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, []);

  const setAudioTrack = useCallback(async (trackId: number) => {
    try {
      await invoke('mpv_set_property', { name: 'aid', value: String(trackId) });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, []);

  const setSubtitleTrack = useCallback(async (trackId: number) => {
    try {
      await invoke('mpv_set_property', { name: 'sid', value: String(trackId) });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, []);

  const setSubtitleStyle = useCallback(async (styles: {
    fontSize?: number;
    color?: string;
    borderSize?: number;
    borderColor?: string;
    shadowOffset?: number;
    shadowColor?: string;
    position?: number;
  }) => {
    try {
      if (styles.fontSize) await invoke('mpv_set_property', { name: 'sub-font-size', value: String(styles.fontSize) });
      if (styles.color) await invoke('mpv_set_property', { name: 'sub-color', value: styles.color });
      if (styles.borderSize !== undefined) await invoke('mpv_set_property', { name: 'sub-border-size', value: String(styles.borderSize) });
      if (styles.borderColor) await invoke('mpv_set_property', { name: 'sub-border-color', value: styles.borderColor });
      if (styles.shadowOffset !== undefined) await invoke('mpv_set_property', { name: 'sub-shadow-offset', value: String(styles.shadowOffset) });
      if (styles.shadowColor) await invoke('mpv_set_property', { name: 'sub-shadow-color', value: styles.shadowColor });
      if (styles.position !== undefined) await invoke('mpv_set_property', { name: 'sub-pos', value: String(styles.position) });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await invoke('mpv_command', { args: ['stop'] });
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, []);

  return {
    // State
    ...state,
    isAvailable,
    error,

    // Controls
    loadFile,
    togglePause,
    seek,
    setVolume,
    setSpeed,
    setAudioTrack,
    setSubtitleTrack,
    setSubtitleStyle,
    stop,
  };
}
