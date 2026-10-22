import type { ActionResponse, BlockchainResponse, DexScreenerMarketData, DexScreenerPairsData, FetchResponse, NewStakersResponse, PriceResponse, RaydiumPoolData, StakeData } from './types';
export const getXprEndpoint = () => import.meta.env?.VITE_XPR_ENDPOINT || 'https://proton.eosusa.io';
const jsonHeaders = {
  'Content-Type': 'application/json'
};
async function fetchJsonResponse<T>(url: string, init?: RequestInit): Promise<{
  data: T;
  headers: Headers;
  fetchedAt: number;
}> {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  if (callerSignal?.aborted) throw callerSignal.reason;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', abortFromCaller, {
    once: true
  });
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(controller.signal.reason);
  controller.signal.addEventListener('abort', onAbort, {
    once: true
  });
  const deadline = setTimeout(() => controller.abort(new DOMException('API request exceeded 10000 ms', 'TimeoutError')), 10000);
  try {
    // Race body parsing too: a mocked or noncooperative body need not honor fetch's signal.
    const request = (async () => {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const data = (await response.json()) as T;
      return {
        data,
        headers: response.headers,
        fetchedAt: Date.now()
      };
    })();
    return await Promise.race([request, aborted]);
  } finally {
    clearTimeout(deadline);
    callerSignal?.removeEventListener('abort', abortFromCaller);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return (await fetchJsonResponse<T>(url, init)).data;
}
export async function fetchXprTableRows<T>(body: Record<string, unknown>, headers: HeadersInit = jsonHeaders): Promise<T> {
  return fetchJson<T>(`${getXprEndpoint()}/v1/chain/get_table_rows`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}
export async function fetchStakeSnapshot(init?: RequestInit): Promise<FetchResponse> {
  const {
    data,
    headers
  } = await fetchJsonResponse<unknown>('https://nfts.jessytremblay.com/STRX/stakes.json', init);
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.values(data).some(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
    const entry = value as Record<string, unknown>;
    return ['staked', 'unstaked'].some(key => typeof entry[key] !== 'number' || !Number.isFinite(entry[key]) || entry[key] as number < 0);
  })) {
    throw new Error('Invalid stake snapshot payload');
  }
  const sourceTime = headers.get('last-modified');
  const parsed = sourceTime ? Date.parse(sourceTime) : NaN;
  return {
    data: data as StakeData,
    lastModified: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
    fetchedAt: Date.now()
  };
}
export const fetchBlockchainConfig = () => fetchXprTableRows<BlockchainResponse>({
  json: true,
  code: 'storexstake',
  scope: 'storexstake',
  table: 'config',
  limit: 10
});
export const fetchPriceRows = () => fetchXprTableRows<PriceResponse>({
  json: true,
  code: 'strxoracle',
  scope: 'strxoracle',
  table: 'prices',
  limit: 9999,
  reverse: false,
  show_payer: false
}, {
  'Content-Type': 'text/plain;charset=UTF-8'
});
export const fetchRewardsPool = () => fetchJson<string[]>(`${getXprEndpoint()}/v1/chain/get_currency_balance`, {
  method: 'POST',
  headers: jsonHeaders,
  body: JSON.stringify({
    code: 'storex',
    account: 'rewards.strx',
    symbol: 'STRX'
  })
});
export const fetchBridgeBalance = () => fetchJson<string[]>(`${getXprEndpoint()}/v1/chain/get_currency_balance`, {
  method: 'POST',
  headers: jsonHeaders,
  body: JSON.stringify({
    code: 'storex',
    account: 'bridge.strx',
    symbol: 'STRX'
  })
});
export const fetchHistoryActions = <T extends ActionResponse,>(params: Record<string, string | number>, account: string, init?: RequestInit) => {
  const baseUrl = `${getXprEndpoint()}/v2/history/get_actions`;
  const searchParams = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    account
  });
  return fetchJson<T>(`${baseUrl}?${searchParams}`, init);
};
export const fetchRaydiumPool = () => fetchJson<RaydiumPoolData>('https://api-v3.raydium.io/pools/info/ids?ids=5XVsERryqVvKPDMUh851H4NsSiK68gGwRg9Rpqf9yMmf');
export const fetchDexScreenerPairs = () => fetchJson<DexScreenerPairsData>('https://api.dexscreener.com/latest/dex/pairs/solana/5XVsERryqVvKPDMUh851H4NsSiK68gGwRg9Rpqf9yMmf');
export const fetchDexScreenerMarket = () => fetchJson<DexScreenerMarketData>('https://api.dexscreener.com/latest/dex/pairs/solana/5XVsERryqVvKPDMUh851H4NsSiK68gGwRg9Rpqf9yMmf');
export const fetchNewStakers = () => fetchJson<NewStakersResponse>('https://nfts.jessytremblay.com/STRX/newstakers.json');
export const fetchXsolPrice = () => fetchJson<any>('https://www.api.bloks.io/proton/tokens/XSOL-proton-xtokens');
export const fetchUserBalance = (account: string) => fetchJson<string[]>(`${getXprEndpoint()}/v1/chain/get_currency_balance`, {
  method: 'POST',
  headers: jsonHeaders,
  body: JSON.stringify({
    code: 'storex',
    account,
    symbol: 'STRX'
  })
});
