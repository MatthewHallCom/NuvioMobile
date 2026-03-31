import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import FastImage from '@d11/react-native-fast-image';
import { useTheme } from '../contexts/ThemeContext';
import { useDownloads } from '../contexts/DownloadsContext';
import type { DownloadItem } from '../contexts/DownloadsContext';
import { getOfflineImageUri } from '../services/offlineMetadataService';
import { useSettings } from '../hooks/useSettings';
import { RootStackParamList } from '../navigation/AppNavigator';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

type OfflineShowDetailRouteProp = RouteProp<RootStackParamList, 'OfflineShowDetail'>;

export default function OfflineShowDetailScreen() {
  const route = useRoute<OfflineShowDetailRouteProp>();
  const navigation = useNavigation();
  const { contentId } = route.params;
  const { currentTheme } = useTheme();
  const { downloads, removeDownload } = useDownloads();
  const { settings } = useSettings();

  // Filter downloads for this show
  const showDownloads = useMemo(
    () => downloads.filter(d => d.contentId === contentId && d.status === 'completed'),
    [downloads, contentId]
  );

  // Get show metadata from first episode
  const showMeta = showDownloads[0];

  // Group by season
  const seasons = useMemo(() => {
    const map: Record<number, DownloadItem[]> = {};
    for (const d of showDownloads) {
      const s = d.season ?? 1;
      if (!map[s]) map[s] = [];
      map[s].push(d);
    }
    // Sort episodes within each season
    for (const key of Object.keys(map)) {
      map[Number(key)].sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
    }
    return map;
  }, [showDownloads]);

  const seasonNumbers = useMemo(
    () => Object.keys(seasons).map(Number).sort((a, b) => a - b),
    [seasons]
  );

  const [selectedSeason, setSelectedSeason] = useState(seasonNumbers[0] ?? 1);
  const currentEpisodes = seasons[selectedSeason] ?? [];

  // Handle empty state (all episodes deleted)
  if (showDownloads.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.background }]}>
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="download-off" size={48} color={currentTheme.colors.mediumEmphasis} />
          <Text style={[styles.emptyText, { color: currentTheme.colors.text }]}>No downloaded episodes</Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: currentTheme.colors.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.backButtonText, { color: currentTheme.colors.background }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const bannerUri = getOfflineImageUri(showMeta, 'banner');
  const posterUri = getOfflineImageUri(showMeta, 'poster');

  const handlePlay = useCallback((item: DownloadItem) => {
    const resolvedUri = item.fileUri;
    if (!resolvedUri) return;

    const lower = resolvedUri.toLowerCase();
    const isMkv = /\.mkv(\?|$)/i.test(lower);
    const isM3u8 = /\.m3u8(\?|$)/i.test(lower);
    const isMpd = /\.mpd(\?|$)/i.test(lower);
    const isMp4 = /\.mp4(\?|$)/i.test(lower);
    const videoType = isM3u8 ? 'm3u8' : isMpd ? 'mpd' : isMp4 ? 'mp4' : undefined;

    const episodeId = item.season && item.episode
      ? `${item.contentId}:${item.season}:${item.episode}`
      : undefined;

    const playerRoute = Platform.OS === 'ios' ? 'PlayerIOS' : 'PlayerAndroid';
    (navigation as any).navigate(playerRoute, {
      uri: resolvedUri,
      title: item.title,
      episodeTitle: item.episodeTitle,
      season: item.season,
      episode: item.episode,
      quality: item.quality,
      streamProvider: 'Downloads',
      streamName: item.providerName || 'Offline',
      headers: undefined,
      id: item.contentId,
      type: item.type,
      episodeId,
      imdbId: item.imdbId || item.contentId,
      availableStreams: {},
      backdrop: undefined,
      videoType,
    });
  }, [navigation]);

  const handleDelete = useCallback((item: DownloadItem) => {
    Alert.alert(
      'Delete Episode',
      `Delete ${item.episodeTitle || `S${item.season}E${item.episode}`}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeDownload(item.id) },
      ]
    );
  }, [removeDownload]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.background }]} edges={['top']}>
      <ScrollView>
        {/* Banner Header */}
        <View style={styles.bannerContainer}>
          <FastImage
            source={{ uri: bannerUri }}
            style={styles.banner}
            resizeMode={FastImage.resizeMode.cover}
          />
          <LinearGradient
            colors={['transparent', currentTheme.colors.background]}
            style={styles.bannerGradient}
          />
          {/* Back button */}
          <TouchableOpacity style={styles.backArrow} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="arrow-left" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Show Info */}
        <View style={styles.infoContainer}>
          <View style={styles.titleRow}>
            <FastImage source={{ uri: posterUri }} style={styles.poster} resizeMode={FastImage.resizeMode.cover} />
            <View style={styles.titleInfo}>
              <Text style={[styles.title, { color: currentTheme.colors.text }]} numberOfLines={2}>
                {showMeta.title}
              </Text>
              <View style={styles.metaRow}>
                {showMeta.year && <Text style={[styles.metaText, { color: currentTheme.colors.mediumEmphasis }]}>{showMeta.year}</Text>}
                {showMeta.rating && (
                  <View style={styles.ratingBadge}>
                    <MaterialCommunityIcons name="star" size={14} color="#FFD700" />
                    <Text style={[styles.metaText, { color: currentTheme.colors.mediumEmphasis }]}>{showMeta.rating}</Text>
                  </View>
                )}
              </View>
              {showMeta.genres && showMeta.genres.length > 0 && (
                <Text style={[styles.genres, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={1}>
                  {showMeta.genres.slice(0, 3).join(' • ')}
                </Text>
              )}
            </View>
          </View>
          {showMeta.description && (
            <Text style={[styles.description, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={4}>
              {showMeta.description}
            </Text>
          )}
        </View>

        {/* Season Tabs */}
        {seasonNumbers.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonTabs}>
            {seasonNumbers.map(s => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.seasonTab,
                  selectedSeason === s && { borderBottomColor: currentTheme.colors.primary, borderBottomWidth: 2 },
                ]}
                onPress={() => setSelectedSeason(s)}
              >
                <Text style={[
                  styles.seasonTabText,
                  { color: selectedSeason === s ? currentTheme.colors.primary : currentTheme.colors.mediumEmphasis },
                ]}>
                  Season {s}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Episode List */}
        <View style={styles.episodeList}>
          {currentEpisodes.map(ep => (
            <TouchableOpacity
              key={ep.id}
              style={[styles.episodeRow, { backgroundColor: currentTheme.colors.elevation1 }]}
              onPress={() => handlePlay(ep)}
              onLongPress={() => handleDelete(ep)}
            >
              <View style={styles.episodeInfo}>
                <Text style={[styles.episodeNumber, { color: currentTheme.colors.primary }]}>
                  E{ep.episode}
                </Text>
                <View style={styles.episodeDetails}>
                  <Text style={[styles.episodeTitle, { color: currentTheme.colors.text }]} numberOfLines={1}>
                    {ep.episodeTitle || `Episode ${ep.episode}`}
                  </Text>
                  <View style={styles.episodeMeta}>
                    {ep.quality && (
                      <View style={[styles.qualityBadge, { backgroundColor: currentTheme.colors.elevation2 }]}>
                        <Text style={[styles.qualityText, { color: currentTheme.colors.mediumEmphasis }]}>{ep.quality}</Text>
                      </View>
                    )}
                    <Text style={[styles.fileSize, { color: currentTheme.colors.mediumEmphasis }]}>
                      {formatFileSize(ep.totalBytes)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.episodeActions}>
                <TouchableOpacity onPress={() => handlePlay(ep)} style={styles.playButton}>
                  <MaterialCommunityIcons name="play-circle" size={36} color={currentTheme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(ep)} style={styles.deleteButton}>
                  <MaterialCommunityIcons name="delete-outline" size={22} color={currentTheme.colors.mediumEmphasis} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 20 },
  emptyText: { fontSize: 18, fontWeight: '600' },
  backButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 8 },
  backButtonText: { fontSize: 16, fontWeight: '600' },
  bannerContainer: { height: 220, position: 'relative' },
  banner: { width: '100%', height: '100%' },
  bannerGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },
  backArrow: { position: 'absolute', top: 8, left: 12, padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
  infoContainer: { paddingHorizontal: 16, paddingBottom: 16, marginTop: -30 },
  titleRow: { flexDirection: 'row', gap: 12 },
  poster: { width: 80, height: 120, borderRadius: 8 },
  titleInfo: { flex: 1, justifyContent: 'flex-end', gap: 4 },
  title: { fontSize: 22, fontWeight: 'bold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 13 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  genres: { fontSize: 12 },
  description: { marginTop: 12, fontSize: 14, lineHeight: 20 },
  seasonTabs: { paddingHorizontal: 16, marginTop: 8, flexGrow: 0 },
  seasonTab: { paddingVertical: 10, paddingHorizontal: 16, marginRight: 4 },
  seasonTabText: { fontSize: 14, fontWeight: '600' },
  episodeList: { paddingHorizontal: 16, paddingBottom: 40, gap: 8, marginTop: 12 },
  episodeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10 },
  episodeInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  episodeNumber: { fontSize: 16, fontWeight: 'bold', width: 32 },
  episodeDetails: { flex: 1, gap: 4 },
  episodeTitle: { fontSize: 15, fontWeight: '500' },
  episodeMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qualityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  qualityText: { fontSize: 11, fontWeight: '600' },
  fileSize: { fontSize: 12 },
  episodeActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playButton: { padding: 4 },
  deleteButton: { padding: 4 },
});
