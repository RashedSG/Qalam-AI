import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Logo } from '@/components/ui/Logo'

/**
 * شاشة إرشاد بدل انهيار التطبيق عندما تكون متغيرات البيئة ناقصة.
 */
export function ConfigGate({ children }: { children: ReactNode }) {
  if (isSupabaseConfigured) return <>{children}</>

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="q-surface w-full max-w-lg rounded-2xl border p-7 shadow-card">
        <Logo size="lg" showTagline className="mb-6" />
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="space-y-2 text-sm">
            <p className="font-semibold">الإعداد غير مكتمل</p>
            <p className="q-muted leading-7">
              لم يتم ضبط اتصال Supabase. انسخ ملف <code className="font-mono">.env.example</code> إلى{' '}
              <code className="font-mono">.env</code> واملأ المتغيرين التاليين ثم أعد تشغيل التطبيق:
            </p>
            <ul className="q-muted list-inside list-disc font-mono text-xs leading-6">
              <li>VITE_SUPABASE_URL</li>
              <li>VITE_SUPABASE_ANON_KEY</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
