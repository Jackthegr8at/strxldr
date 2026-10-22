import { isPersistableSharedKey } from './queryKeys.ts';
export const CACHE_KEY = 'strxldr:swr-cache:v3';
export const CACHE_TTL = 300000;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type Events = Pick<EventTarget, 'addEventListener'> & {
  visibilityState?: string;
};
type RecordValue = {
  data: unknown;
  fetchedAt: number;
};
type Options = {
  storage?: StorageLike;
  now?: () => number;
  eventTarget?: Events;
  aliases?: Record<string, string>;
};
function browserStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function validData(key: string, data: unknown): boolean {
  if (!data || data instanceof Error || typeof data === 'object' && 'then' in data) return false;
  const resource = JSON.parse(key)[1];
  if (resource === 'snapshot') {
    return object(data) && object(data.data) && Number.isFinite(data.fetchedAt) && (data.lastModified === null || typeof data.lastModified === 'string' && Number.isFinite(Date.parse(data.lastModified))) && Object.values(data.data).every(value => object(value) && nonnegative(value.staked) && nonnegative(value.unstaked));
  }
  if (resource === 'config') return object(data) && Array.isArray(data.rows) && data.rows.length > 0 && data.rows.every(row => object(row) && ['stakes', 'rewards', 'rewards_sec'].every(field => typeof row[field] === 'string') && ['pool_duration_months', 'unstake_period_secs'].every(field => nonnegative(row[field])));
  if (resource === 'oraclePrices') return object(data) && Array.isArray(data.rows) && data.rows.every(row => object(row) && typeof row.sym === 'string' && typeof row.quantity === 'string');
  if (resource === 'rewardsPool' || resource === 'bridgeBalance') return Array.isArray(data) && data.every(value => typeof value === 'string');
  if (resource === 'newStakers') return Array.isArray(data) && data.every(value => object(value) && typeof value.username === 'string' && nonnegative(value.total_staked) && typeof value.date === 'string' && Number.isFinite(Date.parse(value.date)));
  if (resource === 'xsol') return Array.isArray(data) && data.every(object) || object(data);
  return object(data) && !('then' in data) && !(data instanceof Error);
}
export function createPersistentCache({
  storage = browserStorage(),
  now = Date.now,
  eventTarget = typeof window === 'undefined' ? undefined : window,
  aliases = {}
}: Options = {}) {
  const map = new Map<string, any>();
  const records = new Map<string, RecordValue>();
  const subscribers = new Set<() => void>();
  const restored = new Set<string>();
  const canonical = (key: string) => isPersistableSharedKey(key) ? key : isPersistableSharedKey(aliases[key]) ? aliases[key] : null;
  try {
    const raw = storage?.getItem(CACHE_KEY);
    const envelope = raw ? JSON.parse(raw) : null;
    if (envelope?.version === 3 && Array.isArray(envelope.entries)) for (const entry of envelope.entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [key, value] = entry;
      if (!isPersistableSharedKey(key) || !value || typeof value !== 'object' || !validData(key, value.data) || !Number.isFinite(value.fetchedAt)) continue;
      const age = now() - value.fetchedAt;
      if (age < 0 || age >= CACHE_TTL) continue;
      restored.add(key);
      records.set(key, {
        data: value.data,
        fetchedAt: value.fetchedAt
      });
      map.set(key, {
        data: value.data
      });
      for (const [alias, target] of Object.entries(aliases)) if (target === key) map.set(alias, {
        data: value.data
      });
    }
  } catch {
    map.clear();
    records.clear();
  }
  const flush = () => {
    try {
      storage?.setItem(CACHE_KEY, JSON.stringify({
        version: 3,
        entries: [...records]
      }));
    } catch {/* Keep the in-memory provider usable. */}
  };
  eventTarget?.addEventListener('pagehide', flush);
  const visibilityTarget = eventTarget === (typeof window === 'undefined' ? undefined : window) && typeof document !== 'undefined' ? document : eventTarget;
  visibilityTarget?.addEventListener('visibilitychange', () => {
    if (visibilityTarget.visibilityState === 'hidden') flush();
  });
  return {
    provider: () => map,
    recordSuccess(data: unknown, key: string) {
      const target = canonical(key);
      if (!target || !validData(target, data)) return;
      restored.delete(target);
      records.set(target, {
        data,
        fetchedAt: now()
      });
      for (const notify of subscribers) notify();
    },
    isRestored(key: string) { return restored.has(key); },
    getFetchedAt(key: string) {
      const target = canonical(key);
      return target ? records.get(target)?.fetchedAt : undefined;
    },
    subscribe(notify: () => void) {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    }
  };
}
