import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import {
  completeHandler,
  createDownloadTask,
  directories,
  getExistingDownloadTasks,
} from '@kesha-antonov/react-native-background-downloader';
import { mmkvStorage } from '../services/mmkvStorage';
import { notificationService } from '../services/notificationService';
import { startOrUpdateDownloadLiveActivity, stopDownloadLiveActivity } from '../services/liveActivityService';
import { offlineImageService } from '../services/offlineImageService';
import { useNetwork } from './NetworkContext';
import { useSettings } from '../hooks/useSettings';

export type DownloadStatus = 'downloading' | 'completed' | 'paused' | 'error' | 'queued';

export interface DownloadItem {
  id: string; // unique id for this download (content id + episode if any)
  contentId: string; // base id (e.g., tt0903747 for series, tt0499549 for movies)
  type: 'movie' | 'series';
  title: string; // movie title or show name
  year?: number;
  providerName?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  quality?: string;
  size?: number; // total bytes if known
  downloadedBytes: number;
  totalBytes: number;
  progress: number; // 0-100
  status: DownloadStatus;
  speedBps?: number;
  etaSeconds?: number;
  posterUrl?: string | null;
  sourceUrl: string; // stream url
  headers?: Record<string, string>;
  fileUri?: string; // local file uri once downloading/finished
  relativeFilePath?: string; // stable path under the app documents dir (survives sandbox path changes)
  createdAt: number;
  updatedAt: number;
  // Additional metadata for progress tracking
  imdbId?: string; // IMDb ID for better tracking
  tmdbId?: number; // TMDB ID if available
  // CRITICAL: Resume data for proper pause/resume across sessions
  resumeData?: string; // The string which allows the API to resume a paused download
  // Offline metadata
  description?: string;
  genres?: string[];
  runtime?: number;        // minutes
  rating?: number;         // e.g. IMDb rating
  bannerUrl?: string;      // remote banner URL
  logoUrl?: string;        // remote logo URL
  totalSeasons?: number;   // for series: total season count
  totalEpisodes?: number;  // for series: total episode count in this season
  // Local image paths (populated after caching)
  localPosterPath?: string;   // file:// URI to cached poster
  localBannerPath?: string;   // file:// URI to cached banner
  // Network-pause tracking
  autoPausedByNetwork?: boolean;
}

type StartDownloadInput = {
  id: string; // Base content ID (e.g., tt0903747)
  type: 'movie' | 'series';
  title: string;
  year?: number;
  providerName?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  quality?: string;
  posterUrl?: string | null;
  url: string;
  headers?: Record<string, string>;
  // Additional metadata for progress tracking
  imdbId?: string;
  tmdbId?: number;
  description?: string;
  genres?: string[];
  runtime?: number;
  rating?: number;
  bannerUrl?: string;
  logoUrl?: string;
};

type DownloadsContextValue = {
  downloads: DownloadItem[];
  startDownload: (input: StartDownloadInput) => Promise<void>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  isDownloadingUrl: (url: string) => boolean;
};

const DownloadsContext = createContext<DownloadsContextValue | undefined>(undefined);

const STORAGE_KEY = 'downloads_state_v1';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9\-_.()\s]/gi, '_').slice(0, 120).trim();
}

function parseContentDispositionFilename(contentDisposition?: string | null): string | null {
  if (!contentDisposition) return null;
  // RFC 5987 filename*=
  const filenameStar = contentDisposition.match(/filename\*=([^;]+)/i);
  if (filenameStar && filenameStar[1]) {
    const value = filenameStar[1].trim();
    const parts = value.split("''");
    const encoded = parts.length > 1 ? parts.slice(1).join("''") : parts[0];
    try {
      return decodeURIComponent(encoded.replace(/(^"|"$)/g, ''));
    } catch {
      return encoded.replace(/(^"|"$)/g, '');
    }
  }

  const filename = contentDisposition.match(/filename=([^;]+)/i);
  if (filename && filename[1]) {
    return filename[1].trim().replace(/(^"|"$)/g, '');
  }
  return null;
}

function getFilenameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    if (!last) return null;
    return decodeURIComponent(last.split('?')[0]);
  } catch {
    return null;
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatSeasonEpisode(season?: number, episode?: number): string | null {
  if (typeof season !== 'number' || typeof episode !== 'number') return null;
  return `S${season}E${episode}`;
}

function formatMovieTitleWithYear(title: string, year?: number): string {
  if (!year || !Number.isFinite(year)) return title;
  if (/\(\d{4}\)\s*$/.test(title)) return title;
  return `${title} (${year})`;
}

function getLiveActivityText(d: DownloadItem): { title: string; subtitle: string } {
  const title = d.type === 'movie' ? formatMovieTitleWithYear(d.title, d.year) : d.title;
  const parts: string[] = [];

  if (d.type === 'series') {
    const se = formatSeasonEpisode(d.season, d.episode);
    if (se) parts.push(se);
    if (d.episodeTitle) parts.push(String(d.episodeTitle));
  }

  parts.push(`${d.progress}%`);
  return { title, subtitle: parts.join(' • ') };
}

async function getContentLength(url: string, headers?: Record<string, string>): Promise<number | null> {
  if (!isHttpUrl(url)) return null;
  try {
    const response = await fetch(url, { method: 'HEAD', headers });
    const raw = response.headers.get('content-length');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function extensionFromContentType(contentType?: string | null): string | null {
  if (!contentType) return null;
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/x-matroska': '.mkv',
    'video/webm': '.webm',
    'video/x-msvideo': '.avi',
    'video/quicktime': '.mov',
    'video/x-flv': '.flv',
    'video/mpeg': '.mpg',
    'video/ogg': '.ogv',
    'video/3gpp': '.3gp',
    'video/mp2t': '.ts',
    'application/octet-stream': null, // generic, can't infer
  };
  return map[mime] ?? null;
}

function hasVideoExtension(filename: string): boolean {
  return /\.(mp4|mkv|webm|avi|mov|flv|mpg|mpeg|ogv|3gp|ts)$/i.test(filename);
}

async function getDownloadFilename(url: string, headers?: Record<string, string>): Promise<string | null> {
  if (!isHttpUrl(url)) return null;
  try {
    const response = await fetch(url, { method: 'HEAD', headers });
    const contentType = response.headers.get('content-type');

    const filenameFromHeaders =
      parseContentDispositionFilename(response.headers.get('content-disposition')) ||
      response.headers.get('x-filename') ||
      response.headers.get('x-download-filename') ||
      response.headers.get('x-suggested-filename');

    let filename = filenameFromHeaders ? String(filenameFromHeaders) : null;

    if (!filename) {
      // Fall back to URL path segment.
      filename = getFilenameFromUrl(url);
    }

    if (filename) {
      const sanitized = sanitizeFilename(filename);
      // If the filename has no video extension, try to infer one from content-type
      if (!hasVideoExtension(sanitized)) {
        const ext = extensionFromContentType(contentType);
        if (ext) return sanitized + ext;
        // Default to .mp4 for video content without a recognized extension
        return sanitized + '.mp4';
      }
      return sanitized;
    }
  } catch (error) {
    console.warn('[DownloadsContext] Could not resolve filename from HEAD request', error);
  }

  return null;
}

function isDownloadableUrl(url: string): boolean {
  if (!url) return false;

  const lower = url.toLowerCase();

  // Check for streaming formats that should NOT be downloadable (only m3u8 and DASH)
  const streamingFormats = [
    '.m3u8',           // HLS streaming
    '.mpd',            // DASH streaming
    'm3u8',            // HLS without extension
    'mpd',             // DASH without extension
  ];

  // Check if URL contains streaming format indicators
  const isStreamingFormat = streamingFormats.some(format =>
    lower.includes(format) ||
    lower.includes(`ext=${format}`) ||
    lower.includes(`format=${format}`) ||
    lower.includes(`container=${format}`)
  );

  // Return true if it's NOT a streaming format (m3u8 or DASH)
  return !isStreamingFormat;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  // Convert to unsigned and hex
  return (hash >>> 0).toString(16);
}

function stripFileScheme(pathOrUri: string): string {
  return pathOrUri.startsWith('file://') ? pathOrUri.replace('file://', '') : pathOrUri;
}

function toFileUri(pathOrUri: string): string {
  if (!pathOrUri) return pathOrUri;
  if (pathOrUri.startsWith('file://')) return pathOrUri;
  if (pathOrUri.startsWith('/')) return `file://${pathOrUri}`;
  return pathOrUri;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

const ANDROID_DEFAULT_DIR = '/storage/emulated/0/Movies/Nuvio';

let _customStoragePath = '';

function setCustomStoragePath(path: string) {
  _customStoragePath = path;
}

function getDocumentsDirPath(): string {
  if (Platform.OS === 'android') {
    if (_customStoragePath) {
      return `${_customStoragePath}/Movies/Nuvio`;
    }
    return ANDROID_DEFAULT_DIR;
  }
  return stripFileScheme(String((directories as any).documents || (FileSystem as any).documentDirectory || ''));
}

async function hasExternalStoragePermission(): Promise<boolean> {
  try {
    return await NativeModules.StorageModule.isExternalStorageManager();
  } catch {
    return false;
  }
}

async function ensureAndroidStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = typeof Platform.Version === 'number'
    ? Platform.Version
    : parseInt(String(Platform.Version), 10);

  // Android 10 and below: request WRITE_EXTERNAL_STORAGE at runtime
  if (apiLevel < 30) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      {
        title: 'Storage Permission',
        message: 'Nuvio needs storage access to download movies to your device.',
        buttonPositive: 'Allow',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  // Android 11+: check if we already have access
  if (await hasExternalStoragePermission()) return true;

  // Request MANAGE_EXTERNAL_STORAGE via the system "All files access" screen
  const userWantsToGrant = await new Promise<boolean>(resolve => {
    Alert.alert(
      'Storage Permission Required',
      'Nuvio needs "All files access" to save downloads to your Movies folder. You\'ll be taken to the permission screen.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Grant Access', onPress: () => resolve(true) },
      ]
    );
  });

  if (!userWantsToGrant) return false;

  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
      { data: 'package:com.nuvio.app' }
    );
  } catch {
    // Fallback for devices that don't support the app-specific intent
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION'
      );
    } catch {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        { data: 'package:com.nuvio.app' }
      );
    }
  }

  // After returning from settings, check if permission was granted
  return hasExternalStoragePermission();
}

