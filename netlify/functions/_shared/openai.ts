/** استدعاء OpenAI Chat Completions — الموضع الوحيد الذي يلمس فيه النظام المفتاح السري. */
import type { PromptSpec } from '../../../src/prompts/shared'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

/** سقف زمني للطلب الخارجي. بلا سقف، قد تُعلَّق الدالة حتى مهلة المنصة. */
export const DEFAULT_TIMEOUT_MS = 45_000

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** تجاوز السقف الزمني — مُميَّز عن إلغاء المستخدم وعن خطأ المزوّد. */
export class TimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Upstream request exceeded ${timeoutMs}ms`)
  }
}

export interface TokenUsage {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export interface PromptResult {
  content: string
  usage: TokenUsage
}

export async function runPrompt(
  spec: PromptSpec,
  apiKey: string,
  model: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PromptResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // إلغاء خارجي (إن وُجد) يُلغي الطلب أيضًا.
  const onExternalAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })

  let res: Response
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: spec.temperature,
        ...(spec.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: spec.system },
          { role: 'user', content: spec.user },
        ],
      }),
    })
  } catch {
    // التمييز مهم: انتهاء المهلة ليس خطأ شبكة وليس إلغاءً من المستخدم.
    // خطأ fetch الأصلي لا يُمرَّر: قد يحمل عنوانًا أو تفاصيل داخلية.
    if (controller.signal.aborted && !options.signal?.aborted) throw new TimeoutError(timeoutMs)
    throw new UpstreamError('Upstream request failed before a response was received', 502)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }

  if (!res.ok) {
    // ⚠️ خصوصية: نتجاهل جسم خطأ المزوّد تمامًا. قد يحتوي صدى الـprompt،
    // ورسالة الاستثناء هذه تُسجَّل ويُصنَّف منها رمز فقط — لا نص.
    throw new UpstreamError(`Upstream responded with status ${res.status}`, res.status)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new UpstreamError('Upstream returned an empty completion', 502)

  return {
    content,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
      totalTokens: data.usage?.total_tokens ?? null,
    },
  }
}

/** يستخرج كائن JSON من نص النموذج حتى لو أُحيط بعلامات ```json. */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : trimmed

  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1))
    }
    throw new SyntaxError('Model response is not valid JSON')
  }
}
