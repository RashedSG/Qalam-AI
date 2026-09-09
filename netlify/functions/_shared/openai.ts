/** استدعاء OpenAI Chat Completions — الموضع الوحيد الذي يلمس فيه النظام المفتاح السري. */
import type { PromptSpec } from '../../../src/prompts/shared'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function runPrompt(
  spec: PromptSpec,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
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

  if (!res.ok) {
    // لا نُعيد نص خطأ المزوّد إلى المتصفح — قد يحتوي تفاصيل حساسة.
    const detail = await res.text().catch(() => '')
    throw new UpstreamError(`OpenAI request failed (${res.status}): ${detail.slice(0, 400)}`, res.status)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new UpstreamError('OpenAI returned an empty completion', 502)
  return content
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
