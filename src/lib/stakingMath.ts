export type StakeAction = {
  time?: Date | string;
  timestamp?: string;
  amount?: number;
  type?: string;
  act?: {
    data?: {
      memo?: string;
      quantity?: string;
    };
  };
};
export type Strategy = 'noCompound' | 'dailyCompound' | 'monthlyCompound' | 'annualCompound';
export function normalizeActionTime(value: Date | string | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return NaN;
  return Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/i.test(value) ? value : `${value}Z`);
}
export function reconcileStake(snapshotStake: number, actions: readonly StakeAction[], lastModified: string | null): number {
  const base = Number.isFinite(snapshotStake) ? Math.max(0, snapshotStake) : 0;
  const cutoff = lastModified ? Date.parse(lastModified) : NaN;
  if (!Number.isFinite(cutoff)) return base;
  const value = actions.reduce((total, action) => {
    if (!(normalizeActionTime(action.time ?? action.timestamp) > cutoff)) return total;
    const amount = action.amount ?? Number.parseFloat(action.act?.data?.quantity ?? '');
    if (!Number.isFinite(amount) || amount < 0) return total;
    const type = action.type ?? action.act?.data?.memo;
    return type === 'add stake' ? total + amount : type === 'withdraw stake' ? total - amount : total;
  }, base);
  return Number.isFinite(value) ? Math.max(0, value) : base;
}
export function calculateScenarioRewards(stake: number, rewardsPerSecond: number, globalStaked: number, priceUsd: number) {
  if (![stake, rewardsPerSecond, globalStaked, priceUsd].every(Number.isFinite) || Math.min(stake, rewardsPerSecond, globalStaked, priceUsd) < 0 || globalStaked === 0) return null;
  const daily = rewardsPerSecond * 86400 * stake / globalStaked;
  const result = {
    daily,
    monthly: daily * 30,
    yearly: daily * 365,
    dailyUsd: daily * priceUsd,
    monthlyUsd: daily * 30 * priceUsd,
    yearlyUsd: daily * 365 * priceUsd
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}
export function projectStake(stake: number, dailyRate: number, elapsedDays: number, elapsedMonths: number, strategy: Strategy): number | null {
  if (![stake, dailyRate, elapsedDays, elapsedMonths].every(Number.isFinite) || Math.min(stake, dailyRate, elapsedDays, elapsedMonths) < 0) return null;
  const value = strategy === 'noCompound' ? stake * (1 + dailyRate * elapsedDays) : strategy === 'dailyCompound' ? stake * Math.pow(1 + dailyRate, elapsedDays) : strategy === 'monthlyCompound' ? stake * Math.pow(1 + dailyRate * 30, elapsedMonths) : stake * Math.pow(1 + dailyRate * 365, Math.floor(elapsedDays / 365));
  return Number.isFinite(value) ? value : null;
}
export function findDaysToTarget(stake: number, dailyRate: number, target: number, strategy: Strategy, startDate: Date = new Date(), horizon = 1825): number | null {
  if (![stake, dailyRate, target, horizon, startDate.getTime()].every(Number.isFinite) || Math.min(stake, dailyRate, target, horizon) < 0) return null;
  for (let day = 0; day <= Math.min(1825, Math.floor(horizon)); day++) {
    const amount = projectStake(stake, dailyRate, day, Math.floor(day / 30), strategy);
    if (amount !== null && amount >= target) return day;
  }
  return null;
}
