import type { NewStaker } from '../lib/types';
import { UserSelectContext } from '../index';
import { memo } from 'react';

type NewStakersPanelProps = {
  newStakers: NewStaker[];
  strxPrice: number;
};

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

export const NewStakersPanel = memo<NewStakersPanelProps>(({ newStakers, strxPrice }) => {
  if (!newStakers.length) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        New Stakers 🎉
      </h2>
      <div className="bg-card rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-custom">
            <thead>
              <tr>
                <th>Time</th>
                <th>Username</th>
                <th>Initial Stake</th>
                <th>USD Value</th>
              </tr>
            </thead>
            <tbody>
              {newStakers.map((staker, index) => {
                const stakerDate = new Date(staker.date);
                const isLast24Hours = (new Date().getTime() - stakerDate.getTime()) < 24 * 60 * 60 * 1000;

                // Format the date with leading zeros for hours and minutes
                const formattedDate = `${stakerDate.getFullYear()}-${String(stakerDate.getMonth() + 1).padStart(2, '0')}-${String(stakerDate.getDate()).padStart(2, '0')} ${String(stakerDate.getHours()).padStart(2, '0')} h ${String(stakerDate.getMinutes()).padStart(2, '0')}`;

                return (
                  <tr 
                    key={staker.username} 
                    className={`${
                      isLast24Hours 
                        ? 'bg-green-50/50 dark:bg-green-800/20' 
                        : ''
                    }`}
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formattedDate}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <UsernameLink username={staker.username} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {staker.total_staked.toLocaleString(undefined, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4
                      })} STRX
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      ${(staker.total_staked * strxPrice).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
