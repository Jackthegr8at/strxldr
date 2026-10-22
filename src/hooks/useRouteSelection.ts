import { useCallback, useEffect, useState } from 'react';
const readRoute = () => ({ pathname: window.location.pathname, selectedUser: window.location.pathname === '/bridge' ? null : new URLSearchParams(window.location.search).get('user') });
export const useRouteSelection = () => {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => { const read = () => setRoute(readRoute()); window.addEventListener('popstate', read); return () => window.removeEventListener('popstate', read); }, []);
  const navigate = useCallback((pathname: string, username: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (username) params.set('user', username); else params.delete('user');
    window.history.pushState({}, '', `${pathname}${params.size ? '?' + params.toString() : ''}`);
    setRoute(readRoute());
  }, []);
  return { ...route, isBridgePage: route.pathname === '/bridge', handleUserSelect: (username: string) => navigate('/', username), handleBackToLeaderboard: () => navigate('/', null), handleBridgeSelect: () => navigate('/bridge', null) };
};
