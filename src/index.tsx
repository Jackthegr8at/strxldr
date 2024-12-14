import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { ArrowUpIcon, ArrowDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type StakeData = {
  [key: string]: number;
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

  const processedData = useMemo(() => {
    if (!data) return [];

    return Object.entries(data)
      .filter(([username]) => username.toLowerCase().includes(searchTerm.toLowerCase()))
      .map(([username, amount]) => ({
        username,
        amount: Number(amount),
      }))
      .filter((item) => {
        // First filter out zero amounts
        if (item.amount <= 0) return false;
        
        // If no tier is selected, show all
        if (!selectedTier) return true;
        
        // Get the next higher tier
        const tierIndex = STAKING_TIERS.findIndex(t => t.name === selectedTier.name);
        const nextTier = STAKING_TIERS[tierIndex - 1];
        
        // Apply tier filtering
        if (!nextTier) {
          return item.amount >= selectedTier.minimum;
        }
        return item.amount >= selectedTier.minimum && item.amount < nextTier.minimum;
      })
      .sort((a, b) =>
        sortOrder === 'desc' ? b.amount - a.amount : a.amount - b.amount
      );
  }, [data, sortOrder, searchTerm, selectedTier]);

  const totalPages = Math.ceil(processedData.length / ITEMS_PER_PAGE);
  const currentData = processedData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const topHolders = processedData.slice(0, 15);

  // Format large numbers (in millions)
  const formatLargeNumber = (value: number) => {
    return (value / 1000000).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }) + 'M';
  };

  // Calculate total tokens for current page
  const currentPageTotal = currentData.reduce((sum, item) => sum + item.amount, 0);

  // Calculate total of all stakes
  const totalStakes = useMemo(() => {
    return processedData.reduce((sum, item) => sum + item.amount, 0);
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
    const totalStaked = processedData.reduce((sum, item) => sum + item.amount, 0);
    
    // Calculate median
    const sortedAmounts = [...processedData].sort((a, b) => a.amount - b.amount);
    const midPoint = Math.floor(sortedAmounts.length / 2);
    const median = sortedAmounts.length % 2 === 0
      ? (sortedAmounts[midPoint - 1].amount + sortedAmounts[midPoint].amount) / 2
      : sortedAmounts[midPoint].amount;

    // Calculate average
    const average = totalStaked / totalUsers;

    // Get min and max stakes
    const minStake = sortedAmounts[0].amount;
    const maxStake = sortedAmounts[sortedAmounts.length - 1].amount;

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
          const amount = user.amount;
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

  const handleEasterEgg = (tier: StakingTier | null, username?: string) => {
    // If clicking the same tier again (unselecting), just reset without animation
    if (selectedTier?.name === tier?.name) {
      setIsEasterEggActive(false);
      setPageTitle("STRX Staking Leaderboard");
      return;
    }
    
    setIsEasterEggActive(true);
    
    // Remove any existing animations
    document.body.classList.remove('shake-animation', 'splash-animation', 'bounce-animation');
    
    // Check for special usernames
    if (username && ['jordanhinks', 'jackthegreat'].includes(username.toLowerCase())) {
      setPageTitle("Future Billionaires List 🚀");
      document.body.classList.add('bounce-animation');
      return;
    }
    
    // Different effects based on tier
    if (tier?.name === 'Free') {
      setPageTitle("NGMI Leaderboard 😢");
      document.body.classList.add('shake-animation');
    } else if (tier?.name === 'Whale') {
      setPageTitle("🐋 Whale Alert! 🚨");
      document.body.classList.add('splash-animation');
    } else if (tier?.name === 'Shrimp') {
      setPageTitle("Shrimps Together Strong 🦐");
      document.body.classList.add('bounce-animation');
    }
    
    // Only remove the animation effect after 1 second
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
            <div className="text-sm text-gray-500 mb-1">Total Staked (API)</div>
            <div className="text-xl font-semibold text-purple-700">
              {statistics?.totalStaked.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
                useGrouping: true,
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Global Staked</div>
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
                        "Amount"
                      ]}
                    />
                    <Bar dataKey="amount" fill="#7C63CC" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by username..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Sort by amount:</span>
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
                    <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Rank</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Username</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Staked Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {currentData.map((item, index) => (
                    <tr key={item.username} className="hover:bg-purple-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                      </td>
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
                              {index === 0 ? '👑' : index === 1 ? '🥈' : '🥉'}
                            </span>
                          )}
                        </a>
                      </td>
                      <td 
                        className="px-6 py-4 text-sm text-gray-900 cursor-pointer hover:text-purple-600"
                        onClick={() => {
                          console.log('Amount clicked for:', item.username);
                          handleEasterEgg(null, item.username);
                        }}
                      >
                        {item.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 4,
                          maximumFractionDigits: 4,
                          useGrouping: true,
                        })}
                      </td>
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