import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, totalPages, total, pageSize, onChange }: { page: number; totalPages: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = 'flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
      <span>
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">
          Page {page} of {totalPages}
        </span>
        <button className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className={btn} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
