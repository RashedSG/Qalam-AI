/**
 * مزود OpenAI.
 *
 * ⚠️ مهم: هذا الملف لا يحتوي — ولن يحتوي — على OPENAI_API_KEY.
 * المسار الآمن:
 *   المتصفح → Netlify Function (/.netlify/functions/ai) → OpenAI API → المتصفح
 * المفتاح موجود في متغيرات بيئة الخادم فقط.
 */
import { AiError, type AiCallOptions, type AiProvider, type AiTask } from './types'

const FUNCTIONS_BASE =
  (import.meta.env.VITE_FUNCTIONS_BASE as string | undefined)?.replace(/\/$/, '') ||
  '/.netlify/functions'

const ENDPOINT = `${FUNCTIONS_BASE}/ai`

interface FunctionErrorBody {
  error?: { code?: string; message?: string }
}

function mapStatus(status: number, body: FunctionErrorBody | null): AiError {
  const code = body?.error?.code
  if (status === 401 || code === 'unauthenticated') return new AiError('unauthenticated')
  // الخادم يميّز بين الحد اللحظي والسقف اليومي؛ نعرض رسالته هي إن وُجدت.
  if (status === 429 || code === 'rate_limited') return new AiError('rate_limited', body?.error?.message)
  if (status === 504 || code === 'timeout') return new AiError('timeout')
  if (code === 'invalid_response') return new AiError('invalid_response')
  if (status >= 500) return new AiError('server')
  return new AiError('unknown', body?.error?.message)
}

export const openaiProvider: AiProvider = {
  id: 'openai',
  label: 'OpenAI',

  async run<TResult>(task: AiTask, payload: unknown, options?: AiCallOptions): Promise<TResult> {
    let response: Response
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: JSON.stringify({ provider: 'openai', task, payload }),
        signal: options?.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw new AiError('aborted')
      throw new AiError('network')
    }

    if (!response.ok) {
      let body: FunctionErrorBody | null = null
      try {
        body = (await response.json()) as FunctionErrorBody
      } catch {
        body = null
      }
      throw mapStatus(response.status, body)
    }

    try {
      const json = (await response.json()) as { data: TResult }
      return json.data
    } catch {
      throw new AiError('invalid_response')
    }
  },
}
