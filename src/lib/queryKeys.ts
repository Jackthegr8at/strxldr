const key = (resource: string, ...identity: (string | number)[]) => JSON.stringify(['strxldr:v3', resource, ...identity]);
export const snapshotKey = () => key('snapshot');
export const configKey = (endpoint: string) => key('config', endpoint);
export const oraclePricesKey = (endpoint: string) => key('oraclePrices', endpoint);
export const rewardsPoolKey = (endpoint: string) => key('rewardsPool', endpoint);
export const bridgeBalanceKey = (endpoint: string) => key('bridgeBalance', endpoint);
export const raydiumKey = () => key('raydium');
export const dexPairsKey = () => key('dexPairs');
export const xsolKey = () => key('xsol');
export const newStakersKey = () => key('newStakers');
export const recentActionsKey = (endpoint: string, tier = '', limit = 30) => key('recentActions', endpoint, tier, limit);
export const userActionsKey = (endpoint: string, username: string) => key('userActions', endpoint, username);
export const userBalanceKey = (endpoint: string, username: string) => key('userBalance', endpoint, username);
export const bridgeHistoryKey = (endpoint: string, username: string | null, offset: number, limit: number) => key('bridgeHistory', endpoint, username ?? '', offset, limit);
const shared = new Set(['snapshot', 'raydium', 'dexPairs', 'xsol', 'newStakers']);
const chain = new Set(['config', 'oraclePrices', 'rewardsPool', 'bridgeBalance']);
export function isPersistableSharedKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const tuple = JSON.parse(value);
    return Array.isArray(tuple) && tuple[0] === 'strxldr:v3' && (tuple.length === 2 && shared.has(tuple[1]) || tuple.length === 3 && chain.has(tuple[1]) && typeof tuple[2] === 'string' && tuple[2].trim().length > 0);
  } catch {
    return false;
  }
}
