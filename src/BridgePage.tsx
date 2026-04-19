import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { ArrowLeftIcon, CubeTransparentIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Header } from './components/Header';
import { ThemeProvider } from './components/ThemeProvider';
import { StatisticCard } from './components/StatisticCard';
import { fetchBridgeBalance, fetchDexScreenerPairs, fetchHistoryActions, fetchRaydiumPool } from './lib/api';
import { cleanMemo, formatTimestamp, getTransactionType } from './lib/leaderboard';
import type { ActionResponse, BridgeAction, RaydiumPoolData } from './lib/types';



export function BridgePage() {
  
  // SWR hooks for data fetching
  const { data: bridgeData } = useSWR<string[]>(
    'bridge_balance',
    fetchBridgeBalance
  );

  const { data: raydiumPoolData } = useSWR<RaydiumPoolData>(
    'raydium_pool_v3',
    fetchRaydiumPool,
    { refreshInterval: 360000 }
  );

  // Get price from the pool data
  const price = raydiumPoolData?.data?.[0]?.price;
  const priceDisplay = price !== undefined
    ? `$${price.toFixed(6)}`
    : 'N/A';

  // For price changes, use week data instead of day data since day data has -1 values
  const weekPriceMin = raydiumPoolData?.data?.[0]?.week?.priceMin;
  const weekPriceMax = raydiumPoolData?.data?.[0]?.week?.priceMax;
  let priceChangePercent: number | undefined;

  if (price !== undefined && weekPriceMin !== undefined && weekPriceMin > 0 && weekPriceMax !== undefined && weekPriceMax > 0) {
    // Calculate a rough change percentage based on week range
    const priceMid = (weekPriceMin + weekPriceMax) / 2;
    priceChangePercent = ((price - priceMid) / priceMid) * 100;
  }

  const priceChangeDisplay = priceChangePercent !== undefined
    ? `${priceChangePercent > 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%`
    : 'N/A';

  // Add state for amount displays if needed
  const [amountDisplays, setAmountDisplays] = useState<{ [key: string]: 'strx' | 'usd' }>({});

  // Add state for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  // Add these states at the top of the BridgePage component
  const [skip, setSkip] = useState(0);
  const FETCH_LIMIT = 300;

  // Add state to store all fetched actions
  const [allActions, setAllActions] = useState<BridgeAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);

  // Add this near other state declarations
  const [searchTerm, setSearchTerm] = useState('');

  // Add this state for global USD display
  const [showAllUsd, setShowAllUsd] = useState(false);

  // Modify the bridge actions fetching
  const { data: bridgeActions, mutate: refetchBridgeActions } = useSWR<ActionResponse>(
    ['bridge_actions', skip],
    async () => {
      setIsLoading(true);
      const data = await fetchHistoryActions<ActionResponse>({
        limit: FETCH_LIMIT,
        'act.name': 'transfer',
        skip,
      }, 'bridge.strx');
      setIsLoading(false);
      return data;
    },
    { refreshInterval: 120000 }
  );

  // Effect to accumulate actions
  useEffect(() => {
    if (bridgeActions?.actions) {
      setAllActions(prev => {
        // Create a Set of existing trx_ids for deduplication
        const existingIds = new Set(prev.map(a => a.trx_id));
        
        // Filter out duplicates and add new actions
        const newActions = bridgeActions.actions.filter(a => !existingIds.has(a.trx_id));
        
        // If no new actions, we've reached the end
        if (newActions.length === 0) {
          setHasMoreData(false);
        }

        // Sort all actions by timestamp to ensure correct order
        return [...prev, ...newActions].sort(
          (a, b) => new Date(b.timestamp + 'Z').getTime() - new Date(a.timestamp + 'Z').getTime()
        );
      });
    }
  }, [bridgeActions]);

  // Format timestamp function
  // Update the processedActions to remove the sort since it's already sorted
  const processedActions = useMemo(() => {
    const filtered = allActions
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

    if (!searchTerm) return filtered;

    return filtered.filter(action => 
      action.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
      action.to.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allActions, searchTerm]);

  // Calculate pagination based on filtered data length
  const totalPages = Math.ceil(processedActions.length / ITEMS_PER_PAGE);
  const currentPageData = processedActions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Add state for showing USD
  const [showUsd, setShowUsd] = useState<{[key: string]: boolean}>({});

  // Move toggleAmountDisplay inside the component
  const toggleAmountDisplay = (trxId: string) => {
    setShowUsd((prev: {[key: string]: boolean}) => ({
      ...prev,
      [trxId]: !prev[trxId]
    }));
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <div className="container mx-auto px-4 md:px-20 md:py-12 py-8">
          {/* Add back button */}
          <button
            onClick={() => {
              window.location.pathname = '/';
            }}
            className="mb-4 flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Back to Leaderboard
          </button>

          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-purple-700">STRX Bridge Dashboard</h1>
          </div>

          {/* Statistics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatisticCard
              title="Bridge Balance"
              value={
                bridgeData?.[0] && price ? (
                  <div className="flex flex-col">
                    <span>{parseFloat(bridgeData[0]).toLocaleString()} STRX</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ≈ {priceDisplay}
                    </span>
                  </div>
                ) : '...'
              }
              tooltip="Current STRX balance in the bridge contract"
            />

            <StatisticCard
              title="STRX/SOL Pool"
              value={
                raydiumPoolData && raydiumPoolData.data.length > 0 ? (
                  <div className="flex flex-col">
                    <span>{raydiumPoolData.data[0].price.toFixed(8)} SOL</span>
                    <span className="text-xs text-gray-500 dark:text-gray-300">
                      TVL: ${raydiumPoolData.data[0].tvl.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-300">
                      24h Vol: ${raydiumPoolData.data[0].day.volume.toLocaleString()}
                    </span>
                  </div>
                ) : 'Loading...'
              }
              tooltip="STRX price and pool stats from Raydium"
            />

            <StatisticCard
              title="Trading Activity"
              value={
                raydiumPoolData ? (
                  <div className="flex flex-col">
                    <span className="text-xs text-green-500">
                      Reward APR: {raydiumPoolData.data[0].day.rewardApr[0].toFixed(2)}%
                    </span>
                    <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">
                      Volume:
                      <div className="ml-2">
                        24h: ${raydiumPoolData.data[0].day.volume.toLocaleString()}<br/>
                        7d: ${raydiumPoolData.data[0].week.volume.toLocaleString()}<br/>
                        30d: ${raydiumPoolData.data[0].month.volume.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ) : 'Loading...'
              }
              tooltip="Trading volume and APR stats from Raydium"
            />

            {raydiumPoolData?.success && raydiumPoolData?.data && raydiumPoolData.data.length > 0 ? (
              <StatisticCard
                title="Market Stats"
                value={
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span>{priceDisplay}</span>
                      <span className={`text-sm ${
                        priceChangePercent !== undefined && priceChangePercent >= 0 
                          ? 'text-green-500' 
                          : 'text-red-500'
                      }`}>
                        {priceChangeDisplay}
                      </span>
                    </div>
                    {raydiumPoolData.data[0].tvl !== undefined && (
                      <span className="text-xs text-gray-500 dark:text-gray-300">
                        TVL: ${raydiumPoolData.data[0].tvl.toLocaleString()}
                      </span>
                    )}
                    {raydiumPoolData.data[0].day?.apr !== undefined && (
                      <div className="text-xs text-gray-500 dark:text-gray-300">
                        APR: {raydiumPoolData.data[0].day.apr.toFixed(2)}%
                        <span className="ml-2">
                          (Fee: {raydiumPoolData.data[0].day.feeApr.toFixed(2)}%)
                        </span>
                      </div>
                    )}
                  </div>
                }
                tooltip="Market statistics from Raydium"
              />
            ) : null}
          </div>

          {/* Bridge Activity Table */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Recent Bridge Activity</h2>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search by username..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-4 py-2 pl-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
              
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
                    {currentPageData.map((action, index) => (
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
                                    href={`./userpage?user=${action.from}`}
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
                                    href={`./userpage?user=${action.to}`}
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
                                ? `$${(action.amount * (price ? price : 0)).toLocaleString(undefined, {
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
                onClick={() => {
                  setCurrentPage(1);
                }}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
              >
                First
              </button>
              <button
                onClick={() => {
                  if (currentPage > 1) {
                    setCurrentPage(prev => prev - 1);
                  }
                }}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={async () => {
                  const nextPage = currentPage + 1;
                  const maxCurrentPage = Math.ceil(processedActions.length / ITEMS_PER_PAGE);

                  if (nextPage <= maxCurrentPage) {
                    setCurrentPage(nextPage);
                  } else if (hasMoreData && !isLoading) {
                    setSkip(prev => prev + FETCH_LIMIT);
                    await refetchBridgeActions();
                    setCurrentPage(nextPage);
                  }
                }}
                disabled={isLoading || (!hasMoreData && currentPage === totalPages)}
                className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200"
              >
                {isLoading ? 'Loading...' : 'Next'}
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
        </div>
      </div>
    </ThemeProvider>
  );
} 