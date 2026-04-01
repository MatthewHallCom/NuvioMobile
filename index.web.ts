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

// Pre-seed storage to skip onboarding on fresh desktop installs
if (!localStorage.getItem('default:hasCompletedOnboarding')) {
  localStorage.setItem('default:hasCompletedOnboarding', 'true');
}

import { AppRegistry } from 'react-native';
import App from './App';

AppRegistry.registerComponent('Nuvio', () => App);
AppRegistry.runApplication('Nuvio', {
  rootTag: document.getElementById('root'),
});
