// MMKV web stub using Tauri Store for persistent disk-backed storage.
// Falls back to localStorage when not running in Tauri (e.g., plain browser dev).
// The codebase uses createMMKV() (factory function), NOT new MMKV().

import { load, type Store } from '@tauri-apps/plugin-store';

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI__;

// Cache of initialized stores (one per MMKV id)
const storeCache = new Map<string, Store>();
const pendingStores = new Map<string, Promise<Store>>();

async function getStore(id: string): Promise<Store> {
  if (storeCache.has(id)) return storeCache.get(id)!;
  if (pendingStores.has(id)) return pendingStores.get(id)!;

  const promise = load(`mmkv-${id}.json`, { autoSave: true });
  pendingStores.set(id, promise);
  const store = await promise;
  storeCache.set(id, store);
  pendingStores.delete(id);
  return store;
}

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

// In-memory cache for synchronous reads (Tauri Store is async).
// Hydrated on first access, kept in sync on writes.
const memoryCache = new Map<string, Map<string, any>>();

function getMemCache(prefix: string): Map<string, any> {
  if (!memoryCache.has(prefix)) {
    memoryCache.set(prefix, new Map());
  }
  return memoryCache.get(prefix)!;
}

// Hydrate memory cache from Tauri Store on startup
async function hydrateCache(prefix: string) {
  if (!isTauri) return;
  try {
    const store = await getStore(prefix);
    const entries = await store.entries();
    const cache = getMemCache(prefix);
    for (const [key, value] of entries) {
      cache.set(key, value);
    }
  } catch {
    // Store not available yet — will hydrate on next access
  }
}

export function createMMKV(config?: { id?: string }): MMKVInstance {
  const prefix = config?.id ?? 'default';
  const cache = getMemCache(prefix);
  const listeners = new Set<(key: string) => void>();

  // Start hydrating from Tauri Store
  if (isTauri) {
    hydrateCache(prefix);
  } else {
    // Hydrate from localStorage
    const lsPrefix = `${prefix}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(lsPrefix)) {
        cache.set(k.slice(lsPrefix.length), localStorage.getItem(k));
      }
    }
  }

  const persistSet = (key: string, value: any) => {
    cache.set(key, value);
    listeners.forEach((cb) => cb(key));
    if (isTauri) {
      getStore(prefix).then((store) => store.set(key, value)).catch(() => {});
    } else {
      localStorage.setItem(`${prefix}:${key}`, String(value));
    }
  };

  const persistDelete = (key: string) => {
    cache.delete(key);
    listeners.forEach((cb) => cb(key));
    if (isTauri) {
      getStore(prefix).then((store) => store.delete(key)).catch(() => {});
    } else {
      localStorage.removeItem(`${prefix}:${key}`);
    }
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
    contains: (key) => cache.has(key),
    getAllKeys: () => Array.from(cache.keys()),
    clearAll: () => {
      const keys = Array.from(cache.keys());
      cache.clear();
      if (isTauri) {
        getStore(prefix).then((store) => store.clear()).catch(() => {});
      } else {
        keys.forEach((k) => localStorage.removeItem(`${prefix}:${k}`));
      }
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
