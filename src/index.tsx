import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { ArrowUpIcon, ArrowDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
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
    { refreshInterval: 120000 } // Refresh every 2 minutes
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
  type SortField = 'staked' | 'unstaked' | 'total';
  const [sortField, setSortField] = useState<SortField>('staked');

  // Add this state for column visibility
  const [visibleColumns, setVisibleColumns] = useState({
    rank: true,
    username: true,
    staked: true,
    unstaked: false,
    total: false,
    usdValue: false,
  });

  // Add this component for the column selector
  const ColumnSelector = ({ visibleColumns, setVisibleColumns }) => (
    <div className="mb-4">
      <select
        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        multiple={true}
        value={Object.keys(visibleColumns).filter(key => visibleColumns[key])}
        onChange={(e) => {
          const selected = Array.from(e.target.selectedOptions, option => option.value);
          const newVisibleColumns = {
            ...visibleColumns,
            ...Object.keys(visibleColumns).reduce((acc, key) => ({
              ...acc,
              [key]: selected.includes(key)
            }), {})
          };
          // Ensure at least one column is always visible
          if (selected.length > 0) {
            setVisibleColumns(newVisibleColumns);
          }
        }}
      >
        <option value="rank">Rank</option>
        <option value="username">Username</option>
        <option value="staked">Staked Amount</option>
        <option value="unstaked">Unstaked Amount</option>
        <option value="total">Total Amount</option>
        <option value="usdValue">USD Value</option>
      </select>
    </div>
  );

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
        <h1 className={`text-3xl font-bold text-purple-700 mb-6 transition-all duration-300 ${
          isEasterEggActive ? 'rainbow-text' : ''
        }`}>
          {pageTitle}
        </h1>
        
        {/* Statistics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Total Stakers</div>
            <div className="text-xl font-semibold text-purple-700">
              {statistics?.totalUsers.toLocaleString()}
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Total Staked (Cleos Call)</div>
            <div className="text-xl font-semibold text-purple-700">
              {statistics?.totalStaked.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
                useGrouping: true,
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Global Staked (API)</div>
            <div className="text-xl font-semibold text-purple-700">
              {globalStaked.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
                useGrouping: true,
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Average Stake</div>
            <div className="text-xl font-semibold text-purple-700">
              {statistics?.average.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
                useGrouping: true,
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Median Stake</div>
            <div className="text-xl font-semibold text-purple-700">
              {statistics?.median.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
                useGrouping: true,
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Stake Range</div>
            <div className="text-xl font-semibold text-purple-700">
              {statistics?.minStake.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
                useGrouping: true,
              })} - {statistics?.maxStake.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
                useGrouping: true,
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">STRX Price (USD)</div>
            <div className="text-xl font-semibold text-purple-700">
              ${strxPrice.toFixed(6)}
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
              <div className="flex items-center gap-2">
                <ColumnSelector visibleColumns={visibleColumns} setVisibleColumns={setVisibleColumns} />
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

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-purple-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700"></th>
                    {visibleColumns.rank && <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Rank</th>}
                    {visibleColumns.username && <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Username</th>}
                    {visibleColumns.staked && <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Staked Amount</th>}
                    {visibleColumns.unstaked && <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Unstaked Amount</th>}
                    {visibleColumns.total && <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Total Amount</th>}
                    {visibleColumns.usdValue && <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">USD Value</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {currentData.map((item, index) => {
                    const [isExpanded, setIsExpanded] = useState(false);
                    return (
                      <React.Fragment key={item.username}>
                        <tr className="hover:bg-purple-50">
                          <td className="px-2 py-4">
                            <button 
                              onClick={() => setIsExpanded(!isExpanded)}
                              className="md:hidden text-purple-600"
                            >
                              {isExpanded ? '▼' : '▶'}
                            </button>
                          </td>
                          {visibleColumns.rank && <td>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>}
                          {visibleColumns.username && <td>{/* username column content */}</td>}
                          {visibleColumns.staked && <td>{/* staked amount content */}</td>}
                          {visibleColumns.unstaked && <td>{/* unstaked amount content */}</td>}
                          {visibleColumns.total && <td>{/* total amount content */}</td>}
                          {visibleColumns.usdValue && <td>{/* USD value content */}</td>}
                        </tr>
                        {isExpanded && (
                          <tr className="md:hidden bg-purple-50">
                            <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 1}>
                              <div className="px-6 py-4 space-y-2">
                                {!visibleColumns.unstaked && (
                                  <div>
                                    <span className="font-semibold">Unstaked:</span> {item.unstaked.toLocaleString()}
                                  </div>
                                )}
                                {!visibleColumns.total && (
                                  <div>
                                    <span className="font-semibold">Total:</span> {item.total.toLocaleString()}
                                  </div>
                                )}
                                {!visibleColumns.usdValue && (
                                  <div>
                                    <span className="font-semibold">USD Value:</span> ${(item.total * strxPrice).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
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