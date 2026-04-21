import { useEffect, useRef, memo } from 'react';

type InfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const InfoModal = memo<InfoModalProps>(({ isOpen, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Esc to close, prevent body scroll, and focus the close button when opened
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    // Defer focus so the button exists in DOM
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
      onClick={(e) => {
        // Close when clicking backdrop (but not the modal body)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
        {/* Close button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 z-10 p-1 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content container with padding */}
        <div className="p-4 md:p-6">
          <h2 id="info-modal-title" className="text-xl md:text-2xl font-bold text-purple-700 dark:text-purple-400 mb-4">
            About STRX Staking Leaderboard
          </h2>
          
          <div className="prose prose-sm md:prose max-w-none space-y-4">
            <p>
              Welcome to the STRX Staking Leaderboard! This platform provides real-time tracking 
              of STOREX token staking positions across the community.
            </p>
            
            <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400">Features:</h3>
            
            <ul className="list-disc pl-5 space-y-2">
              <li className="text-sm md:text-base">View detailed staking statistics and distribution</li>
              <li className="text-sm md:text-base">Track top holders and their staking positions</li>
              <li className="text-sm md:text-base">Real-time statistics with automatic 2-minute updates</li>
              <li className="text-sm md:text-base">Toggle between STRX and USD values by clicking on amounts</li>
              <li className="text-sm md:text-base">Live staking activity dashboard showing recent stakes and withdrawals</li>
              <li className="text-sm md:text-base">New staker detection and highlighting</li>
              <li className="text-sm md:text-base">Percentage of total supply for staked amounts</li>
              <li className="text-sm md:text-base">Sortable leaderboard with search functionality</li>
              <li className="text-sm md:text-base">Find some easter eggs</li>
            </ul>

            <p className="text-sm md:text-base mt-4">
              The leaderboard updates every 30 minutes to provide the most current staking data. 
              USD price is updated every 2 minutes. Users are categorized into tiers (Whale, 
              Shark, Dolphin, etc.) based on their total STRX holdings.
            </p>
          </div>
        </div>

        {/* Footer with close button */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-purple-600 dark:bg-purple-700 text-white rounded-lg 
                     hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors 
                     text-sm md:text-base"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});
