import { cn } from '@/lib/utils'

/** شعار نصي بسيط مع رمز سِنّ القلم (Pen nib). */
export function QalamMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" className="fill-navy-800 dark:fill-beige-100" />
      <path d="M16 6 L21 17 L16 20.5 L11 17 Z" className="fill-gold-500" />
      <path d="M16 20.5 L16 26" className="stroke-beige-100 dark:stroke-navy-800" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="16.2" r="1.4" className="fill-navy-800 dark:fill-beige-100" />
    </svg>
  )
}

export function Logo({
  size = 'md',
  showTagline = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  className?: string
}) {
  const markSize = size === 'lg' ? 'size-12' : size === 'sm' ? 'size-7' : 'size-9'
  const nameSize = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-xl'

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <QalamMark className={markSize} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-baseline gap-2">
          <span className={cn('font-bold tracking-tight', nameSize)}>قلم</span>
          <span className="q-muted text-xs font-semibold tracking-[0.18em]">QALAM</span>
        </div>
        {showTagline ? (
          <p className="q-muted mt-0.5 text-xs">مساعد المراسلات المؤسسية الذكي</p>
        ) : null}
      </div>
    </div>
  )
}
