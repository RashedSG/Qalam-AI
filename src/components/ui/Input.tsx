import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const inputClasses =
  'w-full rounded-xl border bg-[rgb(var(--q-surface))] px-3.5 py-2.5 text-[0.95rem] text-[rgb(var(--q-text))] ' +
  'placeholder:text-[rgb(var(--q-text-muted))] transition-colors ' +
  'border-[rgb(var(--q-border))] hover:border-navy-300 disabled:opacity-60 ' +
  'aria-[invalid=true]:border-red-500'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClasses, 'h-11', className)} {...props} />
  },
)
