import { useBridgeHistory } from './hooks/useBridgeHistory';
import { LoadState } from './components/LoadState';
import { useState, useMemo } from 'react';
import { useConfig, useDexPairs, useUserActions, useUserBalance } from './hooks/useResources';
import { ResourceState } from './components/ResourceState';
import { ArrowLeftIcon, MagnifyingGlassIcon, CubeTransparentIcon } from '@heroicons/react/24/outline';
import { Header } from './components/Header';
import { cleanMemo, formatTimestamp, getTransactionType } from './lib/leaderboard';
import type { ActionResponse, BlockchainResponse, DexScreenerPairsData } from './lib/types';

type UserPageNoStakeProps = {
  username: string;
  onBack: () => void;
};

export default function UserPageNoStake({ username, onBack }: UserPageNoStakeProps) {
  // Move all states and data fetching inside the component
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [showAllUsd, setShowAllUsd] = useState(false);
  const [showUsd, setShowUsd] = useState<{[key: string]: boolean}>({});

  // Move all SWR hooks inside
  const blockchainDataResource = useConfig();
  const { data: blockchainData } = blockchainDataResource;

  const dexScreenerDataResource = useDexPairs();
  const { data: dexScreenerData } = dexScreenerDataResource;

  const dexPriceUsd = useMemo(() => {
    const priceUsd = dexScreenerData?.pairs?.[0]?.priceUsd;
    return priceUsd ? parseFloat(priceUsd) : 0;
  }, [dexScreenerData]);

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
        dailyUsd: dailyReward * dexPriceUsd,
        monthlyUsd: monthlyReward * dexPriceUsd,
        yearlyUsd: yearlyReward * dexPriceUsd,
      }
    };
  }, [blockchainData, dexPriceUsd]);

  const history = useBridgeHistory(username);
  const currentBridgePageData = history.actions.map(action => ({
    time: formatTimestamp(action.timestamp), from: action.act.data.from, to: action.act.data.to,
    amount: parseFloat(action.act.data.quantity.split(' ')[0]), memo: cleanMemo(action.act.data.memo),
    trxId: action.trx_id, type: getTransactionType(action.act.data.memo)
  }));

  const toggleAmountDisplay = (trxId: string) => {
    setShowUsd(prev => ({
      ...prev,
      [trxId]: !prev[trxId]
    }));
  };

  // Add this after other states
  const actionsDataResource = useUserActions(username);
  const { data: actionsData } = actionsDataResource;

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
        // Properly handle UTC timestamp
        const time = new Date(action.timestamp.replace(/Z$/, "") + "Z"); // Add Z to ensure UTC parsing
        return {
          time,
          amount,
          usdValue: amount * dexPriceUsd,
          type: action.act.data.memo,
          trxId: action.trx_id
        };
      })
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [actionsData, dexPriceUsd]);

  // Add this with other useMemo hooks
  const paginatedTransactions = useMemo(() => {
    const startIndex = (transactionPage - 1) * TRANSACTIONS_PER_PAGE;
    const endIndex = startIndex + TRANSACTIONS_PER_PAGE;
    return userActions.slice(startIndex, endIndex);
  }, [userActions, transactionPage]);

  // Add this SWR fetch near other data fetches
  const userBalanceResource = useUserBalance(username);
  const { data: userBalance } = userBalanceResource;

  return (
    <>
      <div className="min-h-screen bg-background text-foreground">
        <Header />

        <div className="container mx-auto px-4 md:px-20 md:py-12 py-8">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={onBack}
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

          <ResourceState resources={[blockchainDataResource, dexScreenerDataResource, userBalanceResource]}>
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
                {userBalance?.[0] ? parseFloat(userBalance[0]).toFixed(4) : userBalance ? '0' : 'N/A'} STRX
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                ${userBalance?.[0] ? (parseFloat(userBalance[0]) * dexPriceUsd).toFixed(2) : userBalance && dexScreenerData ? '0.00' : 'N/A'}
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
                    {userBalance?.[0] ? parseFloat(userBalance[0]).toFixed(4) : userBalance ? '0' : 'N/A'} STRX
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    ≈ ${userBalance?.[0] ? (parseFloat(userBalance[0]) * dexPriceUsd).toFixed(2) : userBalance && dexScreenerData ? '0.00' : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">% of Total Supply</div>
                  <div className="text-lg font-semibold text-purple-700 dark:text-purple-400">
                    {userBalance?.[0] ? ((parseFloat(userBalance[0]) / 2000000000) * 100).toFixed(4) : userBalance ? '0' : 'N/A'}%
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    of 2B STRX
                  </div>
                </div>
              </div>
            </div>
          </div>

          </ResourceState>
          {/* Transaction History Section */}
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

          {/* Bridge Activity Section */}
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
                                    href={`/?user=${action.from}`}
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
                                    href={`/?user=${action.to}`}
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
                                ? `$${(action.amount * dexPriceUsd).toLocaleString(undefined, {
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
            <div className="mt-4 flex flex-wrap justify-end items-center gap-2" data-testid="bridge-pagination">
              <LoadState loading={history.isPending} error={history.error} hasData={history.actions.length > 0} onRetry={history.retry} />
              <button onClick={history.first} disabled={history.page === 1} className="px-4 py-2 rounded border disabled:opacity-50">First</button>
              <button onClick={history.previous} disabled={history.page === 1} className="px-4 py-2 rounded border disabled:opacity-50">Previous</button>
              <span>Page {history.page} of {history.pageCount}</span>
              <button onClick={history.next} disabled={history.isPending || (!history.hasOlder && history.page === history.pageCount)} className="px-4 py-2 rounded border disabled:opacity-50">{history.isPending ? 'Loading...' : history.continueSearching ? 'Continue searching older activity' : 'Next'}</button>
              <button onClick={history.lastLoaded} disabled={history.page === history.pageCount} className="px-4 py-2 rounded border disabled:opacity-50">{history.hasOlder ? 'Last loaded' : 'Last'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 