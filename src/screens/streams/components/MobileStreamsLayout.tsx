import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView as ExpoBlurView } from 'expo-blur';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp } from '@react-navigation/native';

import AnimatedImage from '../../../components/AnimatedImage';
import ProviderFilter from '../../../components/ProviderFilter';
import PulsingChip from '../../../components/PulsingChip';
import EpisodeHero from './EpisodeHero';
import MovieHero from './MovieHero';
import StreamsList from './StreamsList';
import { Stream, Episode } from '../../../types/metadata';
import { StreamSection, FilterItem, GroupedStreams, LoadingProviders, ScraperLogos } from '../types';

// Lazy-safe community blur import for Android
let AndroidBlurView: any = null;
if (Platform.OS === 'android') {
  try {
    AndroidBlurView = require('@react-native-community/blur').BlurView;
  } catch (_) {
    AndroidBlurView = null;
  }
}

interface MobileStreamsLayoutProps {
  // Navigation
  navigation: NavigationProp<any>;
  
  // Theme
  currentTheme: any;
  colors: any;
  settings: any;
  
  // Type
  type: string;
  
  // Metadata
  metadata: any;
  currentEpisode: any;
  selectedEpisode: string | undefined;
  
  // Movie hero
  movieLogoError: boolean;
  setMovieLogoError: (error: boolean) => void;
  
  // Episode hero
  episodeImage: string | null;
  effectiveEpisodeVote: number;
  effectiveEpisodeRuntime?: number;
  hasIMDbRating: boolean;
  gradientColors: [string, string, string, string, string];
  
  // Backdrop
  mobileBackdropSource: string | null | undefined;
  
  // Streams
  sections: StreamSection[];
  streams: GroupedStreams;
  filterItems: FilterItem[];
  selectedProvider: string;
  handleProviderChange: (provider: string) => void;
  sizeSortMode: 'default' | 'size-asc' | 'size-desc';
  handleSizeSortChange: (mode: 'default' | 'size-asc' | 'size-desc') => void;
  chromecastFilter: boolean;
  handleChromecastFilterChange: (enabled: boolean) => void;
  handleStreamPress: (stream: Stream) => void;
  
  // Loading
  loadingProviders: LoadingProviders;
  loadingStreams: boolean;
  loadingEpisodeStreams: boolean;
  hasStremioStreamProviders: boolean;
  streamsEmpty: boolean;
  showInitialLoading: boolean;
  showStillFetching: boolean;
  showNoSourcesError: boolean;
  
  // Autoplay
  isAutoplayWaiting: boolean;
  autoplayTriggered: boolean;
  
  // Scrapers
  activeFetchingScrapers: string[];
  scraperLogos: ScraperLogos;
  
  // Alert
  openAlert: (title: string, message: string) => void;
  
  // IDs
  id: string;
  imdbId?: string;

}

