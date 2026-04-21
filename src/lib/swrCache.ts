import { SWRConfiguration } from 'swr';

type CacheData = {
  [key: string]: {
    data: any;
    error?: any;
    timestamp: number;
  };
};

const CACHE_KEY = 'swr-cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const isClient = typeof window !== 'undefined';

const getCache = (): CacheData => {
  if (!isClient) return {};
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const setCache = (cache: CacheData) => {
  if (!isClient) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
};

const cleanExpiredCache = (cache: CacheData): CacheData => {
  const now = Date.now();
  const cleaned: CacheData = {};
  for (const [key, value] of Object.entries(cache)) {
    if (now - value.timestamp < CACHE_TTL) {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

export const localStorageProvider = (): SWRConfiguration['provider'] => {
  const cache = getCache();
  const cleanedCache = cleanExpiredCache(cache);
  if (Object.keys(cleanedCache).length !== Object.keys(cache).length) {
    setCache(cleanedCache);
  }

  const map = new Map<string, any>(Object.entries(cleanedCache));

  // Save to localStorage when the cache is updated
  window.addEventListener('beforeunload', () => {
    const cacheData: CacheData = {};
    map.forEach((value, key) => {
      cacheData[key] = {
        data: value.data,
        error: value.error,
        timestamp: Date.now(),
      };
    });
    setCache(cacheData);
  });

  // SWR expects a function that receives the current cache and returns a cache
  return () => map;
};
