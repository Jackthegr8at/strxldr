import { useDeferredValue, useEffect, useState, useRef } from 'react';
import { STAKING_TIERS } from '../lib/leaderboard';
import type { SortField, StakingTier, VisibleColumns } from '../lib/types';

const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
  rank: true,
  username: true,
  staked: true,
  unstaked: false,
  total: false,
  usdValue: false,
  rewards: false,
};

export const useLeaderboardState = () => {
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') || '';
  });
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const [selectedTier, setSelectedTier] = useState<StakingTier | null>(() => {
    if (typeof window === 'undefined') return null;
    const tierName = new URLSearchParams(window.location.search).get('tier');
    return tierName ? STAKING_TIERS.find((tier) => tier.name === tierName) ?? null : null;
  });

  const [sortField, setSortField] = useState<SortField>(() => {
    if (typeof window === 'undefined') return 'staked';
    const value = new URLSearchParams(window.location.search).get('sort');
    const allowed: SortField[] = ['staked', 'unstaked', 'total', 'rewards'];
    return (allowed as string[]).includes(value ?? '') ? (value as SortField) : 'staked';
  });

  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? { rank: true, username: true, staked: true, unstaked: true, total: true, usdValue: true, rewards: true } : DEFAULT_VISIBLE_COLUMNS);
  const [currentPage, setCurrentPage] = useState(1);

  const restoring = useRef<string | null>(null);
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q") || "";
      const tier = STAKING_TIERS.find(item => item.name === params.get("tier")) ?? null;
      const sort = ["staked", "unstaked", "total", "rewards"].includes(params.get("sort") ?? "") ? params.get("sort") as SortField : "staked";
      restoring.current = JSON.stringify([q, tier?.name ?? null, sort]);
      setSearchTerm(q); setSelectedTier(tier); setSortField(sort);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, selectedTier, sortField]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (restoring.current !== null) {
      if (restoring.current !== JSON.stringify([deferredSearchTerm, selectedTier?.name ?? null, sortField])) return;
      restoring.current = null;
    }
    const params = new URLSearchParams(window.location.search);

    if (deferredSearchTerm) params.set('q', deferredSearchTerm);
    else params.delete('q');

    if (selectedTier) params.set('tier', selectedTier.name);
    else params.delete('tier');

    if (sortField !== 'staked') params.set('sort', sortField);
    else params.delete('sort');

    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (newUrl !== currentUrl) {
      window.history.replaceState(window.history.state, '', newUrl);
    }
  }, [deferredSearchTerm, selectedTier, sortField]);

  return {
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    selectedTier,
    setSelectedTier,
    sortField,
    setSortField,
    visibleColumns,
    setVisibleColumns,
    currentPage,
    setCurrentPage,
  };
};
