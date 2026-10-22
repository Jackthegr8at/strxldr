import { useMemo, memo } from 'react';
import { useRecentActions } from '../hooks/useResources';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { StakingTier } from '../lib/types';
import { STAKING_TIERS, getUserTier } from '../lib/leaderboard';
import { fetchHistoryActions } from '../lib/api';
import type { ActionResponse } from '../lib/types';
import { UserSelectContext } from '../contexts/UserSelectContext';

const UsernameLink: React.FC<{ username: string }> = ({ username }) => (
  <UserSelectContext.Consumer>
    {(onSelect: (username: string) => void) => (
      <button
        onClick={() => onSelect(username)}
        className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
      >
        {username}
      </button>
    )}
  </UserSelectContext.Consumer>
);

type RecentActionsDashboardProps = {
  strxPrice: number;
  stakersData?: { [key: string]: { staked: number; unstaked: number } };
  setSearchTerm: (term: string) => void;
  selectedTier: StakingTier | null;
};

export const RecentActionsDashboard = memo<RecentActionsDashboardProps>(({ strxPrice, stakersData, setSearchTerm, selectedTier }) => {
  const { data: actionsData, isLoading, error, mutate } = useRecentActions(selectedTier?.name ?? null);

  // Update the formatTimestamp function
  const formatTimestamp = (timestamp: string) => {
    try {
      // Remove milliseconds if present and ensure proper UTC format
      const cleanTimestamp = timestamp
        .replace('.000', '')  // Remove milliseconds
        .replace(/Z$/, '')    // Remove Z if present
        + 'Z';               // Add Z back to ensure UTC

      const date = new Date(cleanTimestamp);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date:', timestamp);
        return 'Invalid date';
      }

      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      });
    } catch (error) {
      console.warn('Error formatting timestamp:', timestamp, error);
      return 'Invalid date';
    }
  };

  const recentActions = useMemo(() => {
    if (!actionsData?.actions) return [];

    return actionsData.actions
      .filter(action => {
        if (!selectedTier || !stakersData) return true;

        const username = action.act.data.memo === "withdraw stake"
          ? action.act.data.to
          : action.act.data.from;

        const userStaked = stakersData[username]?.staked || 0;

        // Get tier boundaries
        const tierIndex = STAKING_TIERS.findIndex(t => t.name === selectedTier.name);
        const nextTierUp = STAKING_TIERS[tierIndex - 1];

        // Check if user is within the selected tier's range
        return userStaked >= selectedTier.minimum &&
               (!nextTierUp || userStaked < nextTierUp.minimum);
      })
      .slice(0, 15)
      .map(action => ({
        time: formatTimestamp(action.timestamp),
        timestamp: action.timestamp,
        username: action.act.data.memo === "withdraw stake"
          ? action.act.data.to
          : action.act.data.from,
        amount: parseFloat(action.act.data.quantity.split(' ')[0]),
        type: action.act.data.memo,
        trxId: action.trx_id,
        isNewStaker: stakersData &&
                    action.act.data.memo === "add stake" &&
                    !stakersData[action.act.data.from]
      }));
  }, [actionsData, stakersData, selectedTier]);

  return (
    <div className="activity-panel recent-activity-panel" tabIndex={0} role="region" aria-label="Recent staking activity" aria-busy={isLoading}>
      {recentActions.length === 0 ? (
        <p className="p-4 text-muted-foreground">
          {isLoading ? 'Loading activity…' : error ? <><span>Unable to load activity.</span> <button onClick={() => { void mutate(); }}>Retry</button></> : 'No recent activity.'}
        </p>
      ) : (
        <ul className="recent-activity-list" aria-label="Recent staking transactions">
          {recentActions.map((action, index) => (
            <li key={index} className="recent-activity-item">
              <div className="recent-activity-account">
                <span className="recent-activity-label">Username</span>
                <div className="recent-activity-identity">
                  {stakersData && <span title={getUserTier(stakersData[action.username]?.staked || 0).name}>{getUserTier(stakersData[action.username]?.staked || 0).emoji}</span>}
                  <UsernameLink username={action.username} />
                  {action.isNewStaker && <span className="text-xs text-green-700 dark:text-green-300">New Staker! 🎉</span>}
                </div>
              </div>
              <div className="recent-activity-time">
                <span className="recent-activity-label">Time</span>
                <time dateTime={action.timestamp}>{action.time}</time>
              </div>
              <div className="recent-activity-money">
                <span className="recent-activity-label">Amount · USD Value</span>
                <span>{action.amount.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} STRX</span>
                <span className="text-muted-foreground">${(action.amount * strxPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="recent-activity-actions">
                <a
                  href={`https://explorer.xprnetwork.org/transaction/${action.trxId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={action.type === 'add stake' ? 'text-green-700 dark:text-green-400 hover:underline' : 'text-red-700 dark:text-red-400 hover:underline'}
                >
                  <span aria-hidden="true">{action.type === 'add stake' ? '👍' : '👎'}</span> {action.type === 'add stake' ? 'Add Stake' : 'Withdraw'}
                </a>
                <button
                  onClick={() => {
                    setSearchTerm(action.username);
                    const searchInput = document.querySelector<HTMLInputElement>('#staker-search');
                    searchInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    searchInput?.focus({ preventScroll: true });
                  }}
                  className="icon-control text-purple-600 dark:text-purple-400"
                  title="Search this user"
                  aria-label={`Search ${action.username} on the leaderboard`}
                >
                  <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
