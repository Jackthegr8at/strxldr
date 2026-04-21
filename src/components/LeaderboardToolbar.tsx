import { useEffect, useState, useRef, type Dispatch, type SetStateAction } from 'react';
import { MagnifyingGlassIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@radix-ui/react-dropdown-menu';
import type { SortField, VisibleColumns } from '../lib/types';
import { useSearchHotkey } from '../hooks/useSearchHotkey';

export type LeaderboardToolbarProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  visibleColumns: VisibleColumns;
  setVisibleColumns: Dispatch<SetStateAction<VisibleColumns>>;
  setSortField: Dispatch<SetStateAction<SortField>>;
};

const ColumnSelector = ({
  visibleColumns,
  setVisibleColumns,
  setSortField,
}: Pick<LeaderboardToolbarProps, 'visibleColumns' | 'setVisibleColumns' | 'setSortField'>) => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isMobile) {
    return null;
  }

  const selectedColumn = Object.entries(visibleColumns)
    .filter(([key]) => !['rank', 'username'].includes(key))
    .filter(([, value]) => value)
    .map(([key]) => key)[0] ?? 'staked';

  return (
    <div className="mb-4 md:hidden">
      <label className="block text-sm text-gray-600 mb-1 dark:text-gray-300">
        Select additional column:
      </label>
      <select
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        value={selectedColumn}
        onChange={(e) => {
          const selected = e.target.value;
          const newVisibleColumns = {
            rank: true,
            username: true,
            staked: selected === 'staked',
            unstaked: selected === 'unstaked',
            total: selected === 'total',
            usdValue: selected === 'usdValue',
            rewards: selected === 'rewards',
          };

          setVisibleColumns(newVisibleColumns);
          setSortField(selected === 'usdValue' ? 'total' : (selected as SortField));
        }}
      >
        <option value="staked">Staked Amount</option>
        <option value="unstaked">Unstaked Amount</option>
        <option value="total">Total Amount</option>
        <option value="usdValue">USD Value</option>
        <option value="rewards">Estimated Rewards</option>
      </select>
      <p className="text-xs text-gray-500 mt-1">Rank and Username are always visible</p>
    </div>
  );
};

export const LeaderboardToolbar = ({
  searchTerm,
  onSearchTermChange,
  visibleColumns,
  setVisibleColumns,
  setSortField,
}: LeaderboardToolbarProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSearchHotkey({ inputRef: searchInputRef });

  return (
    <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="relative">
        <MagnifyingGlassIcon
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
        />
        <label htmlFor="staker-search" className="sr-only">
          Search by username
        </label>
        <input
          ref={searchInputRef}
          id="staker-search"
          type="search"
          placeholder="Search by username..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="w-full md:w-72 pl-9 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
        />
        {searchTerm && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchTermChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 min-h-[36px] min-w-[36px] rounded text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
        <ColumnSelector
          visibleColumns={visibleColumns}
          setVisibleColumns={setVisibleColumns}
          setSortField={setSortField}
        />
        <div className="hidden md:flex items-center gap-2">
          <span className="text-gray-600">Sort by:</span>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-200">
                Sort by
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 min-w-[150px] mt-2 z-50 border border-purple-100 dark:border-purple-800" sideOffset={5}>
              <DropdownMenuItem className="outline-none">
                <button
                  onClick={() => setSortField('staked')}
                  className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                >
                  Staked Amount
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem className="outline-none">
                <button
                  onClick={() => setSortField('unstaked')}
                  className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                >
                  Unstaked Amount
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem className="outline-none">
                <button
                  onClick={() => setSortField('total')}
                  className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                >
                  Total Amount
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem className="outline-none">
                <button
                  onClick={() => setSortField('rewards')}
                  className="block w-full px-4 py-2 hover:bg-purple-50 dark:hover:bg-purple-800 rounded-md text-gray-700 dark:text-gray-200"
                >
                  Estimated Rewards
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};
