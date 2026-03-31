import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  Platform,
  Clipboard,
  Linking,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import Animated from 'react-native-reanimated';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import FastImage from '@d11/react-native-fast-image';
import { useSettings } from '../../hooks/useSettings';
import { useTranslation } from 'react-i18next';
import { VideoPlayerService } from '../../services/videoPlayerService';
import type { DownloadItem } from '../../contexts/DownloadsContext';
import * as FileSystem from 'expo-file-system/legacy';
import { groupDownloadsByShow, getMovieDownloads, getOfflineImageUri } from '../../services/offlineMetadataService';
import type { GroupedShow } from '../../services/offlineMetadataService';
import { useNetwork } from '../../contexts/NetworkContext';
import { useToast } from '../../contexts/ToastContext';
import CustomAlert from '../CustomAlert';
import { Buffer } from 'buffer';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

const HORIZONTAL_ITEM_WIDTH = isTablet ? width * 0.18 : width * 0.3;
const HORIZONTAL_POSTER_HEIGHT = HORIZONTAL_ITEM_WIDTH * 1.5;
const POSTER_WIDTH = isTablet ? 70 : 90;
const POSTER_HEIGHT = isTablet ? 105 : 135;

const optimizePosterUrl = (poster: string | undefined | null): string => {
  if (!poster || poster.includes('placeholder')) {
    return 'https://via.placeholder.com/80x120/333333/666666?text=No+Image';
  }
  if (poster.includes('image.tmdb.org')) {
    return poster.replace(/\/w\d+\//, '/w300/');
  }
  return poster;
};

// Download item component for active downloads
const DownloadItemCard: React.FC<{
  item: DownloadItem;
  onPress: (item: DownloadItem) => void;
  onAction: (item: DownloadItem, action: 'pause' | 'resume' | 'cancel' | 'retry') => void;
  onRequestRemove: (item: DownloadItem) => void;
}> = React.memo(({ item, onPress, onAction, onRequestRemove }) => {
  const { currentTheme } = useTheme();
  const { settings } = useSettings();
  const { showSuccess, showInfo } = useToast();
  const { t } = useTranslation();
  const [posterUrl, setPosterUrl] = useState<string | null>(item.posterUrl || null);
  const borderRadius = settings.posterBorderRadius ?? 12;

  useEffect(() => {
    if (!posterUrl && (item.imdbId || item.tmdbId)) {
      setPosterUrl(item.posterUrl || null);
    }
  }, [item.imdbId, item.tmdbId, item.posterUrl, posterUrl]);

  const handleLongPress = useCallback(() => {
    if (item.status === 'completed' && item.fileUri) {
      Clipboard.setString(item.fileUri);
      if (Platform.OS === 'android') {
        showSuccess(t('downloads.path_copied'), t('downloads.path_copied_desc'));
      } else {
        Alert.alert(t('downloads.copied'), t('downloads.path_copied_desc'));
      }
    } else if (item.status !== 'completed') {
      if (Platform.OS === 'android') {
        showInfo(t('downloads.incomplete'), t('downloads.incomplete_desc'));
      } else {
        Alert.alert(t('downloads.not_available'), t('downloads.not_available_desc'));
      }
    }
  }, [item.status, item.fileUri, showSuccess, showInfo]);

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const v = bytes / Math.pow(1024, i);
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${sizes[i]}`;
  };

  const getStatusColor = () => {
    switch (item.status) {
      case 'downloading': return currentTheme.colors.primary;
      case 'completed': return currentTheme.colors.success || '#4CAF50';
      case 'paused': return currentTheme.colors.warning || '#FF9500';
      case 'error': return currentTheme.colors.error || '#FF3B30';
      case 'queued': return currentTheme.colors.mediumEmphasis;
      default: return currentTheme.colors.mediumEmphasis;
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'downloading':
        const eta = item.etaSeconds ? `${Math.ceil(item.etaSeconds / 60)}m` : undefined;
        return eta ? `${t('downloads.status_downloading')} • ${eta}` : t('downloads.status_downloading');
      case 'completed': return t('downloads.status_completed');
      case 'paused': return t('downloads.status_paused');
      case 'error': return t('downloads.status_error');
      case 'queued': return t('downloads.status_queued');
      default: return t('downloads.status_unknown');
    }
  };

  const getActionIcon = () => {
    switch (item.status) {
      case 'downloading': return 'pause';
      case 'paused':
      case 'error':
      case 'queued': return 'play';
      default: return null;
    }
  };

  const handleActionPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (item.status) {
      case 'downloading': onAction(item, 'pause'); break;
      case 'paused':
      case 'error':
      case 'queued': onAction(item, 'resume'); break;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.downloadItem, { backgroundColor: currentTheme.colors.elevation2 }]}
      onPress={() => onPress(item)}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      <View style={[styles.posterContainer, { borderRadius }]}>
        <FastImage
          source={{ uri: optimizePosterUrl(posterUrl) }}
          style={[styles.poster, { borderRadius }]}
          resizeMode={FastImage.resizeMode.cover}
        />
        <View style={[styles.statusOverlay, { backgroundColor: getStatusColor() }]}>
          <MaterialCommunityIcons
            name={
              item.status === 'completed' ? 'check' :
                item.status === 'downloading' ? 'download' :
                  item.status === 'paused' ? 'pause' :
                    item.status === 'error' ? 'alert-circle' : 'clock'
            }
            size={12}
            color="white"
          />
        </View>
      </View>

      <View style={styles.downloadContent}>
        <View style={styles.downloadHeader}>
          <View style={styles.titleContainer}>
            <Text style={[styles.downloadTitle, { color: currentTheme.colors.text }]} numberOfLines={1}>
              {item.title}{item.type === 'series' && item.season && item.episode ? `  S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}` : ''}
            </Text>
          </View>
          {item.type === 'series' && (
            <Text style={[styles.episodeInfo, { color: currentTheme.colors.mediumEmphasis }]} numberOfLines={1}>
              S{item.season?.toString().padStart(2, '0')}E{item.episode?.toString().padStart(2, '0')} • {item.episodeTitle}
            </Text>
          )}
        </View>

        <View style={styles.progressSection}>
          <View style={styles.providerRow}>
            <Text style={[styles.providerText, { color: currentTheme.colors.mediumEmphasis }]}>
              {item.providerName || t('downloads.provider')}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          </View>
          <View style={styles.sizeRow}>
            <Text style={[styles.progressText, { color: currentTheme.colors.mediumEmphasis }]}>
              {formatBytes(item.downloadedBytes)} / {item.totalBytes ? formatBytes(item.totalBytes) : '\u2014'}
            </Text>
          </View>
          {item.totalBytes && item.totalBytes < 1048576 && (
            <View style={styles.warningRow}>
              <MaterialCommunityIcons name="alert-circle" size={14} color={currentTheme.colors.warning || '#FF9500'} />
              <Text style={[styles.warningText, { color: currentTheme.colors.warning || '#FF9500' }]}>
                {t('downloads.streaming_playlist_warning')}
              </Text>
            </View>
          )}
          <View style={[styles.progressContainer, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <Animated.View
              style={[
                styles.progressBar,
                { backgroundColor: getStatusColor(), width: `${item.progress || 0}%` },
              ]}
            />
          </View>
          <View style={styles.progressDetails}>
            <Text style={[styles.progressPercentage, { color: currentTheme.colors.text }]}>
              {item.progress || 0}%
            </Text>
            {item.etaSeconds && item.status === 'downloading' && (
              <Text style={[styles.etaText, { color: currentTheme.colors.mediumEmphasis }]}>
                {Math.ceil(item.etaSeconds / 60)}m {t('downloads.remaining')}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.actionContainer}>
        {getActionIcon() && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: currentTheme.colors.elevation2 }]}
            onPress={handleActionPress}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name={getActionIcon() as any} size={20} color={currentTheme.colors.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: currentTheme.colors.elevation2 }]}
          onPress={() => onRequestRemove(item)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="delete-outline" size={20} color={currentTheme.colors.error} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

// Main section component
interface LibraryDownloadsSectionProps {
  downloads: DownloadItem[];
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  removeDownload: (id: string) => void;
}

const LibraryDownloadsSection: React.FC<LibraryDownloadsSectionProps> = ({
  downloads,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  removeDownload,
}) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currentTheme } = useTheme();
  const { settings } = useSettings();
  const { t } = useTranslation();
  const { isConnected } = useNetwork();

  const [showRemoveAlert, setShowRemoveAlert] = useState(false);
  const [pendingRemoveItem, setPendingRemoveItem] = useState<DownloadItem | null>(null);
  const [showDeleteShowAlert, setShowDeleteShowAlert] = useState(false);
  const [pendingDeleteShow, setPendingDeleteShow] = useState<{ title: string; items: DownloadItem[] } | null>(null);

  const movieDownloads = useMemo(() => getMovieDownloads(downloads), [downloads]);
  const seriesGroups = useMemo(() => groupDownloadsByShow(downloads), [downloads]);
  const activeDownloads = useMemo(() => downloads.filter(d => d.status !== 'completed'), [downloads]);

  const handleDownloadPress = useCallback(async (item: DownloadItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.status !== 'completed') {
      Alert.alert(t('downloads.not_ready'), t('downloads.not_ready_desc'));
      return;
    }
    const uri = item.fileUri;
    if (!uri) {
      Alert.alert('Playback Error', 'Downloaded file path is missing. Try removing and re-downloading.');
      return;
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        Alert.alert('File Not Found', 'The downloaded file could not be found. It may have been deleted. Try removing and re-downloading.');
        return;
      }
    } catch {
      Alert.alert('Playback Error', 'Could not access the downloaded file.');
      return;
    }

    const lower = String(uri).toLowerCase();
    const isMkv = /\.mkv(\?|$)/i.test(lower) || /(?:[?&]ext=|container=|format=)mkv\b/i.test(lower);
    const isM3u8 = /\.m3u8(\?|$)/i.test(lower);
    const isMpd = /\.mpd(\?|$)/i.test(lower);
    const isMp4 = /\.mp4(\?|$)/i.test(lower);
    const videoType = isM3u8 ? 'm3u8' : isMpd ? 'mpd' : isMp4 ? 'mp4' : undefined;

    if (settings.useExternalPlayerForDownloads) {
      if (Platform.OS === 'android') {
        try {
          const success = await VideoPlayerService.playVideo(uri, {
            useExternalPlayer: true,
            title: item.title,
            episodeTitle: item.type === 'series' ? item.episodeTitle : undefined,
            episodeNumber: item.type === 'series' && item.season && item.episode ? `S${item.season}E${item.episode}` : undefined,
          });
          if (success) return;
        } catch (error) {
          console.error('External player failed:', error);
        }
      } else if (Platform.OS === 'ios') {
        const streamUrl = encodeURIComponent(uri);
        let externalPlayerUrls: string[] = [];

        switch (settings.preferredPlayer) {
          case 'vlc':
            externalPlayerUrls = [
              `vlc://${uri}`,
              `vlc-x-callback://x-callback-url/stream?url=${streamUrl}`,
              `vlc://${streamUrl}`
            ];
            break;
          case 'outplayer':
            externalPlayerUrls = [
              `outplayer://${uri}`,
              `outplayer://${streamUrl}`,
              `outplayer://play?url=${streamUrl}`,
              `outplayer://stream?url=${streamUrl}`,
              `outplayer://play/browser?url=${streamUrl}`
            ];
            break;
          case 'infuse':
            externalPlayerUrls = [`infuse://x-callback-url/play?url=${streamUrl}`];
            break;
          case 'vidhub':
            externalPlayerUrls = [`open-vidhub://x-callback-url/open?url=${streamUrl}`];
            break;
          case 'infuse_livecontainer':
            const infuseUrls = [
              `infuse://x-callback-url/play?url=${streamUrl}`,
              `infuse://play?url=${streamUrl}`,
              `infuse://${streamUrl}`
            ];
            externalPlayerUrls = infuseUrls.map(infuseUrl => {
              const encoded = Buffer.from(infuseUrl).toString('base64');
              return `livecontainer://open-url?url=${encoded}`;
            });
            break;
          default:
            break;
        }

        if (settings.preferredPlayer !== 'internal') {
          const tryNextUrl = (index: number) => {
            if (index >= externalPlayerUrls.length) {
              openInternalPlayer();
              return;
            }
            const url = externalPlayerUrls[index];
            Linking.openURL(url).catch(() => tryNextUrl(index + 1));
          };
          if (externalPlayerUrls.length > 0) {
            tryNextUrl(0);
            return;
          }
        }
      }
    }

    const openInternalPlayer = () => {
      const episodeId = item.type === 'series' && item.season && item.episode
        ? `${item.contentId}:${item.season}:${item.episode}`
        : undefined;

      const playerRoute = Platform.OS === 'ios' ? 'PlayerIOS' : 'PlayerAndroid';
      navigation.navigate(playerRoute as any, {
        uri,
        title: item.title,
        episodeTitle: item.type === 'series' ? item.episodeTitle : undefined,
        season: item.type === 'series' ? item.season : undefined,
        episode: item.type === 'series' ? item.episode : undefined,
        quality: item.quality,
        year: undefined,
        streamProvider: 'Downloads',
        streamName: item.providerName || 'Offline',
        headers: undefined,
        id: item.contentId,
        type: item.type,
        episodeId: episodeId,
        imdbId: (item as any).imdbId || item.contentId,
        availableStreams: {},
        backdrop: undefined,
        videoType,
      } as any);
    };

    openInternalPlayer();
  }, [navigation, settings]);

  const handleDownloadAction = useCallback((item: DownloadItem, action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    if (action === 'pause') pauseDownload(item.id);
    if (action === 'resume') resumeDownload(item.id);
    if (action === 'cancel') cancelDownload(item.id);
  }, [pauseDownload, resumeDownload, cancelDownload]);

  const handleRequestRemove = useCallback((item: DownloadItem) => {
    setPendingRemoveItem(item);
    setShowRemoveAlert(true);
  }, []);

  const handleMovieLongPress = useCallback((item: DownloadItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingDeleteShow({ title: item.title, items: [item] });
    setShowDeleteShowAlert(true);
  }, []);

  const handleShowLongPress = useCallback((group: GroupedShow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const allEpisodes = Object.values(group.seasons).flat();
    setPendingDeleteShow({ title: group.title, items: allEpisodes });
    setShowDeleteShowAlert(true);
  }, []);

  if (downloads.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: currentTheme.colors.elevation1 }]}>
          <MaterialCommunityIcons name="download-outline" size={48} color={currentTheme.colors.mediumEmphasis} />
        </View>
        <Text style={[styles.emptyTitle, { color: currentTheme.colors.text }]}>
          {t('downloads.no_downloads')}
        </Text>
        <Text style={[styles.emptySubtitle, { color: currentTheme.colors.mediumEmphasis }]}>
          {t('downloads.no_downloads_desc')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: currentTheme.colors.darkBackground }}
      contentContainerStyle={styles.listContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Offline indicator */}
      {!isConnected && (
        <View style={[styles.offlineBanner, { backgroundColor: currentTheme.colors.elevation1 }]}>
          <MaterialCommunityIcons name="wifi-off" size={16} color={currentTheme.colors.primary} />
          <Text style={[styles.offlineBannerText, { color: currentTheme.colors.text }]}>
            You're offline — viewing downloaded content
          </Text>
        </View>
      )}

      {/* Active / Queued / Paused / Error downloads */}
      {activeDownloads.map(item => (
        <DownloadItemCard
          key={item.id}
          item={item}
          onPress={handleDownloadPress}
          onAction={handleDownloadAction}
          onRequestRemove={handleRequestRemove}
        />
      ))}

      {/* Completed Movies Section */}
      {movieDownloads.length > 0 && (
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionHeader, { color: currentTheme.colors.text }]}>Movies</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.posterRow}>
            {movieDownloads.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.movieCard}
                onPress={() => handleDownloadPress(item)}
                onLongPress={() => handleMovieLongPress(item)}
                activeOpacity={0.8}
              >
                <FastImage
                  source={{ uri: getOfflineImageUri(item, 'poster') }}
                  style={[styles.moviePoster, { borderRadius: settings.posterBorderRadius ?? 12 }]}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <Text style={[styles.movieTitle, { color: currentTheme.colors.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Completed Series Section */}
      {Object.keys(seriesGroups).length > 0 && (
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionHeader, { color: currentTheme.colors.text }]}>Series</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.posterRow}>
            {Object.values(seriesGroups).map(group => (
              <TouchableOpacity
                key={group.contentId}
                style={styles.movieCard}
                onPress={() => navigation.navigate('OfflineShowDetail', { contentId: group.contentId })}
                onLongPress={() => handleShowLongPress(group)}
                activeOpacity={0.8}
              >
                <FastImage
                  source={{ uri: getOfflineImageUri(group, 'poster') }}
                  style={[styles.moviePoster, { borderRadius: settings.posterBorderRadius ?? 12 }]}
                  resizeMode={FastImage.resizeMode.cover}
                />
                <Text style={[styles.movieTitle, { color: currentTheme.colors.text }]} numberOfLines={2}>
                  {group.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Remove Download Confirmation */}
      <CustomAlert
        visible={showRemoveAlert}
        title={t('downloads.remove_title')}
        message={pendingRemoveItem ? t('downloads.remove_confirm', {
          title: pendingRemoveItem.title,
          season_episode: pendingRemoveItem.type === 'series' && pendingRemoveItem.season && pendingRemoveItem.episode ? ` S${String(pendingRemoveItem.season).padStart(2, '0')}E${String(pendingRemoveItem.episode).padStart(2, '0')}` : ''
        }) : t('downloads.remove_confirm', { title: 'this download', season_episode: '' })}
        actions={[
          { label: t('downloads.cancel'), onPress: () => setShowRemoveAlert(false) },
          { label: t('downloads.remove'), onPress: () => { if (pendingRemoveItem) { removeDownload(pendingRemoveItem.id); } setShowRemoveAlert(false); setPendingRemoveItem(null); }, style: {} },
        ]}
        onClose={() => { setShowRemoveAlert(false); setPendingRemoveItem(null); }}
      />

      {/* Delete Show/Movie Confirmation */}
      <CustomAlert
        visible={showDeleteShowAlert}
        title="Delete Download"
        message={pendingDeleteShow
          ? pendingDeleteShow.items.length === 1
            ? `Delete "${pendingDeleteShow.title}" from your downloads?`
            : `Delete all ${pendingDeleteShow.items.length} episodes of "${pendingDeleteShow.title}" from your downloads?`
          : ''}
        actions={[
          { label: 'Cancel', onPress: () => { setShowDeleteShowAlert(false); setPendingDeleteShow(null); } },
          { label: 'Delete', onPress: () => {
            if (pendingDeleteShow) {
              pendingDeleteShow.items.forEach(item => removeDownload(item.id));
            }
            setShowDeleteShowAlert(false);
            setPendingDeleteShow(null);
          }, style: {} },
        ]}
        onClose={() => { setShowDeleteShowAlert(false); setPendingDeleteShow(null); }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  listContainer: {
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: isTablet ? 120 : 100,
  },
  downloadItem: {
    borderRadius: 0,
    padding: isTablet ? 20 : 16,
    marginBottom: isTablet ? 16 : 12,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: isTablet ? 165 : 152,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    marginHorizontal: 0,
  },
  posterContainer: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 12,
    marginRight: isTablet ? 20 : 16,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#333',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    elevation: Platform.OS === 'android' ? 1 : 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  poster: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  statusOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  downloadContent: {
    flex: 1,
  },
  downloadHeader: {
    marginBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  downloadTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  episodeInfo: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressSection: {
    gap: 4,
  },
  providerRow: {
    marginBottom: 2,
  },
  providerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusRow: {
    marginBottom: 2,
  },
  sizeRow: {
    marginBottom: 6,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  warningText: {
    fontSize: 11,
    fontWeight: '500',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressContainer: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  progressDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '700',
  },
  etaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: isTablet ? 64 : 40,
    paddingTop: isTablet ? 120 : 100,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: isTablet ? 28 : 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: isTablet ? 18 : 16,
    textAlign: 'center',
    lineHeight: isTablet ? 28 : 24,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  offlineBannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  posterRow: {
    paddingHorizontal: 16,
    gap: 12,
  },
  movieCard: {
    width: HORIZONTAL_ITEM_WIDTH,
  },
  moviePoster: {
    width: HORIZONTAL_ITEM_WIDTH,
    height: HORIZONTAL_POSTER_HEIGHT,
    marginBottom: 6,
  },
  movieTitle: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default LibraryDownloadsSection;
