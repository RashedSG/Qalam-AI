import type { ReactNode } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 rounded-2xl bg-[rgb(var(--q-surface-2))] p-4">
        {icon ?? <Inbox className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="q-muted mt-1.5 max-w-sm text-sm">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'إعادة المحاولة',
  className,
}: {
  message: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border border-red-600/25 bg-red-600/5 p-4 text-sm sm:flex-row sm:items-center',
        className,
      )}
    >
      <AlertTriangle className="size-5 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
      <p className="flex-1 text-red-800 dark:text-red-300">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse-soft rounded-lg bg-[rgb(var(--q-surface-2))]', className)}
      aria-hidden="true"
    />
  )
}
