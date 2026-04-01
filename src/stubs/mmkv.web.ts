// MMKV web stub using localStorage.
// The codebase uses createMMKV() (factory function), NOT new MMKV().
// Both mmkvStorage.ts and telemetryService.ts import createMMKV.
// Note: localStorage has ~5-10MB limit. Phase 4 upgrades to @tauri-apps/plugin-store.

interface MMKVInstance {
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  set(key: string, value: string | number | boolean): void;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
  clearAll(): void;
  addOnValueChangedListener(callback: (key: string) => void): { remove: () => void };
}

export function createMMKV(config?: { id?: string }): MMKVInstance {
  const prefix = config?.id ?? 'default';
  const listeners = new Set<(key: string) => void>();

  return {
    getString: (key) => localStorage.getItem(`${prefix}:${key}`) ?? undefined,
    getNumber: (key) => {
      const v = localStorage.getItem(`${prefix}:${key}`);
      return v != null ? Number(v) : undefined;
    },
    getBoolean: (key) => {
      const v = localStorage.getItem(`${prefix}:${key}`);
      return v != null ? v === 'true' : undefined;
    },
    set: (key, value) => {
      localStorage.setItem(`${prefix}:${key}`, String(value));
      listeners.forEach((cb) => cb(key));
    },
    delete: (key) => {
      localStorage.removeItem(`${prefix}:${key}`);
      listeners.forEach((cb) => cb(key));
    },
    contains: (key) => localStorage.getItem(`${prefix}:${key}`) !== null,
    getAllKeys: () =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith(`${prefix}:`))
        .map((k) => k.slice(prefix.length + 1)),
    clearAll: () => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(`${prefix}:`))
        .forEach((k) => localStorage.removeItem(k));
    },
    addOnValueChangedListener: (callback) => {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    },
  };
}

// Also export MMKV class for any code using the constructor pattern
export class MMKV {
  private instance: MMKVInstance;
  constructor(config?: { id?: string }) {
    this.instance = createMMKV(config);
  }
  getString(key: string) { return this.instance.getString(key); }
  getNumber(key: string) { return this.instance.getNumber(key); }
  getBoolean(key: string) { return this.instance.getBoolean(key); }
  set(key: string, value: string | number | boolean) { this.instance.set(key, value); }
  delete(key: string) { this.instance.delete(key); }
  contains(key: string) { return this.instance.contains(key); }
  getAllKeys() { return this.instance.getAllKeys(); }
  clearAll() { this.instance.clearAll(); }
  addOnValueChangedListener(callback: (key: string) => void) {
    return this.instance.addOnValueChangedListener(callback);
  }
}
