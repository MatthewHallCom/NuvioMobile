import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Stream } from '../../types/metadata';
import { getStreamSizeInBytes } from '../../screens/streams/utils';
import { parseCodecFromTitle, getCodecSupport, getCodecDisplayName } from '../../services/codecService';

interface EpisodeStreamPickerProps {
  streams: Stream[];
  selectedStream: Stream | null;
  onSelectStream: (stream: Stream) => void;
  theme: any;
  fullHeight?: boolean;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const EpisodeStreamPicker: React.FC<EpisodeStreamPickerProps> = ({
  streams,
  selectedStream,
  onSelectStream,
  theme,
  fullHeight = false,
}) => {
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

  if (streams.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.colors.mediumEmphasis }]}>
          No streams available
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, fullHeight && { maxHeight: undefined, flex: 1 }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
    >
      {streams.map((stream, index) => {
        const isSelected = selectedStream === stream ||
          (selectedStream?.url != null && selectedStream.url === stream.url);

        const providerLabel = stream.addonName || 'Unknown Provider';
        const streamName = stream.name || '';
        const streamTitle = stream.title || '';
        const filename = (stream.behaviorHints as any)?.filename;
        // Combine name + title for full description, dedup if they're the same
        const descriptionParts = [streamName, streamTitle].filter(Boolean);
        const description = streamName && streamTitle && streamName !== streamTitle
          ? `${streamName}\n${streamTitle}`
          : descriptionParts[0] || '';

        // Quality
        const qualityMatch = (streamTitle || streamName).match(/(\d{3,4})p/);
        const quality = qualityMatch ? qualityMatch[1] + 'p' : null;

        // Size
        const sizeBytes = getStreamSizeInBytes(stream);
        const sizeDisplay = sizeBytes > 0 ? formatBytes(sizeBytes) : null;

        // Codec
        const codec = parseCodecFromTitle(streamTitle, streamName, filename);
        const codecSupport = codec ? getCodecSupport(codec) : 'yes';
        const codecName = codec ? getCodecDisplayName(codec) : null;

        const codecBadgeColor =
          codecSupport === 'no'
            ? theme.colors.error || '#FF3B30'
            : codecSupport === 'partial'
            ? theme.colors.warning || '#FF9500'
            : theme.colors.elevation2;

        return (
          <TouchableOpacity
            key={`${stream.url ?? stream.infoHash ?? index}`}
            style={[
              styles.streamRow,
              isSelected && { backgroundColor: theme.colors.primary + '22', borderColor: theme.colors.primary },
            ]}
            onPress={() => onSelectStream(stream)}
            activeOpacity={0.7}
          >
            {/* Selection indicator */}
            <View style={[
              styles.radioOuter,
              isSelected && { borderColor: theme.colors.primary },
            ]}>
              {isSelected && (
                <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} />
              )}
            </View>

            {/* Stream info */}
            <View style={styles.streamInfo}>
              <Text
                style={[styles.providerName, { color: theme.colors.primary || theme.colors.highEmphasis }]}
                numberOfLines={1}
              >
                {providerLabel}
              </Text>

              {description ? (
                <Text
                  style={[styles.streamTitle, { color: theme.colors.highEmphasis }]}
                  numberOfLines={3}
                >
                  {description}
                </Text>
              ) : null}

              <View style={styles.badgeRow}>
                {quality && (
                  <View style={[styles.badge, { backgroundColor: theme.colors.elevation2 }]}>
                    <Text style={[styles.badgeText, { color: theme.colors.highEmphasis }]}>
                      {quality}
                    </Text>
                  </View>
                )}

                {sizeDisplay && (
                  <View style={[styles.badge, { backgroundColor: theme.colors.elevation2 }]}>
                    <Text style={[styles.badgeText, { color: theme.colors.mediumEmphasis }]}>
                      {sizeDisplay}
                    </Text>
                  </View>
                )}

                {codecName && (
                  <View style={[styles.badge, { backgroundColor: codecBadgeColor }]}>
                    <Text style={[styles.badgeText, { color: theme.colors.white }]}>
                      {codecName}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    maxHeight: 220,
  },
  contentContainer: {
    gap: 6,
  },
  emptyContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  streamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.elevation2,
    backgroundColor: colors.card,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.mediumEmphasis,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  streamInfo: {
    flex: 1,
    gap: 4,
  },
  providerName: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  streamTitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
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
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default EpisodeStreamPicker;
