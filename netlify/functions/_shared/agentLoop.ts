/**
 * حلقة الوكيل.
 *
 * النموذج يقرر أي أداة يستدعي وبأي وسائط؛ هذه الوحدة تنفّذ قراره **داخل حدود
 * لا يستطيع تجاوزها**: عدد دورات، عدد استدعاءات، سقف زمني، سقف رموز، وقائمة
 * أدوات مسموحة. بلا هذه الحدود يصبح كل سؤال حلقة مفتوحة على فاتورة مفتوحة.
 */
import { classifyUpstreamStatus } from './log'
import { findTool, toolSchemas, type ToolContext } from './agentTools'
import { UNTRUSTED_CONTRACT, wrapUntrusted } from './untrusted'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export interface AgentLimits {
  maxSteps: number
  maxToolCalls: number
  timeoutMs: number
  maxTotalTokens: number
}

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxSteps: 8,
  maxToolCalls: 12,
  timeoutMs: 60_000,
  maxTotalTokens: 40_000,
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

/** ما استُخدم من مصادر داخلية — يُعرض للمستخدم ليعرف من أين جاءت الإجابة. */
export interface Citation {
  correspondenceId: string
  subject: string
  reference: string | null
}

export interface ToolCallRecord {
  tool: string
  ok: boolean
  ms: number
}

export interface AgentResult {
  reply: string
  citations: Citation[]
  toolCalls: ToolCallRecord[]
  steps: number
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  injectionSignals: number
  stoppedBy: 'completed' | 'max_steps' | 'max_tool_calls' | 'token_budget'
}

export class AgentError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

function systemPrompt(context: string | null): string {
  return [
    'أنت «مساعد قلم» — مساعد المراسلات المؤسسية داخل نظام قلم.',
    '',
    'ما تفعله: تبحث في مراسلات المستخدم المتاحة له، وتلخّص، وتحلّل المطلوب،',
    'وتقترح صياغات ومسودات ردود بالعربية الفصحى المؤسسية.',
    '',
    'حدودك — غير قابلة للتفاوض:',
    '• لا تعتمد مراسلة ولا توقّعها ولا تُصدرها ولا تحذفها ولا تحيلها.',
    '  إن طُلب منك ذلك قل إنك ستفتح الشاشة المخصصة، ولا تدّعِ أنك نفّذت.',
    '• لا تمنح صلاحيات ولا تغيّر تصنيفًا أمنيًا.',
    '• أدواتك للقراءة فقط، وتعمل بصلاحيات المستخدم: ما لا يراه لا تراه.',
    '  إن لم تجد شيئًا فالسبب غالبًا أنه خارج صلاحيته — قل ذلك ولا تخمّن.',
    '',
    'الاستشهاد: حين تستند إلى مراسلة داخلية اذكر موضوعها ورقمها إن وُجد.',
    'وحين لا يكون لديك مصدر داخلي قل صراحةً إن هذا اقتراح عام لا مستند إليه.',
    '',
    UNTRUSTED_CONTRACT,
    context ? `\nسياق الشاشة الحالية: ${context}` : '',
  ].join('\n')
}

/** يستخرج المراسلات التي لمسها الوكيل فعلًا — لا ما ذكره النموذج نصًّا. */
function collectCitations(raw: unknown, into: Map<string, Citation>): void {
  const rows = Array.isArray(raw) ? raw : [raw]
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : null
    if (!id) continue
    into.set(id, {
      correspondenceId: id,
      subject: typeof record.subject === 'string' ? record.subject : '',
      reference: typeof record.reference_number === 'string' ? record.reference_number : null,
    })
  }
}

