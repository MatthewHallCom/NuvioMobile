// Generic no-op stub for native-only packages that have no web equivalent.
// Each export covers common patterns used by RN native modules.
export default {};
export const init = () => {};
export const configure = () => {};
export const start = () => {};
export const stop = () => {};
export const show = () => {};
export const hide = () => {};

// expo-haptics
export const impactAsync = () => Promise.resolve();
export const notificationAsync = () => Promise.resolve();
export const selectionAsync = () => Promise.resolve();
export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy' };
export const NotificationFeedbackType = { Success: 'success', Warning: 'warning', Error: 'error' };

// expo-keep-awake
export const activateKeepAwake = () => {};
export const deactivateKeepAwake = () => {};
export const activateKeepAwakeAsync = () => Promise.resolve();
export const deactivateKeepAwakeAsync = () => Promise.resolve();
export const useKeepAwake = () => {};
export const isAvailableAsync = () => Promise.resolve(false);

// expo-screen-orientation
export const lockAsync = () => Promise.resolve();
export const unlockAsync = () => Promise.resolve();
export const getOrientationAsync = () => Promise.resolve(1);
export const OrientationLock = { DEFAULT: 0, ALL: 1, PORTRAIT: 2, LANDSCAPE: 3 };
export const Orientation = { PORTRAIT_UP: 1, PORTRAIT_DOWN: 2, LANDSCAPE_LEFT: 3, LANDSCAPE_RIGHT: 4 };

// expo-intent-launcher
export const startActivityAsync = () => Promise.resolve({ resultCode: 0 });
export const ActivityAction = {};

// expo-navigation-bar
export const setBackgroundColorAsync = () => Promise.resolve();
export const setVisibilityAsync = () => Promise.resolve();
export const setBehaviorAsync = () => Promise.resolve();
export const setPositionAsync = () => Promise.resolve();

// expo-brightness
export const getBrightnessAsync = () => Promise.resolve(1);
export const setBrightnessAsync = () => Promise.resolve();
export const getSystemBrightnessAsync = () => Promise.resolve(1);

// expo-updates
export const checkForUpdateAsync = () => Promise.resolve({ isAvailable: false });
export const fetchUpdateAsync = () => Promise.resolve({ isNew: false });
export const reloadAsync = () => Promise.resolve();

// react-native-immersive-mode
export const fullLayout = () => {};
export const setBarMode = () => {};
export const setBarTranslucent = () => {};
export const setBarColor = () => {};
export const setBarDefaultColor = () => {};
