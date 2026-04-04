// react-native-worklets web stub.
// Reanimated v4 imports heavily from this package.
// All exports are no-op stubs that pass through functions or return defaults.

const noop = () => {};
const identity = (fn: any) => fn;
const noopAsync = () => Promise.resolve();

export const runOnUI = identity;
export const runOnUISync = identity;
export const runOnJS = identity;
export const runOnRuntime = (_runtime: any, fn: any) => fn;
export const scheduleOnUI = identity;
export const scheduleOnRN = identity;
export const callMicrotasks = noop;

export const createWorkletRuntime = (_name?: string, _init?: any) => ({});
export const createSerializable = (value: any) => value;
export const createSynchronizable = (value: any) => ({ get: () => value, set: noop });

export const makeShareable = (value: any) => value;
export const isWorkletFunction = (_fn: any) => false;
export const executeOnUIRuntimeSync = identity;

export const serializableMappingCache = new Map();

export const RuntimeKind = {
  UI: 'UI' as const,
  RN: 'RN' as const,
};

export const WorkletsModule = {
  makeShareableClone: (value: any) => value,
  scheduleOnUI: identity,
  executeOnUIRuntimeSync: identity,
  createWorkletRuntime: () => ({}),
};

export default {
  runOnUI,
  runOnUISync,
  runOnJS,
  runOnRuntime,
  scheduleOnUI,
  scheduleOnRN,
  callMicrotasks,
  createWorkletRuntime,
  createSerializable,
  createSynchronizable,
  makeShareable,
  isWorkletFunction,
  executeOnUIRuntimeSync,
  serializableMappingCache,
  RuntimeKind,
  WorkletsModule,
};
