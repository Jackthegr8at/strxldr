import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { ArrowUpIcon, ArrowDownIcon, MagnifyingGlassIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-2xl font-bold text-purple-700 mb-4">About STRX Staking Leaderboard</h2>
        <div className="prose text-gray-600 space-y-4">
          <p>
            Welcome to the STRX Staking Leaderboard! This platform provides real-time tracking of STOREX token staking positions across the community.
          </p>
          <p>
            Here you can:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>View detailed staking statistics and distribution</li>
            <li>Track top holders and their staking positions</li>
            <li>Monitor global staking metrics</li>
            <li>Check current STRX price and USD values</li>
            <li>Find some easter eggs</li>
          </ul>
          <p>
            The leaderboard updates every 60 minutes to provide the most current staking data. USD price is updated every 2 minutes. Users are categorized into tiers (Whale, Shark, Dolphin, etc.) based on their total STRX holdings.
          </p>
        </div>
      </div>
    </div>
  );
};

// Add this type for the display mode
type AmountDisplay = 'strx' | 'usd';

// Add this constant at the top of your file
const TOTAL_SUPPLY = 2000000000; // 2 billion STRX

// Add these types for the actions API
type ActionResponse = {
  actions: Array<{
    action_trace: {
      act: {
        data: {
          from: string;
          memo: string;
          quantity: string;
          to: string;
        };
      };
      block_time: string;
    };
  }>;
};

