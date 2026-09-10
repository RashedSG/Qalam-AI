import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('q-surface rounded-2xl border shadow-card', className)}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
  /** مستوى العنوان. الافتراضي h2؛ يُرفع إلى h1 حين تكون البطاقة عنوان الصفحة. */
  titleAs: Heading = 'h2',
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  titleAs?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 p-5 pb-0', className)}>
      <div className="min-w-0">
        <Heading className="text-base font-semibold sm:text-lg">{title}</Heading>
        {description ? <p className="q-muted mt-1 text-sm">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 border-t px-5 py-4', className)}
      style={{ borderColor: 'rgb(var(--q-border))' }}
      {...props}
    />
  )
}
