// @kesha-antonov/react-native-background-downloader web stub.
// DownloadsContext.tsx imports: completeHandler, createDownloadTask, directories, getExistingDownloadTasks

export const completeHandler = (_id: string) => {};

export const createDownloadTask = (_options: any) => ({
  begin: (_callback: any) => ({ progress: (_cb: any) => ({ done: (_cb: any) => ({}) }) }),
  pause: () => {},
  resume: () => {},
  stop: () => {},
});

export const directories = {
  documents: '/documents',
};

export const getExistingDownloadTasks = () => Promise.resolve([]);

export default {
  completeHandler,
  createDownloadTask,
  directories,
  getExistingDownloadTasks,
};
