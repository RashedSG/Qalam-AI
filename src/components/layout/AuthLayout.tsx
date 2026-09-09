import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link to="/" className="mb-8" aria-label="قلم">
        <Logo size="md" />
      </Link>

      <div className="q-surface w-full max-w-md rounded-2xl border p-6 shadow-card sm:p-7">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle ? <p className="q-muted mt-1.5 text-sm leading-7">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>

      {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
    </div>
  )
}
