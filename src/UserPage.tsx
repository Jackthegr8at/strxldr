import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import * as React from 'react';
import { CubeTransparentIcon } from '@heroicons/react/24/outline';

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
      name: string;
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
  const [transactionPage, setTransactionPage] = useState(1);
  const TRANSACTIONS_PER_PAGE = 10;

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
      const params = new URLSearchParams({
        limit: '50',
        account: username,
        'act.account': 'storex',
        'act.name': 'transfer'
      });
      
      return fetch(`${baseUrl}?${params}`).then(res => res.json());
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
      .map(action => {
        const amount = parseFloat(action.act.data.quantity.split(' ')[0]);
        return {
          time: new Date(action.timestamp),
          amount,
          usdValue: amount * strxPrice, // Calculate USD value
          type: action.act.data.memo,
          trxId: action.trx_id
        };
      })
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [actionsData, strxPrice]);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (transactionPage - 1) * TRANSACTIONS_PER_PAGE;
    const endIndex = startIndex + TRANSACTIONS_PER_PAGE;
    return userActions.slice(startIndex, endIndex);
  }, [userActions, transactionPage]);

  // Add this function back to calculate rewards
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

  // Define stakingStats using useMemo
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
  }, [userData, blockchainData, strxPrice]);

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

        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Recent Transactions</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-purple-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Time</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">USD Value</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedTransactions.map((action, index) => (
                  <tr key={index} className="hover:bg-purple-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {action.time.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={action.type === 'add stake' ? 'text-green-600' : 'text-red-600'}>
                        {action.type === 'add stake' ? 'Stake' : 'Unstake'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {action.amount.toLocaleString()} STRX
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      ${action.usdValue.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <a
                        href={`https://explorer.xprnetwork.org/transaction/${action.trxId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-800 hover:underline"
                      >
                        <CubeTransparentIcon className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">
                  Showing {((transactionPage - 1) * TRANSACTIONS_PER_PAGE) + 1} to {Math.min(transactionPage * TRANSACTIONS_PER_PAGE, userActions.length)} of {userActions.length} transactions
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTransactionPage(p => Math.max(1, p - 1))}
                    disabled={transactionPage === 1}
                    className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setTransactionPage(p => p + 1)}
                    disabled={transactionPage * TRANSACTIONS_PER_PAGE >= userActions.length}
                    className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserPage;