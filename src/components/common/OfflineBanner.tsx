import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetwork } from '../../contexts/NetworkContext';
import { useTheme } from '../../contexts/ThemeContext';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export default function OfflineBanner() {
  const { isConnected } = useNetwork();
  const { currentTheme } = useTheme();
  const navigation = useNavigation<any>();

  if (isConnected) return null;

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
      <TouchableOpacity
        style={[styles.banner, { backgroundColor: currentTheme.colors.elevation1 }]}
        onPress={() => navigation.navigate('MainTabs', { screen: 'Library', params: { initialFilter: 'downloads' } })}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="wifi-off" size={18} color={currentTheme.colors.primary} />
        <Text style={[styles.text, { color: currentTheme.colors.text }]}>
          You're offline — downloaded content is available
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={currentTheme.colors.mediumEmphasis} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 10,
    gap: 10,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
