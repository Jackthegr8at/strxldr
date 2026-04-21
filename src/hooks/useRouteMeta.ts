import { useEffect } from 'react';

export const useRouteMeta = (isBridgePage: boolean, selectedUser: string | null) => {
  useEffect(() => {
    if (isBridgePage) {
      document.title = 'STRX Bridge | STRX Staking Leaderboard';
      updateMetaDescription('Bridge your STRX tokens and view bridge transactions on the STRX staking leaderboard.');
    } else if (selectedUser) {
      document.title = `${selectedUser} | STRX Staking Leaderboard`;
      updateMetaDescription(`View ${selectedUser}'s staking stats, rewards, and history on the STRX staking leaderboard.`);
    } else {
      document.title = 'STRX Staking Leaderboard';
      updateMetaDescription('Track STRX staking statistics, rewards, and leaderboard rankings in real-time.');
    }
  }, [isBridgePage, selectedUser]);
};

const updateMetaDescription = (description: string) => {
  let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.appendChild(meta);
  }
  meta.content = description;
};