function getRelativeDownloadPath(pathOrUri?: string | null): string | undefined {
  if (!pathOrUri) return undefined;

  const withoutScheme = stripFileScheme(String(pathOrUri)).replace(/\\/g, '/').trim();
  if (!withoutScheme) return undefined;

  const relativeCandidate = normalizeRelativePath(withoutScheme);
  if (!withoutScheme.startsWith('/') && relativeCandidate.startsWith('downloads/')) {
    return relativeCandidate;
  }

  const downloadsMatch = withoutScheme.match(/(?:^|\/)(downloads\/.+)$/);
  if (downloadsMatch?.[1]) {
    return normalizeRelativePath(downloadsMatch[1]);
  }

  const documentsDir = getDocumentsDirPath().replace(/\\/g, '/').replace(/\/+$/, '');
  if (documentsDir && withoutScheme.startsWith(`${documentsDir}/`)) {
    return normalizeRelativePath(withoutScheme.slice(documentsDir.length + 1));
  }

  if (!withoutScheme.startsWith('/') && !withoutScheme.includes('://')) {
    return relativeCandidate;
  }

  return undefined;
}

function resolveDownloadFileUri(relativeFilePath?: string | null, fileUri?: string | null): string | undefined {
  const relativePath = getRelativeDownloadPath(relativeFilePath) || getRelativeDownloadPath(fileUri);
  if (relativePath) {
    const documentsDir = getDocumentsDirPath();
    if (documentsDir) {
      return toFileUri(`${documentsDir}/${relativePath}`);
    }
  }

  if (fileUri) return toFileUri(String(fileUri));
  return undefined;
}

