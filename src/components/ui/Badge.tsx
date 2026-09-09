import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'navy'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[rgb(var(--q-surface-2))] text-[rgb(var(--q-text-muted))]',
  navy: 'bg-navy-700 text-white dark:bg-navy-600',
  gold: 'bg-gold-500/15 text-gold-600 dark:text-gold-400',
  success: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  danger: 'bg-red-600/12 text-red-700 dark:text-red-400',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
