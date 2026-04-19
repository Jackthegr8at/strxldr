import { useCallback, useEffect, useState } from 'react';

export const useRouteSelection = () => {
  const [selectedUser, setSelectedUser] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('user');
  });

  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      setSelectedUser(urlParams.get('user'));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const isBridgePage = typeof window !== 'undefined' && window.location.pathname === '/bridge';

  const handleUserSelect = useCallback((username: string) => {
    setSelectedUser(username);
    const params = new URLSearchParams(window.location.search);
    params.set('user', username);
    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.pushState({ username }, '', newUrl);
  }, []);

  const handleBackToLeaderboard = useCallback(() => {
    setSelectedUser(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('user');
    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.pushState({}, '', newUrl);
  }, []);

  return {
    selectedUser,
    setSelectedUser,
    isBridgePage,
    handleUserSelect,
    handleBackToLeaderboard,
  };
};
