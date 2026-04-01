import type { DownloadItem } from '../contexts/DownloadsContext';
import { PLACEHOLDER_IMAGE } from './offlineImageService';

export interface GroupedShow {
  contentId: string;
  title: string;
  year?: number;
  description?: string;
  genres?: string[];
  runtime?: number;
  rating?: number;
  posterUrl?: string | null;
  bannerUrl?: string;
  localPosterPath?: string;
  localBannerPath?: string;
  seasons: { [seasonNum: number]: DownloadItem[] };
}

export function groupDownloadsByShow(
  downloads: DownloadItem[]
): Record<string, GroupedShow> {
  const result: Record<string, GroupedShow> = {};

  const seriesDownloads = downloads.filter(
    d => d.type === 'series' && d.status === 'completed'
  );

  for (const item of seriesDownloads) {
    if (!result[item.contentId]) {
      result[item.contentId] = {
        contentId: item.contentId,
        title: item.title,
        year: item.year,
        description: item.description,
        genres: item.genres,
        runtime: item.runtime,
        rating: item.rating,
        posterUrl: item.posterUrl,
        bannerUrl: item.bannerUrl,
        localPosterPath: item.localPosterPath,
        localBannerPath: item.localBannerPath,
        seasons: {},
      };
    }

    const group = result[item.contentId];
    // Update metadata from latest item if richer
    if (item.description && !group.description) group.description = item.description;
    if (item.genres?.length && !group.genres?.length) group.genres = item.genres;
    if (item.rating && !group.rating) group.rating = item.rating;
    if (item.localPosterPath && !group.localPosterPath) group.localPosterPath = item.localPosterPath;
    if (item.localBannerPath && !group.localBannerPath) group.localBannerPath = item.localBannerPath;

    const season = item.season ?? 1;
    if (!group.seasons[season]) {
      group.seasons[season] = [];
    }
    group.seasons[season].push(item);
  }

  // Sort episodes within each season
  for (const group of Object.values(result)) {
    for (const season of Object.keys(group.seasons)) {
      group.seasons[Number(season)].sort(
        (a, b) => (a.episode ?? 0) - (b.episode ?? 0)
      );
    }
  }

  return result;
}

export function getMovieDownloads(downloads: DownloadItem[]): DownloadItem[] {
  return downloads.filter(d => d.type === 'movie' && d.status === 'completed');
}

export function getOfflineImageUri(
  item: { localPosterPath?: string; localBannerPath?: string; posterUrl?: string | null; bannerUrl?: string },
  type: 'poster' | 'banner'
): string {
  if (type === 'poster') {
    return item.localPosterPath || item.posterUrl || PLACEHOLDER_IMAGE;
  }
  return item.localBannerPath || item.bannerUrl || PLACEHOLDER_IMAGE;
}
