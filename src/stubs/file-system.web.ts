// expo-file-system web stub — skeleton for Phase 1.
// Phase 4 replaces this with @tauri-apps/plugin-fs for real file access.

export const documentDirectory = 'file:///tauri-docs/';
export const cacheDirectory = 'file:///tauri-cache/';
export const bundleDirectory = null;

export const EncodingType = {
  UTF8: 'utf8' as const,
  Base64: 'base64' as const,
};

export const FileSystemUploadType = {
  BINARY_CONTENT: 0,
  MULTIPART: 1,
};

export const readAsStringAsync = async (_uri: string, _options?: any): Promise<string> => '';
export const writeAsStringAsync = async (_uri: string, _content: string, _options?: any): Promise<void> => {};
export const deleteAsync = async (_uri: string, _options?: any): Promise<void> => {};
export const moveAsync = async (_options: any): Promise<void> => {};
export const copyAsync = async (_options: any): Promise<void> => {};
export const makeDirectoryAsync = async (_uri: string, _options?: any): Promise<void> => {};

export const getInfoAsync = async (_uri: string, _options?: any): Promise<{
  exists: boolean;
  isDirectory: boolean;
  size: number;
  modificationTime: number;
  uri: string;
}> => ({
  exists: false,
  isDirectory: false,
  size: 0,
  modificationTime: 0,
  uri: _uri,
});

export const readDirectoryAsync = async (_uri: string): Promise<string[]> => [];
export const downloadAsync = async (_uri: string, _fileUri: string, _options?: any): Promise<any> => ({});
export const uploadAsync = async (_url: string, _fileUri: string, _options?: any): Promise<any> => ({});

export const createDownloadResumable = (
  _uri: string,
  _fileUri: string,
  _options?: any,
  _callback?: any,
  _resumeData?: string,
) => ({
  downloadAsync: async () => ({ uri: _fileUri, status: 200, headers: {} }),
  pauseAsync: async () => ({ resumeData: '' }),
  resumeAsync: async () => ({ uri: _fileUri, status: 200, headers: {} }),
  savable: () => ({ url: _uri, fileUri: _fileUri, resumeData: undefined }),
});

export default {
  documentDirectory,
  cacheDirectory,
  bundleDirectory,
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
  moveAsync,
  copyAsync,
  makeDirectoryAsync,
  getInfoAsync,
  readDirectoryAsync,
  downloadAsync,
  uploadAsync,
  createDownloadResumable,
};
