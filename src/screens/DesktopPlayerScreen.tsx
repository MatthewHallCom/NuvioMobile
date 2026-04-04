// Screen wrapper for DesktopPlayer that bridges navigation route params
// to the DesktopPlayer component's props interface.

import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import DesktopPlayer from '../components/player/desktop/DesktopPlayer';

export default function DesktopPlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { uri, headers, title, episodeTitle, season, episode } = route.params || {};
  const [videoReady, setVideoReady] = useState(false);

  const displayTitle = episodeTitle
    ? `${title || ''} - S${season}E${episode} ${episodeTitle}`
    : title || '';

  // Make ALL webview backgrounds transparent so the native MPV CAMetalLayer
  // behind the webview is visible. This must override react-navigation's
  // intermediate wrapper divs which have opaque backgrounds.
  // A black "curtain" overlay hides the see-through effect until MPV renders.
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'mpv-transparent-overlay';
    style.textContent = `
      html, body, #root, #root > div, #root > div > div,
      [class*="css-view-"] {
        background: transparent !important;
        background-color: transparent !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const el = document.getElementById('mpv-transparent-overlay');
      if (el) el.remove();
    };
  }, []);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  const handleError = useCallback((error: string) => {
    console.error('[DesktopPlayerScreen] Playback error:', error);
  }, []);

  const handleProgress = useCallback((currentTime: number, _duration: number) => {
    // Once we get progress updates, MPV is rendering frames
    if (currentTime > 0 && !videoReady) {
      setVideoReady(true);
    }
  }, [videoReady]);

  return (
    <View style={styles.container}>
      {/* Black curtain — covers the see-through window until MPV renders */}
      {!videoReady && <View style={styles.curtain} />}
      <DesktopPlayer
        source={{ uri, headers }}
        title={displayTitle}
        onBack={handleBack}
        onEnd={handleBack}
        onError={handleError}
        onProgress={handleProgress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  curtain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 10,
  },
});
