'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isError, isPending } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  if (isPending || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }
  return <AppShell user={user}>{children}</AppShell>;
}
