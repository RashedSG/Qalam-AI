/**
 * أدوات الوكيل.
 *
 * ⚠️ القاعدة الحاكمة: كل أداة تُنفَّذ بـ**رمز جلسة المستخدم** ومفتاح anon —
 * لا service_role، ولا مفتاح إداري، ولا تجاوز. الإجراءات في القاعدة
 * `security invoker`، فتسري عليها RLS كما تسري على الواجهة.
 *
 * أثر ذلك: لو نجح حقن أوامر في توجيه الوكيل، فأقصى ما يبلغه هو ما يبلغه
 * المستخدم أصلًا. لا عبور مؤسسات، ولا تجاوز تصنيف، ولا قراءة مراسلات غيره.
 * هذا هو الحاجز الفعلي، وما في `untrusted.ts` طبقة أولى فوقه.
 *
 * ⚠️ كل الأدوات للقراءة. لا أداة تكتب ولا تعتمد ولا توقّع ولا تحذف:
 * الوكيل يقترح والإنسان ينفّذ — Assistant, not Authority.
 */

export interface ToolContext {
  supabaseUrl: string
  supabaseAnonKey: string
  accessToken: string
  timeoutMs: number
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  /** ينفّذ الأداة ويعيد نتيجة قابلة للتسلسل. */
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>
}

class ToolError extends Error {}

/** يستدعي إجراء قاعدة بيانات بهوية المستخدم. */
async function rpc(ctx: ToolContext, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${ctx.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ctx.supabaseAnonKey,
      Authorization: `Bearer ${ctx.accessToken}`,
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(ctx.timeoutMs),
  })
  if (!res.ok) {
    // لا نُمرّر جسم خطأ القاعدة إلى النموذج: قد يحمل تفاصيل بنية داخلية.
    throw new ToolError(`tool query failed with status ${res.status}`)
  }
  return res.json()
}

/** يقصّ النص الطويل: كل حرف يدخل السياق هو رمز مدفوع وسطح حقن إضافي. */
function truncate(value: unknown, max = 4000): unknown {
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}…` : value
  if (Array.isArray(value)) return value.map((item) => truncate(item, max))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, truncate(item, max)]))
  }
  return value
}

const str = (description: string) => ({ type: 'string', description })

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'search_correspondence',
    description:
      'يبحث في مراسلات المستخدم المتاحة له. يعيد مقتطفات لا النص الكامل. ' +
      'استخدمه لإيجاد مراسلات سابقة عن موضوع، أو للبحث برقم مراسلة.',
    parameters: {
      type: 'object',
      properties: {
        query: str('كلمات البحث أو رقم المراسلة'),
        direction: { type: 'string', enum: ['incoming', 'outgoing', 'internal'], description: 'اختياري' },
        limit: { type: 'integer', description: 'عدد النتائج (١–٢٠)' },
      },
      required: ['query'],
    },
    run: (ctx, args) =>
      rpc(ctx, 'agent_search_correspondence', {
        p_query: String(args.query ?? ''),
        p_direction: args.direction ? String(args.direction) : null,
        p_limit: Number(args.limit ?? 8),
      }).then((rows) => truncate(rows, 500)),
  },
  {
    name: 'get_correspondence',
    description: 'يجلب مراسلة واحدة بنصها الكامل بمعرّفها. استخدمه بعد البحث حين تحتاج التفاصيل.',
    parameters: {
      type: 'object',
      properties: { id: str('معرّف المراسلة') },
      required: ['id'],
    },
    run: (ctx, args) => rpc(ctx, 'agent_get_correspondence', { p_id: String(args.id ?? '') }).then((r) => truncate(r, 12000)),
  },
  {
    name: 'get_related_correspondence',
    description: 'يجلب المراسلات المرتبطة بمراسلة: أصلها، الردود عليها، والروابط الصريحة.',
    parameters: {
      type: 'object',
      properties: { id: str('معرّف المراسلة') },
      required: ['id'],
    },
    run: (ctx, args) => rpc(ctx, 'agent_get_related', { p_id: String(args.id ?? '') }),
  },
  {
    name: 'search_templates',
    description: 'يبحث في القوالب المؤسسية المتاحة. استخدمه قبل صياغة مراسلة من الصفر.',
    parameters: {
      type: 'object',
      properties: { query: str('كلمات البحث'), limit: { type: 'integer' } },
      required: ['query'],
    },
    run: (ctx, args) =>
      rpc(ctx, 'agent_search_templates', {
        p_query: String(args.query ?? ''),
        p_limit: Number(args.limit ?? 5),
      }).then((rows) => truncate(rows, 1500)),
  },
  {
    name: 'search_dictionary',
    description: 'يبحث في قاموس العبارات المؤسسية: معناها ومتى تُستخدم. استخدمه لضبط الصياغة الرسمية.',
    parameters: {
      type: 'object',
      properties: { query: str('العبارة أو الموضوع'), limit: { type: 'integer' } },
      required: ['query'],
    },
    run: (ctx, args) =>
      rpc(ctx, 'agent_search_dictionary', {
        p_query: String(args.query ?? ''),
        p_limit: Number(args.limit ?? 6),
      }),
  },
  {
    name: 'list_my_work',
    description: 'يعرض ما يتطلب إجراءً من المستخدم: الإحالات إليه وطوابير سير العمل.',
    parameters: { type: 'object', properties: {} },
    run: (ctx) => rpc(ctx, 'agent_list_my_work', {}),
  },
]

export const TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.name)

const TOOL_MAP = new Map(AGENT_TOOLS.map((tool) => [tool.name, tool]))

/** قائمة السماح: أداة خارجها لا تُنفَّذ مهما ادّعى النموذج. */
export function findTool(name: string): ToolDefinition | undefined {
  return TOOL_MAP.get(name)
}

/** شكل الأدوات كما يتوقعه OpenAI. */
export function toolSchemas() {
  return AGENT_TOOLS.map((tool) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
}
