import { cn } from '@/lib/utils'
import { scoreTone } from '@/lib/utils'

const RING: Record<'good' | 'warn' | 'bad', string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
}

export function ScoreGauge({
  score,
  label,
  size = 120,
  className,
}: {
  score: number
  label?: string
  size?: number
  className?: string
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={`${clamped} من 100`}>
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8" className="stroke-[rgb(var(--q-border))]" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn('stroke-current transition-[stroke-dashoffset] duration-700', RING[scoreTone(clamped)])}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{clamped}</span>
          <span className="q-muted text-[0.7rem]">/ 100</span>
        </div>
      </div>
      {label ? <span className="q-muted text-sm">{label}</span> : null}
    </div>
  )
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="q-muted tabular-nums">{clamped}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-[rgb(var(--q-surface-2))]"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            scoreTone(clamped) === 'good' && 'bg-emerald-600',
            scoreTone(clamped) === 'warn' && 'bg-amber-500',
            scoreTone(clamped) === 'bad' && 'bg-red-600',
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
