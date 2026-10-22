import { useSyncExternalStore } from 'react';
import useSWR from 'swr';
import * as api from '../lib/api';
import * as keys from '../lib/queryKeys';
import { persistentCache } from '../lib/resourceCache';
import type { ActionResponse } from '../lib/types';
export const SNAPSHOT_REFRESH_MS = 120000;
export const SHARED_REFRESH_MS = 300000;
export const USER_REFRESH_MS = 60000;
export const RECENT_ACTIONS_REFRESH_MS = 30000;
function useResource<T>(key: string | null, fetcher: () => Promise<T>, refreshInterval: number) {
  const result = useSWR<T>(key, fetcher, { refreshInterval, keepPreviousData: false });
  useSyncExternalStore(persistentCache.subscribe, () => key ? `${persistentCache.getFetchedAt(key) ?? ''}:${persistentCache.isRestored(key)}` : '', () => '');
  const fetchedAt = key ? persistentCache.getFetchedAt(key) : undefined;
  const cached = !!key && result.data !== undefined && persistentCache.isRestored(key);
  return { ...result, fetchedAt, cached, stale: cached || !!result.error, hasData: result.data !== undefined };
}
export const useSnapshot = () => useResource(keys.snapshotKey(), api.fetchStakeSnapshot, SNAPSHOT_REFRESH_MS);
export const useConfig = () => useResource(keys.configKey(api.getXprEndpoint()), api.fetchBlockchainConfig, SHARED_REFRESH_MS);
export const useOraclePrices = () => useResource(keys.oraclePricesKey(api.getXprEndpoint()), api.fetchPriceRows, SHARED_REFRESH_MS);
export const useRewardsPool = () => useResource(keys.rewardsPoolKey(api.getXprEndpoint()), api.fetchRewardsPool, SHARED_REFRESH_MS);
export const useBridgeBalance = () => useResource(keys.bridgeBalanceKey(api.getXprEndpoint()), api.fetchBridgeBalance, SHARED_REFRESH_MS);
export const useRaydium = () => useResource(keys.raydiumKey(), api.fetchRaydiumPool, SHARED_REFRESH_MS);
export const useDexPairs = () => useResource(keys.dexPairsKey(), api.fetchDexScreenerPairs, SHARED_REFRESH_MS);
export const useXsol = () => useResource(keys.xsolKey(), api.fetchXsolPrice, SHARED_REFRESH_MS);
export const useNewStakers = () => useResource(keys.newStakersKey(), api.fetchNewStakers, SNAPSHOT_REFRESH_MS);
export const useUserActions = (username: string) => useResource(keys.userActionsKey(api.getXprEndpoint(), username), () => api.fetchHistoryActions<ActionResponse>({limit:50, 'act.account':'storex', 'act.name':'transfer'}, username), USER_REFRESH_MS);
export const useUserBalance = (username: string) => useResource(keys.userBalanceKey(api.getXprEndpoint(), username), () => api.fetchUserBalance(username), USER_REFRESH_MS);
export const useRecentActions = (tier: string | null) => useResource(keys.recentActionsKey(api.getXprEndpoint(), tier ?? '', tier ? 100 : 30), () => api.fetchHistoryActions<ActionResponse>({limit:tier ? 100 : 30, sort:'desc', 'act.name':'transfer'}, 'storexstake'), RECENT_ACTIONS_REFRESH_MS);
