'use client';
import clsx from 'clsx';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}
interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
export const useToast = (): ToastApi => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((s) => s.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: Tone, message: string) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }), [push]);
  const icons = { success: CheckCircle2, error: XCircle, info: Info };
  const colors = {
    success: 'text-emerald-500',
    error: 'text-rose-500',
    info: 'text-blue-500',
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="card pointer-events-auto flex items-start gap-3 p-3.5 shadow-lg">
              <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', colors[t.tone])} aria-hidden />
              <p className="flex-1 text-sm">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="text-muted hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
