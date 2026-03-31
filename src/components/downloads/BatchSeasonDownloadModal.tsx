import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Episode } from '../../types/metadata';
import { Stream } from '../../types/metadata';
import { useDownloads } from '../../contexts/DownloadsContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { useSettings } from '../../hooks/useSettings';
import { watchedService } from '../../services/watchedService';
import { fetchStreamsForEpisode } from '../../services/streamFetchService';
import { autoSelectDownloadStream, getStreamSizeInBytes } from '../../screens/streams/utils';
import EpisodeStreamPicker from './EpisodeStreamPicker';

interface BatchSeasonDownloadModalProps {
  visible: boolean;
  onClose: () => void;
  contentId: string;
  contentTitle: string;
  groupedEpisodes: { [seasonNumber: number]: Episode[] };
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

type EpisodeStatus =
  | 'pending'
  | 'fetching'
  | 'ready'
  | 'no-streams'
  | 'already-downloaded'
  | 'skipped-watched'
  | 'error'
  | 'queued';

type EpisodeSelection = {
  episode: Episode;
  status: EpisodeStatus;
  streams: Stream[];
  selectedStream: Stream | null;
  isWatched: boolean;
  isCodecFallback: boolean;
  errorMessage?: string;
};

type Phase = 'season-select' | 'filter-prompt' | 'fetching' | 'summary' | 'downloading';

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const BatchSeasonDownloadModal: React.FC<BatchSeasonDownloadModalProps> = ({
  visible,
  onClose,
  contentId,
  contentTitle,
  groupedEpisodes,
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

  const [phase, setPhase] = useState<Phase>('season-select');
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number | 'all' | null>(null);
  const [selections, setSelections] = useState<EpisodeSelection[]>([]);
  const [watchedMap, setWatchedMap] = useState<boolean[]>([]);
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0 });
  const [fetchingEpisodeTitle, setFetchingEpisodeTitle] = useState('');
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [downloadResult, setDownloadResult] = useState<{ queued: number; failed: number } | null>(null);
  const abortRef = useRef(false);

  const activeEpisodes = useMemo(() => {
    if (!selectedSeasonNum) return [];
    if (selectedSeasonNum === 'all') return Object.values(groupedEpisodes).flat();
    return groupedEpisodes[selectedSeasonNum] || [];
  }, [selectedSeasonNum, groupedEpisodes]);

  // Load watched status when a season is selected
  useEffect(() => {
    if (!visible || !selectedSeasonNum) return;
    let cancelled = false;

    const loadWatched = async () => {
      const results = await Promise.all(
        activeEpisodes.map(ep =>
          watchedService.isEpisodeWatched(contentId, ep.season_number, ep.episode_number, imdbId)
            .catch(() => false)
        )
      );
      if (!cancelled) setWatchedMap(results);
    };

    loadWatched();
    return () => { cancelled = true; };
  }, [visible, selectedSeasonNum, contentId, imdbId]);

  // Reset state on close
  const handleClose = useCallback(() => {
    abortRef.current = true;
    setPhase('season-select');
    setSelectedSeasonNum(null);
    setSelections([]);
    setWatchedMap([]);
    setFetchProgress({ current: 0, total: 0 });
    setExpandedEpisode(null);
    setDownloadResult(null);
    onClose();
  }, [onClose]);

  const unwatchedCount = watchedMap.filter(w => !w).length;
  const totalCount = activeEpisodes.length;

