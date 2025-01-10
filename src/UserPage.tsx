import { useState, useMemo, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { ArrowLeftIcon, InformationCircleIcon, MagnifyingGlassIcon, CubeTransparentIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend, CartesianGrid } from 'recharts';
import * as React from 'react';
import { STAKING_TIERS, type StakingTier, calculateDaysUntilEmpty } from './index';
import debounce from 'lodash/debounce';
import { ThemeToggle } from './components/ThemeToggle';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { Header } from './components/Header';

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

type DexScreenerData = {
  pairs: Array<{
    priceUsd: string;
    volume24h: number;
    txns24h: {
      buys: number;
      sells: number;
    };
  }>;
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

// Update the formatTimestamp function
const formatTimestamp = (timestamp: Date | string) => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  });
};

// Add BridgeAction type
type BridgeAction = {
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
};

// Add helper functions
const cleanMemo = (memo: string) => {
  if (memo.startsWith('STRX-SPL@')) {
    return memo.replace('STRX-SPL@', '');
  }
  
  const solanaMatch = memo.match(/Cross-chain wrap from Solana \((.*?)\)/);
  if (solanaMatch) {
    return solanaMatch[1];
  }
  
  return memo;
};

const getTransactionType = (memo: string) => {
  if (memo.startsWith('STRX-SPL@')) {
    return 'outbound';
  }
  if (memo.includes('Cross-chain wrap from Solana')) {
    return 'inbound';
  }
  return 'other';
};

