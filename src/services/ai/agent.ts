/**
 * عميل وكيل قلم.
 *
 * ⚠️ لا يتصل هذا الملف بأي مزوّد ذكاء اصطناعي. المسار الوحيد:
 *   المتصفح → /.netlify/functions/agent → OpenAI
 * والأدوات تُنفَّذ على الخادم برمز جلسة المستخدم، فترى ما يراه المستخدم فقط.
 */
import { AiError } from './types'

const FUNCTIONS_BASE =
  (import.meta.env.VITE_FUNCTIONS_BASE as string | undefined)?.replace(/\/$/, '') || '/.netlify/functions'

const ENDPOINT = `${FUNCTIONS_BASE}/agent`

export interface AgentTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentCitation {
  correspondenceId: string
  subject: string
  reference: string | null
}

export interface AgentReply {
  reply: string
  citations: AgentCitation[]
  toolsUsed: string[]
  stoppedBy: 'completed' | 'max_steps' | 'max_tool_calls' | 'token_budget'
  /** > 0 يعني أن محتوى في المحادثة حاول توجيه المساعد. يُعرض للمستخدم. */
  injectionSignals: number
}

interface FunctionError {
  error?: { code?: string; message?: string }
}

export async function askAgent(
  messages: AgentTurn[],
  options: { accessToken?: string | null; context?: string | null; signal?: AbortSignal } = {},
): Promise<AgentReply> {
  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      body: JSON.stringify({ messages, context: options.context ?? null }),
      signal: options.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new AiError('aborted')
    throw new AiError('network')
  }

  if (!response.ok) {
    let body: FunctionError | null = null
    try {
      body = (await response.json()) as FunctionError
    } catch {
      body = null
    }
    const code = body?.error?.code
    if (response.status === 401 || code === 'unauthenticated') throw new AiError('unauthenticated')
    if (response.status === 429 || code === 'rate_limited') throw new AiError('rate_limited', body?.error?.message)
    if (response.status === 504 || code === 'timeout') throw new AiError('timeout')
    throw new AiError('server')
  }

  try {
    const json = (await response.json()) as { data: AgentReply }
    return json.data
  } catch {
    throw new AiError('invalid_response')
  }
}
