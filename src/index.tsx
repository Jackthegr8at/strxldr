import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { ArrowUpIcon, ArrowDownIcon, MagnifyingGlassIcon, QuestionMarkCircleIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { UserPage } from './UserPage';
import { Leaderboard } from './Leaderboard';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type StakeData = {
  [key: string]: {
    staked: number;
    unstaked: number;
  };
};

type BlockchainResponse = {
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

const ITEMS_PER_PAGE = 10;

type StakingTier = {
  name: string;
  minimum: number;
  emoji: string;
};

const STAKING_TIERS: StakingTier[] = [
  { name: 'Whale', minimum: 20000000, emoji: '🐋' },
  { name: 'Shark', minimum: 10000000, emoji: '🦈' },
  { name: 'Dolphin', minimum: 5000000, emoji: '🐬' },
  { name: 'Fish', minimum: 1000000, emoji: '🐟' },
  { name: 'Shrimp', minimum: 500000, emoji: '🦐' },
  { name: 'Free', minimum: 0, emoji: '🆓' },
];

// Add this type for the price response
type PriceResponse = {
  rows: [{
    sym: string;
    quantity: string;
  }];
};

// Add this type definition
type SortField = 'staked' | 'unstaked' | 'total';

// Add these types at the top of your file
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
      <label className="block text-sm text-gray-600 mb-1">
        Select additional column:
      </label>
      <select
        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content container with padding */}
        <div className="p-4 md:p-6">
          <h2 className="text-xl md:text-2xl font-bold text-purple-700 mb-4">
            About STRX Staking Leaderboard
          </h2>
          
          <div className="prose prose-sm md:prose max-w-none text-gray-600 space-y-4">
            <p>
              Welcome to the STRX Staking Leaderboard! This platform provides real-time tracking 
              of STOREX token staking positions across the community.
            </p>
            
            <p>Here you can:</p>
            
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

            <p className="text-sm md:text-base">
              The leaderboard updates every 60 minutes to provide the most current staking data. 
              USD price is updated every 2 minutes. Users are categorized into tiers (Whale, 
              Shark, Dolphin, etc.) based on their total STRX holdings.
            </p>
          </div>
        </div>

        {/* Footer with close button */}
        <div className="border-t border-gray-200 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 
                     transition-colors text-sm md:text-base"
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

// Add this constant at the top of your file
const TOTAL_SUPPLY = 2000000000; // 2 billion STRX

// Update the ActionResponse type to match v2 API
type ActionResponse = {
  query_time_ms: number;
  cached: boolean;
  lib: number;
  last_indexed_block: number;
  last_indexed_block_time: string;
  total: {
    value: number;
    relation: string;
  };
  actions: Array<{
    "@timestamp": string;
    timestamp: string;
    block_num: number;
    block_id: string;
    trx_id: string;
    act: {
      account: string;
      name: string;
      authorization: Array<{
        actor: string;
        permission: string;
      }>;
      data: {
        from: string;
        to: string;
        amount: number;
        symbol: string;
        memo: string;
        quantity: string;
      };
    };
    receipts: Array<{
      receiver: string;
      global_sequence: number;
      recv_sequence: number;
      auth_sequence: Array<{
        account: string;
        sequence: number;
      }>;
    }>;
    cpu_usage_us: number;
    net_usage_words: number;
    global_sequence: number;
    producer: string;
    action_ordinal: number;
    creator_action_ordinal: number;
    signatures: Array<string>;
  }>;
};

// Add this component for the recent actions dashboard
const RecentActions: React.FC<{
  strxPrice: number;
  stakersData?: StakeData;
  setSearchTerm: (term: string) => void;
  selectedTier: StakingTier | null;
}> = ({ strxPrice, stakersData, setSearchTerm, selectedTier }) => {
  const { data: actionsData } = useSWR<ActionResponse>(
    ['recent_actions', selectedTier?.name],
    () => {
      const baseUrl = 'https://proton.eosusa.io/v2/history/get_actions';
      const params = new URLSearchParams({
        limit: selectedTier ? '100' : '30',
        account: 'storexstake',
        sort: 'desc',
        'act.name': 'transfer'
      });
      
      return fetch(`${baseUrl}?${params}`).then(res => res.json());
    },
    { refreshInterval: 30000 }
  );

  const formatTimestamp = (timestamp: string) => {
    // Create Date object from UTC string and it will automatically convert to local time
    const date = new Date(timestamp.replace('.000', 'Z'));
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
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
        time: formatTimestamp(action.timestamp.replace('.000', 'Z')),
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
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-purple-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Time</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Username</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Amount</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">USD Value</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Action</th>
              <th className="px-3 py-3 text-left text-sm font-semibold text-purple-700"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {recentActions.map((action, index) => (
              <tr key={index} className={`hover:bg-purple-50 ${
                action.isNewStaker ? 'bg-green-50' : ''
              }`}>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {action.time}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  <div className="flex items-center gap-2">
                    <a 
                      href={`https://explorer.xprnetwork.org/account/${action.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-800 hover:underline"
                    >
                      {action.username}
                    </a>
                    {action.isNewStaker && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        New Staker! 🎉
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {action.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4
                  })} STRX
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  ${(action.amount * strxPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </td>
                <td className="px-6 py-4 text-sm">
                  <a 
                    href={`https://explorer.xprnetwork.org/transaction/${action.trxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 hover:underline ${
                      action.type === 'add stake' 
                        ? 'text-green-600 hover:text-green-800' 
                        : 'text-red-600 hover:text-red-800'
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
                <td className="px-3 py-4 text-sm">
                  <button
                    onClick={() => {
                      setSearchTerm(action.username);
                      
                      // Scroll to the search input
                      const searchInput = document.querySelector('input[type="text"]');
                      if (searchInput) {
                        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="text-purple-600 hover:text-purple-800"
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

// Add this type for the fetch response
type FetchResponse = {
  data: StakeData;
  lastModified: string;
};

// Add this component for the tooltip
const StatisticCard: React.FC<{
  title: string;
  value: React.ReactNode;
  tooltip: string;
  onClick?: () => void;
}> = ({ title, value, tooltip, onClick }) => (
  <div 
    className={`bg-white p-4 rounded-lg shadow border border-purple-100 relative ${
      onClick ? 'cursor-pointer' : ''
    }`}
    onClick={onClick}
  >
    <div className="flex justify-between items-start mb-1">
      <div className="text-sm text-gray-500">{title}</div>
      <div 
        className="group relative"
        title={tooltip}
      >
        <QuestionMarkCircleIcon 
          className="h-5 w-5 text-gray-400 hover:text-purple-600 cursor-help"
        />
        <div className="invisible group-hover:visible absolute right-0 z-10 w-64 p-2 mt-2 text-sm text-white bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
          {tooltip}
        </div>
      </div>
    </div>
    <div className="text-xl font-semibold text-purple-700">
      {value}
    </div>
  </div>
);

// Add this type for new stakers
type NewStaker = {
  username: string;
  total_staked: number;
  date: string;
};

// Add this type for the new stakers response
type NewStakersResponse = NewStaker[];

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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-purple-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Time</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Username</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Initial Stake</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">USD Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {newStakers.map((staker, index) => {
                const stakerDate = new Date(staker.date);
                const isLast24Hours = (new Date().getTime() - stakerDate.getTime()) < 24 * 60 * 60 * 1000;

                return (
                  <tr key={index} className={`hover:bg-purple-50 ${
                    isLast24Hours ? 'bg-green-50' : ''
                  }`}>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {stakerDate.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <a 
                        href={`https://explorer.xprnetwork.org/account/${staker.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-800 hover:underline"
                      >
                        {staker.username}
                      </a>
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
          return milestone.currentTier.name !== 'Free' && isCloseToNextTier;
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

  if (milestones.length === 0) return null;

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
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Mobile view */}
          <div className="md:hidden">
            <div className="grid grid-cols-1 gap-4 p-4">
              {milestones.slice(0, 3).map((milestone, index) => (
                <div key={index} className="bg-white p-4 rounded-lg border border-purple-100">
                  <div className="flex justify-between items-start mb-2">
                    <a 
                      href={`https://explorer.xprnetwork.org/account/${milestone.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-2"
                    >
                      {milestone.username}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setSearchTerm(milestone.username);
                          const searchInput = document.querySelector('input[type="text"]');
                          if (searchInput) {
                            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="text-purple-600 hover:text-purple-800"
                      >
                        <MagnifyingGlassIcon className="h-4 w-4" />
                      </button>
                    </a>
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

                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-purple-600">
                      {milestone.remaining.toLocaleString()} STRX
                    </span>
                    {' '}remaining
                  </div>
                </div>
              ))}
            </div>

            {/* Compact table for remaining items */}
            {milestones.length > 3 && (
              <div className="border-t border-gray-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <tbody className="divide-y divide-gray-200">
                      {milestones.slice(3).map((milestone, index) => (
                        <tr key={index} className="hover:bg-purple-50">
                          <td className="px-4 py-2 text-sm">
                            <a 
                              href={`https://explorer.xprnetwork.org/account/${milestone.username}`}
                              className="text-purple-600 hover:text-purple-800 hover:underline"
                            >
                              {milestone.username}
                            </a>
                          </td>
                          <td className="px-4 py-2 text-sm text-center">
                            <span className="text-lg">
                              {milestone.currentTier.emoji} ➜ {milestone.nextTier.emoji}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-right">
                            <span className="text-purple-600">
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
                <div key={index} className="bg-white p-4 rounded-lg border border-purple-100">
                  <div className="flex justify-between items-start mb-2">
                    <a 
                      href={`https://explorer.xprnetwork.org/account/${milestone.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-2"
                    >
                      {milestone.username}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setSearchTerm(milestone.username);
                          const searchInput = document.querySelector('input[type="text"]');
                          if (searchInput) {
                            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="text-purple-600 hover:text-purple-800"
                      >
                        <MagnifyingGlassIcon className="h-4 w-4" />
                      </button>
                    </a>
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

                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-purple-600">
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

function App() {
  const { data: priceData } = useSWR<PriceResponse>('strx_price_data', /* ... */);
  const { data: blockchainData } = useSWR<BlockchainResponse>('blockchain_data', /* ... */);
  
  const strxPrice = useMemo(() => {
    if (!priceData?.rows) return 0;
    const strxRow = priceData.rows.find(row => row.sym === '4,STRX');
    return strxRow ? parseFloat(strxRow.quantity.split(' ')[0]) : 0;
  }, [priceData]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Leaderboard />} />
        <Route path="/user/:username" element={<UserPage strxPrice={strxPrice} blockchainData={blockchainData} />} />
      </Routes>
    </BrowserRouter>
  );
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// smapshot version
// 1.0.0