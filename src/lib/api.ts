import type {
  ActionResponse,
  BlockchainResponse,
  DexScreenerMarketData,
  DexScreenerPairsData,
  FetchResponse,
  NewStakersResponse,
  PriceResponse,
  RaydiumPoolData,
} from './types';

export const getXprEndpoint = () => import.meta.env.VITE_XPR_ENDPOINT || 'https://proton.eosusa.io';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchXprTableRows<T>(body: Record<string, unknown>, headers: HeadersInit = jsonHeaders): Promise<T> {
  return fetchJson<T>(`${getXprEndpoint()}/v1/chain/get_table_rows`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

export async function fetchStakeSnapshot(): Promise<FetchResponse> {
  const response = await fetch('https://nfts.jessytremblay.com/STRX/stakes.json');
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const lastModified = response.headers.get('last-modified') || new Date().toUTCString();
  const data = await response.json();

  return {
    data,
    lastModified,
  };
}

export const fetchBlockchainConfig = () => fetchXprTableRows<BlockchainResponse>({
  json: true,
  code: 'storexstake',
  scope: 'storexstake',
  table: 'config',
  limit: 10,
});

export const fetchPriceRows = () => fetchXprTableRows<PriceResponse>({
  json: true,
  code: 'strxoracle',
  scope: 'strxoracle',
  table: 'prices',
  limit: 9999,
  reverse: false,
  show_payer: false,
}, {
  'Content-Type': 'text/plain;charset=UTF-8',
});

export const fetchRewardsPool = () => fetchJson<string[]>(`${getXprEndpoint()}/v1/chain/get_currency_balance`, {
  method: 'POST',
  headers: jsonHeaders,
  body: JSON.stringify({
    code: 'storex',
    account: 'rewards.strx',
    symbol: 'STRX',
  }),
});

export const fetchBridgeBalance = () => fetchJson<string[]>(`${getXprEndpoint()}/v1/chain/get_currency_balance`, {
  method: 'POST',
  headers: jsonHeaders,
  body: JSON.stringify({
    code: 'storex',
    account: 'bridge.strx',
    symbol: 'STRX',
  }),
});

export const fetchHistoryActions = <T extends ActionResponse>(params: Record<string, string | number>, account: string) => {
  const baseUrl = `${getXprEndpoint()}/v2/history/get_actions`;
  const searchParams = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    account,
  });

  return fetchJson<T>(`${baseUrl}?${searchParams}`);
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
    symbol: 'STRX',
  }),
});
