import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'outline' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:brightness-110',
  outline: 'border border-brand text-brand hover:bg-brand/10',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface2',
  ghost: 'text-muted hover:bg-surface2 hover:text-fg',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:cursor-not-allowed disabled:opacity-55', size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm', variants[variant], className)}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
