'use client';
import clsx from 'clsx';
import { Activity, ChevronDown, Clock, ExternalLink, LogOut, Menu, Monitor, Moon, Send, Slack, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useStats } from '@/hooks/use-stats';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';
import { Avatar } from '../ui/avatar';
import { Wordmark } from '../ui/logo';

function UserMenu({ user, onNavigate }: { user: User; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      router.replace('/login');
    },
  });
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-fg hover:bg-surface2';
  const themes = [
    { id: 'light', icon: Sun, label: 'Light' },
    { id: 'dark', icon: Moon, label: 'Dark' },
    { id: 'system', icon: Monitor, label: 'System' },
  ];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex w-full items-center gap-2.5 rounded-xl bg-surface2 px-2.5 py-2 text-left">
        <Avatar name={user.name} src={user.avatarUrl} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium">{user.name}</span>
          <span className="block truncate text-[11px] text-muted">{user.email}</span>
        </span>
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full z-40 mt-2 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          <Link role="menuitem" href="/senders" className={item} onClick={() => { setOpen(false); onNavigate(); }}>
            <Send className="h-4 w-4 text-muted" aria-hidden /> Senders
          </Link>
          <Link role="menuitem" href="/integrations" className={item} onClick={() => { setOpen(false); onNavigate(); }}>
            <Slack className="h-4 w-4 text-muted" aria-hidden /> Slack
          </Link>
          <Link role="menuitem" href="/queue" className={item} onClick={() => { setOpen(false); onNavigate(); }}>
            <Activity className="h-4 w-4 text-muted" aria-hidden /> Queue
          </Link>
          <a role="menuitem" href="/admin/queues" target="_blank" rel="noreferrer" className={item}>
            <ExternalLink className="h-4 w-4 text-muted" aria-hidden /> Bull Board
          </a>
          <div className="my-1.5 border-t border-line" />
          <div className="flex items-center gap-1 px-1.5 py-1" role="group" aria-label="Theme">
            {themes.map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setTheme(id)} aria-label={`${label} theme`} aria-pressed={mounted && theme === id} className={clsx('flex flex-1 items-center justify-center rounded-lg py-1.5', mounted && theme === id ? 'bg-brand/15 text-brand' : 'text-muted hover:bg-surface2')}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <div className="my-1.5 border-t border-line" />
          <button role="menuitem" onClick={() => logout.mutate()} className={clsx(item, 'text-rose-600')}>
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data: stats } = useStats();
  const scheduledCount = stats ? stats.emails.scheduled + stats.emails.queued + stats.emails.processing : null;
  const sentCount = stats ? stats.emails.sent + stats.emails.failed : null;
  const nav = [
    { href: '/scheduled', label: 'Scheduled', icon: Clock, count: scheduledCount },
    { href: '/sent', label: 'Sent', icon: Send, count: sentCount },
  ];

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col px-3.5 py-4">
      <Link href="/scheduled" aria-label="RelayDesk home" className="mb-4 block px-1.5" onClick={() => setOpen(false)}>
        <Wordmark />
      </Link>
      <UserMenu user={user} onNavigate={() => setOpen(false)} />
      <Link href="/compose" onClick={() => setOpen(false)} className="mt-3 flex h-9 items-center justify-center rounded-full border border-brand text-sm font-medium text-brand transition-colors hover:bg-brand/10">
        Compose
      </Link>
      <p className="mb-1.5 mt-6 px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted">Core</p>
      <ul className="space-y-1">
        {nav.map(({ href, label, icon: Icon, count }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} className={clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors', active ? 'bg-brand/10 font-semibold text-fg' : 'text-fg/80 hover:bg-surface2')}>
                <Icon className="h-4 w-4 text-muted" aria-hidden />
                <span className="flex-1">{label}</span>
                {count !== null && <span className="text-xs tabular-nums text-muted">{count.toLocaleString()}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 text-muted">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <div className="flex h-14 items-center border-b border-line px-4 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted">
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <main className="px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
