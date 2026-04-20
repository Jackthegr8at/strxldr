import { useState, useMemo, useEffect, useDeferredValue, useRef, Suspense, lazy } from 'react';
import useSWR from 'swr';
import { ArrowUpIcon, ArrowDownIcon, MagnifyingGlassIcon, QuestionMarkCircleIcon, ChevronUpIcon, ChevronDownIcon, CubeTransparentIcon, ArrowLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ThemeProvider, useTheme } from './components/ThemeProvider';
import { Header } from './components/Header';
import { PageFallback } from './components/PageFallback';
import { StatisticCard } from './components/StatisticCard';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { calculateDaysUntilEmpty, getUserTier, STAKING_TIERS, TOTAL_SUPPLY } from './lib/leaderboard';
import { fetchBlockchainConfig, fetchBridgeBalance, fetchDexScreenerPairs, fetchHistoryActions, fetchNewStakers, fetchPriceRows, fetchRaydiumPool, fetchRewardsPool, fetchStakeSnapshot, fetchXsolPrice } from './lib/api';
import type { ActionResponse, BlockchainResponse, DexScreenerData, FetchResponse, NewStaker, NewStakersResponse, PriceResponse, RaydiumPoolData, StakingTier, XSolPriceData } from './lib/types';
import { useLeaderboardState } from './hooks/useLeaderboardState';
import { useRouteSelection } from './hooks/useRouteSelection';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

// Lazy-load pages that aren't needed on first paint
const UserPage = lazy(() => import('./UserPage'));
const UserPageNoStake = lazy(() => import('./UserPageNoStake'));
const BridgePage = lazy(() => import('./BridgePage').then(m => ({ default: m.BridgePage })));

type StakeData = {
  [key: string]: {
    staked: number;
    unstaked: number;
  };
};

const ITEMS_PER_PAGE = 10;

type SortField = 'staked' | 'unstaked' | 'total' | 'rewards';

type VisibleColumns = {
  rank: boolean;
  username: boolean;
  staked: boolean;
  unstaked: boolean;
  total: boolean;
  usdValue: boolean;
  rewards: boolean;
};

type ColumnSelectorProps = {
  visibleColumns: VisibleColumns;
  setVisibleColumns: React.Dispatch<React.SetStateAction<VisibleColumns>>;
  setSortField: React.Dispatch<React.SetStateAction<SortField>>;
};

// Add this component
const ColumnSelector: React.FC<ColumnSelectorProps> = ({ 
  visibleColumns, 
  setVisibleColumns,
  setSortField
}) => {
  // Check if we're on mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Add resize listener
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Only render on mobile
  if (!isMobile) {
    return null;
  }

  return (
    <div className="mb-4">
      <label className="block text-sm text-gray-600 mb-1 dark:text-gray-300">
        Select additional column:
      </label>
      <select
        className="w-full px-3 py-2 
                   border border-gray-300 dark:border-gray-600 rounded-lg 
                   focus:outline-none focus:ring-2 focus:ring-purple-500 
                   bg-white dark:bg-gray-800 
                   text-gray-900 dark:text-gray-100"
        value={Object.entries(visibleColumns)
          .filter(([key]) => !['rank', 'username'].includes(key))
          .filter(([_, value]) => value)
          .map(([key]) => key)[0]}
        onChange={(e) => {
          const selected = e.target.value;

          // Update visible columns
          const newVisibleColumns = {
            rank: true,
            username: true,
            staked: selected === 'staked',
            unstaked: selected === 'unstaked',
            total: selected === 'total',
            usdValue: selected === 'usdValue',
            rewards: selected === 'rewards',
          };
          
          setVisibleColumns(newVisibleColumns);

          // Update sort field based on selection
          if (selected === 'usdValue') {
            setSortField('total'); // Sort by total amount when USD is selected
          } else {
            setSortField(selected as SortField); // Sort by the selected column
          }
        }}
      >
        <option value="staked">Staked Amount</option>
        <option value="unstaked">Unstaked Amount</option>
        <option value="total">Total Amount</option>
        <option value="usdValue">USD Value</option>
        <option value="rewards">Estimated Rewards</option>
      </select>
      <p className="text-xs text-gray-500 mt-1">
        Rank and Username are always visible
      </p>
    </div>
  );
};

// Add this type
type InfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