  const startFetching = useCallback(async (filterWatched: boolean) => {
    abortRef.current = false;
    setPhase('fetching');

    const filteredEpisodes = filterWatched
      ? activeEpisodes.filter((_, i) => !watchedMap[i])
      : activeEpisodes;

    const initial: EpisodeSelection[] = filteredEpisodes.map((ep) => ({
      episode: ep,
      status: 'pending',
      streams: [],
      selectedStream: null,
      isWatched: filterWatched ? false : (watchedMap[activeEpisodes.indexOf(ep)] ?? false),
      isCodecFallback: false,
    }));
    setSelections(initial);
    setFetchProgress({ current: 0, total: filteredEpisodes.length });

    const updated = [...initial];

    for (let i = 0; i < filteredEpisodes.length; i++) {
      if (abortRef.current) break;

      const ep = filteredEpisodes[i];
      setFetchingEpisodeTitle(ep.name || `Episode ${ep.episode_number}`);
      setFetchProgress({ current: i + 1, total: filteredEpisodes.length });

      // Check already downloaded
      const alreadyDone = downloads.find(
        d =>
          d.contentId === contentId &&
          d.season === ep.season_number &&
          d.episode === ep.episode_number &&
          ['completed', 'downloading', 'queued'].includes(d.status)
      );

      if (alreadyDone) {
        updated[i] = { ...updated[i], status: 'already-downloaded' };
        setSelections([...updated]);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Mark fetching
      updated[i] = { ...updated[i], status: 'fetching' };
      setSelections([...updated]);

      try {
        const result = await fetchStreamsForEpisode({
          showId: contentId,
          season: ep.season_number,
          episode: ep.episode_number,
          type: 'series',
          imdbId,
          metadata,
        });

        const { stream, isCodecFallback } = autoSelectDownloadStream(result.streams);

        updated[i] = {
          ...updated[i],
          status: stream ? 'ready' : 'no-streams',
          streams: result.streams,
          selectedStream: stream,
          isCodecFallback,
        };
      } catch (err: any) {
        updated[i] = {
          ...updated[i],
          status: 'error',
          errorMessage: err?.message || 'Failed to fetch streams',
        };
      }

      setSelections([...updated]);
      await new Promise(r => setTimeout(r, 500));
    }

    setPhase('summary');
  }, [activeEpisodes, watchedMap, downloads, contentId, imdbId, metadata]);

  const totalReadySize = useMemo(() => {
    return selections.reduce((sum, sel) => {
      if (sel.status !== 'ready' || !sel.selectedStream) return sum;
      return sum + getStreamSizeInBytes(sel.selectedStream);
    }, 0);
  }, [selections]);

  const readyCount = useMemo(
    () => selections.filter(s => s.status === 'ready').length,
    [selections]
  );

  const startBatchDownload = useCallback(async () => {
    // WiFi-only check once before batch loop
    if (settings?.wifiOnlyDownloads && isConnected && !isWiFi) {
      const sizeStr = totalReadySize > 0 ? ` (~${formatBytes(totalReadySize)})` : '';
      const confirmed = await new Promise<boolean>(resolve => {
        Alert.alert(
          'Cellular Download',
          `You're on cellular data. Download ${readyCount} episode${readyCount !== 1 ? 's' : ''}${sizeStr} anyway?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Download', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;
    }

    const readySelections = selections.filter(s => s.status === 'ready');
    setDownloadProgress({ current: 0, total: readySelections.length });
    setPhase('downloading');

    let queued = 0;
    let failed = 0;
    const updated = [...selections];

    for (let i = 0; i < readySelections.length; i++) {
      const sel = readySelections[i];
      const stream = sel.selectedStream!;
      const ep = sel.episode;
      setDownloadProgress({ current: i + 1, total: readySelections.length });

      try {
        const qualityMatch = (stream.title || '').match(/(\d{3,4})p/);
        await startDownload({
          id: contentId,
          type: 'series',
          title: contentTitle,
          year,
          providerName: stream.name || stream.addonName || 'Provider',
          season: ep.season_number,
          episode: ep.episode_number,
          episodeTitle: ep.name || undefined,
          quality: qualityMatch ? qualityMatch[1] : undefined,
          posterUrl: posterUrl || null,
          url: stream.url!,
          headers: (stream.headers as any) || undefined,
          imdbId: imdbId || undefined,
          description,
          genres,
          runtime,
          rating,
          bannerUrl,
          logoUrl,
        });

        // Mark as queued in UI
        const selIndex = updated.findIndex(
          u => u.episode.episode_number === ep.episode_number && u.episode.season_number === ep.season_number
        );
        if (selIndex !== -1) {
          updated[selIndex] = { ...updated[selIndex], status: 'queued' };
        }
        queued++;
      } catch (err: any) {
        const selIndex = updated.findIndex(
          u => u.episode.episode_number === ep.episode_number && u.episode.season_number === ep.season_number
        );
        if (selIndex !== -1) {
          updated[selIndex] = {
            ...updated[selIndex],
            status: 'error',
            errorMessage: err?.message || 'Download failed',
          };
        }
        failed++;
      }

      setSelections([...updated]);
      await new Promise(r => setTimeout(r, 100));
    }

    setDownloadResult({ queued, failed });

    setTimeout(() => {
      handleClose();
    }, 2000);
  }, [
    selections,
    settings,
    isConnected,
    isWiFi,
    totalReadySize,
    readyCount,
    startDownload,
    contentId,
    contentTitle,
    posterUrl,
    imdbId,
    year,
    description,
    genres,
    runtime,
    rating,
    bannerUrl,
    logoUrl,
    handleClose,
  ]);

  const handleStreamOverride = useCallback((episodeNumber: number, stream: Stream) => {
    setSelections(prev =>
      prev.map(sel =>
        sel.episode.episode_number === episodeNumber
          ? { ...sel, selectedStream: stream }
          : sel
      )
    );
    setExpandedEpisode(null);
  }, []);

  const renderEpisodeRow = useCallback(({ item: sel }: { item: EpisodeSelection }) => {
    const ep = sel.episode;
    const isExpanded = expandedEpisode === ep.episode_number;
    const stream = sel.selectedStream;
    const sizeBytes = stream ? getStreamSizeInBytes(stream) : 0;
    const qualityMatch = stream ? (stream.title || '').match(/(\d{3,4})p/) : null;

    return (
      <View style={styles.episodeRow}>
        <TouchableOpacity
          style={styles.episodeRowHeader}
          onPress={() => {
            if (sel.status === 'ready' && sel.streams.length > 1) {
              setExpandedEpisode(isExpanded ? null : ep.episode_number);
            }
          }}
          activeOpacity={sel.status === 'ready' && sel.streams.length > 1 ? 0.7 : 1}
        >
          <View style={styles.episodeInfo}>
            <Text style={styles.episodeTitle} numberOfLines={1}>
              {selectedSeasonNum === 'all' ? `S${ep.season_number}E${ep.episode_number}` : `E${ep.episode_number}`}
              {ep.name ? ` · ${ep.name}` : ''}
            </Text>

            {sel.status === 'fetching' && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 2 }} />
            )}

            {sel.status === 'ready' && stream && (
              <View style={styles.streamSummary}>
                <Text style={styles.streamProviderText} numberOfLines={1}>
                  {stream.name || stream.addonName || 'Provider'}
                </Text>
                <View style={styles.badgeRow}>
                  {qualityMatch && (
                    <View style={[styles.badge, styles.badgeNeutral]}>
                      <Text style={styles.badgeText}>{qualityMatch[1]}p</Text>
                    </View>
                  )}
                  {sizeBytes > 0 && (
                    <View style={[styles.badge, styles.badgeNeutral]}>
                      <Text style={styles.badgeText}>{formatBytes(sizeBytes)}</Text>
                    </View>
                  )}
                  {sel.isCodecFallback && (
                    <View style={[styles.badge, styles.badgeWarning]}>
                      <Text style={styles.badgeText}>Incompatible Codec</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {sel.status === 'no-streams' && (
              <Text style={styles.statusText}>No streams available</Text>
            )}
            {sel.status === 'already-downloaded' && (
              <Text style={[styles.statusText, styles.statusGreen]}>Already Downloaded</Text>
            )}
            {sel.status === 'skipped-watched' && (
              <Text style={styles.statusText}>Skipped (watched)</Text>
            )}
            {sel.status === 'error' && (
              <Text style={[styles.statusText, styles.statusRed]}>{sel.errorMessage || 'Error'}</Text>
            )}
            {sel.status === 'queued' && (
              <Text style={[styles.statusText, styles.statusGreen]}>Queued</Text>
            )}
          </View>

          {sel.status === 'ready' && sel.streams.length > 1 && (
            <MaterialIcons
              name={isExpanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={colors.mediumEmphasis}
            />
          )}
        </TouchableOpacity>

        {isExpanded && sel.streams.length > 0 && (
          <View style={styles.pickerContainer}>
            <EpisodeStreamPicker
              streams={sel.streams}
              selectedStream={sel.selectedStream}
              onSelectStream={stream => handleStreamOverride(ep.episode_number, stream)}
              theme={{ colors }}
            />
          </View>
        )}
      </View>
    );
  }, [expandedEpisode, handleStreamOverride, selectedSeasonNum]);

  // Inline colors (we don't have theme prop here — use hardcoded dark theme values
  // that match the app's palette; these are standard across all themes)
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

  const styles = useMemo(() => createStyles(colors), []);

  // Sorted season numbers: regular seasons first, specials (0) at end
  const sortedSeasons = useMemo(() => {
    const nums = Object.keys(groupedEpisodes).map(Number);
    const regular = nums.filter(n => n !== 0).sort((a, b) => a - b);
    const specials = nums.filter(n => n === 0);
    return [...regular, ...specials];
  }, [groupedEpisodes]);

  const totalEpisodeCount = useMemo(
    () => Object.values(groupedEpisodes).reduce((sum, eps) => sum + eps.length, 0),
    [groupedEpisodes]
  );

  const headerSubtitle = useMemo(() => {
    if (phase === 'season-select') return null;
    if (selectedSeasonNum === 'all') return 'All Seasons';
    if (selectedSeasonNum !== null) return `Season ${selectedSeasonNum}`;
    return null;
  }, [phase, selectedSeasonNum]);

  const filterPromptTitle = selectedSeasonNum === 'all'
    ? 'Download All Seasons'
    : `Download Season ${selectedSeasonNum}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle} numberOfLines={1}>{contentTitle}</Text>
            {headerSubtitle ? (
              <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton} hitSlop={8}>
            <MaterialIcons name="close" size={22} color={colors.highEmphasis} />
          </TouchableOpacity>
        </View>

        {/* Phase: Season Select */}
        {phase === 'season-select' && (
          <View style={styles.promptContainer}>
            <MaterialIcons name="cloud-download" size={48} color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.promptTitle}>Download Episodes</Text>
            <Text style={styles.promptSubtitle}>Choose a season</Text>

            <TouchableOpacity
              style={[styles.optionButton, styles.optionButtonPrimary]}
              onPress={() => {
                setSelectedSeasonNum('all');
                setPhase('filter-prompt');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.optionButtonTitle}>All Seasons</Text>
              <Text style={styles.optionButtonCount}>{totalEpisodeCount} episode{totalEpisodeCount !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>

            {sortedSeasons.map(seasonNum => {
              const count = (groupedEpisodes[seasonNum] || []).length;
              const label = seasonNum === 0 ? 'Specials' : `Season ${seasonNum}`;
              return (
                <TouchableOpacity
                  key={seasonNum}
                  style={[styles.optionButton, styles.optionButtonSecondary]}
                  onPress={() => {
                    setSelectedSeasonNum(seasonNum);
                    setPhase('filter-prompt');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.optionButtonTitle, { color: colors.highEmphasis }]}>{label}</Text>
                  <Text style={[styles.optionButtonCount, { color: colors.mediumEmphasis }]}>{count} episode{count !== 1 ? 's' : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Phase: Filter Prompt */}
        {phase === 'filter-prompt' && (
          <View style={styles.promptContainer}>
            <MaterialIcons name="cloud-download" size={48} color={colors.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.promptTitle}>{filterPromptTitle}</Text>
            <Text style={styles.promptSubtitle}>Choose which episodes to download</Text>

            <TouchableOpacity
              style={[styles.optionButton, styles.optionButtonPrimary]}
              onPress={() => startFetching(true)}
              disabled={unwatchedCount === 0}
              activeOpacity={0.8}
            >
              <Text style={styles.optionButtonTitle}>Unwatched Only</Text>
              <Text style={styles.optionButtonCount}>{unwatchedCount} episode{unwatchedCount !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, styles.optionButtonSecondary]}
              onPress={() => startFetching(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.optionButtonTitle, { color: colors.highEmphasis }]}>All Episodes</Text>
              <Text style={[styles.optionButtonCount, { color: colors.mediumEmphasis }]}>{totalCount} episode{totalCount !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Phase: Fetching */}
        {phase === 'fetching' && (
          <View style={styles.fetchingContainer}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
            <Text style={styles.fetchingTitle}>Fetching Streams...</Text>
            <Text style={styles.fetchingProgress}>
              {fetchProgress.current} / {fetchProgress.total}
            </Text>
            {fetchingEpisodeTitle ? (
              <Text style={styles.fetchingEpisode} numberOfLines={1}>{fetchingEpisodeTitle}</Text>
            ) : null}

            {/* Progress bar */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: fetchProgress.total > 0
                      ? `${(fetchProgress.current / fetchProgress.total) * 100}%`
                      : '0%',
                  },
                ]}
              />
            </View>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => { abortRef.current = true; }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Phase: Summary */}
        {phase === 'summary' && (
          <View style={styles.summaryContainer}>
            <FlatList
              data={selections}
              keyExtractor={item => `${item.episode.season_number}-${item.episode.episode_number}`}
              renderItem={renderEpisodeRow}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />

            {/* Footer */}
            <View style={styles.summaryFooter}>
              {totalReadySize > 0 && (
                <Text style={styles.totalSize}>
                  Est. total: ~{formatBytes(totalReadySize)}
                </Text>
              )}
              <TouchableOpacity
                style={[
                  styles.downloadButton,
                  readyCount === 0 && styles.downloadButtonDisabled,
                ]}
                onPress={startBatchDownload}
                disabled={readyCount === 0}
                activeOpacity={0.8}
              >
                <MaterialIcons name="download" size={18} color={colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.downloadButtonText}>
                  Download {readyCount} Episode{readyCount !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Phase: Downloading */}
        {phase === 'downloading' && (
          <View style={styles.fetchingContainer}>
            {downloadResult ? (
              <>
                <MaterialIcons name="check-circle" size={48} color={colors.success} style={{ marginBottom: 16 }} />
                <Text style={styles.fetchingTitle}>Done!</Text>
                <Text style={styles.fetchingProgress}>
                  {downloadResult.queued} queued{downloadResult.failed > 0 ? `, ${downloadResult.failed} failed` : ''}
                </Text>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 20 }} />
                <Text style={styles.fetchingTitle}>Queuing Downloads...</Text>
                <Text style={styles.fetchingProgress}>
                  {downloadProgress.current} / {downloadProgress.total}
                </Text>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: downloadProgress.total > 0
                          ? `${(downloadProgress.current / downloadProgress.total) * 100}%`
                          : '0%',
                      },
                    ]}
                  />
                </View>
              </>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
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

  // Filter prompt / Season select
  promptContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  promptTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.highEmphasis,
    textAlign: 'center',
  },
  promptSubtitle: {
    fontSize: 14,
    color: colors.mediumEmphasis,
    textAlign: 'center',
    marginBottom: 8,
  },
  optionButton: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
  },
  optionButtonPrimary: {
    backgroundColor: colors.primary,
  },
  optionButtonSecondary: {
    backgroundColor: colors.elevation2,
  },
  optionButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  optionButtonCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 3,
  },

  // Fetching / Downloading
  fetchingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  fetchingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.highEmphasis,
    marginBottom: 8,
  },
  fetchingProgress: {
    fontSize: 15,
    color: colors.mediumEmphasis,
    marginBottom: 4,
  },
  fetchingEpisode: {
    fontSize: 13,
    color: colors.mediumEmphasis,
    marginBottom: 16,
    maxWidth: 280,
    textAlign: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.elevation2,
    marginTop: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.elevation2,
  },
  cancelButtonText: {
    color: colors.highEmphasis,
    fontWeight: '600',
    fontSize: 14,
  },

  // Summary
  summaryContainer: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  episodeRow: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
  },
  episodeRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  episodeInfo: {
    flex: 1,
  },
  episodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.highEmphasis,
    marginBottom: 4,
  },
  streamSummary: {
    gap: 4,
  },
  streamProviderText: {
    fontSize: 12,
    color: colors.mediumEmphasis,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeNeutral: {
    backgroundColor: colors.elevation2,
  },
  badgeWarning: {
    backgroundColor: colors.warning,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
    letterSpacing: 0.2,
  },
  statusText: {
    fontSize: 12,
    color: colors.mediumEmphasis,
    marginTop: 2,
  },
  statusGreen: {
    color: colors.success,
  },
  statusRed: {
    color: colors.error,
  },
  pickerContainer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.elevation2,
  },

  // Footer
  summaryFooter: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.elevation2,
    gap: 8,
  },
  totalSize: {
    fontSize: 13,
    color: colors.mediumEmphasis,
    textAlign: 'center',
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
});

export default BatchSeasonDownloadModal;
