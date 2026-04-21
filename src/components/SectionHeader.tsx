import type { FC } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

export type SectionHeaderProps = {
  title: string;
  sectionKey: string;
  isVisible: boolean;
  onToggle: () => void;
};

export const SectionHeader: FC<SectionHeaderProps> = ({ title, isVisible, onToggle }) => (
  <div className="flex justify-between items-center mb-4">
    <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
    <button
      onClick={onToggle}
      className="p-3 min-h-[44px] min-w-[44px] text-purple-600 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-200 transition-colors"
      aria-label={isVisible ? 'Hide section' : 'Show section'}
    >
      {isVisible ? (
        <ChevronUpIcon className="h-5 w-5" />
      ) : (
        <ChevronDownIcon className="h-5 w-5" />
      )}
    </button>
  </div>
);
