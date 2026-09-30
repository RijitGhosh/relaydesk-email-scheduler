'use client';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const order = ['light', 'dark', 'system'] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = (mounted ? theme : 'system') as (typeof order)[number];
  const next = order[(order.indexOf(current) + 1) % order.length] as (typeof order)[number];
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;
  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${current}. Switch to ${next}`}
      title={`Theme: ${current}`}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:bg-surface2 hover:text-fg"
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
