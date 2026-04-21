import { useState, useMemo, useEffect, useDeferredValue, useRef, Suspense, lazy } from 'react';
import useSWR from 'swr';
import { ArrowUpIcon, ArrowDownIcon, MagnifyingGlassIcon, QuestionMarkCircleIcon, ChevronUpIcon, ChevronDownIcon, CubeTransparentIcon, ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import * as React from 'react';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import { Header } from './components/Header';
import { PageFallback } from './components/PageFallback';
import { SectionHeader } from './components/SectionHeader';
import { StatisticCard } from './components/StatisticCard';
import { ColumnSelector } from './components/ColumnSelector';
import { NewStakersPanel } from './components/NewStakersPanel';
import { TierMilestoneTracker } from './components/TierMilestoneTracker';
import { RecentActionsDashboard } from './components/RecentActionsDashboard';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { calculateDaysUntilEmpty, getUserTier, STAKING_TIERS, TOTAL_SUPPLY } from './lib/leaderboard';
import { fetchBlockchainConfig, fetchBridgeBalance, fetchDexScreenerPairs, fetchHistoryActions, fetchNewStakers, fetchPriceRows, fetchRaydiumPool, fetchRewardsPool, fetchStakeSnapshot, fetchXsolPrice } from './lib/api';
import type { ActionResponse, BlockchainResponse, DexScreenerData, FetchResponse, NewStaker, NewStakersResponse, PriceResponse, RaydiumPoolData, SectionVisibility, SortField, StakingTier, VisibleColumns, XSolPriceData } from './lib/types';
import { useLeaderboardState } from './hooks/useLeaderboardState';
import { useRouteSelection } from './hooks/useRouteSelection';
import { useRouteMeta } from './hooks/useRouteMeta';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy-load pages that aren't needed on first paint
const UserPage = lazy(() => import('./UserPage'));
const UserPageNoStake = lazy(() => import('./UserPageNoStake'));
const BridgePage = lazy(() => import('./BridgePage').then(m => ({ default: m.BridgePage })));
const InfoModal = lazy(() => import('./components/InfoModal').then(m => ({ default: m.InfoModal })));
const StakersChart = lazy(() => import('./components/StakersChart').then(m => ({ default: m.StakersChart })));

const ITEMS_PER_PAGE = 10;

// Add this type for the display mode
type AmountDisplay = 'strx' | 'usd';

const calculateRewards = (
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

// Add this near the top of the file, after imports
export const UserSelectContext = React.createContext<(username: string) => void>(() => {});

// Update UsernameLink to use context
const UsernameLink: React.FC<{ username: string }> = ({ username }) => (
  <UserSelectContext.Consumer>
    {onSelect => (
      <button 
        onClick={() => onSelect(username)}
        className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
      >
        {username}
      </button>
    )}
  </UserSelectContext.Consumer>
);

export function App() {
  const { theme } = useTheme();

  // Update the SWR hook to use the shared fetchStakeSnapshot function
  const { data: response, error, isLoading } = useSWR<FetchResponse>(
    'stakes_snapshot',
    fetchStakeSnapshot,
    { refreshInterval: 120000 }  // 2 minutes (correct)
  );

  // Function to format the time difference
  const formatTimeDiff = (lastModified: string) => {
    const diff = Date.now() - new Date(lastModified).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    return 'more than a day ago';
  };

  const { data: blockchainData } = useSWR<BlockchainResponse>(
    'blockchain_data',
    fetchBlockchainConfig,
    { refreshInterval: 300000 }  // 5 minutes
  );

  // Add new SWR call for price data with a unique key
  const { data: priceData } = useSWR<PriceResponse>(
    'strx_price_data', // Unique key
    fetchPriceRows,
    { refreshInterval: 300000 }  // 5 minutes
  );

  // Add this with your other SWR fetches
  const { data: rewardsPoolData } = useSWR<any>(
    'rewards_pool',
    fetchRewardsPool,
    { refreshInterval: 300000 }  // 5 minutes
  );

  // Add this SWR hook near your other data fetches
  const { data: bridgeData } = useSWR<any>(
    'bridge_balance',
    fetchBridgeBalance,
    { refreshInterval: 300000 }  // 5 minutes
  );

  // Add with other SWR hooks
  const { data: raydiumPoolData } = useSWR<RaydiumPoolData>(
    'raydium_pool_v3',
    fetchRaydiumPool,
    { refreshInterval: 300000 }  // 5 minutes
  );

  // Add with other SWR hooks in Leaderboard component
  const { data: xsolPriceData } = useSWR<XSolPriceData>(
    'xsol_price',
    fetchXsolPrice,
    { refreshInterval: 300000 }  // 5 minutes
  );

  // Add new SWR hook in Leaderboard component
  const { data: dexScreenerData } = useSWR<DexScreenerData>(
    'dexscreener_data',
    fetchDexScreenerPairs,
    { refreshInterval: 300000 }  // 5 minutes
  );

  const appRootRef = useRef<HTMLDivElement | null>(null);

  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pageTitle, setPageTitle] = useState("STRX Staking Leaderboard");
  const [isEasterEggActive, setIsEasterEggActive] = useState(false);

  // Use shared hooks for state management
  const {
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
  } = useLeaderboardState();

  const {
    selectedUser,
    handleUserSelect,
    handleBackToLeaderboard,
    isBridgePage,
  } = useRouteSelection();

  // Update page title and meta description based on route
  useRouteMeta(isBridgePage, selectedUser);

  // Add this state
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // Add this state to track display mode for each cell
  const [amountDisplays, setAmountDisplays] = useState<{ [key: string]: AmountDisplay }>({});

  // Add this helper function to toggle display mode for a specific cell
  const toggleAmountDisplay = (username: string, field: string) => {
    setAmountDisplays(prev => ({
      ...prev,
      [`${username}-${field}`]: prev[`${username}-${field}`] === 'usd' ? 'strx' : 'usd'
    }));
  };

  // Add this helper function to format amounts
  const formatAmount = (amount: number, displayMode: AmountDisplay) => {
    if (displayMode === 'usd') {
      return `$${(amount * strxPrice).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      })}`;
    }
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
      useGrouping: true,
    });
  };

  // First, create a separate function to get all stakers data without tier filtering
  const getAllStakersData = useMemo(() => {
    if (!response?.data) return [];

    return Object.entries(response.data)
      .map(([username, amounts]) => ({
        username,
        staked: amounts.staked,
        unstaked: amounts.unstaked,
        total: amounts.staked + amounts.unstaked
      }));
  }, [response?.data]);

  // Update tierStatistics to use getAllStakersData instead of processedData
  const tierStatistics = useMemo(() => {
    if (!getAllStakersData.length) return null;

    const tiers = STAKING_TIERS.map((tier, index) => {
      const nextTier = STAKING_TIERS[index - 1];
      return {
        ...tier,
        count: getAllStakersData.filter(user => {
          const amount = user.staked;
          
          // Special handling for "No Stake" tier
          if (tier.name === 'No Stake') {
            return amount === 0;
          }
          
          // If this is the highest tier, only check minimum
          if (!nextTier) {
            return amount >= tier.minimum;
          }
          // Otherwise, check if amount is between this tier's minimum and next tier's minimum
          return amount >= tier.minimum && amount < nextTier.minimum;
        }).length
      };
    });

    return tiers;
  }, [getAllStakersData]);

  // Update processedData to use getAllStakersData as its base
  const processedData = useMemo(() => {
    const needle = deferredSearchTerm.toLowerCase();
    return getAllStakersData
      .filter(item => needle === '' || item.username.toLowerCase().includes(needle))
      .filter((item) => {
        // If no tier is selected, show all
        if (!selectedTier) return true;
        
        // Special handling for "No Stake" tier
        if (selectedTier.name === 'No Stake') {
          return item.staked === 0;
        }
        
        // Find the index of the selected tier
        const tierIndex = STAKING_TIERS.findIndex(t => t.name === selectedTier.name);
        const nextTierUp = STAKING_TIERS[tierIndex - 1];
        
        // For "Whale" tier (first tier)
        if (selectedTier.name === 'Whale') {
          return item.staked >= selectedTier.minimum;
        }
        
        // For all other tiers
        return item.staked >= selectedTier.minimum && 
               (!nextTierUp || item.staked < nextTierUp.minimum);
      })
      .sort((a, b) => {
        const compareValue = sortOrder === 'desc' ? -1 : 1;
        const field = sortField === 'rewards' ? 'staked' : sortField;
        return (a[field] - b[field]) * compareValue;
      });
  }, [getAllStakersData, deferredSearchTerm, selectedTier, sortOrder, sortField]);

  const totalPages = Math.ceil(processedData.length / ITEMS_PER_PAGE);
  const currentData = processedData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const topHolders = useMemo(() => {
    return processedData.slice(0, 15);
  }, [processedData]);

  // Format large numbers (in millions)
  const formatLargeNumber = (value: number) => {
    return (value / 1000000).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }) + 'M';
  };

  // Calculate total tokens for current page
  const currentPageTotal = currentData.reduce((sum, item) => sum + item.total, 0);

  // Calculate total of all stakes
  const totalStakes = useMemo(() => {
    return processedData.reduce((sum, item) => sum + item.total, 0);
  }, [processedData]);

  // Get global staked amount
  const globalStaked = useMemo(() => {
    if (!blockchainData?.rows?.[0]?.stakes) return 0;
    const stakesStr = blockchainData.rows[0].stakes;
    return Number(stakesStr.split(' ')[0]);
  }, [blockchainData]);

  // Calculate statistics
  const statistics = useMemo(() => {
    if (!processedData.length) return null;

    const totalUsers = processedData.length;
    const totalStaked = processedData.reduce((sum, item) => sum + item.staked, 0);
    
    // Calculate median of staked amounts
    const sortedAmounts = [...processedData].sort((a, b) => a.staked - b.staked);
    const midPoint = Math.floor(sortedAmounts.length / 2);
    const median = sortedAmounts.length % 2 === 0
      ? (sortedAmounts[midPoint - 1].staked + sortedAmounts[midPoint].staked) / 2
      : sortedAmounts[midPoint].staked;

    // Calculate average of staked amounts
    const average = totalStaked / totalUsers;

    // Get min and max stakes
    const minStake = sortedAmounts[0].staked;
    const maxStake = sortedAmounts[sortedAmounts.length - 1].staked;

    return {
      totalUsers,
      totalStaked,
      median,
      average,
      minStake,
      maxStake
    };
  }, [processedData]);

  // Get STRX price
  const strxPrice = useMemo(() => {
    if (!priceData?.rows) return 0;
    const strxRow = priceData.rows.find(row => row.sym === '4,STRX');
    return strxRow ? parseFloat(strxRow.quantity.split(' ')[0]) : 0;
  }, [priceData]);

  const handleEasterEgg = (tier: StakingTier | null, username?: string) => {
    // Animate a scoped container, not the <body>, so the page doesn't jump
    const target = appRootRef.current;
    const clearAnims = () => {
      target?.classList.remove('shake-animation', 'splash-animation', 'bounce-animation');
    };
    clearAnims();

    // Simplified check for testing
    if (username === 'jordanhinks' || username === 'jackthegreat') {
      setPageTitle("Future Billionaires List 🚀");
      target?.classList.add('bounce-animation');
      window.setTimeout(clearAnims, 1000);
      return;
    }

    // If toggling the same tier off, reset to the default title
    if (selectedTier?.name === tier?.name) {
      setIsEasterEggActive(false);
      setPageTitle("STRX Staking Leaderboard");
      return;
    }

    setIsEasterEggActive(true);

    if (tier?.name === 'Free') {
      setPageTitle("NGMI Leaderboard 😢");
      target?.classList.add('shake-animation');
    } else if (tier?.name === 'Whale') {
      setPageTitle("🐋 Whale Alert! 🚨");
      target?.classList.add('splash-animation');
    } else if (tier?.name === 'Shrimp') {
      setPageTitle("Shrimps Together Strong 🦐");
      target?.classList.add('bounce-animation');
    } else {
      setPageTitle("STRX Staking Leaderboard");
    }

    window.setTimeout(clearAnims, 1000);
  };

  // Update visibleColumns state based on screen size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        // Show all columns on desktop
        setVisibleColumns({
          rank: true,
          username: true,
          staked: true,
          unstaked: true,
          total: true,
          usdValue: true,
          rewards: true,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Call once on mount
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Add new SWR fetch for new stakers inside the Leaderboard function
  const { data: newStakersData } = useSWR<NewStakersResponse>(
    'new_stakers',
    fetchNewStakers,
    { refreshInterval: 120000 }  // 2 minute
  );

  // Move processedNewStakers inside the Leaderboard function
  const processedNewStakers = useMemo(() => {
    if (!newStakersData) return [];

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    return newStakersData
      .filter(staker => {
        const stakerDate = new Date(staker.date);
        return stakerDate >= oneWeekAgo;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .reduce((acc, staker) => {
        const stakerDate = new Date(staker.date);
        // Include all stakers from last 24 hours
        if (stakerDate >= oneDayAgo) {
          return [...acc, staker];
        }
        // Only include up to 10 stakers total
        if (acc.length < 10) {
          return [...acc, staker];
        }
        return acc;
      }, [] as NewStaker[]);
  }, [newStakersData]);

  // Inside your Leaderboard component, add this state
  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(() => {
    const saved = localStorage.getItem('sectionVisibility');
    return saved ? JSON.parse(saved) : {
      recentActivity: true,
      newStakers: true,
      tierMilestones: true
    };
  });

  useEffect(() => {
    localStorage.setItem('sectionVisibility', JSON.stringify(sectionVisibility));
  }, [sectionVisibility]);

  // Ensure priceUsd is defined before using toFixed
  const priceUsd = dexScreenerData?.pairs?.[0]?.priceUsd;
  const priceUsdDisplay = priceUsd !== undefined
    ? `$${parseFloat(priceUsd).toFixed(6)}`
    : 'N/A'; // or any default value you prefer

  // Get price from the Raydium pool data
  const raydiumPrice = raydiumPoolData?.data?.[0]?.price;
  const raydiumPriceDisplay = raydiumPrice !== undefined
    ? `$${raydiumPrice.toFixed(6)}`
    : 'N/A';

  // For price changes, use week data instead of day data since day data has -1 values
  const weekPriceMin = raydiumPoolData?.data?.[0]?.week?.priceMin;
  const weekPriceMax = raydiumPoolData?.data?.[0]?.week?.priceMax;
  let raydiumPriceChangePercent: number | undefined;

  if (raydiumPrice !== undefined && weekPriceMin !== undefined && weekPriceMin > 0 && weekPriceMax !== undefined && weekPriceMax > 0) {
    // Calculate a rough change percentage based on week range
    const priceMid = (weekPriceMin + weekPriceMax) / 2;
    raydiumPriceChangePercent = ((raydiumPrice - priceMid) / priceMid) * 100;
  }

  const raydiumPriceChangeDisplay = raydiumPriceChangePercent !== undefined
    ? `${raydiumPriceChangePercent > 0 ? '+' : ''}${raydiumPriceChangePercent.toFixed(2)}%`
    : 'N/A';

  // Check route-specific content only after every hook above has been called.
  if (isBridgePage) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <BridgePage />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (selectedUser) {
    if (isLoading || !response) {
      return <PageFallback />;
    }

    const userData = response?.data?.[selectedUser];

    if (!userData) {
      return (
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <UserPageNoStake
              username={selectedUser}
              onBack={handleBackToLeaderboard}
            />
          </Suspense>
        </ErrorBoundary>
      );
    }

    return (
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <UserPage
            username={selectedUser}
            onBack={handleBackToLeaderboard}
            userData={userData}
            globalData={{
              blockchainData,
              priceData,
              lastModified: response.lastModified
            }}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <UserSelectContext.Provider value={handleUserSelect}>
      <div ref={appRootRef} id="app-root" className="min-h-screen bg-background text-foreground">
        <Header />
        <div className="container mx-auto px-4 md:px-20 md:py-12 py-8">
          <div className="flex justify-between items-center mb-6">
            {/* Title on the left */}
            <div className="relative group">
              <h1
                className="flex items-center gap-2 text-2xl md:text-3xl font-bold text-purple-700 dark:text-purple-400"
              >
                {pageTitle}
              </h1>
            </div>
            
            {/* Stake button on the right */}
            <a 
              href="https://storex.io/account/staking"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-purple-600 hover:bg-purple-700 dark:hover:bg-purple-500 px-4 py-2 text-white font-bold rounded-lg transition-colors"
            >
              <span>Stake STRX</span>
            </a>
          </div>

          {/* Last update info with info button */}
          {response?.lastModified && (
            <div className="flex justify-between items-center text-sm mb-4">
              <span className="text-gray-500 italic dark:text-gray-300">
                Last updated {formatTimeDiff(response.lastModified)}
              </span>
              <button
                onClick={() => setIsInfoModalOpen(true)}
                className="p-2 inline-flex items-center gap-2 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
                aria-label="About STRX Staking Leaderboard"
              >
                <QuestionMarkCircleIcon className="h-6 w-6" />
              </button>
            </div>
          )}

          {/* Add the modal component */}
          <Suspense fallback={null}>
            <InfoModal 
              isOpen={isInfoModalOpen} 
              onClose={() => setIsInfoModalOpen(false)} 
            />
          </Suspense>

          {/* Statistics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <StatisticCard
              title="Total Stakers"
              value={statistics?.totalUsers.toLocaleString()}
              tooltip="Total number of unique addresses that currently have STRX tokens staked"
            />

            <StatisticCard
              title="Total Staked (Cleos Call)"
              value={
                <div className="flex flex-col">
                  {formatAmount(
                    statistics?.totalStaked || 0,
                    amountDisplays['statistics-totalStaked'] || 'strx'
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-300">
                    ({((statistics?.totalStaked || 0) / TOTAL_SUPPLY * 100).toFixed(2)}% of supply)
                  </span>
                </div>
              }
              tooltip="Total amount of STRX tokens currently staked in the protocol. Click to toggle between STRX and USD values."
              onClick={() => toggleAmountDisplay('statistics', 'totalStaked')}
            />

            <StatisticCard
              title="Global Staked (API)"
              value={
                <div className="flex flex-col">
                  {formatAmount(
                    globalStaked,
                    amountDisplays['statistics-globalStaked'] || 'strx'
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-300">
                    ({(globalStaked / TOTAL_SUPPLY * 100).toFixed(2)}% of supply)
                  </span>
                </div>
              }
              tooltip="Total staked amount reported by the blockchain API. May differ slightly from Cleos call due to timing differences."
              onClick={() => toggleAmountDisplay('statistics', 'globalStaked')}
            />

            <StatisticCard
              title="Average Stake"
              value={formatAmount(
                statistics?.average || 0,
                amountDisplays['statistics-average'] || 'strx'
              )}
              tooltip="Average amount of STRX tokens staked per user. Click to toggle between STRX and USD values."
              onClick={() => toggleAmountDisplay('statistics', 'average')}
            />

            <StatisticCard
              title="Median Stake"
              value={formatAmount(
                statistics?.median || 0,
                amountDisplays['statistics-median'] || 'strx'
              )}
              tooltip="The middle value of all stake amounts. 50% of stakers have more than this amount, 50% have less."
              onClick={() => toggleAmountDisplay('statistics', 'median')}
            />

            <StatisticCard
              title="Stake Range"
              value={
                <div className="flex flex-col">
                  <span className="text-sm">
                    {formatAmount(
                      statistics?.minStake || 0,
                      amountDisplays['statistics-range'] || 'strx'
                    )}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-300">to</span>
                  <span className="text-sm">
                    {formatAmount(
                      statistics?.maxStake || 0,
                      amountDisplays['statistics-range'] || 'strx'
                    )}
                  </span>
                </div>
              }
              tooltip="The range between the smallest and largest stake amounts in the system. Click to toggle between STRX and USD values."
              onClick={() => toggleAmountDisplay('statistics', 'range')}
            />

            <StatisticCard
              title="Rewards Pool"
              value={
                <div className="flex flex-col">
                  <span>
                    {rewardsPoolData?.[0] 
                      ? parseFloat(rewardsPoolData[0]).toLocaleString() 
                      : '...'} STRX
                  </span>
                  {blockchainData?.rows?.[0] && rewardsPoolData?.[0] && (
                    <span className="text-xs text-gray-500 dark:text-gray-300">
                      ~{calculateDaysUntilEmpty(
                        parseFloat(rewardsPoolData[0]),
                        parseFloat(blockchainData.rows[0].stakes.split(' ')[0]),
                        parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0])
                      ).toLocaleString()} days until empty
                    </span>
                  )}
                </div>
              }
              tooltip="Current rewards pool balance and estimated days until depletion assuming daily compounding"
            />

            <StatisticCard
              title="Bridge Balance"
              value={
                bridgeData?.[0] && raydiumPrice ? (
                  <div className="flex flex-col">
                    <span>{parseFloat(bridgeData[0]).toLocaleString()} STRX</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ≈ ${(parseFloat(bridgeData[0]) * raydiumPrice).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  </div>
                ) : '...'
              }
              tooltip="Current STRX balance in the bridge contract. Click to view bridge dashboard."
              onClick={() => {
                window.location.pathname = '/bridge';
              }}
            >
              <ArrowTopRightOnSquareIcon 
                className="absolute bottom-2 right-2 h-5 w-5 text-gray-400 hover:text-purple-600 transition-colors" 
                title="View Bridge Dashboard"
              />
            </StatisticCard>

            <StatisticCard
              title="STRX Price"
              value={`$${strxPrice.toLocaleString(undefined, {
                minimumFractionDigits: 6,
                maximumFractionDigits: 6,
                useGrouping: true,
              })}`}
              tooltip="Current market price of STRX token, updated every 2 minutes from the blockchain oracle"
            />

            <StatisticCard
              title="STRX/SOL Pool"
              value={
                raydiumPoolData?.success && raydiumPoolData?.data && raydiumPoolData.data.length > 0 ? (
                  <div className="flex flex-col">
                    <span>{raydiumPoolData.data[0].price.toFixed(8)} SOL</span>
                    <span className="text-xs text-gray-500 dark:text-gray-300">
                      TVL: ${raydiumPoolData.data[0].tvl.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-300">
                      24h Vol: ${raydiumPoolData.data[0].day.volume.toLocaleString()}
                    </span>
                    <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">
                      Liquidity:
                      <div className="flex items-center gap-1 ml-2">
                        <img 
                          src="/favicon-128.webp" 
                          alt="STRX" 
                          className="w-4 h-4"
                        />
                        {raydiumPoolData.data[0].mintAmountA.toLocaleString()} STRX
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <img 
                          src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" 
                          alt="SOL" 
                          className="w-4 h-4 rounded-full"
                        />
                        {raydiumPoolData.data[0].mintAmountB.toLocaleString()} SOL
                      </div>
                    </div>
                  </div>
                ) : 'Loading...'
              }
              tooltip="STRX price and pool stats from Raydium"
            />

            <StatisticCard
              title="Trading Activity"
              value={
                raydiumPoolData ? (
                  <div className="flex flex-col">
                    <span className="text-xs text-green-500">
                      Reward APR: {raydiumPoolData.data[0].day.rewardApr[0].toFixed(2)}%
                    </span>
                    <div className="text-xs  text-gray-500 dark:text-gray-300 mt-1">
                      Volume:
                      <div className="ml-2">
                        24h: ${raydiumPoolData.data[0].day.volume.toLocaleString()}<br/>
                        7d: ${raydiumPoolData.data[0].week.volume.toLocaleString()}<br/>
                        30d: ${raydiumPoolData.data[0].month.volume.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ) : 'Loading...'
              }
              tooltip="Trading volume and APR stats from Raydium"
            />

            <StatisticCard
              title="Market Stats"
              value={
                raydiumPoolData?.success && raydiumPoolData?.data && raydiumPoolData.data.length > 0 ? (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span>{raydiumPriceDisplay}</span>
                      <span className={`text-sm ${
                        raydiumPriceChangePercent !== undefined && raydiumPriceChangePercent >= 0 
                          ? 'text-green-500' 
                          : 'text-red-500'
                      }`}>
                        {raydiumPriceChangeDisplay}
                      </span>
                    </div>
                    {raydiumPoolData.data[0].tvl !== undefined && (
                      <span className="text-xs text-gray-500 dark:text-gray-300">
                        TVL: ${raydiumPoolData.data[0].tvl.toLocaleString()}
                      </span>
                    )}
                    {raydiumPoolData.data[0].day?.apr !== undefined && (
                      <div className="text-xs text-gray-500 dark:text-gray-300">
                        APR: {raydiumPoolData.data[0].day.apr.toFixed(2)}%
                        <span className="ml-2">
                          (Fee: {raydiumPoolData.data[0].day.feeApr.toFixed(2)}%)
                        </span>
                      </div>
                    )}
                  </div>
                ) : 'Loading...'
              }
              tooltip="Market statistics from Raydium"
            />
          </div>

          {/* Staking Tiers Dashboard */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Staking Tiers Distribution</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {tierStatistics?.map((tier) => (
                <div
                  key={tier.name}
                  onClick={() => {
                    setSelectedTier(selectedTier?.name === tier.name ? null : tier);
                    handleEasterEgg(tier);
                  }}
                  className={`tier-card p-4 rounded-lg shadow border cursor-pointer ${
                    selectedTier?.name === tier.name 
                      ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400  transition-colors' 
                      : 'hover:bg-purple-200 dark:hover:bg-purple-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{tier.emoji}</span>
                    <span className="text-sm text-muted-foreground dark:text-gray-300">{tier.name}</span>
                  </div>
                  <div className="text-xl font-semibold text-primary dark:text-purple-400">
                    {tier.count > 0 ? tier.count.toLocaleString() : 'X'}
                  </div>
                  <div className="text-xs text-muted-foreground dark:text-gray-300">
                   {tier.minimum > 0 ? tier.minimum.toLocaleString() + '+ STRX' : 'Nada'} 
                  </div>
                </div>
              ))}
            </div>
          </div>

          <TierMilestoneTracker 
            stakersData={processedData}
            setSearchTerm={setSearchTerm}
            selectedTier={selectedTier}
            sectionVisibility={sectionVisibility}
            setSectionVisibility={setSectionVisibility}
            SectionHeader={SectionHeader}
          />

          {/* Add the recent actions dashboard */}
          <div className="mb-8">
            <SectionHeader
              title="Recent Staking Activity"
              sectionKey="recentActivity"
              isVisible={sectionVisibility.recentActivity}
              onToggle={() => setSectionVisibility(prev => ({
                ...prev,
                recentActivity: !prev.recentActivity
              }))}
            />
            
            {sectionVisibility.recentActivity && (
              <RecentActionsDashboard 
                strxPrice={strxPrice}
                stakersData={response?.data}
                setSearchTerm={setSearchTerm}
                selectedTier={selectedTier}
              />
            )}
          </div>

          {/* Add the new stakers panel before the leaderboard table */}
          <NewStakersPanel 
            newStakers={processedNewStakers}
            strxPrice={strxPrice}
          />

          {selectedTier?.name !== 'No Stake' && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Top 15 Holders Distribution</h2>
              <div className="h-64 w-full">
                <Suspense fallback={null}>
                  <StakersChart 
                    topHolders={topHolders}
                    sortField={sortField}
                    formatLargeNumber={formatLargeNumber}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* Add the stakers list section */}
          <div className="mt-8">
            <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="relative">
                <MagnifyingGlassIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                />
                <label htmlFor="staker-search" className="sr-only">
                  Search by username
                </label>
                <input
                  id="staker-search"
                  type="search"
                  placeholder="Search by username..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full md:w-72 pl-9 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-purple-500
                           bg-white dark:bg-gray-800
                           text-gray-900 dark:text-gray-100
                           placeholder-gray-500 dark:placeholder-gray-400"
                />
                {searchTerm && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
                <ColumnSelector 
                  visibleColumns={visibleColumns} 
                  setVisibleColumns={setVisibleColumns}
                  setSortField={setSortField}
                />
                <div className="hidden md:flex items-center gap-2">
                  <span className="text-gray-600">Sort by:</span>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300">
                        Sort by
                        <ChevronDownIcon className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 min-w-[150px] mt-2 z-50 border border-purple-100 dark:border-purple-800"
                      sideOffset={5}
                    >
                      <DropdownMenuItem className="outline-none">
                        <button 
                          onClick={() => setSortField('staked')}
                          className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                        >
                          Staked Amount
                        </button>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="outline-none">
                        <button 
                          onClick={() => setSortField('unstaked')}
                          className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                        >
                          Unstaked Amount
                        </button>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="outline-none">
                        <button 
                          onClick={() => setSortField('total')}
                          className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                        >
                          Total Amount
                        </button>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="outline-none">
                        <button 
                          onClick={() => setSortField('rewards')}
                          className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                        >
                          Estimated Rewards
                        </button>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

          {selectedTier?.name !== 'No Stake' && (
            <div className="bg-card rounded-lg shadow overflow-hidden">
              <table className="table-custom">
                <thead>
                  <tr>
                    {visibleColumns.rank && (
                      <th className="w-12">Rank</th>
                    )}
                    {visibleColumns.username && (
                      <th className="w-40">Username</th>
                    )}
                    {visibleColumns.staked && (
                      <th>Staked Amount</th>
                    )}
                    {visibleColumns.unstaked && (
                      <th>Unstaked Amount</th>
                    )}
                    {visibleColumns.total && (
                      <th>Total Amount</th>
                    )}
                    {visibleColumns.usdValue && (
                      <th>USD Value</th>
                    )}
                    {visibleColumns.rewards && (
                      <th className="min-w-[200px]">Estimated Rewards</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {currentData.length === 0 && (
                    <tr>
                      <td
                        colSpan={Object.values(visibleColumns).filter(Boolean).length || 1}
                        className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                      >
                        {isLoading ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin h-5 w-5 border-2 border-purple-600 border-t-transparent rounded-full" />
                            Loading stakers…
                          </div>
                        ) : deferredSearchTerm ? (
                          <>No stakers match <span className="font-semibold">"{deferredSearchTerm}"</span>.</>
                        ) : selectedTier ? (
                          <>No stakers in the <span className="font-semibold">{selectedTier.name}</span> tier yet.</>
                        ) : (
                          <>No staker data available.</>
                        )}
                      </td>
                    </tr>
                  )}
                  {currentData.map((item, index) => (
                    <tr key={item.username} className="hover:bg-purple-50">
                      {visibleColumns.rank && (
                        <td className="px-2 py-4 text-sm text-gray-900 w-12">
                          <div className="flex items-center gap-1">
                            {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                            {(currentPage === 1 && index < 3) && (
                              <span className="text-yellow-500" title={`Top ${index + 1} Holder`}>
                                {index === 0 ? '👑' : index === 1 ? '🥈' : '🥉'}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.username && (
                        <td className="px-2 py-4 text-sm text-gray-900 w-40">
                          <div className="flex items-center gap-1">
                            <span title={getUserTier(item.staked).name}>
                              {getUserTier(item.staked).emoji}
                            </span>
                            <UsernameLink username={item.username} />
                            <a 
                              href={`https://explorer.xprnetwork.org/account/${item.username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-purple-600 transition-colors"
                              title="View on Blockchain Explorer"
                            >
                              <CubeTransparentIcon className="h-4 w-4" />
                            </a>
                          </div>
                        </td>
                      )}
                      {visibleColumns.staked && (
                        <td 
                          className="px-6 py-4 text-sm text-gray-900 cursor-pointer hover:text-purple-600"
                          onClick={() => {
                            toggleAmountDisplay(item.username, 'staked');
                            handleEasterEgg(null, item.username);
                          }}
                        >
                          <div className="flex flex-col">
                            {formatAmount(
                              item.staked, 
                              amountDisplays[`${item.username}-staked`] || 'strx'
                            )}
                            <span className="text-xs text-gray-500 dark:text-gray-300">
                              ({(item.staked / TOTAL_SUPPLY * 100).toFixed(4)}%)
                            </span>
                          </div>
                        </td>
                      )}
                      {visibleColumns.unstaked && (
                        <td 
                          className="px-6 py-4 text-sm text-gray-900 cursor-pointer hover:text-purple-600"
                          onClick={() => {
                            toggleAmountDisplay(item.username, 'unstaked');
                            handleEasterEgg(null, item.username);
                          }}
                        >
                          <div className="flex flex-col">
                            {formatAmount(
                              item.unstaked, 
                              amountDisplays[`${item.username}-unstaked`] || 'strx'
                            )}
                            <span className="text-xs text-gray-500 dark:text-gray-300">
                              ({(item.unstaked / TOTAL_SUPPLY * 100).toFixed(4)}%)
                            </span>
                          </div>
                        </td>
                      )}
                      {visibleColumns.total && (
                        <td 
                          className="px-6 py-4 text-sm text-gray-900 cursor-pointer hover:text-purple-600"
                          onClick={() => {
                            toggleAmountDisplay(item.username, 'total');
                            handleEasterEgg(null, item.username);
                          }}
                        >
                          <div className="flex flex-col">
                            {formatAmount(
                              item.total, 
                              amountDisplays[`${item.username}-total`] || 'strx'
                            )}
                            <span className="text-xs text-gray-500 dark:text-gray-300">
                              ({(item.total / TOTAL_SUPPLY * 100).toFixed(4)}%)
                            </span>
                          </div>
                        </td>
                      )}
                      {visibleColumns.usdValue && (
                        <td 
                          className="px-6 py-4 text-sm text-gray-900 cursor-pointer hover:text-purple-600"
                          onClick={() => {
                            toggleAmountDisplay(item.username, 'usdValue');
                            handleEasterEgg(null, item.username);
                          }}
                        >
                          {formatAmount(
                            item.total,
                            amountDisplays[`${item.username}-usdValue`] || 'usd'
                          )}
                        </td>
                      )}
                      {visibleColumns.rewards && (
                        <td className="px-4 py-4 text-sm cursor-pointer hover:text-purple-600 min-w-[220px]">
                          {(() => {
                            const rewardsPerSec = blockchainData?.rows[0]?.rewards_sec 
                              ? parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0])
                              : 0;
                            
                            const rewards = calculateRewards(
                              item.staked, 
                              rewardsPerSec, 
                              strxPrice,
                              blockchainData?.rows[0]?.stakes ? parseFloat(blockchainData.rows[0].stakes.split(' ')[0]) : 0
                            );
                            const isUsd = amountDisplays[`${item.username}-rewards`] === 'usd';

                            return (
                              <div className="flex flex-col items-start">
                                <span>
                                  Daily: {isUsd 
                                    ? `$${rewards.dailyUsd.toFixed(2)}` 
                                    : `${rewards.daily.toFixed(4)}`}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-300">
                                  Monthly: {isUsd 
                                    ? `$${rewards.monthlyUsd.toFixed(2)}` 
                                    : `${rewards.monthly.toFixed(4)}`}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-300">
                                  Yearly: {isUsd 
                                    ? `$${rewards.yearlyUsd.toFixed(2)}` 
                                    : `${rewards.yearly.toFixed(4)}`}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          

            {/* Add pagination controls */}
            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-sm text-gray-600 text-center md:text-left dark:text-gray-300">
                Page Total: {currentPageTotal.toLocaleString(undefined, {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                  useGrouping: true,
                })}
              </div>
              <div className="flex items-center gap-2 justify-center md:justify-end">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600 px-2 dark:text-gray-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UserSelectContext.Provider>
  );
}

export default App;
// smapshot version
// 1.2.0