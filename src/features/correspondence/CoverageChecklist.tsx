import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'
import { cn } from '@/lib/utils'
import type { CoverageItem } from '@/services/ai/schemas'

/** يتحقق بصريًا من أن الرد غطّى كل نقطة طلبها المرسل. */
export function CoverageChecklist({ items, className }: { items: CoverageItem[]; className?: string }) {
  const { t } = useI18n()
  if (!items.length) return null

  const missing = items.filter((i) => !i.covered).length

  return (
    <div className={cn('rounded-xl border p-4', className)} style={{ borderColor: 'rgb(var(--q-border))' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('reply.coverage')}</h3>
        <span className={cn('text-xs font-medium tabular-nums', missing ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>
          {items.length - missing} / {items.length}
        </span>
      </div>

      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.pointId} className="flex items-start gap-2.5 text-sm">
            {item.covered ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className={cn('leading-7', !item.covered && 'font-medium')}>{item.point}</p>
              {!item.covered ? (
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {item.note || t('reply.notCovered')}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