const UserPage: React.FC<UserPageProps> = ({ username, onBack, userData, globalData }) => {
  const [projectionRange, setProjectionRange] = useState<'1y' | '2y' | '5y'>('1y');
  const [simulatedStaked, setSimulatedStaked] = useState(userData.staked);
  const [transactionPage, setTransactionPage] = useState(1);
  const TRANSACTIONS_PER_PAGE = 10;

  // Add bridge-related states here
  const [allUserBridgeActions, setAllUserBridgeActions] = useState<BridgeAction[]>([]);
  const [isLoadingBridge, setIsLoadingBridge] = useState(false);
  const [hasMoreBridgeData, setHasMoreBridgeData] = useState(true);
  const [skipBridge, setSkipBridge] = useState(0);
  const [showAllUsd, setShowAllUsd] = useState(false);
  const [showUsd, setShowUsd] = useState<{[key: string]: boolean}>({});
  const FETCH_LIMIT = 300;

  // Update the transaction type to use string for time
  type Transaction = {
    time: string;
    amount: number;
    usdValue: number;
    type: string;
    trxId: string;
  };

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
        // Properly handle UTC timestamp
        const time = new Date(action.timestamp + 'Z'); // Add Z to ensure UTC parsing
        return {
          time,
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
    const percentageOfPool = (simulatedStaked / totalStaked) * 100;
    const percentageOfSupply = (totalAmount / TOTAL_SUPPLY) * 100;

    return {
      percentageOfPool,
      percentageOfSupply,
      rewards: calculateRewards(simulatedStaked)
    };
  }, [blockchainData, simulatedStaked, totalAmount, strxPrice]);

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
      }))
      .reverse();
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

  // Add this debounced function
  const debouncedSetSimulated = useCallback(
    debounce((value: number) => {
      setSimulatedStaked(value);
    }, 500),
    []
  );

  // Update rewards projection calculation
  const rewardsProjection = useMemo(() => {
    const rewards = stakingStats?.rewards;
    if (!rewards?.daily) return [];
    
    const dailyReward = rewards.daily * (simulatedStaked / userData.staked);
    const data = [];
    const years = projectionRange === '1y' ? 1 : projectionRange === '2y' ? 2 : 5;
    const months = years * 12;
    
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    const interval = years === 1 ? 1 : years === 2 ? 2 : 3;

    for (let i = 0; i <= months; i += interval) {
      const date = new Date(startDate);
      date.setMonth(startDate.getMonth() + i);
      
      const daysSinceStart = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // No compound - just add daily rewards
      const noCompound = simulatedStaked + (dailyReward * daysSinceStart);
      
      // Daily compound
      const dailyRate = dailyReward / simulatedStaked;
      const dailyCompound = simulatedStaked * Math.pow(1 + dailyRate, daysSinceStart);
      
      // Monthly compound
      const monthlyRate = (dailyReward * 30) / simulatedStaked;
      const monthlyCompound = simulatedStaked * Math.pow(1 + monthlyRate, i);
      
      // Annual compound
      const annualRate = (dailyReward * 365) / simulatedStaked;
      const annualPeriods = Math.floor(daysSinceStart / 365);
      const annualCompound = simulatedStaked * Math.pow(1 + annualRate, annualPeriods);

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
  }, [stakingStats, simulatedStaked, projectionRange, userData.staked]);

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
    if (!tierProgress || !rewards?.daily || !nextTier) return null;

    // Calculate scenarios for both current and simulated amounts
    const calculateScenarios = (amount: number, dailyReward: number) => {
      const dailyData: DailyDataPoint[] = [];
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      // Generate 5 years of daily data (should be enough to find next tier)
      for (let i = 0; i <= 365 * 5; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        
        const daysSinceStart = i;
        
        // No compound
        const noCompound = amount + (dailyReward * daysSinceStart);
        
        // Daily compound
        const dailyRate = dailyReward / amount;
        const dailyCompound = amount * Math.pow(1 + dailyRate, daysSinceStart);
        
        // Monthly compound
        const monthsSinceStart = Math.floor(daysSinceStart / 30);
        const monthlyRate = (dailyReward * 30) / amount;
        const monthlyCompound = amount * Math.pow(1 + monthlyRate, monthsSinceStart);
        
        // Annual compound
        const yearsSinceStart = Math.floor(daysSinceStart / 365);
        const annualRate = (dailyReward * 365) / amount;
        const annualCompound = amount * Math.pow(1 + annualRate, yearsSinceStart);

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

      const findDaysToTarget = (strategy: 'noCompound' | 'dailyCompound' | 'monthlyCompound' | 'annualCompound') => {
        const dataPoint = dailyData.find(d => d[strategy] >= nextTier.minimum);
        return dataPoint?.day || Infinity;
      };

      return {
        daily: findDaysToTarget('dailyCompound'),
        monthly: findDaysToTarget('monthlyCompound'),
        annually: findDaysToTarget('annualCompound'),
        noCompound: findDaysToTarget('noCompound')
      };
    };

    const currentScenarios = calculateScenarios(userData.staked, rewards.daily);
    const simulatedScenarios = calculateScenarios(simulatedStaked, rewards.daily * (simulatedStaked / userData.staked));

    const rewardDifference = (rewards.daily * (simulatedStaked / userData.staked)) - rewards.daily;

    const adjustedDailyReward = rewards.daily * (simulatedStaked / userData.staked);
    const adjustedMonthlyReward = adjustedDailyReward * 30;

    return {
      scenarios: simulatedScenarios,
      currentScenarios,
      comparison: {
        stakeDifference: simulatedStaked - userData.staked,
        dailyRewardDifference: rewardDifference,
        monthlyRewardDifference: rewardDifference * 30,
        yearlyRewardDifference: rewardDifference * 365,
        daysDifference: {
          daily: currentScenarios.daily - simulatedScenarios.daily,
          monthly: currentScenarios.monthly - simulatedScenarios.monthly,
          annually: currentScenarios.annually - simulatedScenarios.annually,
          noCompound: currentScenarios.noCompound - simulatedScenarios.noCompound
        }
      },
      monthlyProgress: (adjustedMonthlyReward / (nextTier.minimum - simulatedStaked)) * 100
    };
  }, [tierProgress, stakingStats, simulatedStaked, nextTier, userData.staked]);

  // Add the bridge actions fetching
  const { data: bridgeActions, mutate: refetchBridgeActions } = useSWR<ActionResponse>(
    ['bridge_actions', skipBridge, username],
    async () => {
      setIsLoadingBridge(true);
      const baseUrl = `${process.env.REACT_APP_XPR_ENDPOINT || 'https://proton.eosusa.io'}/v2/history/get_actions`;
      const params = new URLSearchParams({
        limit: FETCH_LIMIT.toString(),
        account: 'bridge.strx',
        'act.name': 'transfer',
        skip: skipBridge.toString()
      });
      
      const response = await fetch(`${baseUrl}?${params}`);
      const data = await response.json();
      setIsLoadingBridge(false);
      return data;
    },
    { refreshInterval: 30000 }
  );

  // Effect to accumulate and filter user's bridge actions
  useEffect(() => {
    if (bridgeActions?.actions) {
      setAllUserBridgeActions(prev => {
        const existingIds = new Set(prev.map(a => a.trx_id));
        
        // Filter for user's transactions and remove duplicates
        const newActions = bridgeActions.actions.filter(a => 
          !existingIds.has(a.trx_id) && 
          (a.act.data.from === username || a.act.data.to === username)
        );
        
        // If no new user-related actions, we've reached the end
        if (newActions.length === 0) {
          setHasMoreBridgeData(false);
        }

        return [...prev, ...newActions].sort(
          (a, b) => new Date(b.timestamp + 'Z').getTime() - new Date(a.timestamp + 'Z').getTime()
        );
      });
    }
  }, [bridgeActions, username]);

  // Process bridge actions
  const processedBridgeActions = useMemo(() => {
    return allUserBridgeActions
      .filter(action => !action.act.data.memo.includes('Cross-chain wrap fee'))
      .map(action => ({
        time: formatTimestamp(action.timestamp),
        from: action.act.data.from,
        to: action.act.data.to,
        amount: parseFloat(action.act.data.quantity.split(' ')[0]),
        memo: cleanMemo(action.act.data.memo),
        trxId: action.trx_id,
        type: getTransactionType(action.act.data.memo)
      }));
  }, [allUserBridgeActions]);

  // Add pagination states for bridge actions
  const [currentBridgePage, setCurrentBridgePage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  const totalBridgePages = Math.ceil(processedBridgeActions.length / ITEMS_PER_PAGE);
  const currentBridgePageData = processedBridgeActions.slice(
    (currentBridgePage - 1) * ITEMS_PER_PAGE,
    currentBridgePage * ITEMS_PER_PAGE
  );

  // Add toggle function for USD display
  const toggleAmountDisplay = (trxId: string) => {
    setShowUsd(prev => ({
      ...prev,
      [trxId]: !prev[trxId]
    }));
  };

  // Add near other SWR hooks
  const { data: dexScreenerData } = useSWR<DexScreenerData>(
    'dexscreener_data',
    () => fetch('https://api.dexscreener.com/latest/dex/pairs/solana/5XVsERryqVvKPDMUh851H4NsSiK68gGwRg9Rpqf9yMmf')
      .then(res => res.json()),
    { refreshInterval: 30000 }
  );

  const isMobile = window.innerWidth < 768; // Adjust the breakpoint as needed

  if (!userData) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="container mx-auto px-4 py-8">
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Back to Leaderboard
          </button>
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">User not found</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">No staking data available for {username}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="container mx-auto px-4 md:px-20 md:py-12 py-8">
        <div className="min-h-screen bg-background">
          <div className="">
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
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
                  <h1 className="text-3xl font-bold text-purple-700 dark:text-purple-400">
                    {username}'s Staking Profile
                  </h1>
                  <div className="flex gap-2">
                    <a 
                      href={`https://explorer.xprnetwork.org/account/${username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/40 transition-colors"
                    >
                      View on Explorer →
                    </a>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <div className="flex flex-col gap-4 mb-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Rewards Projection</h2>
                    <div className="flex gap-2">
                      {(['1y', '2y', '5y'] as const).map((range) => (
                        <button
                          key={range}
                          onClick={() => setProjectionRange(range)}
                          className={`px-3 py-1 rounded-lg text-sm ${
                            projectionRange === range
                              ? 'bg-purple-600 text-white dark:bg-purple-500'
                              : 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-400 dark:hover:bg-purple-800'
                          }`}
                        >
                          {range.replace('y', ' Year')}
                          {range !== '1y' ? 's' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-32 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded 
                                 focus:outline-none focus:ring-2 focus:ring-purple-500 
                                 bg-white dark:bg-gray-800 
                                 text-gray-900 dark:text-gray-100"
                        defaultValue={userData.staked}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          debouncedSetSimulated(value);
                        }}
                        placeholder="Staked amount"
                        min="0"
                        step="50000"
                      />
                      <span className="text-sm text-gray-500 dark:text-gray-400">STRX</span>
                    </div>
                    <div className="group relative">
                      <InformationCircleIcon 
                        className="h-5 w-5 text-gray-400 hover:text-purple-600 cursor-help"
                      />
                      <div className="invisible group-hover:visible absolute right-0 z-10 w-64 p-2 mt-2 text-sm text-popover-foreground bg-popover rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <p>These projections assume current reward rates remain constant.</p>
                        {blockchainData?.rows?.[0] && rewardsPoolData?.[0] && (
                          <p className="mt-2">Current rewards pool will be depleted in approximately {calculateDaysUntilEmpty(
                            parseFloat(rewardsPoolData[0]),
                            parseFloat(blockchainData.rows[0].stakes.split(' ')[0]),
                            parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0])
                          )} days at current rates.</p>
                        )}
                        <p className="mt-2">Some scenarios may become possible if the rewards pool is replenished, although rates might differ.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-card rounded-lg shadow p-4">
                  <div className="h-64">
                    <ResponsiveContainer>
                      <LineChart data={rewardsProjection}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--axis-color)" />
                        <XAxis 
                          dataKey="date" 
                          interval={projectionRange === '1y' ? 1 : 2}
                          angle={0}
                          textAnchor="middle"
                          height={30}
                          tick={{ fill: 'var(--axis-color)' }}
                        />
                        <YAxis 
                          domain={['dataMin', 'dataMax']}
                          tickFormatter={(value) => (value / 1000).toFixed(0) + 'k'}
                          tick={{ fill: 'var(--axis-color)' }}
                          width={50}
                        />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'rgba(0, 0, 0, 0.6)',
                            border: '1px solid #6B21A8',
                            borderRadius: '0.5rem',
                            padding: '10px',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                          }}
                          labelStyle={{
                            color: 'white',
                            fontWeight: 'bold',
                          }}
                          formatter={(value: number) => [
                            `${value > 0 ? '+' : '-'}${Math.abs(value).toLocaleString()} STRX`
                          ]}
                          position={isMobile ? { x: 10, y: 0 } : undefined}
                        />
                        <Legend />
                        {['No Compound', 'Daily', 'Monthly', 'Annually'].map((strategy, index) => (
                          <Line 
                            key={strategy}
                            type="monotone" 
                            dataKey={`amount${strategy.replace(' ', '')}`}
                            name={strategy === 'No Compound' ? 'No Compound' : `${strategy} Compound`}
                            stroke={['#7C63CC', '#10B981', '#3B82F6', '#F59E0B'][index]}
                            dot={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                {tierAnalysis?.comparison && simulatedStaked !== userData.staked && (
                  <div className="mt-4 p-4 bg-purple-50/50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                    <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2">
                      Simulation Analysis
                    </h4>
                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                      <p>
                        <span className="font-medium text-purple-700 dark:text-purple-400">
                          {Math.abs(tierAnalysis.comparison.stakeDifference).toLocaleString()} STRX
                        </span>
                        {' '}({Math.abs(tierAnalysis.comparison.stakeDifference * strxPrice).toFixed(2)}$)
                        {' '}{tierAnalysis.comparison.stakeDifference > 0 ? 'increase' : 'decrease'} in staked amount
                      </p>
                      <p>
                        <span className="font-medium text-purple-700 dark:text-purple-400">
                          {Math.abs(tierAnalysis.comparison.dailyRewardDifference).toFixed(4)} STRX
                        </span>
                        {' '}({Math.abs(tierAnalysis.comparison.dailyRewardDifference * strxPrice).toFixed(2)}$)
                        {' '}{tierAnalysis.comparison.dailyRewardDifference > 0 ? 'more' : 'less'} in daily rewards
                      </p>
                      <p>
                        <span className="font-medium text-purple-700 dark:text-purple-400">
                          {Math.abs(tierAnalysis.comparison.monthlyRewardDifference).toFixed(4)} STRX
                        </span>
                        {' '}({Math.abs(tierAnalysis.comparison.monthlyRewardDifference * strxPrice).toFixed(2)}$)
                        {' '}{tierAnalysis.comparison.monthlyRewardDifference > 0 ? 'more' : 'less'} in monthly rewards
                      </p>
                      <p>
                        <span className="font-medium text-purple-700 dark:text-purple-400">
                          {Math.abs(tierAnalysis.comparison.yearlyRewardDifference).toFixed(4)} STRX
                        </span>
                        {' '}({Math.abs(tierAnalysis.comparison.yearlyRewardDifference * strxPrice).toFixed(2)}$)
                        {' '}{tierAnalysis.comparison.yearlyRewardDifference > 0 ? 'more' : 'less'} in yearly rewards
                      </p>
                      {Object.entries(tierAnalysis.comparison.daysDifference).map(([strategy, diff]) => (
                        <p key={strategy}>
                          {strategy === 'noCompound' ? 'Without compounding' : 
                           `${strategy.charAt(0).toUpperCase() + strategy.slice(1)} compound`}: {' '}
                          <span className="font-medium text-purple-700 dark:text-purple-400">
                            {Math.abs(Math.ceil(diff))} days {diff > 0 ? 'faster' : 'slower'}
                          </span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-8">
                {tierProgress && nextTier && (
                  <div className="bg-card rounded-lg shadow p-4 mb-8">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{currentTier?.emoji}</span>
                        <span className="text-gray-400 dark:text-gray-500">➜</span>
                        <span className="text-2xl">{nextTier.emoji}</span>
                      </div>
                      {blockchainData?.rows?.[0] && rewardsPoolData?.[0] && (
                        <div className="group relative">
                          <InformationCircleIcon 
                            className="h-5 w-5 text-gray-400 hover:text-purple-600 cursor-help"
                          />
                          <div className="invisible group-hover:visible absolute right-0 z-10 w-64 p-2 mt-2 text-sm text-popover-foreground bg-popover rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                            <p>These projections assume current reward rates remain constant.</p>
                            <p className="mt-2">Current rewards pool will be depleted in approximately {calculateDaysUntilEmpty(
                              parseFloat(rewardsPoolData[0]),
                              parseFloat(blockchainData.rows[0].stakes.split(' ')[0]),
                              parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0])
                            )} days at current rates.</p>
                            <p className="mt-2">Some scenarios may become possible if the rewards pool is replenished, although rates might differ.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mb-2">
                      <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                        <span>Progress to {nextTier.name}</span>
                        <span>{tierProgress.percentageComplete.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div 
                          className="bg-purple-600 dark:bg-purple-500 h-2.5 rounded-full transition-all duration-500"
                          style={{ width: `${tierProgress.percentageComplete}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-purple-600 dark:text-purple-400">
                        {tierProgress.remaining.toLocaleString()} STRX
                      </span>
                      {' '}remaining to {nextTier.name}
                    </div>

                    {tierAnalysis && (
                      <div className="mt-4 p-3 bg-purple-50/50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                        <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2">
                          Time to Next Tier Analysis
                        </h4>
                        
                        {blockchainData?.rows?.[0] && rewardsPoolData?.[0] && (() => {
                          const daysUntilEmpty = calculateDaysUntilEmpty(
                            parseFloat(rewardsPoolData[0]),
                            parseFloat(blockchainData.rows[0].stakes.split(' ')[0]),
                            parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0])
                          );

                          // Filter out annual scenarios when creating possible/impossible lists
                          const possibleScenarios = Object.entries(tierAnalysis.scenarios)
                            .filter(([strategy]) => strategy !== 'annually')
                            .filter(([_, days]) => days <= daysUntilEmpty);

                          const impossibleScenarios = Object.entries(tierAnalysis.scenarios)
                            .filter(([strategy]) => strategy !== 'annually')
                            .filter(([_, days]) => days > daysUntilEmpty);

                          return (
                            <>
                              {possibleScenarios.length > 0 && (
                                <div className="mb-4">
                                  <div className="text-sm text-green-700 dark:text-green-400 mb-2">
                                    Possible with current reward rates:
                                  </div>
                                  {possibleScenarios.map(([strategy, days]) => {
                                    const targetDate = new Date();
                                    targetDate.setDate(targetDate.getDate() + Math.ceil(days));
                                    
                                    return (
                                      <p key={strategy} className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                                        <span className="font-medium text-purple-700 dark:text-purple-400">
                                          {strategy === 'noCompound' ? 'Without compounding: ' :
                                           strategy === 'daily' ? 'Daily compound: ' :
                                           strategy === 'monthly' ? 'Monthly compound: ' :
                                           strategy === 'annually' ? 'Annual compound: ' : 'Unknown'}
                                        </span>
                                        ~{Math.ceil(days)} days ({targetDate.toLocaleDateString()})
                                      </p>
                                    );
                                  })}
                                </div>
                              )}
                              
                              {impossibleScenarios.length > 0 && (
                                <div>
                                  <div className="text-sm text-red-700 dark:text-red-400 mb-2">
                                    Not possible with current reward rates:
                                  </div>
                                  {impossibleScenarios.map(([strategy, days]) => (
                                    <p key={strategy} className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                                      <span className="font-medium text-purple-700 dark:text-purple-400">
                                        {strategy === 'noCompound' ? 'Without compounding: ' :
                                         strategy === 'daily' ? 'Daily compound: ' :
                                         strategy === 'monthly' ? 'Monthly compound: ' : 'Unknown'}
                                      </span>
                                      ~{Math.ceil(days)} days (exceeds pool duration)
                                    </p>
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}

                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                          Monthly rewards of{' '}
                          <span className="font-medium text-purple-700 dark:text-purple-400">
                            {stakingStats?.rewards?.monthly.toFixed(4)} STRX
                          </span>
                          {' '}contribute{' '}
                          <span className="font-medium text-purple-700 dark:text-purple-400">
                            {((stakingStats?.rewards?.monthly ?? 0) / (nextTier.minimum - userData.staked) * 100).toFixed(2)}%
                          </span>
                          {' '}towards your next tier goal. At this rate, it will take approximately{' '}
                          <span className="font-medium text-purple-700 dark:text-purple-400">
                            {Math.ceil((nextTier.minimum - userData.staked) / (stakingStats?.rewards?.monthly ?? 0))}
                          </span>
                          {' '}months to reach the next tier.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-card rounded-lg shadow p-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Staked</div>
                  <div className="text-xl font-semibold text-purple-700 dark:text-purple-400">
                    {userData.staked.toLocaleString()} STRX
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ${(userData.staked * strxPrice).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </div>
                </div>

                <div className="bg-card rounded-lg shadow p-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Unstaked</div>
                  <div className="text-xl font-semibold text-purple-700 dark:text-purple-400">
                    {userData.unstaked.toLocaleString()} STRX
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ${(userData.unstaked * strxPrice).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </div>
                </div>

                <div className="bg-card rounded-lg shadow p-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Pool Share</div>
                  <div className="text-xl font-semibold text-purple-700 dark:text-purple-400">
                    {stakingStats?.percentageOfPool.toFixed(4)}%
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    of total staked STRX
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="bg-card rounded-lg shadow p-4">
                  <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Estimated Rewards</h2>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Daily</div>
                      <div className="text-lg font-semibold text-purple-700 dark:text-purple-400">
                        {stakingStats?.rewards?.daily.toFixed(4)} STRX
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        ≈ ${stakingStats?.rewards?.dailyUsd.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Monthly</div>
                      <div className="text-lg font-semibold text-purple-700 dark:text-purple-400">
                        {stakingStats?.rewards?.monthly.toFixed(4)} STRX
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        ≈ ${stakingStats?.rewards?.monthlyUsd.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Yearly</div>
                      <div className="text-lg font-semibold text-purple-700 dark:text-purple-400">
                        {stakingStats?.rewards?.yearly.toFixed(4)} STRX
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        ≈ ${stakingStats?.rewards?.yearlyUsd.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-card rounded-lg shadow p-4">
                  <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Supply Statistics</h2>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Total Balance</div>
                      <div className="text-lg font-semibold text-purple-700 dark:text-purple-400">
                        {totalAmount.toLocaleString()} STRX
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        ≈ ${(totalAmount * strxPrice).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">% of Total Supply</div>
                      <div className="text-lg font-semibold text-purple-700 dark:text-purple-400">
                        {(totalAmount / TOTAL_SUPPLY * 100).toFixed(4)}%
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        of 2B STRX
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Staking Activity</h2>
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
                <div className="bg-card rounded-lg shadow p-4">
                  <div>
                    {isMobile ? (
                      <ResponsiveContainer>
                        <LineChart data={activityData}>
                          {/* Chart configuration for mobile */}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64">
                        <ResponsiveContainer>
                          <LineChart 
                            data={activityData}
                            margin={{ left: 20, right: 20, top: 10, bottom: 10 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--axis-color)" />
                            <XAxis 
                              dataKey="time" 
                              tick={{ fill: 'var(--axis-color)' }}
                            />
                            <YAxis 
                              tick={{ fill: 'var(--axis-color)' }}
                              tickFormatter={(value) => (value / 1000).toFixed(0) + 'k'}
                              width={50}
                            />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                border: '1px solid #6B21A8',
                                borderRadius: '0.5rem',
                                padding: '10px',
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                              }}
                              labelStyle={{
                                color: 'white',
                                fontWeight: 'bold',
                              }}
                              formatter={(value: number) => [
                                `${value > 0 ? '+' : '-'}${Math.abs(value).toLocaleString()} STRX`
                              ]}
                              position={isMobile ? { x: 10, y: 0 } : undefined}
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
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                  Transaction History
                </h2>
                <div className="bg-card rounded-lg shadow overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="table-custom">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Amount</th>
                          <th>USD Value</th>
                          <th>Type</th>
                          <th>Transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTransactions.map((tx, index) => (
                          <tr key={index}>
                            <td>{formatTimestamp(tx.time)}</td>
                            <td>{tx.amount.toFixed(4)} STRX</td>
                            <td>${tx.usdValue.toFixed(2)}</td>
                            <td>
                              <span className={
                                tx.type === 'add stake'
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }>
                                {tx.type}
                              </span>
                            </td>
                            <td>
                              <a
                                href={`https://explorer.xprnetwork.org/transaction/${tx.trxId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
                              >
                                View →
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Recent Bridge Activity</h2>
                
                <div className="mb-4 flex items-center justify-end">
                  <button
                    onClick={() => setShowAllUsd(prev => !prev)}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/40 transition-colors"
                  >
                    <span>Show in {showAllUsd ? 'STRX' : 'USD'}</span>
                    <span className="text-xs">
                      {showAllUsd ? '' : '$'}
                    </span>
                  </button>
                </div>

                <div className="bg-card rounded-lg shadow overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed md:table-auto">
                      <thead>
                        <tr className="bg-purple-50 dark:bg-purple-900/20">
                          <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider">
                            Time
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider">
                            From/To
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider">
                            Address
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider">
                            Explorer
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentBridgePageData.map((action, index) => (
                          <tr 
                            key={index} 
                            className={`
                              border-l-[6px] border-solid
                              ${
                                action.type === 'inbound'
                                  ? 'border-l-green-500 dark:border-l-green-400 bg-green-50 dark:bg-green-900/10'
                                  : action.type === 'outbound'
                                    ? 'border-l-red-500 dark:border-l-red-400 bg-red-50 dark:bg-red-900/10'
                                    : 'border-l-transparent'
                              }
                              hover:bg-white dark:hover:bg-white/5
                            `}
                          >
                            <td className="px-2 md:px-4 py-3 text-sm whitespace-nowrap">
                              <div className="flex flex-col md:flex-row md:gap-1">
                                {action.time}
                              </div>
                            </td>
                            <td className="px-2 md:px-4 py-3 text-sm">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center space-x-1">
                                  {action.type === 'inbound' ? '📥' : '📤'}
                                  {action.from === 'bridge.strx' ? (
                                    <a
                                      href={`https://explorer.xprnetwork.org/account/${action.from}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 truncate max-w-[100px] md:max-w-full"
                                    >
                                      {action.from}
                                    </a>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <a
                                        href={`/user/${action.from}`}
                                        className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 truncate max-w-[100px] md:max-w-full"
                                      >
                                        {action.from}
                                      </a>
                                      <a
                                        href={`https://explorer.xprnetwork.org/account/${action.from}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                                      >
                                        <CubeTransparentIcon className="h-4 w-4" />
                                      </a>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                                  <span>→</span>
                                  {action.to === 'bridge.strx' ? (
                                    <a
                                      href={`https://explorer.xprnetwork.org/account/${action.to}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 truncate max-w-[100px] md:max-w-full"
                                    >
                                      {action.to}
                                    </a>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <a
                                        href={`/user/${action.to}`}
                                        className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 truncate max-w-[100px] md:max-w-full"
                                      >
                                        {action.to}
                                      </a>
                                      <a
                                        href={`https://explorer.xprnetwork.org/account/${action.to}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                                      >
                                        <CubeTransparentIcon className="h-4 w-4" />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td 
                              className="px-2 md:px-4 py-3 text-sm cursor-pointer"
                              onClick={() => toggleAmountDisplay(action.trxId)}
                            >
                              <div className="flex flex-col">
                                <span>
                                  {(showAllUsd || showUsd[action.trxId])
                                    ? `$${(action.amount * (dexScreenerData?.pairs[0]?.priceUsd ? parseFloat(dexScreenerData.pairs[0].priceUsd) : 0)).toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })}`
                                    : action.amount.toLocaleString()
                                  }
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {(showAllUsd || showUsd[action.trxId]) ? 'USD' : 'STRX'}
                                </span>
                              </div>
                            </td>
                            <td className="px-2 md:px-4 py-3 text-sm">
                              {action.type !== 'other' ? (
                                <div className="flex items-center space-x-1">
                                  <a
                                    href={`https://solscan.io/account/${action.memo}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 truncate max-w-[100px] md:max-w-full"
                                  >
                                    {action.memo}
                                  </a>
                                  <img 
                                    src="/favicon_solscan.png" 
                                    alt="Solscan" 
                                    className="h-4 w-4"
                                  />
                                </div>
                              ) : (
                                action.memo
                              )}
                            </td>
                            <td className="px-2 md:px-4 py-3 text-sm">
                              <a
                                href={`https://explorer.xprnetwork.org/transaction/${action.trxId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
                              >
                                View →
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination */}
                <div className="mt-4 flex justify-end items-center gap-2">
                  <button
                    onClick={() => setCurrentBridgePage(1)}
                    disabled={currentBridgePage === 1}
                    className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                  >
                    First
                  </button>
                  <button
                    onClick={() => {
                      if (currentBridgePage > 1) {
                        setCurrentBridgePage(prev => prev - 1);
                      }
                    }}
                    disabled={currentBridgePage === 1}
                    className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 px-2">
                    Page {currentBridgePage} of {totalBridgePages}
                  </span>
                  <button
                    onClick={async () => {
                      const nextPage = currentBridgePage + 1;
                      const maxCurrentPage = Math.ceil(processedBridgeActions.length / ITEMS_PER_PAGE);

                      if (nextPage <= maxCurrentPage) {
                        setCurrentBridgePage(nextPage);
                      } else if (hasMoreBridgeData && !isLoadingBridge) {
                        setSkipBridge(prev => prev + FETCH_LIMIT);
                        await refetchBridgeActions();
                        setCurrentBridgePage(nextPage);
                      }
                    }}
                    disabled={isLoadingBridge || (!hasMoreBridgeData && currentBridgePage === totalBridgePages)}
                    className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                  >
                    {isLoadingBridge ? 'Loading...' : 'Next'}
                  </button>
                  <button
                    onClick={() => setCurrentBridgePage(totalBridgePages)}
                    disabled={currentBridgePage === totalBridgePages}
                    className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
                  >
                    Last
                  </button>
                </div>
              </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default UserPage; 
// smapshot version
// 1.1.0