export const DownloadsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const downloadsRef = useRef(downloads);
  const { isConnected, isWiFi } = useNetwork();
  const { settings } = useSettings();
  const isWiFiRef = useRef(isWiFi);
  const isConnectedRef = useRef(isConnected);
  const wifiOnlyRef = useRef(settings.wifiOnlyDownloads);
  useEffect(() => { isWiFiRef.current = isWiFi; }, [isWiFi]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
  useEffect(() => { wifiOnlyRef.current = settings.wifiOnlyDownloads; }, [settings.wifiOnlyDownloads]);
  useEffect(() => { setCustomStoragePath(settings.downloadStoragePath || ''); }, [settings.downloadStoragePath]);
  useEffect(() => {
    downloadsRef.current = downloads;
  }, [downloads]);
  // Keep active native background tasks in memory (not persisted)
  const tasksRef = useRef<Map<string, any>>(new Map());
  const lastBytesRef = useRef<Map<string, { bytes: number; time: number }>>(new Map());
  const processQueueRef = useRef<(() => void) | null>(null);

  // Persist and restore
  useEffect(() => {
    (async () => {
      try {
        const raw = await mmkvStorage.getItem(STORAGE_KEY);
        if (raw) {
          const list = JSON.parse(raw) as Array<Partial<DownloadItem>>;
          // With native background downloader we can re-attach after restart.
          const restored: DownloadItem[] = list.map((d) => {
            const status = (d.status as DownloadStatus) || 'queued';
            const safe: DownloadItem = {
              id: String(d.id),
              contentId: String(d.contentId ?? d.id),
              type: (d.type as 'movie' | 'series') ?? 'movie',
              title: String(d.title ?? 'Content'),
              providerName: d.providerName,
              season: typeof d.season === 'number' ? d.season : undefined,
              episode: typeof d.episode === 'number' ? d.episode : undefined,
              episodeTitle: d.episodeTitle ? String(d.episodeTitle) : undefined,
              quality: d.quality ? String(d.quality) : undefined,
              size: typeof d.size === 'number' ? d.size : undefined,
              downloadedBytes: typeof d.downloadedBytes === 'number' ? d.downloadedBytes : 0,
              totalBytes: typeof d.totalBytes === 'number' ? d.totalBytes : 0,
              progress: typeof d.progress === 'number' ? d.progress : 0,
              // If the app was killed while downloading, we'll re-attach; keep it as queued until we see the task.
              status: status === 'downloading' ? 'queued' : status,
              speedBps: undefined,
              etaSeconds: undefined,
              posterUrl: (d.posterUrl as any) ?? null,
              sourceUrl: String(d.sourceUrl ?? ''),
              headers: (d.headers as any) ?? undefined,
              fileUri: resolveDownloadFileUri((d as any).relativeFilePath, d.fileUri),
              relativeFilePath: getRelativeDownloadPath((d as any).relativeFilePath) || getRelativeDownloadPath(d.fileUri),
              createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
              updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
              // Restore metadata for progress tracking
              imdbId: (d as any).imdbId ? String((d as any).imdbId) : undefined,
              tmdbId: typeof (d as any).tmdbId === 'number' ? (d as any).tmdbId : undefined,
              // CRITICAL: Restore resumeData for proper resume across sessions
              resumeData: (d as any).resumeData ? String((d as any).resumeData) : undefined,
            };
            return safe;
          });
          setDownloads(restored);

          // Backfill: cache images for existing completed downloads that lack local paths
          const needsBackfill = restored.filter(
            d => d.status === 'completed' && d.posterUrl && !d.localPosterPath
          );
          if (needsBackfill.length > 0) {
            (async () => {
              for (const item of needsBackfill) {
                const [localPosterPath, localBannerPath] = await Promise.all([
                  offlineImageService.cacheImage(item.posterUrl, item.contentId, 'poster'),
                  offlineImageService.cacheImage(item.bannerUrl, item.contentId, 'banner'),
                ]);
                if (localPosterPath || localBannerPath) {
                  setDownloads(prev => prev.map(d =>
                    d.id === item.id
                      ? { ...d, localPosterPath: localPosterPath || d.localPosterPath, localBannerPath: localBannerPath || d.localBannerPath, updatedAt: Date.now() }
                      : d
                  ));
                }
              }
            })();
          }
        }
      } catch { }
    })();
  }, []);

  // Notifications are configured globally by notificationService

  // Track app state to know foreground/background
  const appStateRef = useRef<string>('active');

  // Cache last notified progress to reduce spam
  const lastNotifyRef = useRef<Map<string, number>>(new Map());

  // iOS-only Live Activities for background download progress
  const liveActivityIdsRef = useRef<Map<string, string>>(new Map());
  const lastLiveProgressRef = useRef<Map<string, number>>(new Map());

  const maybeNotifyProgress = useCallback(async (d: DownloadItem) => {
    try {
      if (appStateRef.current === 'active') return;
      if (d.status !== 'downloading') return;
      const prev = lastNotifyRef.current.get(d.id) ?? -1;
      if (d.progress <= prev || d.progress - prev < 2) return; // notify every 2%
      lastNotifyRef.current.set(d.id, d.progress);
      await notificationService.notifyDownloadProgress(d.title, d.progress, d.downloadedBytes, d.totalBytes);
    } catch { }
  }, []);

  const notifyCompleted = useCallback(async (d: DownloadItem) => {
    try {
      if (appStateRef.current === 'active') return;
      await notificationService.notifyDownloadComplete(d.title);
    } catch { }
  }, []);

  const stopLiveActivityForDownload = useCallback(async (downloadId: string, opts?: { title?: string; subtitle?: string; progressPercent?: number }) => {
    const activityId = liveActivityIdsRef.current.get(downloadId);
    if (!activityId) return;

    liveActivityIdsRef.current.delete(downloadId);
    lastLiveProgressRef.current.delete(downloadId);

    const title = opts?.title || downloadsRef.current.find(d => d.id === downloadId)?.title || 'Download';
    await stopDownloadLiveActivity({
      activityId,
      title,
      subtitle: opts?.subtitle,
      progressPercent: opts?.progressPercent,
    });
  }, []);

  const stopAllLiveActivities = useCallback(async () => {
    const entries = Array.from(liveActivityIdsRef.current.entries());
    liveActivityIdsRef.current.clear();
    lastLiveProgressRef.current.clear();

    await Promise.all(
      entries.map(async ([downloadId, activityId]) => {
        const title = downloadsRef.current.find(d => d.id === downloadId)?.title || 'Download';
        await stopDownloadLiveActivity({ activityId, title });
      })
    );
  }, []);

  const maybeUpdateLiveActivity = useCallback(async (d: DownloadItem) => {
    try {
      if (d.status !== 'downloading') return;

      // Create the Live Activity as soon as possible (even in foreground) so it exists
      // when the user backgrounds / swipes away. Only keep updating progress while backgrounded.
      const existingActivityId = liveActivityIdsRef.current.get(d.id);
      const isBackground = appStateRef.current !== 'active';
      if (!isBackground && existingActivityId) return;

      const prev = lastLiveProgressRef.current.get(d.id) ?? -1;
      if (isBackground && (d.progress <= prev || d.progress - prev < 2)) return; // update every 2%
      lastLiveProgressRef.current.set(d.id, d.progress);

      const { title, subtitle } = getLiveActivityText(d);

      const activityId = await startOrUpdateDownloadLiveActivity({
        activityId: existingActivityId,
        title,
        subtitle,
        progressPercent: d.progress,
        deepLinkUrl: '/downloads',
      });

      if (activityId && activityId !== existingActivityId) {
        liveActivityIdsRef.current.set(d.id, activityId);
      }
    } catch {
      // ignore
    }
  }, []);

  const syncLiveActivitiesForBackground = useCallback(async () => {
    if (appStateRef.current === 'active') return;

    const activeIds = new Set(downloadsRef.current.filter(d => d.status === 'downloading').map(d => d.id));
    await Promise.all(
      downloadsRef.current
        .filter(d => d.status === 'downloading')
        .map(d => maybeUpdateLiveActivity(d))
    );

    // Stop activities for downloads that are no longer downloading.
    const existing = Array.from(liveActivityIdsRef.current.keys());
    await Promise.all(
      existing
        .filter(id => !activeIds.has(id))
        .map(id => stopLiveActivityForDownload(id))
    );
  }, [maybeUpdateLiveActivity, stopLiveActivityForDownload]);

  useEffect(() => {
    mmkvStorage.setItem(STORAGE_KEY, JSON.stringify(downloads)).catch(() => { });
  }, [downloads]);

  const updateDownload = useCallback((id: string, updater: (d: DownloadItem) => DownloadItem) => {
    setDownloads(prev => {
      const next = prev.map(d => (d.id === id ? updater(d) : d));
      downloadsRef.current = next;
      return next;
    });
  }, []);

  const attachDownloadTask = useCallback((task: any) => {
    const taskId = String(task?.id);
    if (!taskId) return;

    task
      .begin(({ expectedBytes }: any) => {
        console.log(`[DownloadsContext] Download began: ${taskId}, expectedBytes: ${expectedBytes}`);
        updateDownload(taskId, (d) => ({
          ...d,
          totalBytes: typeof expectedBytes === 'number' && expectedBytes > 0 ? expectedBytes : d.totalBytes,
          status: 'downloading',
          updatedAt: Date.now(),
        }));

        const current = downloadsRef.current.find(x => x.id === taskId);
        if (current) {
          maybeUpdateLiveActivity({ ...current, status: 'downloading' });
        }
      })
      .progress(({ bytesDownloaded, bytesTotal }: any) => {
        const now = Date.now();
        const last = lastBytesRef.current.get(taskId);
        let speedBps = 0;
        if (last && typeof bytesDownloaded === 'number') {
          const deltaBytes = bytesDownloaded - last.bytes;
          const deltaTime = Math.max(1, now - last.time) / 1000;
          speedBps = deltaBytes / deltaTime;
        }
        if (typeof bytesDownloaded === 'number') {
          lastBytesRef.current.set(taskId, { bytes: bytesDownloaded, time: now });
        }

        updateDownload(taskId, (d) => ({
          ...d,
          downloadedBytes: typeof bytesDownloaded === 'number' ? bytesDownloaded : d.downloadedBytes,
          totalBytes: typeof bytesTotal === 'number' && bytesTotal > 0 ? bytesTotal : d.totalBytes,
          progress:
            typeof bytesDownloaded === 'number' && typeof bytesTotal === 'number' && bytesTotal > 0
              ? Math.floor((bytesDownloaded / bytesTotal) * 100)
              : d.progress,
          speedBps,
          status: 'downloading',
          updatedAt: now,
        }));

        const current = downloadsRef.current.find(x => x.id === taskId);
        if (current && typeof bytesDownloaded === 'number') {
          const totalBytes = typeof bytesTotal === 'number' && bytesTotal > 0 ? bytesTotal : current.totalBytes;
          const progress = totalBytes > 0 ? Math.floor((bytesDownloaded / totalBytes) * 100) : current.progress;
          const next = { ...current, downloadedBytes: bytesDownloaded, totalBytes, progress };
          maybeNotifyProgress(next);
          maybeUpdateLiveActivity({ ...next, status: 'downloading' });
        }
      })
      .done(({ location, bytesDownloaded, bytesTotal }: any) => {
        console.log(`[DownloadsContext] Download completed: ${taskId}, bytes: ${bytesDownloaded}/${bytesTotal}, location: ${location}`);
        const finalPath = location ? String(location) : '';
        const finalUri = finalPath ? toFileUri(finalPath) : undefined;
        const relativeFilePath = getRelativeDownloadPath(finalPath || finalUri);

        updateDownload(taskId, (d) => ({
          ...d,
          status: 'completed',
          downloadedBytes: typeof bytesDownloaded === 'number' ? bytesDownloaded : d.downloadedBytes,
          totalBytes: typeof bytesTotal === 'number' && bytesTotal > 0 ? bytesTotal : d.totalBytes,
          progress: 100,
          updatedAt: Date.now(),
          fileUri: finalUri || d.fileUri,
          relativeFilePath: relativeFilePath || d.relativeFilePath,
          resumeData: undefined,
        }));

        const doneItem = downloadsRef.current.find(x => x.id === taskId);
        if (doneItem) {
          notifyCompleted({ ...doneItem, status: 'completed', progress: 100, fileUri: finalUri || doneItem.fileUri } as DownloadItem);
          stopLiveActivityForDownload(taskId, { title: doneItem.title, subtitle: 'Completed', progressPercent: 100 });
        } else {
          stopLiveActivityForDownload(taskId, { subtitle: 'Completed', progressPercent: 100 });
        }

        try {
          completeHandler(taskId);
        } catch { }

        tasksRef.current.delete(taskId);
        lastBytesRef.current.delete(taskId);

        // Start next queued download
        processQueueRef.current?.();
      })
      .error(({ error }: any) => {
        updateDownload(taskId, (d) => ({
          ...d,
          status: 'error',
          updatedAt: Date.now(),
        }));

        const current = downloadsRef.current.find(x => x.id === taskId);
        stopLiveActivityForDownload(taskId, { title: current?.title, subtitle: 'Error', progressPercent: current?.progress });

        console.log(`[DownloadsContext] Background download error: ${taskId}`, error);

        // Start next queued download
        processQueueRef.current?.();
      });
  }, [maybeNotifyProgress, maybeUpdateLiveActivity, notifyCompleted, stopLiveActivityForDownload, updateDownload]);

  useEffect(() => {
    (async () => {
      try {
        const tasks = await getExistingDownloadTasks();
        for (const task of tasks) {
          const taskId = String((task as any)?.id);
          if (!taskId) continue;
          tasksRef.current.set(taskId, task);
          attachDownloadTask(task);

          const existing = downloadsRef.current.find(d => d.id === taskId);
          if (!existing) {
            const meta = ((task as any)?.metadata || {}) as any;
            const createdAt = Date.now();
            const fallback: DownloadItem = {
              id: taskId,
              contentId: String(meta.contentId ?? taskId),
              type: (meta.type as 'movie' | 'series') ?? 'movie',
              title: String(meta.title ?? 'Content'),
              year: typeof meta.year === 'number' ? meta.year : undefined,
              providerName: meta.providerName,
              season: typeof meta.season === 'number' ? meta.season : undefined,
              episode: typeof meta.episode === 'number' ? meta.episode : undefined,
              episodeTitle: meta.episodeTitle ? String(meta.episodeTitle) : undefined,
              quality: meta.quality ? String(meta.quality) : undefined,
              size: undefined,
              downloadedBytes: 0,
              totalBytes: 0,
              progress: 0,
              status: 'queued',
              speedBps: 0,
              etaSeconds: undefined,
              posterUrl: meta.posterUrl ?? null,
              sourceUrl: String(meta.sourceUrl ?? ''),
              headers: meta.headers,
              fileUri: resolveDownloadFileUri(meta.relativeFilePath, meta.fileUri),
              relativeFilePath: getRelativeDownloadPath(meta.relativeFilePath) || getRelativeDownloadPath(meta.fileUri),
              createdAt,
              updatedAt: createdAt,
              imdbId: meta.imdbId,
              tmdbId: meta.tmdbId,
              resumeData: undefined,
            };

            setDownloads(prev => [fallback, ...prev]);
          }
        }
      } catch (e) {
        console.log('[DownloadsContext] Failed to re-attach background downloads', e);
      }
    })();
  }, [attachDownloadTask]);

  const refreshInProgressRef = useRef(false);
  const refreshAllDownloadsFromDisk = useCallback(async () => {
    if (refreshInProgressRef.current) return;
    refreshInProgressRef.current = true;
    try {
      const list = downloadsRef.current;
      await Promise.all(
        list.map(async (d) => {
          const resolvedFileUri = resolveDownloadFileUri(d.relativeFilePath, d.fileUri);
          if (!resolvedFileUri) return;
          if (d.status === 'completed' || d.status === 'queued') return;

          try {
            const info = await FileSystem.getInfoAsync(resolvedFileUri);
            if (!info.exists || typeof info.size !== 'number') return;

            let totalBytes = d.totalBytes;
            if (!totalBytes || totalBytes <= 0) {
              const len = await getContentLength(d.sourceUrl, d.headers);
              if (len) totalBytes = len;
            }

            const downloadedBytes = Math.max(d.downloadedBytes, info.size);
            const progress = totalBytes && totalBytes > 0 ? Math.floor((downloadedBytes / totalBytes) * 100) : d.progress;

            const looksComplete = totalBytes && totalBytes > 0 ? downloadedBytes >= totalBytes : false;

            updateDownload(d.id, (prev) => ({
              ...prev,
              downloadedBytes,
              totalBytes: totalBytes || prev.totalBytes,
              progress: looksComplete ? 100 : Math.min(99, Math.max(prev.progress, progress)),
              status: looksComplete ? 'completed' : prev.status,
              fileUri: resolvedFileUri,
              relativeFilePath: prev.relativeFilePath || getRelativeDownloadPath(resolvedFileUri),
              resumeData: looksComplete ? undefined : prev.resumeData,
              updatedAt: Date.now(),
            }));

            if (looksComplete) {
              const done = downloadsRef.current.find(x => x.id === d.id);
              if (done) {
                notifyCompleted({ ...done, status: 'completed', progress: 100, fileUri: resolvedFileUri } as DownloadItem);
                stopLiveActivityForDownload(d.id, { title: done.title, subtitle: 'Completed', progressPercent: 100 });
              } else {
                stopLiveActivityForDownload(d.id, { subtitle: 'Completed', progressPercent: 100 });
              }
              tasksRef.current.delete(d.id);
              lastBytesRef.current.delete(d.id);
            }
          } catch {
            // Ignore per-item refresh failures
          }
        })
      );
    } finally {
      refreshInProgressRef.current = false;
    }
  }, [updateDownload, notifyCompleted, stopLiveActivityForDownload]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      appStateRef.current = s;
      if (s === 'active') {
        stopAllLiveActivities();
        refreshAllDownloadsFromDisk();
      } else {
        syncLiveActivitiesForBackground();
      }
    });
    return () => sub.remove();
  }, [refreshAllDownloadsFromDisk, stopAllLiveActivities, syncLiveActivitiesForBackground]);

  // Start a queued download by creating the native task
  const startQueuedDownload = useCallback((item: DownloadItem) => {
    const destinationPath = item.fileUri ? stripFileScheme(item.fileUri) : null;
    if (!destinationPath) {
      updateDownload(item.id, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
      return;
    }

    updateDownload(item.id, (d) => ({ ...d, status: 'downloading', updatedAt: Date.now() }));
    maybeUpdateLiveActivity({ ...item, status: 'downloading' });

    const task = createDownloadTask({
      id: item.id,
      url: item.sourceUrl,
      destination: destinationPath,
      headers: item.headers,
      metadata: {
        contentId: item.contentId,
        type: item.type,
        title: item.title,
        year: item.year,
        providerName: item.providerName,
        season: item.season,
        episode: item.episode,
        episodeTitle: item.episodeTitle,
        quality: item.quality,
        posterUrl: item.posterUrl,
        sourceUrl: item.sourceUrl,
        headers: item.headers,
        fileUri: item.fileUri,
        relativeFilePath: item.relativeFilePath,
        imdbId: item.imdbId,
        tmdbId: item.tmdbId,
      },
    });

    tasksRef.current.set(item.id, task);
    attachDownloadTask(task);
    lastBytesRef.current.set(item.id, { bytes: 0, time: Date.now() });

    try {
      console.log(`[DownloadsContext] Starting native download task: ${item.id}`);
      task.start();
    } catch (e) {
      console.log('[DownloadsContext] Failed to start background download', e);
      updateDownload(item.id, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
      processQueueRef.current?.();
    }
  }, [attachDownloadTask, maybeUpdateLiveActivity, updateDownload]);

  // Process the download queue — only 1 download at a time
  const processQueue = useCallback(() => {
    const current = downloadsRef.current;
    const hasActive = current.some(d => d.status === 'downloading');
    if (hasActive) return;

    const next = current.filter(d => d.status === 'queued').sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;

    // Check if there's an existing native task (paused download being resumed)
    const existingTask = tasksRef.current.get(next.id);
    if (existingTask) {
      updateDownload(next.id, (d) => ({ ...d, status: 'downloading', updatedAt: Date.now() }));
      maybeUpdateLiveActivity({ ...next, status: 'downloading' });
      try {
        existingTask.resume();
      } catch (e) {
        console.log(`[DownloadsContext] Resume failed in queue: ${next.id}`, e);
        updateDownload(next.id, (d) => ({ ...d, status: 'error', updatedAt: Date.now() }));
        processQueueRef.current?.();
      }
    } else {
      startQueuedDownload(next);
    }
  }, [startQueuedDownload, updateDownload, maybeUpdateLiveActivity]);

  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  const resumeDownload = useCallback(async (id: string) => {
    const item = downloadsRef.current.find(d => d.id === id);
    if (!item) return;

    // Set to queued — processQueue will start it when a slot is free
    updateDownload(id, (d) => ({ ...d, status: 'queued', updatedAt: Date.now() }));

    // Re-attach native task if needed
    let task = tasksRef.current.get(id);
    if (!task) {
      try {
        const tasks = await getExistingDownloadTasks();
        task = tasks.find((t: any) => String(t?.id) === id);
        if (task) {
          tasksRef.current.set(id, task);
          attachDownloadTask(task);
        }
      } catch { }
    }

    if (!task) {
      // Native task lost (e.g. app restart) — re-create from saved item data
      console.log(`[DownloadsContext] No native task for ${id}, re-creating download`);
      startQueuedDownload(item);
      return;
    }

    processQueueRef.current?.();
  }, [attachDownloadTask, startQueuedDownload, updateDownload]);

  const startDownload = useCallback(async (input: StartDownloadInput) => {
    console.log(`[DownloadsContext] startDownload called:`, { title: input.title, type: input.type, url: input.url?.substring(0, 80) });

    if (!isHttpUrl(input.url)) {
      throw new Error('This stream is not a direct HTTP URL, so it cannot be downloaded.');
    }

    // Validate that the URL is downloadable (not m3u8 or DASH)
    if (!isDownloadableUrl(input.url)) {
      throw new Error('This stream format cannot be downloaded. M3U8 (HLS) and DASH streaming formats are not supported for download.');
    }

    // WiFi-only download check
    if (wifiOnlyRef.current && isConnectedRef.current && !isWiFiRef.current) {
      const userConfirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Cellular Download',
          'WiFi-only downloads is enabled. Do you want to download on cellular data?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Download Anyway', onPress: () => resolve(true) },
          ]
        );
      });
      if (!userConfirmed) return;
    }

    // Ensure we have storage permission on Android before proceeding
    if (Platform.OS === 'android') {
      const hasPermission = await ensureAndroidStoragePermission();
      if (!hasPermission) {
        throw new Error('Storage permission is required to download files. Please grant "All files access" in Settings.');
      }
    }

    const contentId = input.id;
    // Create unique ID per URL - allows same episode/movie from different sources
    const urlHash = hashString(input.url);
    const baseId = input.type === 'series' && input.season && input.episode
      ? `${contentId}:S${input.season}E${input.episode}`
      : contentId;
    const compoundId = `${baseId}:${urlHash}`;

    // Check if this exact URL is already being downloaded
    const existing = downloadsRef.current.find(d => d.sourceUrl === input.url);
    if (existing) {
      if (existing.status === 'completed' || existing.status === 'downloading' || existing.status === 'queued') {
        return;
      } else if (existing.status === 'paused' || existing.status === 'error') {
        await resumeDownload(existing.id);
        return;
      }
    }

    const documentsDir = getDocumentsDirPath();
    if (!documentsDir) throw new Error('Downloads directory is not available');

    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const resolvedFilename = await getDownloadFilename(input.url, input.headers);
    let fileName = resolvedFilename || uniqueId;
    const downloadsDirPath = `${documentsDir}/downloads`;
    let destinationPath = `${downloadsDirPath}/${fileName}`;

    // Ensure the downloads directory exists.
    try {
      await FileSystem.makeDirectoryAsync(toFileUri(downloadsDirPath), { intermediates: true }).catch(() => { });
    } catch { }

    // If the resolved name already exists, make it unique.
    try {
      const info = await FileSystem.getInfoAsync(toFileUri(destinationPath));
      if (info.exists) {
        fileName = `${uniqueId}_${fileName}`;
        destinationPath = `${downloadsDirPath}/${fileName}`;
      }
    } catch { }

    const fileUri = toFileUri(destinationPath);
    const relativeFilePath = getRelativeDownloadPath(destinationPath);

    const createdAt = Date.now();
    const newItem: DownloadItem = {
      id: compoundId,
      contentId,
      type: input.type,
      title: input.title,
      year: typeof input.year === 'number' ? input.year : undefined,
      providerName: input.providerName,
      season: input.season,
      episode: input.episode,
      episodeTitle: input.episodeTitle,
      quality: input.quality,
      size: undefined,
      downloadedBytes: 0,
      totalBytes: 0,
      progress: 0,
      status: 'queued',
      speedBps: 0,
      etaSeconds: undefined,
      posterUrl: input.posterUrl || null,
      sourceUrl: input.url,
      headers: input.headers,
      fileUri,
      relativeFilePath,
      createdAt,
      updatedAt: createdAt,
      // Store metadata for progress tracking
      imdbId: input.imdbId,
      tmdbId: input.tmdbId,
      // Offline metadata
      description: input.description,
      genres: input.genres,
      runtime: input.runtime,
      rating: input.rating,
      bannerUrl: input.bannerUrl,
      logoUrl: input.logoUrl,
      // Initialize resumeData as undefined
      resumeData: undefined,
    };

    setDownloads(prev => {
      const next = [newItem, ...prev];
      downloadsRef.current = next;
      return next;
    });

    // Fire-and-forget image caching
    const downloadId = compoundId;
    (async () => {
      try {
        const [localPosterPath, localBannerPath] = await Promise.all([
          offlineImageService.cacheImage(input.posterUrl, input.id, 'poster'),
          offlineImageService.cacheImage(input.bannerUrl, input.id, 'banner'),
        ]);
        // Update the download item with local paths
        setDownloads(prev => prev.map(d =>
          d.id === downloadId
            ? { ...d, localPosterPath: localPosterPath || undefined, localBannerPath: localBannerPath || undefined, updatedAt: Date.now() }
            : d
        ));
      } catch {
        // Image caching failure should never block downloads
      }
    })();

    // Process the queue — will start this download if no other is active
    processQueueRef.current?.();
  }, [resumeDownload, updateDownload]);

  const pauseDownload = useCallback(async (id: string) => {
    console.log(`[DownloadsContext] Pausing download: ${id}`);

    // First, update the status to 'paused' immediately
    // This will cause any ongoing download/resume operations to check status and exit gracefully
    updateDownload(id, (d) => ({ ...d, status: 'paused', updatedAt: Date.now() }));

    const current = downloadsRef.current.find(d => d.id === id);
    stopLiveActivityForDownload(id, { title: current?.title, subtitle: 'Paused', progressPercent: current?.progress });

    const task = tasksRef.current.get(id);
    if (!task) return;

    try {
      await task.pause();
    } catch (e) {
      console.log(`[DownloadsContext] Pause failed: ${id}`, e);
    }

    // Start next queued download
    processQueueRef.current?.();
  }, [stopLiveActivityForDownload, updateDownload]);

  const cancelDownload = useCallback(async (id: string) => {
    const current = downloadsRef.current.find(d => d.id === id);
    await stopLiveActivityForDownload(id, { title: current?.title, subtitle: 'Canceled', progressPercent: current?.progress });
    try {
      const task = tasksRef.current.get(id);
      if (task) {
        try { await task.stop(); } catch { }
      }
    } finally {
      tasksRef.current.delete(id);
      lastBytesRef.current.delete(id);
    }

    const item = downloadsRef.current.find(d => d.id === id);
    const resolvedFileUri = resolveDownloadFileUri(item?.relativeFilePath, item?.fileUri);
    if (resolvedFileUri) {
      await FileSystem.deleteAsync(resolvedFileUri, { idempotent: true }).catch(() => { });
    }
    setDownloads(prev => prev.filter(d => d.id !== id));

    // Start next queued download
    processQueueRef.current?.();
  }, [stopLiveActivityForDownload]);

  const removeDownload = useCallback(async (id: string) => {
    const item = downloadsRef.current.find(d => d.id === id);
    await stopLiveActivityForDownload(id, { title: item?.title, subtitle: 'Removed', progressPercent: item?.progress });
    const resolvedFileUri = resolveDownloadFileUri(item?.relativeFilePath, item?.fileUri);
    if (resolvedFileUri && item?.status === 'completed') {
      await FileSystem.deleteAsync(resolvedFileUri, { idempotent: true }).catch(() => { });
    }
    if (item) {
      await offlineImageService.deleteImagesIfOrphaned(
        item.contentId,
        downloadsRef.current,
        item.id
      );
    }
    setDownloads(prev => prev.filter(d => d.id !== id));

    // Start next queued download
    processQueueRef.current?.();
  }, [stopLiveActivityForDownload]);

  // Auto-pause/resume downloads on WiFi change
  useEffect(() => {
    if (!settings.wifiOnlyDownloads) return;

    if (!isWiFi && isConnected) {
      // WiFi lost while on cellular — pause active downloads
      const activeDownloads = downloadsRef.current.filter(d => d.status === 'downloading');
      for (const d of activeDownloads) {
        pauseDownload(d.id);
      }
      if (activeDownloads.length > 0) {
        setDownloads(prev => prev.map(d =>
          d.status === 'paused' && activeDownloads.some(a => a.id === d.id)
            ? { ...d, autoPausedByNetwork: true, updatedAt: Date.now() }
            : d
        ));
      }
    } else if (isWiFi) {
      // WiFi restored — resume only auto-paused downloads
      const autoPaused = downloadsRef.current.filter(d => d.autoPausedByNetwork && d.status === 'paused');
      for (const d of autoPaused) {
        resumeDownload(d.id);
      }
      if (autoPaused.length > 0) {
        setDownloads(prev => prev.map(d =>
          d.autoPausedByNetwork
            ? { ...d, autoPausedByNetwork: false, updatedAt: Date.now() }
            : d
        ));
      }
    }
  }, [isWiFi, isConnected, pauseDownload, resumeDownload, settings.wifiOnlyDownloads]);

  const value = useMemo<DownloadsContextValue>(() => ({
    downloads,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    removeDownload,
    isDownloadingUrl: (url: string) => {
      return downloadsRef.current.some(d => d.sourceUrl === url && (d.status === 'queued' || d.status === 'downloading' || d.status === 'paused'));
    },
  }), [downloads, startDownload, pauseDownload, resumeDownload, cancelDownload, removeDownload]);

  return (
    <DownloadsContext.Provider value={value}>
      {children}
    </DownloadsContext.Provider>
  );
};

export function useDownloads(): DownloadsContextValue {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error('useDownloads must be used within DownloadsProvider');
  return ctx;
}

