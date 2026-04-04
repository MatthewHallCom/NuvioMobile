// Sentry stub for web builds.
// App.tsx wraps the entire app with Sentry.wrap() and calls Sentry.init().
// This no-op stub prevents crashes without adding real error tracking.
// Replace with @sentry/browser for production desktop error tracking.

export const init = (_config: any) => {};
export const wrap = (component: any) => component;
export const captureException = (_error: any) => {};
export const captureMessage = (_message: string) => {};
export const withScope = (callback: (scope: any) => void) => {
  callback({
    setTag: () => {},
    setExtra: () => {},
    setUser: () => {},
    setLevel: () => {},
  });
};
export const setUser = (_user: any) => {};
export const setTag = (_key: string, _value: string) => {};
export const setExtra = (_key: string, _value: any) => {};
export const addBreadcrumb = (_breadcrumb: any) => {};
export const feedbackIntegration = () => ({});
export const reactNativeTracingIntegration = () => ({});
export const reactNavigationIntegration = () => ({ registerNavigationContainer: () => {} });

export default {
  init,
  wrap,
  captureException,
  captureMessage,
  withScope,
  setUser,
  setTag,
  setExtra,
  addBreadcrumb,
  feedbackIntegration,
  reactNativeTracingIntegration,
  reactNavigationIntegration,
};
