import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Spinner } from './Spinner'

/**
 * تجربة انتظار تشرح ما يحدث بلغة المستخدم.
 * ملاحظة: هذه خطوات وصفية للواجهة فقط — لا تعرض أي تفكير داخلي للنموذج.
 */
export function ProcessingSteps({ steps, className }: { steps: string[]; className?: string }) {
  const [active, setActive] = useState(0)
  // مفتاح مستقر: يمنع إعادة تشغيل المؤقت عند كل إعادة رسم بمصفوفة جديدة بنفس المحتوى.
  const stepsKey = steps.join('|')
  const stepCount = steps.length

  useEffect(() => {
    setActive(0)
    if (stepCount <= 1) return
    const id = window.setInterval(() => {
      setActive((prev) => (prev >= stepCount - 1 ? prev : prev + 1))
    }, 1800)
    return () => window.clearInterval(id)
  }, [stepsKey, stepCount])

  return (
    <ul className={cn('space-y-3', className)} aria-live="polite">
      {steps.map((step, index) => {
        const done = index < active
        const current = index === active
        return (
          <li
            key={step}
            className={cn(
              'flex items-center gap-3 text-sm transition-opacity',
              done && 'opacity-60',
              !done && !current && 'opacity-35',
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--q-surface-2))]">
              {done ? (
                <Check className="size-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              ) : current ? (
                <Spinner className="size-3.5" />
              ) : (
                <span className="size-1.5 rounded-full bg-[rgb(var(--q-text-muted))]" aria-hidden="true" />
              )}
            </span>
            <span className={cn(current && 'font-medium')}>{step}</span>
          </li>
        )
      })}
    </ul>
  )
}
