import { Skeleton } from '@/components/ui';

/** Placeholder turn shapes while history loads: a right-aligned block, then document lines. */
export function MessagesSkeleton() {
  return (
    <div role="status" aria-label="Loading messages" className="min-h-0 flex-1 overflow-hidden px-4 py-5 [view-transition-name:chat-body] md:px-5">
      <div className="mx-auto flex w-full max-w-[var(--chat-max-w)] flex-col gap-3">
        {[0, 1].map((turn) => (
          <div key={turn} className="flex flex-col gap-3 [&:not(:first-child)]:mt-6">
            <Skeleton className="h-10 w-3/5 self-end md:w-2/5" />
            <Skeleton className="mt-2 h-4 w-1/3" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
