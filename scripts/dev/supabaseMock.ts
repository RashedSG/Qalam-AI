/**
 * بديل عميل Supabase للمعاينة البصرية — أداة تطوير لا جزء من التطبيق.
 *
 * ⚠️ لماذا؟ لأن كل شاشة خلف حارس جلسة، وكل بيانات خلف RLS. فمراجعة الواجهة
 * بصريًّا تستلزم مشروع Supabase حيًّا وبيانات فيه ودورة اعتماد كاملة — أي أن
 * الشاشات **لا تُراجَع**، ويُكتشف خللها في العرض أمام الحاضرين.
 *
 * هذا البديل يُبدَّل بـ`vite.preview.config.ts` وحده. لا يُستورد من التطبيق،
 * ولا يدخل حزمة الإنتاج، ولا يقرأ ولا يكتب شبكة.
 *
 * ولا يحاكي الصلاحيات: يعيد كل شيء لكل أحد. الأمان يُختبر على Postgres حقيقي
 * في `src/test/*.integration.test.ts` — وهذا للعين لا للأمان.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { FIXTURES, RPC_FIXTURES } from './previewFixtures'

export const isSupabaseConfigured = true

type Result = { data: unknown; error: null }

/**
 * سلسلة استعلام كسولة: كل دالة تعيد السلسلة نفسها، والانتظار عليها يحسم
 * النتيجة من الجدول المطلوب. لا تصفية ولا ترتيب — المعاينة تريد صفوفًا
 * تُعرض، لا استعلامًا صحيحًا.
 */
function queryChain(table: string): PromiseLike<Result> {
  let single = false
  const equals: Array<[string, unknown]> = []

  /**
   * ⚠️ `.eq()` تُطبَّق فعلًا. البديل الذي يتجاهل التصفية يجعل «الوارد» يعرض
   * صادرًا، فتُقرأ المعاينة على أنها خلل في التطبيق وليست خللًا فيه. مراجعةٌ
   * بصرية لا يُوثق بها أسوأ من لا مراجعة.
   */
  const resolveRows = () => {
    const list = (FIXTURES[table] ?? []) as Array<Record<string, unknown>>
    if (equals.length === 0) return list
    return list.filter((row) =>
      equals.every(([column, value]) => {
        if (!(column in row)) return true // عمود لا تعرفه البيانات الوهمية لا يُقصي
        return row[column] === value
      }),
    )
  }

  const state = {
    then(resolve: (value: Result) => unknown) {
      const list = resolveRows()
      return Promise.resolve({ data: single ? (list[0] ?? null) : list, error: null }).then(resolve)
    },
  }

  const proxy: PromiseLike<Result> = new Proxy(state, {
    get(base, prop: string) {
      if (prop === 'then') return base.then.bind(base)
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => {
          single = true
          return proxy
        }
      }
      if (prop === 'eq') {
        return (column: string, value: unknown) => {
          equals.push([column, value])
          return proxy
        }
      }
      return () => proxy
    },
  }) as PromiseLike<Result>

  return proxy
}

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'demo@qalam.test',
  user_metadata: { full_name: 'المستخدم التجريبي' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
}

const SESSION = {
  access_token: 'preview-token',
  refresh_token: 'preview-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: USER,
}

export const supabase = {
  from: (table: string) => queryChain(table),

  rpc(name: string) {
    return Promise.resolve({ data: RPC_FIXTURES[name] ?? null, error: null })
  },

  auth: {
    getSession: () => Promise.resolve({ data: { session: SESSION }, error: null }),
    getUser: () => Promise.resolve({ data: { user: USER }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: () => Promise.resolve({ data: { session: SESSION }, error: null }),
    signUp: () => Promise.resolve({ data: { session: SESSION }, error: null }),
    signInWithOAuth: () => Promise.resolve({ data: null, error: null }),
    resetPasswordForEmail: () => Promise.resolve({ error: null }),
    updateUser: () => Promise.resolve({ data: { user: USER }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
  },

  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: { path: 'preview' }, error: null }),
      remove: () => Promise.resolve({ data: null, error: null }),
      createSignedUrl: () => Promise.resolve({ data: { signedUrl: '#preview' }, error: null }),
    }),
  },
} as unknown as SupabaseClient
