import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import type { ReactNode, KeyboardEvent } from 'react';

export type StatisticCardProps = {
  loading?: boolean;
  unavailable?: boolean;
  variant?: 'standard' | 'market';
  title: string;
  value: ReactNode;
  tooltip: string;
  onClick?: () => void;
  children?: ReactNode;
};

export const StatisticCard = ({ title, value, tooltip, onClick, children, loading = false, unavailable = false, variant = 'standard' }: StatisticCardProps) => {
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
      aria-busy={loading && !unavailable}
      className={`statistic-card statistic-card--${variant} ${onClick ? 'statistic-card--interactive' : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="statistic-card__heading">
        <div className="statistic-card__label">{title}</div>
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
      <div className="statistic-card__value">
        {unavailable ? 'Unavailable' : loading || value === undefined || value === null || value === '' ? (
          <div className="skeleton h-6 w-24" aria-label="Loading" />
        ) : (
          value
        )}
      </div>
      {!unavailable && children}
    </div>
  );
};
