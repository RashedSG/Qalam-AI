import { useCallback, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { AiError, type AiCallOptions } from '@/services/ai'

interface AiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * غلاف موحّد لكل استدعاءات AI:
 * - يمرر رمز الجلسة تلقائيًا.
 * - يلغي الطلب السابق عند إطلاق طلب جديد.
 * - يحوّل الأخطاء إلى رسالة عربية جاهزة للعرض.
 */
export function useAiTask<TResult, TPayload = unknown>(
  task: (payload: TPayload, options?: AiCallOptions) => Promise<TResult>,
) {
  const { accessToken } = useAuth()
  const [state, setState] = useState<AiState<TResult>>({ data: null, loading: false, error: null })
  const abortRef = useRef<AbortController | null>(null)

  const run = useCallback(
    async (payload: TPayload): Promise<TResult | null> => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState({ data: null, loading: true, error: null })
      try {
        const result = await task(payload, { accessToken, signal: controller.signal })
        if (controller.signal.aborted) return null
        setState({ data: result, loading: false, error: null })
        return result
      } catch (err) {
        if (controller.signal.aborted) return null
        const message =
          err instanceof AiError ? err.message : 'تعذّر إتمام العملية حاليًا. حاول مرة أخرى.'
        setState({ data: null, loading: false, error: message })
        return null
      }
    },
    [task, accessToken],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState({ data: null, loading: false, error: null })
  }, [])

  const setData = useCallback((data: TResult | null) => {
    setState((prev) => ({ ...prev, data }))
  }, [])

  return { ...state, run, reset, setData }
}
