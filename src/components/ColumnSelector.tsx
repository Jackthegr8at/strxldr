import { useState, useEffect, memo } from 'react';
import type { SortField, VisibleColumns } from '../lib/types';

type ColumnSelectorProps = {
  visibleColumns: VisibleColumns;
  setVisibleColumns: React.Dispatch<React.SetStateAction<VisibleColumns>>;
  setSortField: React.Dispatch<React.SetStateAction<SortField>>;
};

export const ColumnSelector = memo<ColumnSelectorProps>(({ 
  visibleColumns, 
  setVisibleColumns,
  setSortField
}) => {
  // Check if we're on mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Add resize listener
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Only render on mobile
  if (!isMobile) {
    return null;
  }

  return (
    <div className="mb-4">
      <label className="block text-sm text-gray-600 mb-1 dark:text-gray-300">
        Select additional column:
      </label>
      <select
        className="w-full px-3 py-2 
                   border border-gray-300 dark:border-gray-600 rounded-lg 
                   focus:outline-none focus:ring-2 focus:ring-purple-500 
                   bg-white dark:bg-gray-800 
                   text-gray-900 dark:text-gray-100"
        value={Object.entries(visibleColumns)
          .filter(([key]) => !['rank', 'username'].includes(key))
          .filter(([_, value]) => value)
          .map(([key]) => key)[0]}
        onChange={(e) => {
          const selected = e.target.value;

          // Update visible columns
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

          // Update sort field based on selection
          if (selected === 'usdValue') {
            setSortField('total'); // Sort by total amount when USD is selected
          } else {
            setSortField(selected as SortField); // Sort by the selected column
          }
        }}
      >
        <option value="staked">Staked Amount</option>
        <option value="unstaked">Unstaked Amount</option>
        <option value="total">Total Amount</option>
        <option value="usdValue">USD Value</option>
        <option value="rewards">Estimated Rewards</option>
      </select>
      <p className="text-xs text-gray-500 mt-1">
        Rank and Username are always visible
      </p>
    </div>
  );
});