// Add this component
const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Esc to close, prevent body scroll, and focus the close button when opened
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    // Defer focus so the button exists in DOM
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
      onClick={(e) => {
        // Close when clicking backdrop (but not the modal body)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
        {/* Close button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 z-10 p-1 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content container with padding */}
        <div className="p-4 md:p-6">
          <h2 id="info-modal-title" className="text-xl md:text-2xl font-bold text-purple-700 dark:text-purple-400 mb-4">
            About STRX Staking Leaderboard
          </h2>
          
          <div className="prose prose-sm md:prose max-w-none space-y-4">
            <p>
              Welcome to the STRX Staking Leaderboard! This platform provides real-time tracking 
              of STOREX token staking positions across the community.
            </p>
            
            <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400">Features:</h3>
            
            <ul className="list-disc pl-5 space-y-2">
              <li className="text-sm md:text-base">View detailed staking statistics and distribution</li>
              <li className="text-sm md:text-base">Track top holders and their staking positions</li>
              <li className="text-sm md:text-base">Real-time statistics with automatic 2-minute updates</li>
              <li className="text-sm md:text-base">Toggle between STRX and USD values by clicking on amounts</li>
              <li className="text-sm md:text-base">Live staking activity dashboard showing recent stakes and withdrawals</li>
              <li className="text-sm md:text-base">New staker detection and highlighting</li>
              <li className="text-sm md:text-base">Percentage of total supply for staked amounts</li>
              <li className="text-sm md:text-base">Sortable leaderboard with search functionality</li>
              <li className="text-sm md:text-base">Find some easter eggs</li>
            </ul>

            <p className="text-sm md:text-base mt-4">
              The leaderboard updates every 30 minutes to provide the most current staking data. 
              USD price is updated every 2 minutes. Users are categorized into tiers (Whale, 
              Shark, Dolphin, etc.) based on their total STRX holdings.
            </p>
          </div>
        </div>

        {/* Footer with close button */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 dark:bg-purple-700 text-white rounded-lg 
                     hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors 
                     text-sm md:text-base"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Add this type for the display mode
type AmountDisplay = 'strx' | 'usd';

// Add this component for the recent actions dashboard
const RecentActionsDashboard: React.FC<{
  strxPrice: number;
  stakersData?: StakeData;
  setSearchTerm: (term: string) => void;
  selectedTier: StakingTier | null;
}> = ({ strxPrice, stakersData, setSearchTerm, selectedTier }) => {
  const { data: actionsData } = useSWR<ActionResponse>(
    ['recent_actions', selectedTier?.name],
    () => fetchHistoryActions<ActionResponse>({
      limit: selectedTier ? '100' : '30',
      account: 'storexstake',
      sort: 'desc',
      'act.name': 'transfer'
    }, 'storexstake'),
    { refreshInterval: 30000 }  // 30 seconds
  );

  // Update the formatTimestamp function
  const formatTimestamp = (timestamp: string) => {
    try {
      // Remove milliseconds if present and ensure proper UTC format
      const cleanTimestamp = timestamp
        .replace('.000', '')  // Remove milliseconds
        .replace(/Z$/, '')    // Remove Z if present
        + 'Z';               // Add Z back to ensure UTC

      const date = new Date(cleanTimestamp);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date:', timestamp);
        return 'Invalid date';
      }

      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      });
    } catch (error) {
      console.warn('Error formatting timestamp:', timestamp, error);
      return 'Invalid date';
    }
  };

  const recentActions = useMemo(() => {
    if (!actionsData?.actions) return [];
    
    return actionsData.actions
      .filter(action => {
        if (!selectedTier || !stakersData) return true;

        const username = action.act.data.memo === "withdraw stake" 
          ? action.act.data.to 
          : action.act.data.from;

        const userStaked = stakersData[username]?.staked || 0;

        // Get tier boundaries
        const tierIndex = STAKING_TIERS.findIndex(t => t.name === selectedTier.name);
        const nextTierUp = STAKING_TIERS[tierIndex - 1];

        // Check if user is within the selected tier's range
        return userStaked >= selectedTier.minimum && 
               (!nextTierUp || userStaked < nextTierUp.minimum);
      })
      .slice(0, 15)
      .map(action => ({
        time: formatTimestamp(action.timestamp),
        username: action.act.data.memo === "withdraw stake" 
          ? action.act.data.to 
          : action.act.data.from,
        amount: parseFloat(action.act.data.quantity.split(' ')[0]),
        type: action.act.data.memo,
        trxId: action.trx_id,
        isNewStaker: stakersData && 
                    action.act.data.memo === "add stake" && 
                    !stakersData[action.act.data.from]
      }));
  }, [actionsData, stakersData, selectedTier]);

  return (
    <div className="bg-card rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-custom">
          <thead>
            <tr>
              <th>Time</th>
              <th>Username</th>
              <th>Amount</th>
              <th>USD Value</th>
              <th>Action</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recentActions.map((action, index) => (
              <tr key={index} className={action.isNewStaker ? 'bg-green-50 dark:bg-green-900/20' : ''}>
                <td>{action.time}</td>
                <td>
                  <div className="flex items-center gap-2">
                    {stakersData && (
                      <span title={getUserTier(stakersData[action.username]?.staked || 0).name}>
                        {getUserTier(stakersData[action.username]?.staked || 0).emoji}
                      </span>
                    )}
                    <UsernameLink username={action.username} />
                    {action.isNewStaker && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">
                        New Staker! 🎉
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  {action.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4
                  })} STRX
                </td>
                <td>
                  ${(action.amount * strxPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </td>
                <td>
                  <a 
                    href={`https://explorer.xprnetwork.org/transaction/${action.trxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 hover:underline ${
                      action.type === 'add stake' 
                        ? 'text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300' 
                        : 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300'
                    }`}
                  >
                    {action.type === 'add stake' ? (
                      <>
                        <span>👍</span> Add Stake
                      </>
                    ) : (
                      <>
                        <span>👎</span> Withdraw
                      </>
                    )}
                  </a>
                </td>
                <td>
                  <button
                    onClick={() => {
                      setSearchTerm(action.username);
                      const searchInput = document.querySelector('input[type="text"]');
                      if (searchInput) {
                        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
                    title="Search this user"
                  >
                    <MagnifyingGlassIcon className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Add this component for displaying new stakers
const NewStakersPanel: React.FC<{ 
  newStakers: NewStaker[];
  strxPrice: number;
}> = ({ newStakers, strxPrice }) => {
  if (!newStakers.length) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        New Stakers 🎉
      </h2>
      <div className="bg-card rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-custom">
            <thead>
              <tr>
                <th>Time</th>
                <th>Username</th>
                <th>Initial Stake</th>
                <th>USD Value</th>
              </tr>
            </thead>
            <tbody>
              {newStakers.map((staker, index) => {
                const stakerDate = new Date(staker.date);
                const isLast24Hours = (new Date().getTime() - stakerDate.getTime()) < 24 * 60 * 60 * 1000;

                // Format the date with leading zeros for hours and minutes
                const formattedDate = `${stakerDate.getFullYear()}-${String(stakerDate.getMonth() + 1).padStart(2, '0')}-${String(stakerDate.getDate()).padStart(2, '0')} ${String(stakerDate.getHours()).padStart(2, '0')} h ${String(stakerDate.getMinutes()).padStart(2, '0')}`;

                return (
                  <tr 
                    key={staker.username} 
                    className={`${
                      isLast24Hours 
                        ? 'bg-green-50/50 dark:bg-green-800/20' 
                        : ''
                    }`}
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formattedDate} {/* Use the formatted date */}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <UsernameLink username={staker.username} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {staker.total_staked.toLocaleString(undefined, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4
                      })} STRX
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      ${(staker.total_staked * strxPrice).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Add this new type near your other type definitions
type MilestoneUser = {
  username: string;
  currentTier: StakingTier;
  nextTier: StakingTier;
  staked: number;
  remaining: number;
  percentageComplete: number;
};

// Add this new component
const TierMilestoneTracker: React.FC<{
  stakersData: Array<{ username: string; total: number; staked: number }>;
  setSearchTerm: (term: string) => void;
  selectedTier: StakingTier | null;
  sectionVisibility: SectionVisibility;
  setSectionVisibility: React.Dispatch<React.SetStateAction<SectionVisibility>>;
  SectionHeader: React.FC<{
    title: string;
    sectionKey: keyof SectionVisibility;
    isVisible: boolean;
    onToggle: () => void;
  }>;
}> = ({ 
  stakersData, 
  setSearchTerm, 
  selectedTier, 
  sectionVisibility, 
  setSectionVisibility,
  SectionHeader 
}) => {
  const milestones = useMemo(() => {
    return stakersData
      .map(staker => {
        let currentTier = STAKING_TIERS[0];
        for (let i = 0; i < STAKING_TIERS.length; i++) {
          if (staker.staked >= STAKING_TIERS[i].minimum) {
            currentTier = STAKING_TIERS[i];
            break;
          }
        }
        
        const tierIndex = STAKING_TIERS.findIndex(t => t.name === currentTier.name);
        const nextTier = STAKING_TIERS[tierIndex - 1];
        
        if (!nextTier) {
          return null;
        }
        
        const remaining = nextTier.minimum - staker.staked;
        const percentageComplete = ((staker.staked - currentTier.minimum) / 
          (nextTier.minimum - currentTier.minimum)) * 100;

        return {
          username: staker.username,
          currentTier,
          nextTier,
          staked: staker.staked,
          remaining,
          percentageComplete
        };
      })
      .filter((milestone): milestone is MilestoneUser => {
        if (!milestone) return false;
        
        const isCloseToNextTier = 
          milestone.remaining > 0 && 
          milestone.remaining < milestone.nextTier.minimum * 0.15;
        
        if (selectedTier) {
          return milestone.currentTier.name === selectedTier.name && isCloseToNextTier;
        } else {
          return milestone.currentTier.name !== 'No Stake' && isCloseToNextTier;
        }
      })
      .sort((a, b) => {
        // First sort by tier level (higher tiers first)
        const aTierIndex = STAKING_TIERS.findIndex(t => t.name === a.currentTier.name);
        const bTierIndex = STAKING_TIERS.findIndex(t => t.name === b.currentTier.name);
        
        if (aTierIndex !== bTierIndex) {
          return aTierIndex - bTierIndex; // Lower index (higher tier) comes first
        }
        
        // If same tier, sort by how close they are to next tier (percentage)
        return b.percentageComplete - a.percentageComplete;
      })
      .slice(0, selectedTier ? 999 : 15);
  }, [stakersData, selectedTier]);

  if (milestones.length === 0 || selectedTier?.name === 'No Stake') return null;

  return (
    <div className="mb-8">
      <SectionHeader
        title="Tier Milestone Tracker 🎯"
        sectionKey="tierMilestones"
        isVisible={sectionVisibility.tierMilestones}
        onToggle={() => setSectionVisibility(prev => ({
          ...prev,
          tierMilestones: !prev.tierMilestones
        }))}
      />

      {sectionVisibility.tierMilestones && (
        <div className="rounded-lg border-t shadow dark:shadow-purple-500 overflow-hidden">
          {/* Mobile view */}
          <div className="md:hidden">
            <div className="grid grid-cols-1 gap-4 p-4">
              {milestones.slice(0, 3).map((milestone, index) => (
                <div key={index} className="bg-card p-4 rounded-lg border">
                  <div className="flex justify-between items-start mb-2">
                    <UsernameLink username={milestone.username} />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{milestone.currentTier.emoji}</span>
                    <span className="text-gray-400">➜</span>
                    <span className="text-2xl">{milestone.nextTier.emoji}</span>
                  </div>

                  <div className="mb-2">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Progress to {milestone.nextTier.name}</span>
                      <span>{milestone.percentageComplete.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${milestone.percentageComplete}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-200">
                    <span className="font-medium text-purple-600 dark:text-purple-400">
                      {milestone.remaining.toLocaleString()} STRX
                    </span>
                    {' '}remaining
                  </div>
                </div>
              ))}
            </div>

            {/* Compact table for remaining items */}
            {milestones.length > 3 && (
              <div className="border-t border-gray-200 dark:border-purple-500">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <tbody className="divide-y divide-gray-200 dark:divide-purple-500">
                      {milestones.slice(3).map((milestone, index) => (
                        <tr key={index} className="hover:bg-purple-50 dark:hover:bg-purple-900">
                          <td className="px-4 py-2 text-sm">
                            <UsernameLink username={milestone.username} />
                          </td>
                          <td className="px-4 py-2 text-sm text-center">
                            <span className="text-lg">
                              {milestone.currentTier.emoji} ➜ {milestone.nextTier.emoji}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-right">
                            <span className="text-gray-600 dark:text-gray-200">
                              {milestone.remaining.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Desktop view - original grid layout */}
          <div className="hidden md:block p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {milestones.map((milestone, index) => (
                <div key={index} className="bg-card p-4 rounded-lg border">
                  <div className="flex justify-between items-start mb-2">
                    <UsernameLink username={milestone.username} />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{milestone.currentTier.emoji}</span>
                    <span className="text-gray-400">➜</span>
                    <span className="text-2xl">{milestone.nextTier.emoji}</span>
                  </div>

                  <div className="mb-2">
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-200 mb-1">
                      <span>Progress to {milestone.nextTier.name}</span>
                      <span>{milestone.percentageComplete.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${milestone.percentageComplete}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-200">
                    <span className="font-medium text-purple-600 dark:text-purple-400">
                      {milestone.remaining.toLocaleString()} STRX
                    </span>
                    {' '}remaining
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Add these types at the top with your other types
type SectionVisibility = {
  recentActivity: boolean;
  newStakers: boolean;
  tierMilestones: boolean;
};

// Add this helper function near your other utility functions
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
const UserSelectContext = React.createContext<(username: string) => void>(() => {});

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

const ThemedTooltip = ({ active, payload, label }: any) => {
  const { theme } = useTheme();
  
  if (!active || !payload) return null;
  
  return (
    <div
      style={{
        backgroundColor: theme === 'dark' ? 'black' : 'white',
        border: '1px solid #6B21A8',
        borderRadius: '8px',
        color: theme === 'dark' ? 'white' : 'black',
        padding: '8px'
      }}
    >
      <p className="font-medium">{label}</p>
      <p>Staked : {payload[0]?.value.toLocaleString(undefined, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
        useGrouping: true,
      })}</p>
    </div>
  );
};

function App() {
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

  // Add this effect to save visibility state
  useEffect(() => {
    localStorage.setItem('sectionVisibility', JSON.stringify(sectionVisibility));
  }, [sectionVisibility]);

  // Add this component definition
  const SectionHeader: React.FC<{
    title: string;
    sectionKey: keyof SectionVisibility;
    isVisible: boolean;
    onToggle: () => void;
  }> = ({ title, isVisible, onToggle }) => (
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
      <button
        onClick={onToggle}
        className="p-2 text-purple-600 hover:text-purple-800 transition-colors"
        aria-label={isVisible ? "Hide section" : "Show section"}
      >
        {isVisible ? (
          <ChevronUpIcon className="h-5 w-5" />
        ) : (
          <ChevronDownIcon className="h-5 w-5" />
        )}
      </button>
    </div>
  );

  const { theme } = useTheme();

  // Add theme as a dependency to the chart's useMemo
  const chart = useMemo(() => (
    <BarChart data={topHolders} margin={{ left: 50, right: 20, top: 20, bottom: 20 }}>
      <XAxis 
        dataKey="username" 
        tick={{ fill: 'var(--axis-color)' }}
      />
      <YAxis 
        tickFormatter={formatLargeNumber}
        tick={{ fill: 'var(--axis-color)' }}
      />
      <Tooltip content={<ThemedTooltip />} />
      <Bar 
        dataKey={sortField === 'rewards' ? 'staked' : sortField} 
        fill="#7C63CC" 
      />
    </BarChart>
  ), [topHolders, theme, sortField]); // Add theme to dependencies

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
      <Suspense fallback={<PageFallback />}>
        <BridgePage />
      </Suspense>
    );
  }

  if (selectedUser) {
    if (isLoading || !response) {
      return <PageFallback />;
    }

    const userData = response?.data?.[selectedUser];

    if (!userData) {
      return (
        <Suspense fallback={<PageFallback />}>
          <UserPageNoStake
            username={selectedUser}
            onBack={handleBackToLeaderboard}
          />
        </Suspense>
      );
    }

    return (
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
          <InfoModal 
            isOpen={isInfoModalOpen} 
            onClose={() => setIsInfoModalOpen(false)} 
          />

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
                <ResponsiveContainer>
                  {chart}
                </ResponsiveContainer>
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

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
// smapshot version
// 1.2.0

// Add this after ReactDOM.render()
serviceWorkerRegistration.register();