import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import useSWR from 'swr';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { StakingTier, STAKING_TIERS, calculateRewards, StakeData, ActionResponse, BlockchainResponse, fetcher } from './utils';

type UserPageProps = {
  strxPrice: number;
  blockchainData?: BlockchainResponse;
};

export const UserPage: React.FC<UserPageProps> = ({ strxPrice, blockchainData }) => {
  const { username } = useParams<{ username: string }>();
  
  // Fetch user's staking data
  const { data: userData } = useSWR<StakeData>(
    `https://nfts.jessytremblay.com/STRX/stakes.json`,
    fetcher
  );

  // Fetch user's recent actions
  const { data: actionsData } = useSWR<ActionResponse>(
    username ? [
      'user_actions',
      username
    ] : null,
    () => {
      const baseUrl = 'https://proton.eosusa.io/v2/history/get_actions';
      const params = new URLSearchParams({
        limit: '100',
        account: 'storexstake',
        sort: 'desc',
        'act.name': 'transfer',
        search: username || ''
      });
      
      return fetch(`${baseUrl}?${params}`).then(res => res.json());
    },
    { refreshInterval: 30000 }
  );

  const userStats = useMemo(() => {
    if (!userData || !username) return null;

    const user = userData[username];
    if (!user) return null;

    // Calculate user's tier
    const tier = STAKING_TIERS.find((t: StakingTier, index: number) => {
      const nextTier = STAKING_TIERS[index - 1];
      return user.staked >= t.minimum && (!nextTier || user.staked < nextTier.minimum);
    });

    // Calculate next tier progress
    const tierIndex = STAKING_TIERS.findIndex((t: StakingTier) => t.name === tier?.name);
    const nextTier = STAKING_TIERS[tierIndex - 1];
    const tierProgress = nextTier ? {
      current: tier,
      next: nextTier,
      remaining: nextTier.minimum - user.staked,
      progress: ((user.staked - (tier?.minimum || 0)) / 
        (nextTier.minimum - (tier?.minimum || 0))) * 100
    } : null;

    // Calculate rewards
    const rewardsPerSec = blockchainData?.rows[0]?.rewards_sec 
      ? parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0])
      : 0;
    
    const rewards = calculateRewards(
      user.staked,
      rewardsPerSec,
      strxPrice,
      blockchainData?.rows[0]?.stakes ? parseFloat(blockchainData.rows[0].stakes.split(' ')[0]) : 0
    );

    return {
      staked: user.staked,
      unstaked: user.unstaked,
      total: user.staked + user.unstaked,
      tier,
      tierProgress,
      rewards
    };
  }, [userData, username, blockchainData, strxPrice]);

  // Process user's action history
  const actionHistory = useMemo(() => {
    if (!actionsData?.actions) return [];
    
    return actionsData.actions
      .filter((action: ActionResponse['actions'][0]) => 
        action.act.data.from === username || 
        action.act.data.to === username
      )
      .map((action: ActionResponse['actions'][0]) => ({
        time: new Date(action.timestamp),
        type: action.act.data.memo,
        amount: parseFloat(action.act.data.quantity.split(' ')[0]),
        trxId: action.trx_id
      }));
  }, [actionsData, username]);

  if (!userStats) {
    return (
      <div className="min-h-screen bg-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Link 
            to="/"
            className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-800 mb-6"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Back to Leaderboard
          </Link>
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-800">User not found</h2>
            <p className="text-gray-600 mt-2">
              No staking data found for username: {username}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link 
          to="/"
          className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-800 mb-6"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Back to Leaderboard
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-purple-700 mb-2">
            {username} {userStats.tier?.emoji}
          </h1>
          <a 
            href={`https://explorer.xprnetwork.org/account/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 hover:text-purple-800 hover:underline"
          >
            View on Explorer
          </a>
        </div>

        {/* User Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Staked Amount</div>
            <div className="text-xl font-semibold text-purple-700">
              {userStats.staked.toLocaleString()} STRX
            </div>
            <div className="text-sm text-gray-500">
              ${(userStats.staked * strxPrice).toLocaleString()}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Unstaked Amount</div>
            <div className="text-xl font-semibold text-purple-700">
              {userStats.unstaked.toLocaleString()} STRX
            </div>
            <div className="text-sm text-gray-500">
              ${(userStats.unstaked * strxPrice).toLocaleString()}
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="text-sm text-gray-500 mb-1">Total Balance</div>
            <div className="text-xl font-semibold text-purple-700">
              {userStats.total.toLocaleString()} STRX
            </div>
            <div className="text-sm text-gray-500">
              ${(userStats.total * strxPrice).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Tier Progress */}
        {userStats.tierProgress && (
          <div className="bg-white p-6 rounded-lg shadow border border-purple-100 mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Tier Progress
            </h2>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">{userStats.tier?.emoji}</span>
              <span className="text-gray-400">➜</span>
              <span className="text-2xl">{userStats.tierProgress.next.emoji}</span>
            </div>
            <div className="mb-2">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress to {userStats.tierProgress.next.name}</span>
                <span>{userStats.tierProgress.progress.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${userStats.tierProgress.progress}%` }}
                ></div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-medium text-purple-600">
                {userStats.tierProgress.remaining.toLocaleString()} STRX
              </span>
              {' '}remaining until {userStats.tierProgress.next.name}
            </div>
          </div>
        )}

        {/* Rewards Section */}
        <div className="bg-white p-6 rounded-lg shadow border border-purple-100 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Estimated Rewards
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-500 mb-1">Daily</div>
              <div className="text-lg font-semibold text-purple-700">
                {userStats.rewards.daily.toFixed(4)} STRX
              </div>
              <div className="text-sm text-gray-500">
                ${userStats.rewards.dailyUsd.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Monthly</div>
              <div className="text-lg font-semibold text-purple-700">
                {userStats.rewards.monthly.toFixed(4)} STRX
              </div>
              <div className="text-sm text-gray-500">
                ${userStats.rewards.monthlyUsd.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Yearly</div>
              <div className="text-lg font-semibold text-purple-700">
                {userStats.rewards.yearly.toFixed(4)} STRX
              </div>
              <div className="text-sm text-gray-500">
                ${userStats.rewards.yearlyUsd.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Action History */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">
              Recent Activity
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-purple-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Time</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Action</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-purple-700">USD Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {actionHistory.map((action: { time: Date; type: string; amount: number; trxId: string }, index: number) => (
                  <tr key={index} className="hover:bg-purple-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {action.time.toLocaleString()}
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
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {action.amount.toLocaleString()} STRX
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      ${(action.amount * strxPrice).toLocaleString()}
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