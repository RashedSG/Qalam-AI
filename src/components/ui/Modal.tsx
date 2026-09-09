import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, description, children, footer, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'q-surface animate-fade-in relative w-full max-w-lg rounded-t-2xl border shadow-lift sm:rounded-2xl',
          'max-h-[90dvh] overflow-y-auto',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? <p className="q-muted mt-1 text-sm">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 hover:bg-[rgb(var(--q-surface-2))]"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {children ? <div className="px-5 pb-5">{children}</div> : null}
        {footer ? (
          <div
            className="flex flex-wrap justify-end gap-2 border-t px-5 py-4"
            style={{ borderColor: 'rgb(var(--q-border))' }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