// Add this component for the recent actions dashboard
const RecentActions: React.FC = () => {
  const { data: actionsData } = useSWR<ActionResponse>(
    'recent_actions',
    () => fetch('https://proton.greymass.com/v1/history/get_actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      body: JSON.stringify({
        account_name: "storexstake",
        pos: -1,
        offset: -30
      })
    }).then(res => res.json()),
    { refreshInterval: 30000 } // Refresh every 30 seconds
  );

  const recentActions = useMemo(() => {
    if (!actionsData?.actions) return [];
    
    return actionsData.actions
      .filter(action => 
        action.action_trace.act.data.memo === "add stake" || 
        action.action_trace.act.data.memo === "withdraw stake"
      )
      .slice(0, 15) // Get only the last 15 actions
      .map(action => ({
        time: new Date(action.action_trace.block_time),
        username: action.action_trace.act.data.from,
        amount: parseFloat(action.action_trace.act.data.quantity.split(' ')[0]),
        type: action.action_trace.act.data.memo
      }));
  }, [actionsData]);

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Recent Staking Activity</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-purple-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Time</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Username</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Amount</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentActions.map((action, index) => (
                <tr key={index} className="hover:bg-purple-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {action.time.toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <a 
                      href={`https://explorer.xprnetwork.org/account/${action.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-800 hover:underline"
                    >
                      {action.username}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {action.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4
                    })} STRX
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex items-center gap-1 ${
                      action.type === 'add stake' 
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }`}>
                      {action.type === 'add stake' ? (
                        <>
                          <span>👍</span> Add Stake
                        </>
                      ) : (
                        <>
                          <span>👎</span> Withdraw
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function Leaderboard() {
  const { data, error, isLoading } = useSWR<StakeData>(
    'https://nfts.jessytremblay.com/STRX/stakes.json',
    fetcher,
    { refreshInterval: 120000 } // Refresh every 2 minutes
  );

  const { data: blockchainData } = useSWR<BlockchainResponse>(
    'https://proton.eosusa.io/v1/chain/get_table_rows',
    (url) => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      body: JSON.stringify({
        json: true,
        code: "storexstake",
        scope: "storexstake",
        table: "config",
        limit: 10
      })
    }).then(res => res.json()),
    { refreshInterval: 60000 } // Refresh every 60 minutes
  );

  // Add new SWR call for price data with a unique key
  const { data: priceData } = useSWR<PriceResponse>(
    'strx_price_data', // Unique key
    () => fetch('https://proton.eosusa.io/v1/chain/get_table_rows', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      body: JSON.stringify({
        json: true,
        code: "strxoracle",
        scope: "strxoracle",
        table: "prices",
        limit: 9999,
        reverse: false,
        show_payer: false
      })
    }).then(res => res.json()),
    { refreshInterval: 120000 } // Refresh every 2 minutes
  );

  // Add console.log to debug
  console.log('Price data:', priceData);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTier, setSelectedTier] = useState<StakingTier | null>(null);
  const [pageTitle, setPageTitle] = useState("STRX Staking Leaderboard");
  const [isEasterEggActive, setIsEasterEggActive] = useState(false);

  // Reset page when search term changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Add sort type
  const [sortField, setSortField] = useState<SortField>('staked');

  // Add this state near your other useState declarations
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>({
    rank: true,
    username: true,
    staked: true,
    unstaked: false,
    total: false,
    usdValue: false,
  });

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

  // Update processedData to handle new structure
  const processedData = useMemo(() => {
    if (!data) return [];

    return Object.entries(data)
      .filter(([username]) => username.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(([username, amounts]) => ({
        username,
        staked: amounts.staked,
        unstaked: amounts.unstaked,
        total: amounts.staked + amounts.unstaked
      }))
      .filter((item) => {
        if (item.staked <= 0 && item.unstaked <= 0) return false;
        
        if (!selectedTier) return true;
        
        const tierIndex = STAKING_TIERS.findIndex(t => t.name === selectedTier.name);
        const nextTier = STAKING_TIERS[tierIndex - 1];
        
        if (!nextTier) {
          return item.total >= selectedTier.minimum;
        }
        return item.total >= selectedTier.minimum && item.total < nextTier.minimum;
      })
      .sort((a, b) => {
        const compareValue = sortOrder === 'desc' ? -1 : 1;
        return (a[sortField] - b[sortField]) * compareValue;
      });
  }, [data, sortOrder, searchTerm, selectedTier, sortField]);

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

  const tierStatistics = useMemo(() => {
    if (!processedData.length) return null;

    const tiers = STAKING_TIERS.map((tier, index) => {
      const nextTier = STAKING_TIERS[index - 1]; // Get the next higher tier
      return {
        ...tier,
        count: processedData.filter(user => {
          const amount = user.total;
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
  }, [processedData]);

  // Get STRX price
  const strxPrice = useMemo(() => {
    if (!priceData?.rows) return 0;
    const strxRow = priceData.rows.find(row => row.sym === '4,STRX');
    return strxRow ? parseFloat(strxRow.quantity.split(' ')[0]) : 0;
  }, [priceData]);

  const handleEasterEgg = (tier: StakingTier | null, username?: string) => {
    // Remove any existing animations
    document.body.classList.remove('shake-animation', 'splash-animation', 'bounce-animation');
    
    // Simplified check for testing
    if (username === 'jordanhinks' || username === 'jackthegreat') {
      setPageTitle("Future Billionaires List 🚀");
      document.body.classList.add('bounce-animation');
      return;
    }
    
    // If no match, continue with tier checks
    if (selectedTier?.name === tier?.name) {
      setIsEasterEggActive(false);
      setPageTitle("STRX Staking Leaderboard");
      return;
    }
    
    setIsEasterEggActive(true);
    
    if (tier?.name === 'Free') {
      setPageTitle("NGMI Leaderboard 😢");
      document.body.classList.add('shake-animation');
    } else if (tier?.name === 'Whale') {
      setPageTitle("🐋 Whale Alert! 🚨");
      document.body.classList.add('splash-animation');
    } else if (tier?.name === 'Shrimp') {
      setPageTitle("Shrimps Together Strong 🦐");
      document.body.classList.add('bounce-animation');
    } else if (tier) {
      // Reset title for any other tier
      setPageTitle("STRX Staking Leaderboard");
    }
    
    setTimeout(() => {
      document.body.classList.remove('shake-animation', 'splash-animation', 'bounce-animation');
    }, 1000);
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
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Call once on mount
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <p className="text-red-700">Error loading data. Please try again later.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className={`text-3xl font-bold text-purple-700 ${
            isEasterEggActive ? 'rainbow-text' : ''
          }`}>
            {pageTitle}
          </h1>
          <button
            onClick={() => setIsInfoModalOpen(true)}
            className="p-2 text-purple-600 hover:text-purple-800 transition-colors"
            aria-label="Information"
          >
            <QuestionMarkCircleIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Add the modal component */}
        <InfoModal 
          isOpen={isInfoModalOpen} 
          onClose={() => setIsInfoModalOpen(false)} 
        />

        {/* Statistics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Total Stakers</div>
            <div className="text-xl font-semibold text-purple-700">
              {statistics?.totalUsers.toLocaleString()}
            </div>
          </div>
          
          <div 
            className="bg-white p-4 rounded-lg shadow border border-purple-100 cursor-pointer"
            onClick={() => toggleAmountDisplay('statistics', 'totalStaked')}
          >
            <div className="text-sm text-gray-500 mb-1">Total Staked (Cleos Call)</div>
            <div className="flex flex-col">
              <div className="text-xl font-semibold text-purple-700">
                {formatAmount(
                  statistics?.totalStaked || 0,
                  amountDisplays['statistics-totalStaked'] || 'strx'
                )}
              </div>
              <span className="text-xs text-gray-500">
                ({((statistics?.totalStaked || 0) / TOTAL_SUPPLY * 100).toFixed(2)}% of supply)
              </span>
            </div>
          </div>

          <div 
            className="bg-white p-4 rounded-lg shadow border border-purple-100 cursor-pointer"
            onClick={() => toggleAmountDisplay('statistics', 'globalStaked')}
          >
            <div className="text-sm text-gray-500 mb-1">Global Staked (API)</div>
            <div className="flex flex-col">
              <div className="text-xl font-semibold text-purple-700">
                {formatAmount(
                  globalStaked,
                  amountDisplays['statistics-globalStaked'] || 'strx'
                )}
              </div>
              <span className="text-xs text-gray-500">
                ({(globalStaked / TOTAL_SUPPLY * 100).toFixed(2)}% of supply)
              </span>
            </div>
          </div>

          <div 
            className="bg-white p-4 rounded-lg shadow border border-purple-100 cursor-pointer"
            onClick={() => toggleAmountDisplay('statistics', 'average')}
          >
            <div className="text-sm text-gray-500 mb-1">Average Stake</div>
            <div className="text-xl font-semibold text-purple-700">
              {formatAmount(
                statistics?.average || 0,
                amountDisplays['statistics-average'] || 'strx'
              )}
            </div>
          </div>

          <div 
            className="bg-white p-4 rounded-lg shadow border border-purple-100 cursor-pointer"
            onClick={() => toggleAmountDisplay('statistics', 'median')}
          >
            <div className="text-sm text-gray-500 mb-1">Median Stake</div>
            <div className="text-xl font-semibold text-purple-700">
              {formatAmount(
                statistics?.median || 0,
                amountDisplays['statistics-median'] || 'strx'
              )}
            </div>
          </div>

          <div 
            className="bg-white p-4 rounded-lg shadow border border-purple-100 cursor-pointer"
            onClick={() => toggleAmountDisplay('statistics', 'range')}
          >
            <div className="text-sm text-gray-500 mb-1">Stake Range</div>
            <div className="text-xl font-semibold text-purple-700">
              {formatAmount(
                statistics?.minStake || 0,
                amountDisplays['statistics-range'] || 'strx'
              )} - {formatAmount(
                statistics?.maxStake || 0,
                amountDisplays['statistics-range'] || 'strx'
              )}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">STRX Price</div>
            <div className="text-xl font-semibold text-purple-700">
              ${strxPrice.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
                useGrouping: true,
              })}
            </div>
          </div>
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
                className={`tier-card bg-white p-4 rounded-lg shadow border cursor-pointer transition-colors ${
                  selectedTier?.name === tier.name 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-purple-100 hover:bg-purple-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{tier.emoji}</span>
                  <span className="text-sm text-gray-500">{tier.name}</span>
                </div>
                <div className="text-xl font-semibold text-purple-700">
                  {tier.count.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  {tier.minimum.toLocaleString()}+ STRX
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add the recent actions dashboard */}
        <RecentActions />

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-700 border-t-transparent"></div>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Top 15 Holders Distribution</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer>
                  <BarChart data={topHolders} margin={{ left: 50, right: 20, top: 20, bottom: 20 }}>
                    <XAxis dataKey="username" />
                    <YAxis 
                      tickFormatter={formatLargeNumber}
                    />
                    <Tooltip 
                      formatter={(value: number) => [
                        value.toLocaleString(undefined, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                          useGrouping: true,
                        }),
                        sortField.charAt(0).toUpperCase() + sortField.slice(1) // Capitalize first letter
                      ]}
                    />
                    <Bar dataKey={sortField} fill="#7C63CC" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by username..."
                  className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
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
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as SortField)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="staked">Staked Amount</option>
                    <option value="unstaked">Unstaked Amount</option>
                    <option value="total">Total Amount</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-1 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                  >
                    {sortOrder === 'desc' ? (
                      <ArrowDownIcon className="h-4 w-4" />
                    ) : (
                      <ArrowUpIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-purple-50">
                  <tr>
                    {visibleColumns.rank && (
                      <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Rank</th>
                    )}
                    {visibleColumns.username && (
                      <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Username</th>
                    )}
                    {visibleColumns.staked && (
                      <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Staked Amount</th>
                    )}
                    {visibleColumns.unstaked && (
                      <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Unstaked Amount</th>
                    )}
                    {visibleColumns.total && (
                      <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Total Amount</th>
                    )}
                    {visibleColumns.usdValue && (
                      <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">USD Value</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {currentData.map((item, index) => (
                    <tr key={item.username} className="hover:bg-purple-50">
                      {visibleColumns.rank && (
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                        </td>
                      )}
                      {visibleColumns.username && (
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <a 
                            onClick={() => handleEasterEgg(null, item.username)}
                            href={`https://explorer.xprnetwork.org/account/${item.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-800 hover:underline cursor-pointer flex items-center gap-2"
                          >
                            {item.username}
                            {(currentPage === 1 && index < 3) && (
                              <span className="text-yellow-500" title={`Top ${index + 1} Holder`}>
                                {index === 0 ? '���' : index === 1 ? '🥈' : '🥉'}
                              </span>
                            )}
                          </a>
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
                            <span className="text-xs text-gray-500">
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
                            <span className="text-xs text-gray-500">
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
                            <span className="text-xs text-gray-500">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-sm text-gray-600 text-center md:text-left">
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
                <span className="text-sm text-gray-600 px-2">
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
          </>
        )}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <Leaderboard />
  </React.StrictMode>
);