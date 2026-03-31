import * as FileSystem from 'expo-file-system/legacy';

const OFFLINE_IMAGES_DIR = `${FileSystem.documentDirectory}offline-images/`;
export const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/300x450/333333/666666?text=No+Image';

async function ensureDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(OFFLINE_IMAGES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(OFFLINE_IMAGES_DIR, { intermediates: true });
  }
}

function getLocalPath(contentId: string, type: 'poster' | 'banner'): string {
  const safeId = contentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${OFFLINE_IMAGES_DIR}${safeId}_${type}.jpg`;
}

export async function cacheImage(
  remoteUrl: string | null | undefined,
  contentId: string,
  type: 'poster' | 'banner'
): Promise<string | null> {
  if (!remoteUrl || !contentId) return null;
  try {
    await ensureDirectory();
    const localPath = getLocalPath(contentId, type);

    // Check if already cached
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) return localPath;

    const result = await FileSystem.downloadAsync(remoteUrl, localPath);
    if (result.status === 200) {
      return localPath;
    }
    // Clean up failed download
    try { await FileSystem.deleteAsync(localPath, { idempotent: true }); } catch {}
    return null;
  } catch {
    return null;
  }
}

export async function isImageCached(contentId: string, type: 'poster' | 'banner'): Promise<boolean> {
  try {
    const localPath = getLocalPath(contentId, type);
    const info = await FileSystem.getInfoAsync(localPath);
    return info.exists;
  } catch {
    return false;
  }
}

export async function deleteImagesIfOrphaned(
  contentId: string,
  allDownloads: Array<{ contentId: string; id: string }>,
  excludeId?: string
): Promise<void> {
  // Check if any other downloads share this contentId
  const siblings = allDownloads.filter(
    d => d.contentId === contentId && d.id !== excludeId
  );
  if (siblings.length > 0) return;

  // No siblings -- safe to delete
  try {
    const posterPath = getLocalPath(contentId, 'poster');
    const bannerPath = getLocalPath(contentId, 'banner');
    await FileSystem.deleteAsync(posterPath, { idempotent: true });
    await FileSystem.deleteAsync(bannerPath, { idempotent: true });
  } catch {
    // Ignore cleanup errors
  }
}

export async function deleteAllOfflineImages(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(OFFLINE_IMAGES_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(OFFLINE_IMAGES_DIR, { idempotent: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

export const offlineImageService = {
  cacheImage,
  isImageCached,
  deleteImagesIfOrphaned,
  deleteAllOfflineImages,
  PLACEHOLDER_IMAGE,
};
