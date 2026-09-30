/* eslint-disable @next/next/no-img-element */
import clsx from 'clsx';

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return src ? (
    <img src={src} alt={name} referrerPolicy="no-referrer" className={clsx('h-8 w-8 rounded-full object-cover', className)} />
  ) : (
    <div aria-label={name} className={clsx('flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-fg', className)}>
      {initial}
    </div>
  );
}
