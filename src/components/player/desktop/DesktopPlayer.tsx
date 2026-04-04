// Native fallback — DesktopPlayer is only used on web/Tauri.
// On iOS/Android the PlayerIOS/PlayerAndroid screens are used instead.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function DesktopPlayer() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Desktop player is not available on this platform.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#fff', fontSize: 16 },
});
