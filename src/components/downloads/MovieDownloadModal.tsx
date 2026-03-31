import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Stream } from '../../types/metadata';
import { useDownloads } from '../../contexts/DownloadsContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { useSettings } from '../../hooks/useSettings';
import { fetchStreamsForEpisode } from '../../services/streamFetchService';
import { autoSelectDownloadStream, getStreamSizeInBytes } from '../../screens/streams/utils';
import EpisodeStreamPicker from './EpisodeStreamPicker';

interface MovieDownloadModalProps {
  visible: boolean;
  onClose: () => void;
  contentId: string;
  contentTitle: string;
  posterUrl?: string | null;
  imdbId?: string;
  metadata?: { imdb_id?: string };
  year?: number;
  description?: string;
  genres?: string[];
  runtime?: number;
  rating?: number;
  bannerUrl?: string;
  logoUrl?: string;
}

type Phase = 'fetching' | 'pick' | 'done';

const colors = {
  primary: '#7C5CBF',
  white: '#FFFFFF',
  highEmphasis: '#FFFFFF',
  mediumEmphasis: 'rgba(255,255,255,0.6)',
  card: '#1E1E2E',
  elevation2: '#2A2A3E',
  darkBackground: '#12121C',
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  darkGray: '#3A3A4E',
};

