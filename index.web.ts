// Polyfill reanimated native globals for web
// Reanimated checks for these at runtime; on native they're injected by the C++ runtime.
// On web, we provide performance.now()-based alternatives.
if (typeof globalThis._getAnimationTimestamp === 'undefined') {
  globalThis._getAnimationTimestamp = () => performance.now();
}
if (typeof globalThis.__frameTimestamp === 'undefined') {
  globalThis.__frameTimestamp = undefined;
}
if (typeof globalThis._notifyAboutProgress === 'undefined') {
  globalThis._notifyAboutProgress = () => {};
}
if (typeof globalThis._notifyAboutEnd === 'undefined') {
  globalThis._notifyAboutEnd = () => {};
}
if (typeof globalThis._setGestureState === 'undefined') {
  globalThis._setGestureState = () => {};
}
if (typeof globalThis._makeShareableClone === 'undefined') {
  globalThis._makeShareableClone = (v: any) => v;
}
if (typeof globalThis._scheduleOnJS === 'undefined') {
  globalThis._scheduleOnJS = (fn: any) => fn;
}
if (typeof globalThis._scheduleOnRuntime === 'undefined') {
  globalThis._scheduleOnRuntime = () => {};
}

// Shim require() for React Native code that uses it for assets or
// platform-guarded dynamic imports. Vite uses ESM so require() doesn't exist.
// Most require() calls in RN are for images/JSON assets or are behind
// Platform.OS checks that won't execute on web.
if (typeof globalThis.require === 'undefined') {
  (globalThis as any).require = (id: string) => {
    // Asset requires (images, JSON, lottie) — return null to avoid text node errors
    if (/\.(json|png|jpg|jpeg|gif|svg|zip|lottie)$/.test(id)) {
      return null;
    }
    console.warn(`[web] require("${id}") called — returning empty stub`);
    return {};
  };
}

import { AppRegistry, BackHandler } from 'react-native';
import App from './App';

// Patch BackHandler for web — RNW throws on addEventListener
BackHandler.addEventListener = function(_event: string, _handler: () => boolean) {
  return { remove: () => {} };
};

// Pre-seed storage to skip onboarding on fresh desktop installs
// Must run after imports so MMKV stub hydrates from localStorage
if (!localStorage.getItem('default:hasCompletedOnboarding')) {
  localStorage.setItem('default:hasCompletedOnboarding', 'true');
}

AppRegistry.registerComponent('Nuvio', () => App);
AppRegistry.runApplication('Nuvio', {
  rootTag: document.getElementById('root'),
});
