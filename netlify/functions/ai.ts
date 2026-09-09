/**
 * قلم | QALAM — نقطة الاتصال الآمنة الوحيدة بـ OpenAI.
 *
 *   المتصفح → هذه الدالة → OpenAI → المتصفح
 *
 * ضمانات:
 * - OPENAI_API_KEY لا يغادر الخادم إطلاقًا.
 * - كل طلب يتطلب جلسة Supabase صالحة.
 * - كل مدخل يُتحقق منه بـ Zod قبل بناء الـ prompt.
 * - كل مخرج يُتحقق منه بـ Zod، مع إعادة محاولة واحدة آمنة.
 * - لا يُسجَّل محتوى المراسلات في اللوق إطلاقًا (خصوصية).
 */
import type { Handler, HandlerEvent } from '@netlify/functions'
import { ConfigError, readEnv } from './_shared/env'
import { verifySupabaseUser } from './_shared/auth'
import { checkRateLimit } from './_shared/rateLimit'
import { extractJson, runPrompt, UpstreamError } from './_shared/openai'
import { TASK_REGISTRY, type TaskName } from './_shared/registry'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

type ErrorCode =
  | 'method_not_allowed'
  | 'bad_request'
  | 'unauthenticated'
  | 'rate_limited'
  | 'invalid_response'
  | 'server'

function fail(status: number, code: ErrorCode, message: string) {
  return {
    statusCode: status,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: { code, message } }),
  }
}

function ok(data: unknown) {
  return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ data }) }
}

interface RequestBody {
  provider?: string
  task?: string
  payload?: unknown
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return fail(405, 'method_not_allowed', 'Method not allowed.')
  }

  let env
  try {
    env = readEnv()
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error('[qalam:ai] configuration error:', err.message)
      return fail(500, 'server', 'الخدمة غير مهيأة بشكل صحيح. راجع إعدادات البيئة.')
    }
    throw err
  }

  /* ------------------------------ المصادقة ------------------------------ */
  const authHeader = event.headers.authorization ?? event.headers.Authorization
  const user = await verifySupabaseUser(authHeader, env.supabaseUrl, env.supabaseAnonKey)
  if (!user) {
    return fail(401, 'unauthenticated', 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.')
  }

  if (!checkRateLimit(user.id)) {
    return fail(429, 'rate_limited', 'تم تجاوز عدد الطلبات المسموح بها. انتظر قليلًا ثم حاول مجددًا.')
  }

  /* ---------------------------- تحليل الطلب ----------------------------- */
  let body: RequestBody
  try {
    body = JSON.parse(event.body ?? '{}') as RequestBody
  } catch {
    return fail(400, 'bad_request', 'صيغة الطلب غير صحيحة.')
  }

  const taskName = body.task as TaskName | undefined
  if (!taskName || !(taskName in TASK_REGISTRY)) {
    return fail(400, 'bad_request', 'العملية المطلوبة غير معروفة.')
  }

  // V1: OpenAI فقط. طبقة التجريد جاهزة لإضافة مزودين آخرين هنا لاحقًا.
  if (body.provider && body.provider !== 'openai') {
    return fail(400, 'bad_request', 'مزود الذكاء الاصطناعي غير مدعوم.')
  }

  const definition = TASK_REGISTRY[taskName]
  const inputResult = definition.inputSchema.safeParse(body.payload)
  if (!inputResult.success) {
    console.error(`[qalam:ai] invalid input for task=${taskName}`) // بدون محتوى المستخدم
    return fail(400, 'bad_request', 'البيانات المُرسلة غير مكتملة أو غير صالحة.')
  }

  /* --------------------------- تنفيذ مع إعادة محاولة --------------------- */
  const build = definition.build as (input: unknown) => ReturnType<typeof definition.build>
  const spec = build(inputResult.data)

  const attempt = async (strict: boolean) => {
    const effectiveSpec = strict
      ? {
          ...spec,
          temperature: Math.min(spec.temperature, 0.2),
          system: `${spec.system}\n\nتنبيه: المحاولة السابقة أنتجت JSON غير صالح. أعد الإجابة بكائن JSON صالح فقط، بلا أي نص إضافي.`,
        }
      : spec
    const raw = await runPrompt(effectiveSpec, env.openaiApiKey, env.openaiModel)
    return definition.outputSchema.safeParse(extractJson(raw))
  }

  try {
    let result = await attempt(false)
    if (!result.success) {
      // إعادة محاولة واحدة آمنة قبل إظهار خطأ للمستخدم.
      result = await attempt(true)
    }

    if (!result.success) {
      console.error(`[qalam:ai] schema validation failed for task=${taskName} after retry`)
      return fail(502, 'invalid_response', 'تعذّر فهم نتيجة المعالجة. حاول مرة أخرى.')
    }

    return ok(result.data)
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.error(`[qalam:ai] upstream error for task=${taskName}: ${err.message}`)
      if (err.status === 429) {
        return fail(429, 'rate_limited', 'الخدمة مزدحمة حاليًا. حاول مرة أخرى بعد قليل.')
      }
      return fail(502, 'server', 'تعذّر إتمام العملية حاليًا. حاول مرة أخرى بعد قليل.')
    }
    if (err instanceof SyntaxError) {
      console.error(`[qalam:ai] JSON parse failure for task=${taskName}`)
      return fail(502, 'invalid_response', 'تعذّر فهم نتيجة المعالجة. حاول مرة أخرى.')
    }
    console.error(`[qalam:ai] unexpected error for task=${taskName}`)
    return fail(500, 'server', 'حدث خطأ غير متوقع. حاول مرة أخرى.')
  }
}
