import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  fullWidth?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-navy-700 text-white hover:bg-navy-800 active:bg-navy-900 dark:bg-beige-100 dark:text-navy-900 dark:hover:bg-white',
  secondary:
    'bg-beige-100 text-navy-800 hover:bg-beige-200 border border-beige-300 dark:bg-navy-800 dark:text-beige-100 dark:border-navy-600 dark:hover:bg-navy-700',
  outline:
    'border border-[rgb(var(--q-border))] bg-transparent text-[rgb(var(--q-text))] hover:bg-[rgb(var(--q-surface-2))]',
  ghost: 'bg-transparent text-[rgb(var(--q-text))] hover:bg-[rgb(var(--q-surface-2))]',
  danger: 'bg-red-700 text-white hover:bg-red-800 active:bg-red-900',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-[0.95rem] gap-2',
  lg: 'h-13 px-6 text-base gap-2.5 py-3.5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, fullWidth, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
})