async function callModel(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<{
  message: ChatMessage
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal,
    body: JSON.stringify({ model, temperature: 0.3, messages, tools: toolSchemas(), tool_choice: 'auto' }),
  })

  if (!res.ok) {
    // جسم الخطأ لا يُقرأ: قد يردّ صدى الـprompt وفيه محتوى مراسلات.
    throw new AgentError(`upstream ${res.status}`, classifyUpstreamStatus(res.status))
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: ChatMessage }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }
  const message = data.choices?.[0]?.message
  if (!message) throw new AgentError('empty completion', 'invalid_response')
  return { message, usage: data.usage ?? {} }
}

export async function runAgent(input: {
  history: AgentMessage[]
  contextLabel: string | null
  apiKey: string
  model: string
  toolCtx: ToolContext
  limits: AgentLimits
}): Promise<AgentResult> {
  const { limits } = input
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), limits.timeoutMs)

  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(input.contextLabel) }]
  let injectionSignals = 0

  // ⚠️ حتى رسائل المستخدم تُغلَّف: قد يكون لصق نص مراسلة واردة كاملًا.
  for (const turn of input.history) {
    if (turn.role === 'assistant') {
      messages.push({ role: 'assistant', content: turn.content })
      continue
    }
    const wrapped = wrapUntrusted(turn.content, 'رسالة المستخدم')
    injectionSignals += wrapped.signals
    messages.push({ role: 'user', content: wrapped.text })
  }

  const citations = new Map<string, Citation>()
  const toolCalls: ToolCallRecord[] = []
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  let steps = 0
  let stoppedBy: AgentResult['stoppedBy'] = 'completed'
  let reply = ''

  try {
    while (steps < limits.maxSteps) {
      steps += 1

      const { message, usage: turnUsage } = await callModel(
        messages,
        input.apiKey,
        input.model,
        controller.signal,
      )
      usage.promptTokens += turnUsage.prompt_tokens ?? 0
      usage.completionTokens += turnUsage.completion_tokens ?? 0
      usage.totalTokens += turnUsage.total_tokens ?? 0

      if (usage.totalTokens > limits.maxTotalTokens) {
        stoppedBy = 'token_budget'
        reply = message.content ?? ''
        break
      }

      const requested = message.tool_calls ?? []
      if (requested.length === 0) {
        reply = message.content ?? ''
        break
      }

      if (toolCalls.length + requested.length > limits.maxToolCalls) {
        stoppedBy = 'max_tool_calls'
        break
      }

      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls })

      for (const call of requested) {
        const startedTool = Date.now()
        const tool = findTool(call.function.name)
        let payload: string
        let ok = false

        if (!tool) {
          // قائمة السماح: أداة غير مسجّلة لا تُنفَّذ مهما ادّعى النموذج وجودها.
          payload = JSON.stringify({ error: 'unknown_tool' })
        } else {
          try {
            const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
            const result = await tool.run(input.toolCtx, args)
            collectCitations(result, citations)

            // ⚠️ نتيجة الأداة نص كتبه آخرون — تُغلَّف كما يُغلَّف أي محتوى خارجي.
            const wrapped = wrapUntrusted(JSON.stringify(result), `نتيجة الأداة ${tool.name}`)
            injectionSignals += wrapped.signals
            payload = wrapped.text
            ok = true
          } catch {
            payload = JSON.stringify({ error: 'tool_failed' })
          }
        }

        toolCalls.push({ tool: call.function.name, ok, ms: Date.now() - startedTool })
        messages.push({ role: 'tool', tool_call_id: call.id, content: payload })
      }

      if (steps >= limits.maxSteps) {
        stoppedBy = 'max_steps'
        break
      }
    }

    if (!reply && stoppedBy === 'completed') stoppedBy = 'max_steps'
  } catch (err) {
    if (controller.signal.aborted) throw new AgentError('agent timed out', 'timeout')
    throw err
  } finally {
    clearTimeout(timer)
  }

  return {
    reply: reply || 'تعذّر إكمال الإجابة ضمن الحدود المسموحة. جرّب سؤالًا أضيق.',
    citations: [...citations.values()],
    toolCalls,
    steps,
    usage,
    injectionSignals,
    stoppedBy,
  }
}
