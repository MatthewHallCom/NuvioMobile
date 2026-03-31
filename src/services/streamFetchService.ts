import { stremioService } from './stremioService';
import { tmdbService } from './tmdbService';
import { Stream } from '../types/metadata';
import { GroupedStreams } from '../types/streams';

const API_TIMEOUT = 10000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    ),
  ]);
}

/**
 * Resolve the Stremio episode ID from show-level id + season/episode numbers.
 *
 * Decision tree mirrors loadEpisodeStreams in useMetadata.ts (lines 1894-2045).
 */
async function resolveStremioEpisodeId(opts: {
  showId: string;
  season: number;
  episode: number;
  type: string;
  imdbId?: string;
  metadata?: { imdb_id?: string };
}): Promise<{ stremioEpisodeId: string; contentType: string }> {
  const { showId, season, episode, type, imdbId, metadata } = opts;
  const seasonNum = String(season);
  const episodeNum = String(episode);

  // Only check collection status for non-series content.
  // isCollectionContent can false-positive on IMDb IDs (tt...) because collection
  // addons often share the same idPrefix. For TV series batch downloads we always
  // want the series episode format (showId:season:episode).
  const isCollection = type !== 'series' && stremioService.isCollectionContent(showId).isCollection;
  const contentType = isCollection ? 'movie' : 'series';

  let stremioEpisodeId: string;

  if (isCollection) {
    // For collections individual episodes are movies — caller passes episodeId directly as showId
    stremioEpisodeId = showId;
  } else if (showId.startsWith('tmdb:')) {
    const tmdbId = showId.split(':')[1];
    if (metadata?.imdb_id) {
      stremioEpisodeId = `${metadata.imdb_id}:${seasonNum}:${episodeNum}`;
    } else if (imdbId) {
      stremioEpisodeId = `${imdbId}:${seasonNum}:${episodeNum}`;
    } else {
      try {
        const externalIds = await withTimeout(
          tmdbService.getShowExternalIds(parseInt(tmdbId)),
          API_TIMEOUT
        );
        if (externalIds?.imdb_id) {
          stremioEpisodeId = `${externalIds.imdb_id}:${seasonNum}:${episodeNum}`;
        } else {
          stremioEpisodeId = `${showId}:${seasonNum}:${episodeNum}`;
        }
      } catch {
        stremioEpisodeId = `${showId}:${seasonNum}:${episodeNum}`;
      }
    }
  } else if (showId.startsWith('tt')) {
    // Already an IMDb ID
    stremioEpisodeId = `${showId}:${seasonNum}:${episodeNum}`;
  } else {
    // Other namespace (kitsu, tvdb, mal, etc.)
    // Most addons only support IMDb (tt) prefix, so prefer imdbId when available
    if (metadata?.imdb_id) {
      stremioEpisodeId = `${metadata.imdb_id}:${seasonNum}:${episodeNum}`;
    } else if (imdbId) {
      stremioEpisodeId = `${imdbId}:${seasonNum}:${episodeNum}`;
    } else {
      // Fallback: use the raw ID — may not match any addon
      stremioEpisodeId = `${showId}:${seasonNum}:${episodeNum}`;
    }
  }

  return { stremioEpisodeId, contentType };
}

export interface FetchStreamsResult {
  streams: Stream[];
  grouped: GroupedStreams;
}

/**
 * Standalone stream fetcher for a single episode. No React dependencies.
 * Used by the batch-season download flow.
 */
export async function fetchStreamsForEpisode(opts: {
  showId: string;
  season: number;
  episode: number;
  type: string;
  imdbId?: string;
  metadata?: { imdb_id?: string };
}): Promise<FetchStreamsResult> {
  const { showId, season, episode, type, imdbId, metadata } = opts;

  const { stremioEpisodeId, contentType } = await resolveStremioEpisodeId({
    showId,
    season,
    episode,
    type,
    imdbId,
    metadata,
  });

  const grouped: GroupedStreams = {};
  const allStreams: Stream[] = [];

  await new Promise<void>((resolve) => {
    let settled = false;
    let callbackCount = 0;
    let dispatched = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        clearTimeout(safetyTimer);
        resolve();
      }
    };

    // Safety timeout — absolute maximum wait
    const safetyTimer = setTimeout(finish, 30000);

    stremioService
      .getStreams(contentType, stremioEpisodeId, (streams, addonId, addonName, error) => {
        callbackCount++;
        console.log(`[streamFetchService] Callback #${callbackCount} for ${stremioEpisodeId}: ${streams?.length ?? 0} streams, error=${!!error}`);

        if (!error && streams && addonId && addonName) {
          const key = addonId;
          if (!grouped[key]) {
            grouped[key] = { addonName, streams: [] };
          }
          grouped[key].streams.push(...streams);
          allStreams.push(...streams);
        }

        // Each callback means one addon responded. Resolve shortly after.
        setTimeout(finish, 500);
      })
      .then(() => {
        dispatched = true;
        console.log(`[streamFetchService] getStreams dispatched for ${stremioEpisodeId}, callbackCount=${callbackCount}`);
        // If callbacks already fired (fast response), resolve soon
        if (callbackCount > 0) {
          setTimeout(finish, 500);
        } else {
          // No callbacks yet — wait up to 15s for the HTTP responses
          setTimeout(finish, 15000);
        }
      })
      .catch(finish);
  });

  return { streams: allStreams, grouped };
}
