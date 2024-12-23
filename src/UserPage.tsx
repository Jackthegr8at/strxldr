import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { ArrowLeftIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import * as React from 'react';
import { CubeTransparentIcon } from '@heroicons/react/24/outline';
import { STAKING_TIERS, type StakingTier, calculateDaysUntilEmpty } from './index';

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

// Add this before the tierAnalysis useMemo
interface DailyDataPoint {
  day: number;
  date: Date;
  noCompound: number;
  dailyCompound: number;
  monthlyCompound: number;
  annualCompound: number;
}

const UserPage: React.FC<UserPageProps> = ({ username, onBack, userData, globalData }) => {
  const [transactionPage, setTransactionPage] = useState(1);
  const TRANSACTIONS_PER_PAGE = 10;

  // First, get the actions data
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

  // First get priceData
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
        limit: 100
      })
    })
    .then(res => {
      if (!res.ok) {
        throw new Error('Network response was not ok');
      }
      return res.json();
    }),
    { 
      refreshInterval: 120000,
      fallbackData: globalData.priceData
    }
  );

  // Then get strxPrice
  const strxPrice = useMemo(() => {
    if (!priceData?.rows) return 0;
    const strxRow = priceData.rows.find(row => row.sym === '4,STRX');
    return strxRow ? parseFloat(strxRow.quantity.split(' ')[0]) : 0;
  }, [priceData]);

  // Then define userActions
  const userActions = useMemo(() => {
    if (!actionsData?.actions) return [];
    
    return actionsData.actions
      .filter(action => {
        const memo = action.act.data.memo;
        return memo === "add stake" || memo === "withdraw stake" || memo === "claim staking rewards";
      })
      .map(action => {
        const amount = parseFloat(action.act.data.quantity.split(' ')[0]);
        return {
          time: new Date(action.timestamp),
          amount,
          usdValue: amount * strxPrice,
          type: action.act.data.memo,
          trxId: action.trx_id
        };
      })
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [actionsData, strxPrice]);

  // Fix the timeRange initialization by using useEffect
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');

  // Add useEffect to check transaction count and update timeRange
  useEffect(() => {
    if (userActions.length > 0) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentTransactions = userActions.filter(action => {
        return action.type !== 'claim staking rewards' && 
               action.time >= sevenDaysAgo;
      });

      if (recentTransactions.length < 2) {
        setTimeRange('30d');
      }
    }
  }, [userActions]);

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

  // Add total calculation
  const totalAmount = userData.staked + userData.unstaked;

  const stakingStats = useMemo(() => {
    if (!blockchainData?.rows?.[0]) return null;

    const totalStaked = parseFloat(blockchainData.rows[0].stakes.split(' ')[0]);
    const percentageOfPool = (userData.staked / totalStaked) * 100;
    const percentageOfSupply = (totalAmount / TOTAL_SUPPLY) * 100;

    return {
      percentageOfPool,
      percentageOfSupply,
      rewards: calculateRewards(userData.staked)
    };
  }, [userData, blockchainData, totalAmount]);

  const activityData = useMemo(() => {
    if (!userActions.length) return [];

    const now = new Date();
    const timeRangeMap = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    return userActions
      .filter(action => {
        if (action.type === 'claim staking rewards') return false;
        return now.getTime() - action.time.getTime() <= timeRangeMap[timeRange];
      })
      .map(action => ({
        time: action.time.toLocaleDateString(),
        amount: action.type === 'add stake' ? action.amount : -action.amount
      }));
  }, [userActions, timeRange]);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (transactionPage - 1) * TRANSACTIONS_PER_PAGE;
    const endIndex = startIndex + TRANSACTIONS_PER_PAGE;
    return userActions.slice(startIndex, endIndex);
  }, [userActions, transactionPage]);

  const currentTier = useMemo(() => {
    return STAKING_TIERS.find((tier, index) => {
      const nextTier = STAKING_TIERS[index - 1];
      return userData.staked >= tier.minimum && (!nextTier || userData.staked < nextTier.minimum);
    });
  }, [userData.staked]);

  const nextTier = useMemo(() => {
    const currentTierIndex = STAKING_TIERS.findIndex(t => t.name === currentTier?.name);
    return STAKING_TIERS[currentTierIndex - 1];
  }, [currentTier]);

  const tierProgress = useMemo(() => {
    if (!currentTier || !nextTier) return null;
    
    const remaining = nextTier.minimum - userData.staked;
    const percentageComplete = ((userData.staked - currentTier.minimum) / 
      (nextTier.minimum - currentTier.minimum)) * 100;

    return {
      remaining,
      percentageComplete
    };
  }, [currentTier, nextTier, userData.staked]);

  // Update projection range type
  const [projectionRange, setProjectionRange] = useState<'1y' | '2y' | '5y'>('1y');

  // Update rewards projection calculation
  const rewardsProjection = useMemo(() => {
    const rewards = stakingStats?.rewards;
    if (!rewards?.daily) return [];
    
    const dailyReward = rewards.daily;
    const data = [];
    const years = projectionRange === '1y' ? 1 : projectionRange === '2y' ? 2 : 5;
    const months = years * 12;
    
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    // Adjust interval based on projection range
    const interval = years === 1 ? 1 : years === 2 ? 2 : 3; // months

    for (let i = 0; i <= months; i += interval) {
      const date = new Date(startDate);
      date.setMonth(startDate.getMonth() + i);
      
      const daysSinceStart = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // No compound - just add daily rewards
      const noCompound = userData.staked + (dailyReward * daysSinceStart);
      
      // Daily compound
      const dailyRate = dailyReward / userData.staked;
      const dailyCompound = userData.staked * Math.pow(1 + dailyRate, daysSinceStart);
      
      // Monthly compound
      const monthlyRate = (dailyReward * 30) / userData.staked;
      const monthlyCompound = userData.staked * Math.pow(1 + monthlyRate, i);
      
      // Annual compound
      const annualRate = (dailyReward * 365) / userData.staked;
      const annualPeriods = Math.floor(daysSinceStart / 365);
      const annualCompound = userData.staked * Math.pow(1 + annualRate, annualPeriods);

      data.push({
        date: years === 1 
          ? date.toLocaleDateString(undefined, { month: 'short' })
          : years === 2 
            ? date.toLocaleDateString(undefined, { year: '2-digit', month: 'short' })
            : date.toLocaleDateString(undefined, { year: '2-digit' }),
        fullDate: date.toLocaleDateString(undefined, { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        amountNoCompound: noCompound,
        amountDaily: dailyCompound,
        amountMonthly: monthlyCompound,
        amountAnnually: annualCompound,
        day: daysSinceStart
      });
    }
    
    return data;
  }, [stakingStats, userData.staked, projectionRange]);

  // Add this with your other SWR fetches
  const { data: rewardsPoolData } = useSWR<any>(
    'rewards_pool',
    () => fetch('https://proton.eosusa.io/v1/chain/get_currency_balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: "storex",
        account: "rewards.strx",
        symbol: "STRX"
      })
    }).then(res => res.json())
  );

  // Then update the analysis section
  const tierAnalysis = useMemo(() => {
    const rewards = stakingStats?.rewards;
    if (!tierProgress || !rewards?.daily || !rewards?.monthly || !nextTier) return null;

    // Generate daily data points for accurate analysis
    const dailyData: DailyDataPoint[] = [];
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    // Generate 5 years of daily data (should be enough to find next tier)
    for (let i = 0; i <= 365 * 5; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      const daysSinceStart = i;
      
      // No compound
      const noCompound = userData.staked + (rewards.daily * daysSinceStart);
      
      // Daily compound
      const dailyRate = rewards.daily / userData.staked;
      const dailyCompound = userData.staked * Math.pow(1 + dailyRate, daysSinceStart);
      
      // Monthly compound - match the rewards projection calculation
      const monthsSinceStart = Math.floor(daysSinceStart / 30);
      const monthlyRate = (rewards.daily * 30) / userData.staked;
      const monthlyCompound = userData.staked * Math.pow(1 + monthlyRate, monthsSinceStart);
      
      // Annual compound
      const yearsSinceStart = Math.floor(daysSinceStart / 365);
      const annualRate = (rewards.daily * 365) / userData.staked;
      const annualCompound = userData.staked * Math.pow(1 + annualRate, yearsSinceStart);

      dailyData.push({
        day: i,
        date,
        noCompound,
        dailyCompound,
        monthlyCompound,
        annualCompound
      });

      // Stop if all strategies have reached the target
      if (Math.min(noCompound, dailyCompound, monthlyCompound, annualCompound) >= nextTier.minimum) {
        break;
      }
    }

    // Find days to reach next tier for each strategy
    const findDaysToTarget = (strategy: 'noCompound' | 'dailyCompound' | 'monthlyCompound' | 'annualCompound') => {
      const dataPoint = dailyData.find(d => d[strategy] >= nextTier.minimum);
      return dataPoint ? dataPoint.day : Infinity;
    };

    return {
      scenarios: {
        daily: findDaysToTarget('dailyCompound'),
        monthly: findDaysToTarget('monthlyCompound'),
        annually: findDaysToTarget('annualCompound'),
        noCompound: findDaysToTarget('noCompound')
      },
      monthlyProgress: (rewards.monthly / tierProgress.remaining) * 100
    };
  }, [tierProgress, stakingStats, userData.staked, nextTier]);

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
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-purple-600 hover:text-purple-800"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              Back to Leaderboard
            </button>
            {currentTier && (
              <span className="text-2xl ml-auto" title={currentTier.name}>
                {currentTier.emoji}
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className="text-3xl font-bold text-purple-700">
              {username}'s Staking Profile
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const url = `${window.location.origin}?user=${username}`;
                  navigator.clipboard.writeText(url);
                  alert('URL copied to clipboard!');
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Share
              </button>
              <a 
                href={`https://explorer.xprnetwork.org/account/${username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm"
              >
                View on Explorer →
              </a>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Rewards Projection</h2>
            <div className="flex items-center gap-2">
              <div 
                className="group relative"
                title="Projection Details"
              >
                <InformationCircleIcon 
                  className="h-5 w-5 text-gray-400 hover:text-purple-600 cursor-help"
                />
                <div className="invisible group-hover:visible absolute right-0 z-10 w-64 p-2 mt-2 text-sm text-white bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  <p>These projections assume current reward rates remain constant.</p>
                  <p className="mt-2">Current rewards pool will be depleted in approximately {Math.ceil(daysUntilEmpty)} days at current rates.</p>
                  {impossibleScenarios.length > 0 && (
                    <p className="mt-2">Some scenarios may become possible if the rewards pool is replenished, although rates might differ.</p>
                  )}
                </div>
              </div>
              {(['1y', '2y', '5y'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setProjectionRange(range)}
                  className={`px-3 py-1 rounded-lg text-sm ${
                    projectionRange === range
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                >
                  {range.replace('y', ' Year')}
                  {range !== '1y' ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border border-purple-100">
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={rewardsProjection}>
                  <XAxis 
                    dataKey="date" 
                    interval={projectionRange === '1y' ? 1 : 2}
                    angle={0}
                    textAnchor="middle"
                    height={30}
                  />
                  <YAxis 
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(value) => (value / 1000).toFixed(0) + 'k'}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => {
                      const difference = value - userData.staked;
                      return [
                        <div>
                          <div>{value.toLocaleString()} STRX</div>
                          <div className="text-xs text-gray-500">
                            +{difference.toLocaleString()} STRX
                          </div>
                        </div>,
                        'Projected Balance'
                      ];
                    }}
                    labelFormatter={(label, data) => {
                      if (!data?.[0]?.payload?.fullDate) return label;
                      return `Date: ${data[0].payload.fullDate}`;
                    }}
                  />
                  <Legend />
                  {['No Compound', 'Daily', 'Monthly', 'Annually'].map((strategy, index) => (
                    <Line 
                      key={strategy}
                      type="monotone" 
                      dataKey={`amount${strategy.replace(' ', '')}`}
                      name={`${strategy} Compound`}
                      stroke={['#7C63CC', '#10B981', '#3B82F6', '#F59E0B'][index]}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mb-8">
          {tierProgress && nextTier && (
            <div className="bg-white p-4 rounded-lg shadow border border-purple-100 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{currentTier?.emoji}</span>
                <span className="text-gray-400">➜</span>
                <span className="text-2xl">{nextTier.emoji}</span>
              </div>

              <div className="mb-2">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Progress to {nextTier.name}</span>
                  <span>{tierProgress.percentageComplete.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${tierProgress.percentageComplete}%` }}
                  ></div>
                </div>
              </div>

              <div className="text-sm text-gray-600">
                <span className="font-medium text-purple-600">
                  {tierProgress.remaining.toLocaleString()} STRX
                </span>
                {' '}remaining to {nextTier.name}
              </div>

              {tierAnalysis && (
                <div className="mt-4 p-3 bg-purple-50 rounded-lg">
                  <h4 className="text-sm font-semibold text-purple-700 mb-2">Time to Next Tier Analysis</h4>
                  
                  {blockchainData?.rows?.[0] && rewardsPoolData?.[0] && (() => {
                    const daysUntilEmpty = calculateDaysUntilEmpty(
                      parseFloat(rewardsPoolData[0]),
                      parseFloat(blockchainData.rows[0].stakes.split(' ')[0]),
                      parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0])
                    );

                    const possibleScenarios: Array<[string, number]> = [];
                    const impossibleScenarios: Array<[string, number]> = [];

                    Object.entries(tierAnalysis.scenarios).forEach(([strategy, days]) => {
                      if (days <= daysUntilEmpty) {
                        possibleScenarios.push([strategy, days]);
                      } else {
                        impossibleScenarios.push([strategy, days]);
                      }
                    });

                    return (
                      <>
                        {possibleScenarios.length > 0 && (
                          <div className="mb-4">
                            <div className="text-sm text-green-700 mb-2">Possible with current reward rates:</div>
                            {possibleScenarios.map(([strategy, days]) => {
                              const targetDate = new Date();
                              targetDate.setDate(targetDate.getDate() + Math.ceil(days));
                              
                              return (
                                <p key={strategy} className="text-sm text-gray-600 ml-2">
                                  <span className="font-medium text-purple-700">
                                    {strategy === 'noCompound' ? 'Without compounding: ' :
                                     strategy === 'daily' ? 'Daily compound: ' :
                                     strategy === 'monthly' ? 'Monthly compound: ' : 'Annual compound: '}
                                  </span>
                                  ~{Math.ceil(days)} days ({targetDate.toLocaleDateString()})
                                </p>
                              );
                            })}
                          </div>
                        )}
                        
                        {impossibleScenarios.length > 0 && (
                          <div>
                            <div className="text-sm text-red-700 mb-2">Not possible with current reward rates:</div>
                            {impossibleScenarios.map(([strategy, days]) => (
                              <p key={strategy} className="text-sm text-gray-600 ml-2">
                                <span className="font-medium text-purple-700">
                                  {strategy === 'noCompound' ? 'Without compounding: ' :
                                   strategy === 'daily' ? 'Daily compound: ' :
                                   strategy === 'monthly' ? 'Monthly compound: ' : 'Annual compound: '}
                                </span>
                                ~{Math.ceil(days)} days (exceeds pool duration)
                              </p>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 text-sm text-gray-600">
                          <div className="flex justify-between items-start mb-1">
                            <div className="text-sm text-gray-500">Note</div>
                            <div 
                              className="group relative"
                              title="Projection Details"
                            >
                              <InformationCircleIcon 
                                className="h-5 w-5 text-gray-400 hover:text-purple-600 cursor-help"
                              />
                              <div className="invisible group-hover:visible absolute right-0 z-10 w-64 p-2 mt-2 text-sm text-white bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                <p>These projections assume current reward rates remain constant.</p>
                                <p className="mt-2">Current rewards pool will be depleted in approximately {Math.ceil(daysUntilEmpty)} days at current rates.</p>
                                {impossibleScenarios.length > 0 && (
                                  <p className="mt-2">Some scenarios may become possible if the rewards pool is replenished, although rates might differ.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mt-3">
                          Monthly rewards contribute{' '}
                          <span className="font-medium text-purple-700">
                            {tierAnalysis.monthlyProgress.toFixed(2)}%
                          </span>
                          {' '}towards your next tier goal
                        </p>
                      </>
                    );
                  })()}

                  <div className="mt-4 text-xs text-gray-500">
                    <p className="mb-1">
                      Note: These projections assume current reward rates remain constant.
                    </p>
                    <p>
                      Current rewards pool: {' '}
                      <span className="font-medium">
                        {rewardsPoolData?.[0] 
                          ? parseFloat(rewardsPoolData[0]).toLocaleString() 
                          : '...'} STRX
                      </span>
                      {blockchainData?.rows?.[0] && rewardsPoolData?.[0] && (
                        <span className="text-gray-500">
                          {' '}(~{calculateDaysUntilEmpty(
                            parseFloat(rewardsPoolData[0]),
                            parseFloat(blockchainData.rows[0].stakes.split(' ')[0]),
                            parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0])
                          ).toLocaleString()} days until empty)
                        </span>
                      )}
                    </p>
                    <p>
                      Projections may vary based on changes in reward rates and available rewards.
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 mt-3">
                    Monthly rewards contribute{' '}
                    <span className="font-medium text-purple-700">
                      {tierAnalysis.monthlyProgress.toFixed(2)}%
                    </span>
                    {' '}towards your next tier goal
                  </p>
                </div>
              )}
            </div>
          )}
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
                <div className="text-sm text-gray-500">Total Balance</div>
                <div className="text-lg font-semibold text-purple-700">
                  {totalAmount.toLocaleString()} STRX
                </div>
                <div className="text-sm text-gray-500">
                  ≈ ${(totalAmount * strxPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">% of Total Supply</div>
                <div className="text-lg font-semibold text-purple-700">
                  {(totalAmount / TOTAL_SUPPLY * 100).toFixed(4)}%
                </div>
                <div className="text-sm text-gray-500">
                  of 2B STRX
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
            <div className="overflow-x-auto">
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
                        <span className={
                          action.type === 'add stake' ? 'text-green-600' :
                          action.type === 'withdraw stake' ? 'text-red-600' :
                          action.type === 'claim staking rewards' ? 'text-blue-600' :
                          'text-gray-600'
                        }>
                          {action.type === 'add stake' ? 'Stake' :
                           action.type === 'withdraw stake' ? 'Unstake' :
                           action.type === 'claim staking rewards' ? 'Claim' : 
                           'Unknown'}
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
            </div>
            
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
// smapshot version
// 1.1.0