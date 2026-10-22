import type { ReactNode } from 'react';
import { LoadState } from './LoadState';
type Resource = { data?: unknown; error?: unknown; isLoading: boolean; cached: boolean; mutate: () => Promise<unknown> };
export function ResourceState({ resources, children }: { resources: Resource[]; children?: ReactNode }) {
  const missing = resources.some(resource => resource.data === undefined);
  const error = resources.find(resource => resource.error)?.error;
  return <LoadState loading={missing && resources.some(resource => resource.isLoading)} error={error} hasData={!missing} stale={resources.some(resource => resource.cached)} onRetry={() => { void Promise.allSettled(resources.map(resource => resource.mutate())); }}>{!missing && children}</LoadState>;
}
