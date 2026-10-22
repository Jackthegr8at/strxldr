const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function formatOptionalNumber(value: number | null | undefined, digits?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return digits === undefined ? value.toLocaleString() : value.toFixed(digits);
}
export function getRaydiumStats(response: unknown) {
  const envelope = response as {
    success?: boolean;
    data?: unknown[];
  } | null;
  const pool = envelope?.success === true && Array.isArray(envelope.data) && envelope.data[0] && typeof envelope.data[0] === 'object' ? envelope.data[0] as Record<string, any> : {};
  const price = finite(pool.price);
  const minimum = finite(pool.week?.priceMin);
  const maximum = finite(pool.week?.priceMax);
  const midpoint = minimum !== null && maximum !== null ? (minimum + maximum) / 2 : null;
  const priceChangePercent = price !== null && minimum !== null && maximum !== null && minimum > 0 && maximum > 0 && midpoint !== null ? finite((price - midpoint) / midpoint * 100) : null;
  return {
    price,
    tvl: finite(pool.tvl),
    mintAmountA: finite(pool.mintAmountA),
    mintAmountB: finite(pool.mintAmountB),
    dayVolume: finite(pool.day?.volume),
    weekVolume: finite(pool.week?.volume),
    monthVolume: finite(pool.month?.volume),
    apr: finite(pool.day?.apr),
    feeApr: finite(pool.day?.feeApr),
    rewardApr: finite(Array.isArray(pool.day?.rewardApr) ? pool.day.rewardApr[0] : null),
    priceChangePercent
  };
}
