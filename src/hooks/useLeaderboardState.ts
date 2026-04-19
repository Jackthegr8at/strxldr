import { useDeferredValue, useEffect, useState } from 'react';
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

  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(DEFAULT_VISIBLE_COLUMNS);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, selectedTier, sortField]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

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
