import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { inputClasses } from './Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 5, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(inputClasses, 'resize-y leading-8', className)} {...props} />
  },
)
