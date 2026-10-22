import type { FC } from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

export type SectionHeaderProps = {
  title: string;
  sectionKey: string;
  isVisible: boolean;
  onToggle: () => void;
};

export const SectionHeader: FC<SectionHeaderProps> = ({ title, isVisible, onToggle }) => (
  <div className="section-heading">
    <h2 className="section-heading__title">{title}</h2>
    <button
      onClick={onToggle}
      className="icon-control"
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
