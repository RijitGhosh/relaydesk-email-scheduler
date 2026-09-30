'use client';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

export function useAuth() {
  return useQuery<User, ApiError>({
    queryKey: ['me'],
    queryFn: () => api<User>('/auth/me'),
    retry: (count, err) => err.status !== 401 && count < 2,
    staleTime: 60_000,
  });
}
