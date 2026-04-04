// Web stub for react-native-reanimated
// Provides no-op/passthrough implementations for browser builds.

import { View, Text, Image, ScrollView, FlatList } from 'react-native';
import { useRef, useCallback } from 'react';

// --- Shared values ---
function useSharedValue(init: any) {
  const ref = useRef({ value: init });
  return ref.current;
}

function useDerivedValue(updater: () => any) {
  return { value: updater() };
}

// --- Animated styles ---
// Return empty style — let CSS/inline styles handle everything.
// Animated entrance/exit styles (opacity, transform) are skipped on web
// so content is always immediately visible.
function useAnimatedStyle(_updater: () => any) {
  return {};
}

function useAnimatedProps(updater: () => any) {
  try { return updater(); } catch { return {}; }
}

function useAnimatedScrollHandler(_handler: any) {
  return useCallback(() => {}, []);
}

function useAnimatedReaction(_prepare: any, _react: any) {}

// --- Animations ---
function withTiming(toValue: any, _config?: any, _cb?: any) { return toValue; }
function withSpring(toValue: any, _config?: any, _cb?: any) { return toValue; }
function withDelay(_delay: number, value: any) { return value; }
function withSequence(...values: any[]) { return values[values.length - 1]; }
function withRepeat(value: any) { return value; }
function withDecay(_config?: any) { return 0; }

function cancelAnimation(_sv: any) {}
function runOnJS(fn: any) { return fn; }
function runOnUI(fn: any) { return fn; }

// --- Interpolation ---
function interpolateColor(
  value: number,
  inputRange: number[],
  outputRange: string[],
) {
  if (outputRange.length < 2) return outputRange[0] ?? 'transparent';
  if (value <= inputRange[0]) return outputRange[0];
  if (value >= inputRange[inputRange.length - 1]) return outputRange[outputRange.length - 1];
  for (let i = 0; i < inputRange.length - 1; i++) {
    if (value >= inputRange[i] && value <= inputRange[i + 1]) {
      return outputRange[i + 1];
    }
  }
  return outputRange[0];
}

function interpolate(
  value: number,
  inputRange: number[],
  outputRange: number[],
  _extrapolation?: any,
) {
  if (inputRange.length < 2 || outputRange.length < 2) return outputRange[0] ?? 0;
  if (value <= inputRange[0]) return outputRange[0];
  if (value >= inputRange[inputRange.length - 1]) return outputRange[outputRange.length - 1];
  for (let i = 0; i < inputRange.length - 1; i++) {
    if (value >= inputRange[i] && value <= inputRange[i + 1]) {
      const t = (value - inputRange[i]) / (inputRange[i + 1] - inputRange[i]);
      return outputRange[i] + t * (outputRange[i + 1] - outputRange[i]);
    }
  }
  return outputRange[0];
}

const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };
const Extrapolate = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };

// --- Easing ---
const Easing = {
  linear: (t: number) => t,
  ease: (t: number) => t,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  circle: (t: number) => t,
  bezier: (_x1: number, _y1: number, _x2: number, _y2: number) => (t: number) => t,
  in: (fn: (t: number) => number) => fn,
  out: (fn: (t: number) => number) => fn,
  inOut: (fn: (t: number) => number) => fn,
};

// --- Layout animations (entering/exiting) ---
function createLayoutAnimation() {
  const anim: any = new Proxy({}, {
    get: (_target, _prop) => {
      // Every property returns a function that returns the proxy itself,
      // allowing arbitrary chaining: FadeIn.duration(400).easing(...).delay(100)
      return (..._args: any[]) => anim;
    },
  });
  return anim;
}

const FadeIn = createLayoutAnimation();
const FadeOut = createLayoutAnimation();
const FadeInUp = createLayoutAnimation();
const FadeInDown = createLayoutAnimation();
const FadeOutUp = createLayoutAnimation();
const FadeOutDown = createLayoutAnimation();
const SlideInRight = createLayoutAnimation();
const SlideOutLeft = createLayoutAnimation();
const SlideInLeft = createLayoutAnimation();
const SlideOutRight = createLayoutAnimation();
const SlideInDown = createLayoutAnimation();
const SlideOutDown = createLayoutAnimation();
const SlideInUp = createLayoutAnimation();
const SlideOutUp = createLayoutAnimation();
const Layout = createLayoutAnimation();

// --- Animated components (passthrough to plain RN) ---
const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  createAnimatedComponent: (component: any) => component,
};

type SharedValue<T = any> = { value: T };

export default Animated;
export type { SharedValue };
const createAnimatedComponent = (component: any) => component;

export {
  createAnimatedComponent,
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  withDecay,
  cancelAnimation,
  runOnJS,
  runOnUI,
  interpolate,
  interpolateColor,
  Extrapolation,
  Extrapolate,
  Easing,
  FadeIn,
  FadeOut,
  FadeInUp,
  FadeInDown,
  FadeOutUp,
  FadeOutDown,
  SlideInRight,
  SlideOutLeft,
  SlideInLeft,
  SlideOutRight,
  SlideInDown,
  SlideOutDown,
  SlideInUp,
  SlideOutUp,
  Layout,
};
