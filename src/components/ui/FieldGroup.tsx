import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FieldGroupProps {
  label: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}

/**
 * مثل Field لكن لمجموعات الاختيار (أزرار/شرائح) بدل عنصر إدخال واحد.
 * يستخدم role="group" + aria-labelledby — لأن <label for> لا يصح مع <div>.
 */
export function FieldGroup({ label, hint, error, children, className }: FieldGroupProps) {
  const id = useId()
  const labelId = `${id}-label`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('space-y-1.5', className)}>
      <span id={labelId} className="block text-sm font-medium">
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
        {children}
      </div>
      {hint && !error ? (
        <p id={hintId} className="q-muted text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
