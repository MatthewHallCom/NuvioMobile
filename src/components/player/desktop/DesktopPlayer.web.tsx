// Desktop video player component.
// Uses MPV via Tauri IPC for playback.
// The video renders into a native layer behind the webview;
// this component provides the transparent overlay with controls.

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useMpvPlayer } from './hooks/useMpvPlayer';

const ACCENT = '#e50914';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const HIDE_DELAY = 3000;

interface DesktopPlayerProps {
  source: { uri: string; headers?: Record<string, string> };
  title?: string;
  resumePosition?: number;
  onBack?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  onProgress?: (currentTime: number, duration: number) => void;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${m}:${sec.toString().padStart(2, '0')}`;
}

function MIcon({ code, size = 24, color = '#fff' }: { code: string; size?: number; color?: string }) {
  return (
    <Text style={{ fontFamily: 'MaterialIcons', fontSize: size, color, lineHeight: size + 4 }}>
      {code}
    </Text>
  );
}

export default function DesktopPlayer({
  source,
  title,
  resumePosition,
  onBack,
  onEnd,
  onError,
  onProgress,
}: DesktopPlayerProps) {
  const mpv = useMpvPlayer();

  // Controls visibility
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Progress bar state
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPos, setHoverPos] = useState<number | null>(null); // 0-1
  const [dragPos, setDragPos] = useState<number | null>(null);   // 0-1
  const [tooltipX, setTooltipX] = useState(0);
  const progressBarRef = useRef<View>(null);
  const progressBarNativeRef = useRef<HTMLElement | null>(null);

  // Volume slider
  const [isVolHovered, setIsVolHovered] = useState(false);
  const prevVolumeRef = useRef(100);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Double-click detection
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCountRef = useRef(0);

  // --- Show/hide controls ---
  const showControls = useCallback(() => {
    setControlsVisible(true);
    document.body.style.cursor = '';
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (mpv.isPlaying && !isDragging) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
        document.body.style.cursor = 'none';
      }, HIDE_DELAY);
    }
  }, [mpv.isPlaying, isDragging]);

  // When paused or dragging, always show controls
  useEffect(() => {
    if (!mpv.isPlaying || isDragging) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
      document.body.style.cursor = '';
    }
  }, [mpv.isPlaying, isDragging]);

  // Cleanup cursor on unmount
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // --- Fullscreen ---
  const toggleFullscreen = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      const fs = await win.isFullscreen();
      await win.setFullscreen(!fs);
      setIsFullscreen(!fs);
    } catch {
      // fallback: DOM fullscreen
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen?.();
        setIsFullscreen(false);
      }
    }
  }, []);

  // --- Load file when source changes ---
  useEffect(() => {
    if (source?.uri && mpv.isAvailable) {
      mpv.loadFile(source.uri, resumePosition);
    }
  }, [source?.uri, mpv.isAvailable]);

  // --- Stop on unmount ---
  useEffect(() => {
    return () => {
      mpv.stop().catch(() => {});
    };
  }, []);

  // --- Forward progress ---
  useEffect(() => {
    if (onProgress && mpv.currentTime > 0) {
      onProgress(mpv.currentTime, mpv.duration);
    }
  }, [mpv.currentTime, mpv.duration]);

  // --- Forward errors ---
  useEffect(() => {
    if (mpv.error && onError) {
      onError(mpv.error);
    }
  }, [mpv.error]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          mpv.togglePause();
          break;
        case 'j':
        case 'J':
        case 'ArrowLeft':
          e.preventDefault();
          mpv.seek(Math.max(0, mpv.currentTime - 10));
          break;
        case 'l':
        case 'L':
        case 'ArrowRight':
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
        case 'M':
          e.preventDefault();
          if (mpv.volume > 0) {
            prevVolumeRef.current = mpv.volume;
            mpv.setVolume(0);
          } else {
            mpv.setVolume(prevVolumeRef.current || 100);
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          e.preventDefault();
          onBack?.();
          break;
        case '<':
          e.preventDefault();
          {
            const idx = SPEEDS.indexOf(mpv.speed);
            if (idx > 0) mpv.setSpeed(SPEEDS[idx - 1]);
          }
          break;
        case '>':
          e.preventDefault();
          {
            const idx = SPEEDS.indexOf(mpv.speed);
            if (idx < SPEEDS.length - 1) mpv.setSpeed(SPEEDS[idx + 1]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mpv.currentTime, mpv.volume, mpv.speed, toggleFullscreen, onBack]);

  // --- Progress bar helpers ---
  const getPosFromEvent = useCallback((e: MouseEvent | React.MouseEvent): number => {
    const el = progressBarNativeRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = (e as MouseEvent).clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }, []);

  const getTimeFromPos = useCallback((pos: number): number => {
    return pos * mpv.duration;
  }, [mpv.duration]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getPosFromEvent(e);
    setDragPos(pos);
    setIsDragging(true);
    setTooltipX((e as any).clientX);

    const onMouseMove = (ev: MouseEvent) => {
      const p = getPosFromEvent(ev);
      setDragPos(p);
      setTooltipX(ev.clientX);
    };
    const onMouseUp = (ev: MouseEvent) => {
      const p = getPosFromEvent(ev);
      mpv.seek(getTimeFromPos(p));
      setIsDragging(false);
      setDragPos(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [getPosFromEvent, getTimeFromPos, mpv]);

  const handleProgressMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = getPosFromEvent(e);
    setHoverPos(pos);
    setTooltipX((e as any).clientX);
  }, [getPosFromEvent]);

  const handleProgressMouseLeave = useCallback(() => {
    if (!isDragging) setHoverPos(null);
  }, [isDragging]);

  // --- Video area click / double-click ---
  const handleVideoPress = useCallback(() => {
    clickCountRef.current += 1;
    if (clickCountRef.current === 1) {
      clickTimerRef.current = setTimeout(() => {
        if (clickCountRef.current === 1) {
          mpv.togglePause();
        }
        clickCountRef.current = 0;
      }, 250);
    } else if (clickCountRef.current === 2) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickCountRef.current = 0;
      toggleFullscreen();
    }
  }, [mpv, toggleFullscreen]);

  // --- Speed cycle ---
  const cycleSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(mpv.speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    mpv.setSpeed(next);
  }, [mpv]);

  // --- Volume icon selection ---
  const volumeIcon = mpv.volume === 0
    ? '\ue04f'  // volume_off
    : mpv.volume < 50
    ? '\ue04d'  // volume_down
    : '\ue050'; // volume_up

  const playedPos = isDragging && dragPos !== null ? dragPos : (mpv.duration > 0 ? mpv.currentTime / mpv.duration : 0);
  const hoverFraction = hoverPos !== null ? hoverPos : null;

  // Tooltip time
  const tooltipTime = hoverPos !== null ? getTimeFromPos(isDragging && dragPos !== null ? dragPos : hoverPos) : 0;

  if (mpv.isAvailable === false) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredOverlay}>
          <Text style={styles.errorText}>MPV is not installed.</Text>
          <Text style={[styles.errorText, { color: '#aaa', fontSize: 13, marginTop: 4 }]}>
            Install with: brew install mpv
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onMouseMove={showControls as any}
    >
      {/* Transparent video area — MPV renders behind */}
      <Pressable style={styles.videoArea} onPress={handleVideoPress} />

      {/* Buffering spinner */}
      {mpv.isBuffering && (
        <View style={styles.spinnerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Error display */}
      {mpv.error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{mpv.error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.8 }]}
            onPress={() => mpv.loadFile(source.uri, mpv.currentTime)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Controls overlay — fades in/out */}
      <View
        style={[styles.controlsOverlay, { opacity: controlsVisible ? 1 : 0 }]}
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <MIcon code={'\ue5cd'} size={26} />
          </Pressable>
          {title ? (
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <View style={styles.topBarRight} />
        </View>

        {/* Center play/pause */}
        <View style={styles.centerArea} pointerEvents="none">
          {/* intentionally empty — clicks handled by videoArea Pressable */}
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {/* Progress bar */}
          <View
            // @ts-ignore — ref forwarding to DOM element for getBoundingClientRect
            ref={(el: any) => { progressBarNativeRef.current = el; }}
            style={styles.progressBarOuter}
            onMouseDown={handleProgressMouseDown as any}
            onMouseMove={handleProgressMouseMove as any}
            onMouseLeave={handleProgressMouseLeave as any}
          >
            {/* Tooltip */}
            {hoverPos !== null && (
              <View
                style={[
                  styles.tooltip,
                  {
                    left: `${(hoverPos * 100).toFixed(2)}%` as any,
                  },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.tooltipText}>{formatTime(tooltipTime)}</Text>
              </View>
            )}

            {/* Track */}
            <View style={styles.progressTrack}>
              {/* Hover indicator */}
              {hoverFraction !== null && (
                <View
                  style={[
                    styles.progressHover,
                    { width: `${(hoverFraction * 100).toFixed(2)}%` as any },
                  ]}
                />
              )}
              {/* Played fill */}
              <View
                style={[
                  styles.progressFill,
                  { width: `${(playedPos * 100).toFixed(2)}%` as any },
                ]}
              />
              {/* Thumb */}
              {hoverPos !== null || isDragging ? (
                <View
                  style={[
                    styles.progressThumb,
                    { left: `${(playedPos * 100).toFixed(2)}%` as any },
                  ]}
                />
              ) : null}
            </View>
          </View>

          {/* Controls row */}
          <View style={styles.controlsRow}>
            {/* Left group */}
            <View style={styles.controlsGroup}>
              {/* Play/Pause */}
              <Pressable
                onPress={mpv.togglePause}
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
              >
                <MIcon code={mpv.isPlaying ? '\ue034' : '\ue037'} size={28} />
              </Pressable>

              {/* Seek -10 */}
              <Pressable
                onPress={() => mpv.seek(Math.max(0, mpv.currentTime - 10))}
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
              >
                <MIcon code={'\ue059'} size={24} />
              </Pressable>

              {/* Seek +10 */}
              <Pressable
                onPress={() => mpv.seek(mpv.currentTime + 10)}
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
              >
                <MIcon code={'\ue056'} size={24} />
              </Pressable>

              {/* Volume */}
              <View style={styles.volumeGroup}>
                <Pressable
                  onPress={() => {
                    if (mpv.volume > 0) {
                      prevVolumeRef.current = mpv.volume;
                      mpv.setVolume(0);
                    } else {
                      mpv.setVolume(prevVolumeRef.current || 100);
                    }
                  }}
                  style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
                  onHoverIn={() => setIsVolHovered(true)}
                  onHoverOut={() => setIsVolHovered(false)}
                >
                  <MIcon code={volumeIcon} size={24} />
                </Pressable>
                {/* Volume slider */}
                <View
                  style={[styles.volumeSliderWrapper, isVolHovered && styles.volumeSliderVisible]}
                  // @ts-ignore
                  onMouseEnter={() => setIsVolHovered(true)}
                  onMouseLeave={() => setIsVolHovered(false)}
                >
                  <input
                    type="range"
                    min={0}
                    max={150}
                    value={mpv.volume}
                    onChange={(e) => mpv.setVolume(Number(e.target.value))}
                    style={{
                      width: 80,
                      accentColor: ACCENT,
                      cursor: 'pointer',
                    }}
                  />
                </View>
              </View>

              {/* Time */}
              <Text style={styles.timeText}>
                {formatTime(mpv.currentTime)}
                <Text style={{ color: '#aaa' }}> / {formatTime(mpv.duration)}</Text>
              </Text>
            </View>

            {/* Right group */}
            <View style={styles.controlsGroup}>
              {/* Subtitle toggle (placeholder) */}
              <Pressable
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
                onPress={() => {/* placeholder */}}
              >
                <MIcon code={'\ue048'} size={22} color="#aaa" />
              </Pressable>

              {/* Speed */}
              <Pressable
                onPress={cycleSpeed}
                style={({ pressed }) => [styles.speedButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.speedText}>
                  {mpv.speed === 1 ? '1x' : `${mpv.speed}x`}
                </Text>
              </Pressable>

              {/* Fullscreen */}
              <Pressable
                onPress={toggleFullscreen}
                style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
              >
                <MIcon code={isFullscreen ? '\ue5d1' : '\ue5d0'} size={24} />
              </Pressable>
            </View>
          </View>
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 0,
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 10,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 10,
    backgroundColor: ACCENT,
    borderRadius: 6,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  centeredOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },

  // Controls overlay
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    // @ts-ignore — web-only transition
    transition: 'opacity 0.3s ease',
    justifyContent: 'space-between',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 32,
    // Gradient: black at top, transparent at bottom
    // @ts-ignore
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)',
  },
  topBarRight: {
    width: 44,
  },
  titleText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
    // @ts-ignore
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
  },

  // Center area (transparent, passes clicks to videoArea)
  centerArea: {
    flex: 1,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 32,
    // @ts-ignore
    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
  },

  // Progress bar
  progressBarOuter: {
    height: 20,
    justifyContent: 'center',
    marginBottom: 4,
    // @ts-ignore
    cursor: 'pointer',
    position: 'relative',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
    // @ts-ignore
    transition: 'height 0.15s ease',
  },
  progressHover: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: '50%',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    marginTop: -7,
    marginLeft: -7,
    // @ts-ignore
    boxShadow: '0 0 4px rgba(0,0,0,0.6)',
  },
  tooltip: {
    position: 'absolute',
    bottom: 24,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    // @ts-ignore
    transform: 'translateX(-50%)',
    // @ts-ignore
    pointerEvents: 'none',
    zIndex: 30,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },

  // Controls row
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  controlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 8,
    borderRadius: 4,
  },
  timeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
  },

  // Volume
  volumeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  volumeSliderWrapper: {
    width: 0,
    overflow: 'hidden',
    opacity: 0,
    // @ts-ignore
    transition: 'width 0.2s ease, opacity 0.2s ease',
  },
  volumeSliderVisible: {
    width: 90,
    opacity: 1,
  },

  // Speed
  speedButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  speedText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
