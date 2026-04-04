// MMKV web stub using localStorage for persistent storage.
// The codebase uses createMMKV() (factory function), NOT new MMKV().

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

// In-memory cache for synchronous reads.
// Hydrated from localStorage on first access, kept in sync on writes.
const memoryCache = new Map<string, Map<string, any>>();

function getMemCache(prefix: string): Map<string, any> {
  if (!memoryCache.has(prefix)) {
    memoryCache.set(prefix, new Map());
  }
  return memoryCache.get(prefix)!;
}

export function createMMKV(config?: { id?: string }): MMKVInstance {
  const prefix = config?.id ?? 'default';
  const cache = getMemCache(prefix);
  const listeners = new Set<(key: string) => void>();

  // Hydrate from localStorage
  const lsPrefix = `${prefix}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(lsPrefix)) {
      cache.set(k.slice(lsPrefix.length), localStorage.getItem(k));
    }
  }

  const persistSet = (key: string, value: any) => {
    cache.set(key, value);
    listeners.forEach((cb) => cb(key));
    localStorage.setItem(`${prefix}:${key}`, String(value));
  };

  const persistDelete = (key: string) => {
    cache.delete(key);
    listeners.forEach((cb) => cb(key));
    localStorage.removeItem(`${prefix}:${key}`);
  };

  return {
    getString: (key) => {
      const v = cache.get(key);
      return v != null ? String(v) : undefined;
    },
    getNumber: (key) => {
      const v = cache.get(key);
      return v != null ? Number(v) : undefined;
    },
    getBoolean: (key) => {
      const v = cache.get(key);
      if (v == null) return undefined;
      return v === true || v === 'true';
    },
    set: (key, value) => persistSet(key, value),
    delete: (key) => persistDelete(key),
    remove: (key) => persistDelete(key),
    contains: (key) => cache.has(key),
    getAllKeys: () => Array.from(cache.keys()),
    clearAll: () => {
      const keys = Array.from(cache.keys());
      cache.clear();
      keys.forEach((k) => localStorage.removeItem(`${prefix}:${k}`));
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
  remove(key: string) { this.instance.delete(key); }
  contains(key: string) { return this.instance.contains(key); }
  getAllKeys() { return this.instance.getAllKeys(); }
  clearAll() { this.instance.clearAll(); }
  addOnValueChangedListener(callback: (key: string) => void) {
    return this.instance.addOnValueChangedListener(callback);
  }
}
