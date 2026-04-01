// Minimal shim: re-export everything from RNW + add missing native-only APIs.
// IMPORTANT: Do NOT add explicit exports for anything RNW already exports
// (Easing, Animated, View, etc.) — that causes conflicts with `export *`.

import * as ReactNative from 'react-native-web';
export * from 'react-native-web';
export { unstable_batchedUpdates } from 'react-dom';

// Default export (export * doesn't re-export default in ESM)
export default ReactNative;

// --- APIs that do NOT exist in react-native-web ---

export const ToastAndroid = {
  show() {},
  showWithGravity() {},
  showWithGravityAndOffset() {},
  SHORT: 0,
  LONG: 1,
  TOP: 0,
  BOTTOM: 1,
  CENTER: 2,
};

export const ActionSheetIOS = {
  showActionSheetWithOptions() {},
  showShareActionSheetWithOptions() {},
};

export const requireNativeComponent = (_name: string) => {
  const RNW = require('react-native-web');
  return RNW.View;
};

export const NativeModules = new Proxy(
  {},
  { get: () => new Proxy({}, { get: () => () => {} }) },
);

export const NativeEventEmitter = class {
  addListener() { return { remove() {} }; }
  removeAllListeners() {}
  listenerCount() { return 0; }
};
