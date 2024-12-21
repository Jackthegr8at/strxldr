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

export type ActionResponse = {
  actions: Array<{
    timestamp: string;
    act: {
      data: {
        from: string;
        to: string;
        quantity: string;
        memo: string;
      };
    };
    trx_id: string;
  }>;
};

export type StakingTier = {
  name: string;
  minimum: number;
  emoji: string;
};

export const STAKING_TIERS: StakingTier[] = [
  { name: 'Whale', minimum: 20000000, emoji: '🐋' },
  { name: 'Shark', minimum: 10000000, emoji: '🦈' },
  { name: 'Dolphin', minimum: 5000000, emoji: '🐬' },
  { name: 'Fish', minimum: 1000000, emoji: '🐟' },
  { name: 'Shrimp', minimum: 500000, emoji: '🦐' },
  { name: 'Free', minimum: 0, emoji: '🆓' },
];

export const fetcher = (url: string) => fetch(url).then((res) => res.json());

export const calculateRewards = (
  stakedAmount: number,
  rewardsPerSec: number,
  strxPrice: number,
  globalStaked: number
) => {
  const dailyReward = rewardsPerSec * 86400 * (stakedAmount / globalStaked);
  const monthlyReward = dailyReward * 30;
  const yearlyReward = dailyReward * 365;
  
  return {
    daily: dailyReward,
    monthly: monthlyReward,
    yearly: yearlyReward,
    dailyUsd: dailyReward * strxPrice,
    monthlyUsd: monthlyReward * strxPrice,
    yearlyUsd: yearlyReward * strxPrice,
  };
};

export type PriceResponse = {
  rows: [{
    sym: string;
    quantity: string;
  }];
};