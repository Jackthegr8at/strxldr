import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import * as React from 'react';

// Reuse types from index.tsx
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

type ActionResponse = {
  actions: Array<{
    "@timestamp": string;
    timestamp: string;
    act: {
      data: {
        from: string;
        to: string;
        amount: number;
        symbol: string;
        memo: string;
        quantity: string;
      };
    };
    trx_id: string;
  }>;
};

type PriceResponse = {
  rows: [{
    sym: string;
    quantity: string;
  }];
};

const TOTAL_SUPPLY = 2000000000;

// Update the component props to include initial data
type UserPageProps = {
  username: string;
  onBack: () => void;
  userData: {
    staked: number;
    unstaked: number;
  };
  globalData: {
    blockchainData?: BlockchainResponse;
    priceData?: PriceResponse;
  };
};

const UserPage: React.FC<UserPageProps> = ({ username, onBack, userData, globalData }) => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');

  // We don't need to fetch the full staking data since we have the user's data
  const { data: blockchainData } = useSWR<BlockchainResponse>(
    'blockchain_data',
    () => fetch('https://proton.eosusa.io/v1/chain/get_table_rows', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        json: true,
        code: "storexstake",
        scope: "storexstake",
        table: "config",
        limit: 10
      })
    }).then(res => res.json()),
    { 
      refreshInterval: 60000,
      fallbackData: globalData.blockchainData
    }
  );

  const { data: priceData } = useSWR<PriceResponse>(
    'strx_price',
    () => fetch('https://proton.eosusa.io/v1/chain/get_table_rows', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        json: true,
        code: "strxoracle",
        scope: "strxoracle",
        table: "prices",
        limit: 1
      })
    }).then(res => res.json()),
    { 
      refreshInterval: 120000,
      fallbackData: globalData.priceData
    }
  );

  // Update the user's transaction history fetch
  const { data: actionsData } = useSWR<ActionResponse>(
    ['user_actions', username],
    () => {
      const baseUrl = 'https://proton.eosusa.io/v2/history/get_actions';
      
      // Create two promises for 'to' and 'from' transactions
      const toPromise = fetch(`${baseUrl}?limit=50&account=storex&act.name=transfer&act.data.to=${username}`).then(res => res.json());
      const fromPromise = fetch(`${baseUrl}?limit=50&account=storex&act.name=transfer&act.data.from=${username}`).then(res => res.json());
      
      // Combine and sort both results
      return Promise.all([toPromise, fromPromise]).then(([toActions, fromActions]) => {
        const combinedActions = [...(toActions.actions || []), ...(fromActions.actions || [])];
        
        // Sort by timestamp descending
        combinedActions.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        return { actions: combinedActions };
      });
    },
    { refreshInterval: 30000 }
  );

  const strxPrice = useMemo(() => {
    if (!priceData?.rows) return 0;
    const strxRow = priceData.rows.find(row => row.sym === '4,STRX');
    return strxRow ? parseFloat(strxRow.quantity.split(' ')[0]) : 0;
  }, [priceData]);

  const userActions = useMemo(() => {
    if (!actionsData?.actions) return [];
    
    return actionsData.actions
      .filter(action => 
        action.act.data.from === username || 
        action.act.data.to === username
      )
      .map(action => ({
        time: new Date(action.timestamp),
        amount: parseFloat(action.act.data.quantity.split(' ')[0]),
        type: action.act.data.memo,
        trxId: action.trx_id
      }));
  }, [actionsData, username]);

  const calculateRewards = (stakedAmount: number) => {
    if (!blockchainData?.rows?.[0]) return null;
    
    const rewardsPerSec = parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0]);
    const globalStaked = parseFloat(blockchainData.rows[0].stakes.split(' ')[0]);
    
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

  const stakingStats = useMemo(() => {
    if (!blockchainData?.rows?.[0]) return null;

    const totalStaked = parseFloat(blockchainData.rows[0].stakes.split(' ')[0]);
    const percentageOfPool = (userData.staked / totalStaked) * 100;
    const percentageOfSupply = (userData.staked / TOTAL_SUPPLY) * 100;

    return {
      percentageOfPool,
      percentageOfSupply,
      rewards: calculateRewards(userData.staked)
    };
  }, [userData, blockchainData]);

  const activityData = useMemo(() => {
    if (!userActions.length) return [];

    const now = new Date();
    const timeRangeMap = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    return userActions
      .filter(action => now.getTime() - action.time.getTime() <= timeRangeMap[timeRange])
      .map(action => ({
        time: action.time.toLocaleDateString(),
        amount: action.type === 'add stake' ? action.amount : -action.amount
      }));
  }, [userActions, timeRange]);

  if (!userData) {
    return (
      <div className="min-h-screen bg-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-purple-600 hover:text-purple-800"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Back to Leaderboard
          </button>
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-800">User not found</h2>
            <p className="text-gray-600 mt-2">No staking data available for {username}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-purple-600 hover:text-purple-800"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Back to Leaderboard
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-purple-700 mb-2">
            {username}'s Staking Profile
          </h1>
          <a 
            href={`https://explorer.xprnetwork.org/account/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 hover:text-purple-800 hover:underline text-sm"
          >
            View on Explorer →
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Total Staked</div>
            <div className="text-xl font-semibold text-purple-700">
              {userData.staked.toLocaleString()} STRX
            </div>
            <div className="text-sm text-gray-500">
              ${(userData.staked * strxPrice).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Total Unstaked</div>
            <div className="text-xl font-semibold text-purple-700">
              {userData.unstaked.toLocaleString()} STRX
            </div>
            <div className="text-sm text-gray-500">
              ${(userData.unstaked * strxPrice).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Pool Share</div>
            <div className="text-xl font-semibold text-purple-700">
              {stakingStats?.percentageOfPool.toFixed(4)}%
            </div>
            <div className="text-sm text-gray-500">
              of total staked STRX
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Estimated Rewards</h2>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500">Daily</div>
                <div className="text-lg font-semibold text-purple-700">
                  {stakingStats?.rewards?.daily.toFixed(4)} STRX
                </div>
                <div className="text-sm text-gray-500">
                  ≈ ${stakingStats?.rewards?.dailyUsd.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Monthly</div>
                <div className="text-lg font-semibold text-purple-700">
                  {stakingStats?.rewards?.monthly.toFixed(4)} STRX
                </div>
                <div className="text-sm text-gray-500">
                  ≈ ${stakingStats?.rewards?.monthlyUsd.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Yearly</div>
                <div className="text-lg font-semibold text-purple-700">
                  {stakingStats?.rewards?.yearly.toFixed(4)} STRX
                </div>
                <div className="text-sm text-gray-500">
                  ≈ ${stakingStats?.rewards?.yearlyUsd.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Supply Statistics</h2>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-gray-500">% of Total Supply</div>
                <div className="text-lg font-semibold text-purple-700">
                  {stakingStats?.percentageOfSupply.toFixed(4)}%
                </div>
                <div className="text-sm text-gray-500">
                  of 2B STRX
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Value</div>
                <div className="text-lg font-semibold text-purple-700">
                  ${((userData.staked + userData.unstaked) * strxPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Staking Activity</h2>
            <div className="flex gap-2">
              {(['24h', '7d', '30d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 rounded-lg text-sm ${
                    timeRange === range
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={activityData}>
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => [
                      `${Math.abs(value).toLocaleString()} STRX`,
                      value > 0 ? 'Staked' : 'Unstaked'
                    ]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#7C63CC"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Recent Transactions</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-purple-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Time</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {userActions.slice(0, 10).map((action, index) => (
                  <tr key={index} className="hover:bg-purple-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {action.time.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={
                        action.type === 'add stake'
                          ? 'text-green-600'
                          : 'text-red-600'
                      }>
                        {action.type === 'add stake' ? 'Stake' : 'Unstake'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {action.amount.toLocaleString()} STRX
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <a
                        href={`https://explorer.xprnetwork.org/transaction/${action.trxId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-800 hover:underline"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserPage; 