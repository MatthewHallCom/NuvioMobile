// Desktop video player component.
// Uses MPV via Tauri IPC for playback.
// The video renders into a native layer behind the webview;
// this component provides the transparent overlay with controls.

import React, { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useMpvPlayer } from './hooks/useMpvPlayer';

interface DesktopPlayerProps {
  source: { uri: string; headers?: Record<string, string> };
  resumePosition?: number;
  onEnd?: () => void;
  onError?: (error: string) => void;
  onProgress?: (currentTime: number, duration: number) => void;
}

export default function DesktopPlayer({
  source,
  resumePosition,
  onEnd,
  onError,
  onProgress,
}: DesktopPlayerProps) {
  const mpv = useMpvPlayer();

  // Load file when source changes
  useEffect(() => {
    if (source?.uri && mpv.isAvailable) {
      mpv.loadFile(source.uri, resumePosition);
    }
  }, [source?.uri, mpv.isAvailable]);

  // Forward progress to parent
  useEffect(() => {
    if (onProgress && mpv.currentTime > 0) {
      onProgress(mpv.currentTime, mpv.duration);
    }
  }, [mpv.currentTime, mpv.duration]);

  // Forward errors
  useEffect(() => {
    if (mpv.error && onError) {
      onError(mpv.error);
    }
  }, [mpv.error]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          mpv.togglePause();
          break;
        case 'ArrowLeft':
        case 'j':
          e.preventDefault();
          mpv.seek(Math.max(0, mpv.currentTime - 10));
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          mpv.seek(mpv.currentTime + 10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          mpv.setVolume(Math.min(150, mpv.volume + 5));
          break;
        case 'ArrowDown':
          e.preventDefault();
          mpv.setVolume(Math.max(0, mpv.volume - 5));
          break;
        case 'm':
          e.preventDefault();
          mpv.setVolume(mpv.volume > 0 ? 0 : 100);
          break;
        case 'f':
          e.preventDefault();
          // TODO: Toggle fullscreen via Tauri window API
          break;
        case 'Escape':
          e.preventDefault();
          mpv.stop();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mpv.currentTime, mpv.volume]);

  if (mpv.isAvailable === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          MPV is not installed. Install it with: brew install mpv
        </Text>
      </View>
    );
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = mpv.duration > 0 ? (mpv.currentTime / mpv.duration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Transparent area where MPV renders behind the webview */}
      <View style={styles.videoArea} />

      {/* Buffering indicator */}
      {mpv.isBuffering && (
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Error display */}
      {mpv.error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{mpv.error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => mpv.loadFile(source.uri, mpv.currentTime)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom controls bar */}
      <View style={styles.controlsBar}>
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <View style={styles.controlsRow}>
          {/* Play/Pause */}
          <TouchableOpacity onPress={mpv.togglePause} style={styles.controlButton}>
            <Text style={styles.controlIcon}>{mpv.isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>

          {/* Time */}
          <Text style={styles.timeText}>
            {formatTime(mpv.currentTime)} / {formatTime(mpv.duration)}
          </Text>

          {/* Speed */}
          <TouchableOpacity
            onPress={() => {
              const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
              const idx = speeds.indexOf(mpv.speed);
              const next = speeds[(idx + 1) % speeds.length];
              mpv.setSpeed(next);
            }}
            style={styles.controlButton}
          >
            <Text style={styles.controlText}>{mpv.speed}x</Text>
          </TouchableOpacity>

          {/* Volume */}
          <Text style={styles.controlText}>🔊 {mpv.volume}%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  videoArea: {
    flex: 1,
    // Transparent — MPV's CAMetalLayer renders behind this
    backgroundColor: 'transparent',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#4a90d9',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  controlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
  },
  progressContainer: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4a90d9',
    borderRadius: 2,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  controlButton: {
    padding: 8,
  },
  controlIcon: {
    color: '#fff',
    fontSize: 20,
  },
  controlText: {
    color: '#fff',
    fontSize: 14,
  },
  timeText: {
    color: '#ccc',
    fontSize: 13,
    flex: 1,
  },
});
