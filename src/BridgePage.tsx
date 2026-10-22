import { useBridgeHistory } from './hooks/useBridgeHistory';
import { LoadState } from './components/LoadState';
import { getRaydiumStats, formatOptionalNumber } from './lib/marketData';
import { useState, useMemo } from 'react';
import { useBridgeBalance, useOraclePrices, useRaydium } from './hooks/useResources';
import { ResourceState } from './components/ResourceState';
import { ArrowLeftIcon, CubeTransparentIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Header } from './components/Header';
import { StatisticCard } from './components/StatisticCard';
import { cleanMemo, formatTimestamp, getTransactionType } from './lib/leaderboard';
import type { PriceResponse, RaydiumPoolData } from './lib/types';



export function BridgePage({ onBack }: { onBack: () => void }) {

  // SWR hooks for data fetching
  const bridgeDataResource = useBridgeBalance();
  const { data: bridgeData } = bridgeDataResource;

  const raydiumPoolDataResource = useRaydium();
  const { data: raydiumPoolData } = raydiumPoolDataResource;

  const priceDataResource = useOraclePrices();
  const { data: priceData } = priceDataResource;

  const strxPrice = useMemo(() => {
    const strxRow = priceData?.rows?.find(row => row.sym === '4,STRX');
    return strxRow ? parseFloat(strxRow.quantity.split(' ')[0]) : 0;
  }, [priceData]);

  const strxPriceDisplay = priceData?.rows?.some(row => row.sym === '4,STRX') && Number.isFinite(strxPrice) && strxPrice >= 0
    ? `$${strxPrice.toFixed(6)}`
    : 'N/A';

  const market = getRaydiumStats(raydiumPoolData);
  const priceChangePercent = market.priceChangePercent;
  const priceChangeDisplay = priceChangePercent === null ? 'N/A' : `${priceChangePercent > 0 ? '+' : ''}${formatOptionalNumber(priceChangePercent, 2)}%`;

  // Add state for amount displays if needed
  const [amountDisplays, setAmountDisplays] = useState<{ [key: string]: 'strx' | 'usd' }>({});

  const [searchTerm, setSearchTerm] = useState('');
  const [showAllUsd, setShowAllUsd] = useState(false);
  const history = useBridgeHistory(null, searchTerm);
  const currentPageData = history.actions.map(action => ({
    time: formatTimestamp(action.timestamp), from: action.act.data.from, to: action.act.data.to,
    amount: parseFloat(action.act.data.quantity.split(' ')[0]), memo: cleanMemo(action.act.data.memo),
    trxId: action.trx_id, type: getTransactionType(action.act.data.memo)
  }));

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
    <>
      <div className="min-h-screen bg-background text-foreground">
        <Header />

        <div className="container mx-auto px-4 md:px-20 md:py-12 py-8">
          {/* Add back button */}
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Back to Leaderboard
          </button>

          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-purple-700 dark:text-purple-300">STRX Bridge Dashboard</h1>
          </div>

          {/* Statistics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 auto-rows-[minmax(180px,auto)] gap-4 mb-8" data-testid="bridge-statistics">
            <StatisticCard
              loading={[bridgeDataResource, priceDataResource].some(resource => resource.data === undefined && !resource.error)}
              unavailable={[bridgeDataResource, priceDataResource].some(resource => resource.data === undefined && Boolean(resource.error))}
              title="Bridge Balance"
              value={
                bridgeData?.[0] && strxPrice > 0 ? (
                  <div className="flex flex-col">
                    <span>{parseFloat(bridgeData[0]).toLocaleString()} STRX</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ≈ ${(parseFloat(bridgeData[0]) * strxPrice).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  </div>
                ) : '...'
              }
              tooltip="Current STRX balance in the bridge contract"
            />

            <StatisticCard
              loading={[raydiumPoolDataResource].some(resource => resource.data === undefined && !resource.error)}
              unavailable={[raydiumPoolDataResource].some(resource => resource.data === undefined && Boolean(resource.error))}
              title="STRX/SOL Pool"
              value={
                raydiumPoolData !== undefined ? (
                  <div className="flex flex-col">
                    <span>{formatOptionalNumber(market.price, 8)} SOL</span>
                    <span className="text-xs text-gray-500 dark:text-gray-300">
                      TVL: ${formatOptionalNumber(market.tvl)}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-300">
                      24h Vol: ${formatOptionalNumber(market.dayVolume)}
                    </span>
                  </div>
                ) : 'Loading...'
              }
              tooltip="STRX price and pool stats from Raydium"
            />

            <StatisticCard
              loading={[raydiumPoolDataResource].some(resource => resource.data === undefined && !resource.error)}
              unavailable={[raydiumPoolDataResource].some(resource => resource.data === undefined && Boolean(resource.error))}
              title="Trading Activity"
              value={
                raydiumPoolData ? (
                  <div className="flex flex-col">
                    <span className="text-xs text-green-500">
                      Reward APR: {formatOptionalNumber(market.rewardApr, 2)}%
                    </span>
                    <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">
                      Volume:
                      <div className="ml-2">
                        24h: ${formatOptionalNumber(market.dayVolume)}<br/>
                        7d: ${formatOptionalNumber(market.weekVolume)}<br/>
                        30d: ${formatOptionalNumber(market.monthVolume)}
                      </div>
                    </div>
                  </div>
                ) : 'Loading...'
              }
              tooltip="Trading volume and APR stats from Raydium"
            />

            <StatisticCard
              loading={[raydiumPoolDataResource, priceDataResource].some(resource => resource.data === undefined && !resource.error)}
              unavailable={[raydiumPoolDataResource, priceDataResource].some(resource => resource.data === undefined && Boolean(resource.error))}
              title="Market Stats"
              value={
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span>{strxPriceDisplay}</span>
                    <span className={`text-sm ${
                      priceChangePercent !== null && priceChangePercent >= 0
                        ? 'text-green-500'
                        : 'text-red-500'
                    }`}>
                      {priceChangeDisplay}
                    </span>
                  </div>
                  {raydiumPoolData !== undefined && (
                    <span className="text-xs text-gray-500 dark:text-gray-300">
                      TVL: ${formatOptionalNumber(market.tvl)}
                    </span>
                  )}
                  {raydiumPoolData !== undefined && (
                    <div className="text-xs text-gray-500 dark:text-gray-300">
                      APR: {formatOptionalNumber(market.apr, 2)}%
                      <span className="ml-2">
                        (Fee: {formatOptionalNumber(market.feeApr, 2)}%)
                      </span>
                    </div>
                  )}
                </div>
              }
              tooltip="Market statistics from Raydium"
            />
          </div>

          {[bridgeDataResource, raydiumPoolDataResource, priceDataResource].some(resource => resource.error || resource.cached) && <ResourceState resources={[bridgeDataResource, raydiumPoolDataResource, priceDataResource]} />}
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
                    history.first();
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
            <div className="bg-card rounded-lg shadow h-[560px] md:h-[540px] overflow-y-auto" tabIndex={0} role="region" aria-label="Bridge activity history">
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
                                ? `$${(action.amount * strxPrice).toLocaleString(undefined, {
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
