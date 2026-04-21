import { Skeleton } from './Skeleton';

export const PageFallback = () => (
  <div className="min-h-screen bg-white dark:bg-gray-900 p-4 md:p-8">
    <div className="max-w-4xl mx-auto">
      {/* Header skeleton */}
      <div className="mb-6">
        <Skeleton className="h-12 w-64 mb-4" variant="rect" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full" variant="rect" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" variant="rect" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" variant="rect" />
        ))}
      </div>
    </div>
  </div>
);
