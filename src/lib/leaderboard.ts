import type { StakingTier } from './types';

export const TOTAL_SUPPLY = 2_000_000_000;

export const STAKING_TIERS: StakingTier[] = [
  { name: 'Whale', minimum: 20_000_000, emoji: '🐋' },
  { name: 'Shark', minimum: 10_000_000, emoji: '🦈' },
  { name: 'Dolphin', minimum: 5_000_000, emoji: '🐬' },
  { name: 'Fish', minimum: 1_000_000, emoji: '🐟' },
  { name: 'Shrimp', minimum: 500_000, emoji: '🦐' },
  { name: 'Free', minimum: 0.000001, emoji: '🆓' },
  { name: 'No Stake', minimum: 0, emoji: '🤷' },
];

export const calculateDaysUntilEmpty = (rewardsPool: number, totalStaked: number, rewardsPerSec: number) => {
  let remainingRewards = rewardsPool;
  let currentStaked = totalStaked;
  let days = 0;

  while (remainingRewards > 0 && days < 3650) {
    const dailyRewards = rewardsPerSec * 86400 * (currentStaked / totalStaked);
    remainingRewards -= dailyRewards;
    currentStaked += dailyRewards;
    days++;
  }

  return days;
};

export const getUserTier = (stakedAmount: number): StakingTier => {
  return STAKING_TIERS.find((tier, index) => {
    const nextTier = STAKING_TIERS[index - 1];
    return stakedAmount >= tier.minimum && (!nextTier || stakedAmount < nextTier.minimum);
  }) || STAKING_TIERS[STAKING_TIERS.length - 1];
};

export const cleanMemo = (memo: string) => {
  if (memo.startsWith('STRX-SPL@')) {
    return memo.replace('STRX-SPL@', '');
  }

  const solanaMatch = memo.match(/Cross-chain wrap from Solana \((.*?)\)/);
  if (solanaMatch) {
    return solanaMatch[1];
  }

  return memo;
};

export const getTransactionType = (memo: string) => {
  if (memo.startsWith('STRX-SPL@')) {
    return 'outbound';
  }
  if (memo.includes('Cross-chain wrap from Solana')) {
    return 'inbound';
  }
  return 'other';
};

export const formatTimestamp = (timestamp: Date | string) => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  });
};
