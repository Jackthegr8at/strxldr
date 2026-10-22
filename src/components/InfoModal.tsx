import { useEffect, useRef, memo } from 'react';

type InfoModalProps = {
  isOpen: boolean;
  opener?: HTMLElement | null;
  onClose: () => void;
};

export const InfoModal = memo<InfoModalProps>(({ isOpen, onClose, opener }) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const restoreTarget = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    closeButtonRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [isOpen, opener]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="m-auto p-0 border-0 bg-transparent text-foreground w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] backdrop:bg-black/50"
      aria-labelledby="info-modal-title"
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(control => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onCancel={event => { event.preventDefault(); onCloseRef.current(); }}
      onClose={() => { if (dialogRef.current?.isConnected && dialogRef.current.open === false) onCloseRef.current(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onCloseRef.current();
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
    </dialog>
  );
});
