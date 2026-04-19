export type StakeData = {
  [key: string]: {
    staked: number;
    unstaked: number;
  };
};

export type BlockchainResponse = {
  rows: [{
    stakes: string;
    rewards: string;
    rewards_sec: string;
    pool_duration_months: number;
    unstake_period_secs: number;
    stake_plans: any[];
    spare1: number;
    spare2: number;
    spare3: number;
    suspended: number;
  }];
};

export type PriceResponse = {
  rows: [{
    sym: string;
    quantity: string;
  }];
};

export type SortField = 'staked' | 'unstaked' | 'total' | 'rewards';

export type VisibleColumns = {
  rank: boolean;
  username: boolean;
  staked: boolean;
  unstaked: boolean;
  total: boolean;
  usdValue: boolean;
  rewards: boolean;
};

export type AmountDisplay = 'strx' | 'usd';

export type SectionVisibility = {
  recentActivity: boolean;
  newStakers: boolean;
  tierMilestones: boolean;
};

export type NewStaker = {
  username: string;
  total_staked: number;
  date: string;
};

export type NewStakersResponse = NewStaker[];

export type DailyDataPoint = {
  day: number;
  date: Date;
  noCompound: number;
  dailyCompound: number;
  monthlyCompound: number;
  annualCompound: number;
};

export type FetchResponse = {
  data: StakeData;
  lastModified: string;
};

export type BridgeAction = {
  "@timestamp": string;
  timestamp: string;
  act: {
    name: string;
    data: {
      from: string;
      to: string;
      amount: number;
      symbol: string;
      memo: string;
      quantity: string;
    };
  };
  trx_id: string;
};

export type ActionResponse = {
  actions: BridgeAction[];
};

export type RaydiumPoolData = {
  id: string;
  success: boolean;
  data: [{
    price: number;
    mintAmountA: number;
    mintAmountB: number;
    tvl: number;
    day: {
      volume: number;
      apr: number;
      feeApr: number;
      rewardApr: number[];
      priceMin: number;
      priceMax: number;
    };
    week: {
      volume: number;
      apr: number;
      feeApr: number;
      priceMin: number;
      priceMax: number;
      rewardApr: number[];
    };
    month: {
      volume: number;
      apr: number;
      feeApr: number;
      priceMin: number;
      priceMax: number;
      rewardApr: number[];
    };
  }];
};

export type DexScreenerPairsData = {
  pairs: Array<{
    priceUsd: string;
    volume24h: number;
    txns24h: {
      buys: number;
      sells: number;
    };
  }>;
};

export type DexScreenerData = DexScreenerPairsData;

export type DexScreenerMarketData = {
  pair: {
    baseToken: {
      symbol: string;
      name: string;
    };
    quoteToken: {
      symbol: string;
      name: string;
    };
    priceUsd: string;
    priceChange: {
      h24: number;
    };
    txns: {
      h24: {
        buys: number;
        sells: number;
      };
    };
    liquidity: {
      usd: number;
      base: number;
      quote: number;
    };
    marketCap: number;
  };
};

export type XSolPriceData = {
  0: {
    price: {
      quotes: {
        USD: number;
      };
      usd: number;
    };
  };
};

export type StakingTier = {
  name: string;
  minimum: number;
  emoji: string;
};
