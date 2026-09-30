import clsx from 'clsx';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={clsx('animate-pulse rounded-md bg-surface2', className)} aria-hidden />
);

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={clsx('h-4', c === 0 ? 'w-44' : c === 1 ? 'w-56' : 'w-24')} />
          ))}
        </div>
      ))}
    </div>
  );
}
