import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { ArrowLeftIcon, MagnifyingGlassIcon, CubeTransparentIcon } from '@heroicons/react/24/outline';
import { ThemeProvider } from './components/ThemeProvider';
import { Header } from './components/Header';

type UserPageNoStakeProps = {
  username: string;
  onBack: () => void;
};

// Types can stay outside
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

type ActionResponse = {
  actions: BridgeAction[];
};

type BlockchainResponse = {
  rows: Array<{
    stakes: string;
    rewards_sec: string;
  }>;
};

export default function UserPageNoStake({ username, onBack }: UserPageNoStakeProps) {
  // Move all states and data fetching inside the component
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [allUserBridgeActions, setAllUserBridgeActions] = useState<BridgeAction[]>([]);
  const [isLoadingBridge, setIsLoadingBridge] = useState(false);
  const [hasMoreBridgeData, setHasMoreBridgeData] = useState(true);
  const [skipBridge, setSkipBridge] = useState(0);
  const [showAllUsd, setShowAllUsd] = useState(false);
  const [showUsd, setShowUsd] = useState<{[key: string]: boolean}>({});
  const FETCH_LIMIT = 300;

  // Move all SWR hooks inside
  const { data: blockchainData } = useSWR<BlockchainResponse>(
    'blockchain_data',
    () => fetch(`${process.env.REACT_APP_XPR_ENDPOINT || 'https://proton.eosusa.io'}/v1/chain/get_table_rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json: true,
        code: "storexstake",
        scope: "storexstake",
        table: "config",
        limit: 10
      })
    }).then(res => res.json()),
    { refreshInterval: 60000 }
  );

  const { data: dexScreenerData } = useSWR<any>(
    'dexscreener_data',
    () => fetch('https://api.dexscreener.com/latest/dex/pairs/solana/5XVsERryqVvKPDMUh851H4NsSiK68gGwRg9Rpqf9yMmf')
      .then(res => res.json()),
    { refreshInterval: 30000 }
  );

  // Add stakingStats here
  const stakingStats = useMemo(() => {
    if (!blockchainData?.rows?.[0]) return null;

    const totalStaked = parseFloat(blockchainData.rows[0].stakes.split(' ')[0]);
    const rewardsPerSec = parseFloat(blockchainData.rows[0].rewards_sec.split(' ')[0]);

    const dailyReward = rewardsPerSec * 86400;
    const monthlyReward = dailyReward * 30;
    const yearlyReward = dailyReward * 365;
    
    return {
      rewards: {
        daily: dailyReward,
        monthly: monthlyReward,
        yearly: yearlyReward,
        dailyUsd: dailyReward * (dexScreenerData?.pair?.priceUsd ? parseFloat(dexScreenerData.pair.priceUsd) : 0),
        monthlyUsd: monthlyReward * (dexScreenerData?.pair?.priceUsd ? parseFloat(dexScreenerData.pair.priceUsd) : 0),
        yearlyUsd: yearlyReward * (dexScreenerData?.pair?.priceUsd ? parseFloat(dexScreenerData.pair.priceUsd) : 0),
      }
    };
  }, [blockchainData, dexScreenerData]);

  // Fetch bridge actions
  const { data: bridgeActions, mutate: refetchBridgeActions } = useSWR<ActionResponse>(
    ['bridge_actions', skipBridge],
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

  // Helper functions
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

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp + 'Z');
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false
    });
  };

  // Effect to accumulate and filter user's bridge actions
  useEffect(() => {
    if (bridgeActions?.actions) {
      setAllUserBridgeActions(prev => {
        const existingIds = new Set(prev.map(a => a.trx_id));
        
        const newActions = bridgeActions.actions.filter(a => 
          !existingIds.has(a.trx_id) && 
          (a.act.data.from === username || a.act.data.to === username)
        );
        
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

  // Pagination states
  const [currentBridgePage, setCurrentBridgePage] = useState(1);
  const ITEMS_PER_PAGE = 30;
  const totalBridgePages = Math.ceil(processedBridgeActions.length / ITEMS_PER_PAGE);
  const currentBridgePageData = processedBridgeActions.slice(
    (currentBridgePage - 1) * ITEMS_PER_PAGE,
    currentBridgePage * ITEMS_PER_PAGE
  );

  const toggleAmountDisplay = (trxId: string) => {
    setShowUsd(prev => ({
      ...prev,
      [trxId]: !prev[trxId]
    }));
  };

  // Add this after other states
  const { data: actionsData } = useSWR<ActionResponse>(
    ['user_actions', username],
    () => {
      const baseUrl = `${process.env.REACT_APP_XPR_ENDPOINT || 'https://proton.eosusa.io'}/v2/history/get_actions`;
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

  // Add this after other states
  const [transactionPage, setTransactionPage] = useState(1);
  const TRANSACTIONS_PER_PAGE = 10;

  // Add this with other useMemo hooks
  const userActions = useMemo(() => {
    if (!actionsData?.actions) return [];
    
    return actionsData.actions
      .filter(action => {
        const memo = action.act.data.memo;
        return memo === "add stake" || memo === "withdraw stake" || memo === "claim staking rewards";
      })
      .map(action => {
        const amount = parseFloat(action.act.data.quantity.split(' ')[0]);
        const time = new Date(action.timestamp + 'Z');
        return {
          time,
          amount,
          usdValue: amount * (dexScreenerData?.pair?.priceUsd ? parseFloat(dexScreenerData.pair.priceUsd) : 0),
          type: action.act.data.memo,
          trxId: action.trx_id
        };
      })
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [actionsData, dexScreenerData]);

  // Add this with other useMemo hooks
  const paginatedTransactions = useMemo(() => {
    const startIndex = (transactionPage - 1) * TRANSACTIONS_PER_PAGE;
    const endIndex = startIndex + TRANSACTIONS_PER_PAGE;
    return userActions.slice(startIndex, endIndex);
  }, [userActions, transactionPage]);

  // Add this SWR fetch near other data fetches
  const { data: userBalance } = useSWR<any>(
    ['user_balance', username],
    () => fetch(`${process.env.REACT_APP_XPR_ENDPOINT || 'https://proton.eosusa.io'}/v1/chain/get_currency_balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: "storex",
        account: username,
        symbol: "STRX"
      })
    }).then(res => res.json()),
    { refreshInterval: 30000 }
  );

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <div className="container mx-auto px-4 md:px-20 md:py-12 py-8">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              Back to Leaderboard
            </button>
            <span className="text-3xl" title="Not staking">🤷</span>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-purple-700 dark:text-purple-400">
                {username}'s Profile
              </h1>
              <a 
                href={`https://explorer.xprnetwork.org/account/${username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/40 transition-colors"
              >
                View on Explorer →
              </a>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              This user is not currently staking STRX
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-card rounded-lg shadow p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Staked</div>
              <div className="text-xl font-semibold text-purple-700 dark:text-purple-400">
                0 STRX
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                $0.00
              </div>
            </div>

            <div className="bg-card rounded-lg shadow p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Unstaked</div>
              <div className="text-xl font-semibold text-purple-700 dark:text-purple-400">
                {userBalance?.[0] ? parseFloat(userBalance[0]).toFixed(4) : '0'} STRX
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                ${userBalance?.[0] ? (parseFloat(userBalance[0]) * (dexScreenerData?.pair?.priceUsd ? parseFloat(dexScreenerData.pair.priceUsd) : 0)).toFixed(2) : '0.00'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="bg-card rounded-lg shadow p-4">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Supply Statistics</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total Balance</div>
                  <div className="text-lg font-semibold text-purple-700 dark:text-purple-400">
                    {userBalance?.[0] ? parseFloat(userBalance[0]).toFixed(4) : '0'} STRX
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ≈ ${userBalance?.[0] ? (parseFloat(userBalance[0]) * (dexScreenerData?.pair?.priceUsd ? parseFloat(dexScreenerData.pair.priceUsd) : 0)).toFixed(2) : '0.00'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">% of Total Supply</div>
                  <div className="text-lg font-semibold text-purple-700 dark:text-purple-400">
                    {userBalance?.[0] ? ((parseFloat(userBalance[0]) / 2000000000) * 100).toFixed(4) : '0'}%
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    of 2B STRX
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Transaction History Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Transaction History
            </h2>
            <div className="bg-card rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed md:table-auto">
                  <thead>
                    <tr className="bg-purple-50 dark:bg-purple-900/20">
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider">Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTransactions.map((tx, index) => (
                      <tr key={index} className="hover:bg-white dark:hover:bg-white/5">
                        <td className="px-4 py-3 text-sm">{formatTimestamp(tx.time.toISOString())}</td>
                        <td className="px-4 py-3 text-sm">{tx.amount.toFixed(4)} STRX</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={tx.type === 'add stake' ? 'text-green-600' : 'text-red-600'}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <a
                            href={`https://explorer.xprnetwork.org/transaction/${tx.trxId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-800"
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

          {/* Bridge Activity Section */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Bridge Activity</h2>
            
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
                                ? `$${(action.amount * (dexScreenerData?.pair?.priceUsd ? parseFloat(dexScreenerData.pair.priceUsd) : 0)).toLocaleString(undefined, {
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
    </ThemeProvider>
  );
} 