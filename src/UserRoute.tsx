import { lazy, Suspense } from 'react';
import { useSnapshot } from './hooks/useResources';
import { LoadState } from './components/LoadState';
import { PageFallback } from './components/PageFallback';
const UserPage = lazy(() => import('./UserPage'));
const UserPageNoStake = lazy(() => import('./UserPageNoStake'));
export default function UserRoute({ username, onBack }: { username: string; onBack: () => void }) {
  const snapshot = useSnapshot();
  const userData = snapshot.data?.data[username];
  return <LoadState loading={snapshot.isLoading} error={snapshot.error} hasData={snapshot.hasData} stale={snapshot.cached} onRetry={() => { void snapshot.mutate(); }}>
    {snapshot.data && <Suspense fallback={<PageFallback />}>{userData ? <UserPage key={username} username={username} onBack={onBack} userData={userData} lastModified={snapshot.data.lastModified} /> : <UserPageNoStake key={username} username={username} onBack={onBack} />}</Suspense>}
  </LoadState>;
}
