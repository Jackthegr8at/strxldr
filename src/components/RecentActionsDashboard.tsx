import { useMemo, memo } from 'react';
import useSWR from 'swr';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { StakingTier } from '../lib/types';
import { STAKING_TIERS, getUserTier } from '../lib/leaderboard';
import { fetchHistoryActions } from '../lib/api';
import type { ActionResponse } from '../lib/types';
import { UserSelectContext } from '../index';

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
  const { data: actionsData } = useSWR<ActionResponse>(
    ['recent_actions', selectedTier?.name],
    () => fetchHistoryActions<ActionResponse>({
      limit: selectedTier ? '100' : '30',
      account: 'storexstake',
      sort: 'desc',
      'act.name': 'transfer'
    }, 'storexstake'),
    { refreshInterval: 30000 }  // 30 seconds
  );

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
    <div className="bg-card rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table-custom">
          <thead>
            <tr>
              <th>Time</th>
              <th>Username</th>
              <th>Amount</th>
              <th>USD Value</th>
              <th>Action</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recentActions.map((action, index) => (
              <tr key={index} className={action.isNewStaker ? 'bg-green-50 dark:bg-green-900/20' : ''}>
                <td>{action.time}</td>
                <td>
                  <div className="flex items-center gap-2">
                    {stakersData && (
                      <span title={getUserTier(stakersData[action.username]?.staked || 0).name}>
                        {getUserTier(stakersData[action.username]?.staked || 0).emoji}
                      </span>
                    )}
                    <UsernameLink username={action.username} />
                    {action.isNewStaker && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300">
                        New Staker! 🎉
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  {action.amount.toLocaleString(undefined, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4
                  })} STRX
                </td>
                <td>
                  ${(action.amount * strxPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </td>
                <td>
                  <a 
                    href={`https://explorer.xprnetwork.org/transaction/${action.trxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 hover:underline ${
                      action.type === 'add stake' 
                        ? 'text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300' 
                        : 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300'
                    }`}
                  >
                    {action.type === 'add stake' ? (
                      <>
                        <span>👍</span> Add Stake
                      </>
                    ) : (
                      <>
                        <span>👎</span> Withdraw
                      </>
                    )}
                  </a>
                </td>
                <td>
                  <button
                    onClick={() => {
                      setSearchTerm(action.username);
                      const searchInput = document.querySelector('input[type="text"]');
                      if (searchInput) {
                        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                    className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
                    title="Search this user"
                  >
                    <MagnifyingGlassIcon className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
