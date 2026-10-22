import type { ReactNode } from 'react';

type LoadStateProps = {
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
  hasData: boolean;
  stale?: boolean;
  children?: ReactNode;
};

export function LoadState({ loading, error, onRetry, hasData, stale, children }: LoadStateProps) {
  if (!hasData && error) {
    return <div role="alert" className="rounded-lg border p-4">
      <p>Unable to load data. Please try again.</p>
      <button type="button" onClick={onRetry} className="mt-2 rounded border px-3 py-2">Retry</button>
    </div>;
  }
  if (!hasData && loading) {
    return <div role="status" aria-label="Loading data" className="space-y-3 p-4">
      <span className="sr-only">Loading data…</span>
      <div aria-hidden="true" className="h-6 rounded bg-gray-200 dark:bg-gray-700" />
      <div aria-hidden="true" className="h-24 rounded bg-gray-200 dark:bg-gray-700" />
    </div>;
  }
  return <>{hasData && (error || stale) && <div role="status" className="rounded-lg border p-3">
    <p>{error ? 'Showing cached data. The latest refresh failed.' : 'Showing cached data while checking for updates.'}</p>
    <button type="button" onClick={onRetry} className="mt-2 rounded border px-3 py-2">Retry</button>
  </div>}{children}</>;
}
