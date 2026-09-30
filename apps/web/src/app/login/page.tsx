'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';
import { Wordmark } from '@/components/ui/logo';

const messages: Record<string, string> = {
  invalid_state: 'Your sign-in session expired. Please try again.',
  expired_state: 'Your sign-in session expired. Please try again.',
  login_failed: 'Google sign-in failed. Please try again.',
  access_denied: 'Google sign-in was cancelled.',
};

function LoginInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const { data: existing } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(params.get('error') ? (messages[params.get('error') as string] ?? 'Something went wrong signing you in.') : null);

  useEffect(() => {
    if (existing) router.replace('/scheduled');
  }, [existing, router]);

  const auth = useMutation({
    mutationFn: () => api<User>(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: mode === 'login' ? { email, password } : { name, email, password } }),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      router.replace('/scheduled');
    },
    onError: (e: Error) => setError(e.message),
  });

  const field = 'h-10 w-full rounded-lg bg-surface2 px-3 text-xs placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30';
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface2/40 px-4 py-10">
      <div className="w-full max-w-[300px] rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-5 flex justify-center">
          <Wordmark />
        </div>
        <h1 className="text-center text-2xl font-semibold">{mode === 'login' ? 'Login' : 'Sign up'}</h1>
        <a href="/api/auth/google" className="mt-5 flex h-9 items-center justify-center gap-2 rounded-lg bg-brand/10 text-xs font-medium transition-colors hover:bg-brand/15">
          <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3A12 12 0 1 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44a20 20 0 0 0 19.6-23.9Z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7Z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44Z" />
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9Z" />
          </svg>
          Login with Google
        </a>
        <div className="my-4 flex items-center gap-2 text-[10px] text-muted">
          <span className="h-px flex-1 bg-line" />
          or sign up through email
          <span className="h-px flex-1 bg-line" />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            auth.mutate();
          }}
          className="space-y-2.5"
        >
          {mode === 'signup' && <input aria-label="Name" required maxLength={100} className={field} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
          <input aria-label="Email ID" type="email" required className={field} placeholder="Email ID" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input aria-label="Password" type="password" required minLength={mode === 'signup' ? 8 : 1} className={field} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <Button type="submit" loading={auth.isPending} className="mt-2 h-9 w-full text-xs">
            {mode === 'login' ? 'Login' : 'Create account'}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
          }}
          className="mt-4 w-full text-center text-xs text-muted hover:text-fg"
        >
          {mode === 'login' ? 'New here? Sign up with email' : 'Already have an account? Login'}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
