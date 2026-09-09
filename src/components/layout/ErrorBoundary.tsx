import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Logo } from '@/components/ui/Logo'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

/**
 * حاجز أخطاء عام — يمنع الشاشة البيضاء.
 * خصوصية: لا نعرض ولا نسجّل محتوى المراسلات، فقط رسالة الخطأ التقنية في وحدة التحكم.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[qalam] render error:', error.message, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <Logo size="md" className="mb-8" />
        <h1 className="text-lg font-semibold">حدث خطأ غير متوقع</h1>
        <p className="q-muted mt-2 max-w-sm leading-7">
          تعذّر عرض هذه الصفحة. يمكنك إعادة تحميل التطبيق والمتابعة.
        </p>
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          className="mt-7 inline-flex h-11 items-center rounded-xl bg-navy-700 px-5 text-sm font-medium text-white hover:bg-navy-800 dark:bg-beige-100 dark:text-navy-900"
        >
          العودة إلى الرئيسية
        </button>
      </div>
    )
  }
}