const MobileStreamsLayout = memo(
  ({
    navigation,
    currentTheme,
    colors,
    settings,
    type,
    metadata,
    currentEpisode,
    selectedEpisode,
    movieLogoError,
    setMovieLogoError,
    episodeImage,
    effectiveEpisodeVote,
    effectiveEpisodeRuntime,
    hasIMDbRating,
    gradientColors,
    mobileBackdropSource,
    sections,
    streams,
    filterItems,
    selectedProvider,
    handleProviderChange,
    sizeSortMode,
    handleSizeSortChange,
    chromecastFilter,
    handleChromecastFilterChange,
    handleStreamPress,
    loadingProviders,
    loadingStreams,
    loadingEpisodeStreams,
    hasStremioStreamProviders,
    streamsEmpty,
    showInitialLoading,
    showStillFetching,
    showNoSourcesError,
    isAutoplayWaiting,
    autoplayTriggered,
    activeFetchingScrapers,
    scraperLogos,
    openAlert,
    id,
    imdbId,
  }: MobileStreamsLayoutProps) => {
    const { t } = useTranslation();
    const styles = React.useMemo(() => createStyles(colors), [colors]);
    const isEpisode = metadata?.videos && metadata.videos.length > 1 && selectedEpisode;

    return (
      <>
        {/* Full Screen Background */}
        {settings.enableStreamsBackdrop ? (
          <View style={StyleSheet.absoluteFill}>
            {mobileBackdropSource ? (
              <AnimatedImage
                source={{ uri: mobileBackdropSource }}
                style={styles.mobileFullScreenBackground}
                contentFit="cover"
              />
            ) : (
              <View style={styles.mobileNoBackdropBackground} />
            )}
            {Platform.OS === 'android' && AndroidBlurView ? (
              <AndroidBlurView
                blurAmount={15}
                blurRadius={25}
                overlayColor="rgba(0,0,0,0.85)"
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <ExpoBlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            {Platform.OS === 'ios' && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.8)' }]} />
            )}
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.darkBackground }]} />
        )}

        {/* Movie Hero */}
        {type === 'movie' && metadata && (
          <MovieHero
            metadata={metadata}
            movieLogoError={movieLogoError}
            setMovieLogoError={setMovieLogoError}
            colors={colors}
            enableStreamsBackdrop={settings.enableStreamsBackdrop}
          />
        )}

        {/* Episode Hero */}
        {currentEpisode && (
          <EpisodeHero
            episodeImage={episodeImage}
            currentEpisode={currentEpisode}
            effectiveEpisodeVote={effectiveEpisodeVote}
            effectiveEpisodeRuntime={effectiveEpisodeRuntime}
            hasIMDbRating={hasIMDbRating}
            gradientColors={gradientColors}
            colors={colors}
            enableStreamsBackdrop={settings.enableStreamsBackdrop}
          />
        )}

        {/* Hero blend overlay for episodes */}
        {isEpisode && (
          <View style={styles.heroBlendOverlay}>
            <LinearGradient
              colors={
                settings.enableStreamsBackdrop
                  ? ['rgba(0,0,0,0.98)', 'rgba(0,0,0,0.85)', 'transparent']
                  : [colors.darkBackground, colors.darkBackground, 'transparent']
              }
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}

        {/* Main Content */}
        <View
          style={[
            styles.streamsMainContent,
            type === 'movie' && styles.streamsMainContentMovie,
            !settings.enableStreamsBackdrop && { backgroundColor: colors.darkBackground },
          ]}
        >
          {/* Provider Filter + Sort */}
          <View style={styles.filterContainer}>
            {!streamsEmpty && (
              <>
                <View style={styles.filterRow}>
                  <View style={styles.filterScrollWrapper}>
                    <ProviderFilter
                      selectedProvider={selectedProvider}
                      providers={filterItems}
                      onSelect={handleProviderChange}
                      theme={currentTheme}
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.sortButton,
                      sizeSortMode !== 'default' && styles.sortButtonActive,
                    ]}
                    onPress={() => {
                      const next = sizeSortMode === 'default' ? 'size-asc' : sizeSortMode === 'size-asc' ? 'size-desc' : 'default';
                      handleSizeSortChange(next);
                    }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={sizeSortMode === 'size-asc' ? 'arrow-upward' : sizeSortMode === 'size-desc' ? 'arrow-downward' : 'swap-vert'}
                      size={18}
                      color={sizeSortMode !== 'default' ? colors.white : colors.highEmphasis}
                    />
                    {sizeSortMode !== 'default' && (
                      <Text style={styles.sortButtonText}>
                        {sizeSortMode === 'size-asc' ? 'Size ↑' : 'Size ↓'}
                      </Text>
                    )}
                  </TouchableOpacity>
                  {Platform.OS === 'android' && (
                    <TouchableOpacity
                      style={[
                        styles.sortButton,
                        chromecastFilter && styles.sortButtonActive,
                      ]}
                      onPress={() => handleChromecastFilterChange(!chromecastFilter)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons
                        name={chromecastFilter ? 'cast-connected' : 'cast'}
                        size={18}
                        color={chromecastFilter ? colors.white : colors.highEmphasis}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>

          {/* Active Scrapers Status */}
          {activeFetchingScrapers.length > 0 && (
            <View style={styles.activeScrapersContainer}>
              <Text style={styles.activeScrapersTitle}>{t('streams.fetching_from')}</Text>
              <View style={styles.activeScrapersRow}>
                {activeFetchingScrapers.map((scraperName, index) => (
                  <PulsingChip key={scraperName} text={scraperName} delay={index * 200} />
                ))}
              </View>
            </View>
          )}

          {/* Content */}
          {showNoSourcesError ? (
            <View style={styles.noStreams}>
              <MaterialIcons name="error-outline" size={48} color={colors.textMuted} />
              <Text style={styles.noStreamsText}>{t('streams.no_sources_available')}</Text>
              <Text style={styles.noStreamsSubText}>{t('streams.add_sources_desc')}</Text>
              <TouchableOpacity
                style={styles.addSourcesButton}
                onPress={() => navigation.navigate('Addons' as never)}
              >
                <Text style={styles.addSourcesButtonText}>{t('streams.add_sources')}</Text>
              </TouchableOpacity>
            </View>
          ) : streamsEmpty ? (
            showInitialLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>
                  {isAutoplayWaiting ? t('streams.finding_best_stream') : t('streams.finding_streams')}
                </Text>
              </View>
            ) : showStillFetching ? (
              <View style={styles.loadingContainer}>
                <MaterialIcons name="hourglass-bottom" size={32} color={colors.primary} />
                <Text style={styles.loadingText}>{t('streams.still_fetching')}</Text>
              </View>
            ) : (
              <View style={styles.noStreams}>
                <MaterialIcons name="error-outline" size={48} color={colors.textMuted} />
                <Text style={styles.noStreamsText}>{t('streams.no_streams_available')}</Text>
              </View>
            )
          ) : (
            <StreamsList
              sections={sections}
              streams={streams}
              loadingProviders={loadingProviders}
              loadingStreams={loadingStreams}
              loadingEpisodeStreams={loadingEpisodeStreams}
              hasStremioStreamProviders={hasStremioStreamProviders}
              isAutoplayWaiting={isAutoplayWaiting}
              autoplayTriggered={autoplayTriggered}
              handleStreamPress={handleStreamPress}
              openAlert={openAlert}
              settings={settings}
              currentTheme={currentTheme}
              colors={colors}
              scraperLogos={scraperLogos}
              metadata={metadata}
              type={type}
              currentEpisode={currentEpisode}
              episodeImage={episodeImage}
              id={id}
              imdbId={imdbId}
            />
          )}
        </View>

      </>
    );
  }
);

const createStyles = (colors: any) =>
  StyleSheet.create({
    mobileFullScreenBackground: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      height: '100%',
    },
    mobileNoBackdropBackground: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.darkBackground,
    },
    heroBlendOverlay: {
      position: 'absolute',
      top: 140,
      left: 0,
      right: 0,
      height: Platform.OS === 'android' ? 95 : 180,
      zIndex: 0,
      pointerEvents: 'none',
    },
    streamsMainContent: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingTop: 12,
      zIndex: 1,
      ...(Platform.OS === 'ios' && {
        opacity: 1,
        shouldRasterizeIOS: false,
      }),
    },
    streamsMainContentMovie: {
      paddingTop: Platform.OS === 'android' ? 10 : 15,
    },
    filterContainer: {
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    filterRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
    filterScrollWrapper: {
      flex: 1,
    },
    sortButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.elevation2,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 16,
      marginLeft: 6,
    },
    sortButtonActive: {
      backgroundColor: colors.primary,
    },
    sortButtonText: {
      color: colors.white,
      fontSize: 12,
      fontWeight: '600' as const,
      marginLeft: 3,
    },
    activeScrapersContainer: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: 'transparent',
      marginHorizontal: 16,
      marginBottom: 4,
    },
    activeScrapersTitle: {
      color: colors.mediumEmphasis,
      fontSize: 12,
      fontWeight: '500',
      marginBottom: 6,
      opacity: 0.8,
    },
    activeScrapersRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
    },
    noStreams: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    noStreamsText: {
      color: colors.textMuted,
      fontSize: 16,
      marginTop: 16,
    },
    noStreamsSubText: {
      color: colors.mediumEmphasis,
      fontSize: 14,
      marginTop: 8,
      textAlign: 'center',
    },
    addSourcesButton: {
      marginTop: 24,
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.primary,
      borderRadius: 8,
    },
    addSourcesButtonText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '600',
    },
    loadingContainer: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    loadingText: {
      color: colors.primary,
      fontSize: 12,
      marginLeft: 4,
      fontWeight: '500',
    },
  });

MobileStreamsLayout.displayName = 'MobileStreamsLayout';

export default MobileStreamsLayout;
