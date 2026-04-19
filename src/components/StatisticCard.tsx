import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import type { ReactNode, KeyboardEvent } from 'react';

export type StatisticCardProps = {
  title: string;
  value: ReactNode;
  tooltip: string;
  onClick?: () => void;
  children?: ReactNode;
};

export const StatisticCard = ({ title, value, tooltip, onClick, children }: StatisticCardProps) => {
  const handleKeyDown = onClick
    ? (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  return (
    <div
      className={`bg-card p-4 rounded-lg shadow border relative ${
        onClick ? 'cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors' : ''
      }`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex justify-between items-start mb-1">
        <div className="text-sm text-muted-foreground dark:text-gray-300">{title}</div>
        <button
          type="button"
          aria-label={tooltip}
          className="tooltip-trigger relative inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-full"
          onClick={(e) => e.stopPropagation()}
        >
          <QuestionMarkCircleIcon
            className="h-5 w-5 text-gray-400 hover:text-purple-600 transition-colors cursor-help"
            aria-hidden="true"
          />
          <span
            role="tooltip"
            className="tooltip-content invisible absolute right-0 z-10 w-64 p-2 mt-2 text-sm rounded-lg opacity-0 transition-opacity text-gray-100 dark:text-gray-100 bg-gray-800/90 dark:bg-black/70 border border-purple-200/20 dark:border-purple-900 backdrop-blur-sm top-full text-left font-normal"
          >
            {tooltip}
          </span>
        </button>
      </div>
      <div className="text-xl font-semibold text-purple-700 dark:text-purple-400">
        {value === undefined || value === null || value === '' ? (
          <div className="skeleton h-6 w-24" aria-label="Loading" />
        ) : (
          value
        )}
      </div>
      {children}
    </div>
  );
};
