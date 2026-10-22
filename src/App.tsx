import { lazy, Suspense } from 'react';
import { useRouteSelection } from './hooks/useRouteSelection';
import { useRouteMeta } from './hooks/useRouteMeta';
import { UserSelectContext, NavigationContext } from './contexts/UserSelectContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageFallback } from './components/PageFallback';
const LeaderboardPage = lazy(() => import('./index'));
const UserRoute = lazy(() => import('./UserRoute'));
const BridgePage = lazy(() => import('./BridgePage').then(module => ({default: module.BridgePage})));
export default function App() {
  const route = useRouteSelection();
  useRouteMeta(route.isBridgePage, route.selectedUser);
  return <NavigationContext.Provider value={{ home: route.handleBackToLeaderboard, bridge: route.handleBridgeSelect }}><UserSelectContext.Provider value={route.handleUserSelect}><ErrorBoundary key={route.isBridgePage ? 'bridge' : route.selectedUser ?? 'leaderboard'}><Suspense fallback={<PageFallback />}>
    {route.isBridgePage ? <BridgePage onBack={route.handleBackToLeaderboard} /> : route.selectedUser ? <UserRoute username={route.selectedUser} onBack={route.handleBackToLeaderboard} /> : <LeaderboardPage onUserSelect={route.handleUserSelect} onBridgeSelect={route.handleBridgeSelect} />}
  </Suspense></ErrorBoundary></UserSelectContext.Provider></NavigationContext.Provider>;
}
