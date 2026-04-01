// expo-modules-core web stub.
// Rolldown can't resolve TypeScript type re-exports from the source .ts files.
// This provides the runtime exports that Expo packages need.

export class EventEmitter {
  private listeners = new Map<string, Set<Function>>();
  addListener(event: string, listener: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return { remove: () => this.listeners.get(event)?.delete(listener) };
  }
  removeAllListeners(event?: string) {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }
  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }
}

export class NativeModule extends EventEmitter {
  [key: string]: any;
}

export class SharedObject {
  release() {}
}

export class SharedRef extends SharedObject {
  nativeRefType?: string;
}

export const requireNativeModule = (_name: string) => new Proxy({}, { get: () => () => {} });
export const requireOptionalNativeModule = (_name: string) => null;
export const requireNativeViewManager = (_name: string) => ({});
export const createPermissionHook = () => () => [null, () => Promise.resolve(null), () => Promise.resolve(null)];
export const PermissionStatus = { UNDETERMINED: 'undetermined', GRANTED: 'granted', DENIED: 'denied' };
export const UnavailabilityError = class extends Error {};
export const Platform = { OS: 'web', select: (obj: any) => obj.web ?? obj.default };
export const CodedError = class extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } };
export const LegacyEventEmitter = EventEmitter;
export const registerWebModule = (_name: string, _module: any) => {};
export const reloadAppAsync = (_reason?: string) => Promise.resolve();
export const uuid = { v4: () => Math.random().toString(36).slice(2) };

export default {
  EventEmitter,
  NativeModule,
  SharedObject,
  SharedRef,
  requireNativeModule,
  requireOptionalNativeModule,
  requireNativeViewManager,
  createPermissionHook,
  PermissionStatus,
  UnavailabilityError,
  Platform,
  CodedError,
};
