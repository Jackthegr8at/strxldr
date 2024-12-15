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

// First, define the types
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
};

function Leaderboard() {
  const { data, error, isLoading } = useSWR<StakeData>(
    'https://nfts.jessytremblay.com/STRX/stakes.json',
    fetcher,
    { refreshInterval: 120000 }
  );

  // Add the visibleColumns state
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>({
    rank: true,
    username: true,
    staked: true,
    unstaked: false,
    total: false,
    usdValue: false,
  });

  // Basic loading and error states
  if (error) return <div>Error loading data</div>;
  if (isLoading) return <div>Loading...</div>;
  if (!data) return <div>No data available</div>;

  return (
    <div className="min-h-screen bg-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-purple-700 mb-6">
          {pageTitle}
        </h1>
        
        {/* Rest of your existing component */}
        
        <table className="w-full">
          <thead className="bg-purple-50">
            <tr>
              {visibleColumns.rank && <th>Rank</th>}
              {visibleColumns.username && <th>Username</th>}
              {visibleColumns.staked && <th>Staked Amount</th>}
              {visibleColumns.unstaked && <th>Unstaked Amount</th>}
              {visibleColumns.total && <th>Total Amount</th>}
              {visibleColumns.usdValue && <th>USD Value</th>}
            </tr>
          </thead>
          <tbody>
            {currentData.map((item, index) => (
              <tr key={item.username}>
                {visibleColumns.rank && <td>{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>}
                {visibleColumns.username && <td>{item.username}</td>}
                {visibleColumns.staked && <td>{item.staked.toLocaleString()}</td>}
                {visibleColumns.unstaked && <td>{item.unstaked.toLocaleString()}</td>}
                {visibleColumns.total && <td>{item.total.toLocaleString()}</td>}
                {visibleColumns.usdValue && <td>${(item.total * strxPrice).toLocaleString()}</td>}
              </tr>
            ))}
          </tbody>
        </table>
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