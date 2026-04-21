import { useMemo, memo } from 'react';
import type { StakingTier, SectionVisibility } from '../lib/types';
import { STAKING_TIERS } from '../lib/leaderboard';
import { UserSelectContext } from '../index';

type MilestoneUser = {
  username: string;
  currentTier: StakingTier;
  nextTier: StakingTier;
  staked: number;
  remaining: number;
  percentageComplete: number;
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

type TierMilestoneTrackerProps = {
  stakersData: Array<{ username: string; total: number; staked: number }>;
  setSearchTerm: (term: string) => void;
  selectedTier: StakingTier | null;
  sectionVisibility: SectionVisibility;
  setSectionVisibility: React.Dispatch<React.SetStateAction<SectionVisibility>>;
  SectionHeader: React.FC<{
    title: string;
    sectionKey: string;
    isVisible: boolean;
    onToggle: () => void;
  }>;
};

export const TierMilestoneTracker = memo<TierMilestoneTrackerProps>(({ 
  stakersData, 
  setSearchTerm, 
  selectedTier, 
  sectionVisibility, 
  setSectionVisibility,
  SectionHeader 
}) => {
  const milestones = useMemo(() => {
    return stakersData
      .map(staker => {
        let currentTier = STAKING_TIERS[0];
        for (let i = 0; i < STAKING_TIERS.length; i++) {
          if (staker.staked >= STAKING_TIERS[i].minimum) {
            currentTier = STAKING_TIERS[i];
            break;
          }
        }
        
        const tierIndex = STAKING_TIERS.findIndex(t => t.name === currentTier.name);
        const nextTier = STAKING_TIERS[tierIndex - 1];
        
        if (!nextTier) {
          return null;
        }
        
        const remaining = nextTier.minimum - staker.staked;
        const percentageComplete = ((staker.staked - currentTier.minimum) / 
          (nextTier.minimum - currentTier.minimum)) * 100;

        return {
          username: staker.username,
          currentTier,
          nextTier,
          staked: staker.staked,
          remaining,
          percentageComplete
        };
      })
      .filter((milestone): milestone is MilestoneUser => {
        if (!milestone) return false;
        
        const isCloseToNextTier = 
          milestone.remaining > 0 && 
          milestone.remaining < milestone.nextTier.minimum * 0.15;
        
        if (selectedTier) {
          return milestone.currentTier.name === selectedTier.name && isCloseToNextTier;
        } else {
          return milestone.currentTier.name !== 'No Stake' && isCloseToNextTier;
        }
      })
      .sort((a, b) => {
        // First sort by tier level (higher tiers first)
        const aTierIndex = STAKING_TIERS.findIndex(t => t.name === a.currentTier.name);
        const bTierIndex = STAKING_TIERS.findIndex(t => t.name === b.currentTier.name);
        
        if (aTierIndex !== bTierIndex) {
          return aTierIndex - bTierIndex; // Lower index (higher tier) comes first
        }
        
        // If same tier, sort by how close they are to next tier (percentage)
        return b.percentageComplete - a.percentageComplete;
      })
      .slice(0, selectedTier ? 999 : 15);
  }, [stakersData, selectedTier]);

  if (milestones.length === 0 || selectedTier?.name === 'No Stake') return null;

  return (
    <div className="mb-8">
      <SectionHeader
        title="Tier Milestone Tracker 🎯"
        sectionKey="tierMilestones"
        isVisible={sectionVisibility.tierMilestones}
        onToggle={() => setSectionVisibility(prev => ({
          ...prev,
          tierMilestones: !prev.tierMilestones
        }))}
      />

      {sectionVisibility.tierMilestones && (
        <div className="rounded-lg border-t shadow dark:shadow-purple-500 overflow-hidden">
          {/* Mobile view */}
          <div className="md:hidden">
            <div className="grid grid-cols-1 gap-4 p-4">
              {milestones.slice(0, 3).map((milestone, index) => (
                <div key={index} className="bg-card p-4 rounded-lg border">
                  <div className="flex justify-between items-start mb-2">
                    <UsernameLink username={milestone.username} />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{milestone.currentTier.emoji}</span>
                    <span className="text-gray-400">➜</span>
                    <span className="text-2xl">{milestone.nextTier.emoji}</span>
                  </div>

                  <div className="mb-2">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Progress to {milestone.nextTier.name}</span>
                      <span>{milestone.percentageComplete.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${milestone.percentageComplete}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-200">
                    <span className="font-medium text-purple-600 dark:text-purple-400">
                      {milestone.remaining.toLocaleString()} STRX
                    </span>
                    {' '}remaining
                  </div>
                </div>
              ))}
            </div>

            {/* Compact table for remaining items */}
            {milestones.length > 3 && (
              <div className="border-t border-gray-200 dark:border-purple-500">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <tbody className="divide-y divide-gray-200 dark:divide-purple-500">
                      {milestones.slice(3).map((milestone, index) => (
                        <tr key={index} className="hover:bg-purple-50 dark:hover:bg-purple-900">
                          <td className="px-4 py-2 text-sm">
                            <UsernameLink username={milestone.username} />
                          </td>
                          <td className="px-4 py-2 text-sm text-center">
                            <span className="text-lg">
                              {milestone.currentTier.emoji} ➜ {milestone.nextTier.emoji}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-right">
                            <span className="text-gray-600 dark:text-gray-200">
                              {milestone.remaining.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Desktop view - original grid layout */}
          <div className="hidden md:block p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {milestones.map((milestone, index) => (
                <div key={index} className="bg-card p-4 rounded-lg border">
                  <div className="flex justify-between items-start mb-2">
                    <UsernameLink username={milestone.username} />
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{milestone.currentTier.emoji}</span>
                    <span className="text-gray-400">➜</span>
                    <span className="text-2xl">{milestone.nextTier.emoji}</span>
                  </div>

                  <div className="mb-2">
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-200 mb-1">
                      <span>Progress to {milestone.nextTier.name}</span>
                      <span>{milestone.percentageComplete.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${milestone.percentageComplete}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-200">
                    <span className="font-medium text-purple-600 dark:text-purple-400">
                      {milestone.remaining.toLocaleString()} STRX
                    </span>
                    {' '}remaining
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