const MovieDownloadModal: React.FC<MovieDownloadModalProps> = ({
  visible,
  onClose,
  contentId,
  contentTitle,
  posterUrl,
  imdbId,
  metadata,
  year,
  description,
  genres,
  runtime,
  rating,
  bannerUrl,
  logoUrl,
}) => {
  const { downloads, startDownload } = useDownloads();
  const { isWiFi, isConnected } = useNetwork();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('fetching');
  const [streams, setStreams] = useState<Stream[]>([]);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);

  const styles = useMemo(() => createStyles(colors), []);

  // Sort streams by size ascending (smallest first)
  const sortedStreams = useMemo(() => {
    return [...streams].sort((a, b) => {
      const sizeA = getStreamSizeInBytes(a);
      const sizeB = getStreamSizeInBytes(b);
      if (sizeA === 0 && sizeB === 0) return 0;
      if (sizeA === 0) return 1;
      if (sizeB === 0) return -1;
      return sizeA - sizeB;
    });
  }, [streams]);

  const alreadyDownloaded = useMemo(
    () =>
      downloads.find(
        d =>
          d.contentId === contentId &&
          d.type === 'movie' &&
          ['completed', 'downloading', 'queued'].includes(d.status)
      ),
    [downloads, contentId]
  );

  const handleClose = useCallback(() => {
    setPhase('fetching');
    setStreams([]);
    setSelectedStream(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;

    setPhase('fetching');
    setStreams([]);
    setSelectedStream(null);

    let cancelled = false;

    const fetchStreams = async () => {
      try {
        const result = await fetchStreamsForEpisode({
          showId: contentId,
          season: 0,
          episode: 0,
          type: 'movie',
          imdbId,
          metadata,
        });

        if (cancelled) return;

        const { stream } = autoSelectDownloadStream(result.streams);
        setStreams(result.streams);
        setSelectedStream(stream);
        setPhase('pick');
      } catch {
        if (!cancelled) {
          setPhase('pick');
        }
      }
    };

    fetchStreams();

    return () => {
      cancelled = true;
    };
  }, [visible, contentId, imdbId, metadata]);

  const handleDownload = useCallback(async () => {
    if (!selectedStream) return;

    if (settings?.wifiOnlyDownloads && isConnected && !isWiFi) {
      const confirmed = await new Promise<boolean>(resolve => {
        Alert.alert(
          'Cellular Download',
          `You're on cellular data. Download "${contentTitle}" anyway?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Download', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;
    }

    const qualityMatch = (selectedStream.title || '').match(/(\d{3,4})p/);

    await startDownload({
      id: contentId,
      type: 'movie',
      title: contentTitle,
      year,
      providerName: selectedStream.name || selectedStream.addonName || 'Provider',
      quality: qualityMatch ? qualityMatch[1] : undefined,
      posterUrl: posterUrl || null,
      url: selectedStream.url!,
      headers: (selectedStream.headers as any) || undefined,
      imdbId: imdbId || undefined,
      description,
      genres,
      runtime,
      rating,
      bannerUrl,
      logoUrl,
    });

    setPhase('done');
    setTimeout(() => {
      handleClose();
    }, 1500);
  }, [
    selectedStream,
    settings,
    isConnected,
    isWiFi,
    contentTitle,
    startDownload,
    contentId,
    year,
    posterUrl,
    imdbId,
    description,
    genres,
    runtime,
    rating,
    bannerUrl,
    logoUrl,
    handleClose,
  ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, Platform.OS === 'android' && { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {phase === 'fetching' ? 'Finding Streams...' : contentTitle}
            </Text>
            {phase === 'pick' && sortedStreams.length > 0 && (
              <Text style={styles.headerSubtitle}>{sortedStreams.length} sources available · sorted by size</Text>
            )}
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton} hitSlop={8}>
            <MaterialIcons name="close" size={22} color={colors.highEmphasis} />
          </TouchableOpacity>
        </View>

        {/* Phase: Fetching */}
        {phase === 'fetching' && (
          <View style={styles.centeredContainer}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.fetchingText}>Fetching streams...</Text>
          </View>
        )}

        {/* Phase: Pick */}
        {phase === 'pick' && (
          <View style={styles.pickContainer}>
            {sortedStreams.length === 0 ? (
              <View style={styles.centeredContainer}>
                <MaterialIcons name="cloud-off" size={48} color={colors.mediumEmphasis} style={{ marginBottom: 16 }} />
                <Text style={styles.noStreamsText}>No streams available</Text>
              </View>
            ) : (
              <View style={styles.pickerWrapper}>
                <EpisodeStreamPicker
                  streams={sortedStreams}
                  selectedStream={selectedStream}
                  onSelectStream={setSelectedStream}
                  theme={{ colors }}
                  fullHeight
                />
              </View>
            )}

            <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
              {alreadyDownloaded ? (
                <View style={styles.alreadyDownloadedContainer}>
                  <MaterialIcons name="check-circle" size={18} color={colors.success} style={{ marginRight: 6 }} />
                  <Text style={styles.alreadyDownloadedText}>Already Downloaded</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.downloadButton,
                    (!selectedStream || streams.length === 0) && styles.downloadButtonDisabled,
                  ]}
                  onPress={handleDownload}
                  disabled={!selectedStream || streams.length === 0}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="download" size={18} color={colors.white} style={{ marginRight: 6 }} />
                  <Text style={styles.downloadButtonText}>Download</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Phase: Done */}
        {phase === 'done' && (
          <View style={styles.centeredContainer}>
            <MaterialIcons name="check-circle" size={48} color={colors.success} style={{ marginBottom: 16 }} />
            <Text style={styles.doneText}>Download started ✓</Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.darkBackground,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.elevation2,
    },
    headerTitleBlock: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.highEmphasis,
    },
    headerSubtitle: {
      fontSize: 13,
      color: colors.mediumEmphasis,
      marginTop: 2,
    },
    closeButton: {
      padding: 4,
      marginLeft: 12,
    },
    centeredContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    fetchingText: {
      fontSize: 16,
      color: colors.mediumEmphasis,
    },
    noStreamsText: {
      fontSize: 16,
      color: colors.mediumEmphasis,
      textAlign: 'center',
    },
    pickContainer: {
      flex: 1,
    },
    pickerWrapper: {
      flex: 1,
      padding: 16,
    },
    footer: {
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.elevation2,
    },
    alreadyDownloadedContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
    },
    alreadyDownloadedText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.success,
    },
    downloadButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 14,
    },
    downloadButtonDisabled: {
      opacity: 0.4,
    },
    downloadButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.white,
    },
    doneText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.highEmphasis,
    },
  });

export default MovieDownloadModal;
