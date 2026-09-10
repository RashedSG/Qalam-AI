/**
 * اختبارات تكامل على Postgres حقيقي.
 *
 * تتحقق من ضمانات لا يستطيع التحليل الساكن إثباتها: الذرّية، وسلوك RLS
 * تحت أدوار حقيقية، وأن الاختبارات السلبية تفشل فعلًا كما يجب.
 *
 * تعمل فقط عند ضبط QALAM_TEST_DATABASE_URL على قاعدة اختبار قابلة للمسح،
 * وتُتخطى بصمت بدونها — لا تُبطئ التطوير اليومي ولا تتطلب بنية في CI.
 *
 * التشغيل:
 *   QALAM_TEST_DATABASE_URL=postgres://…/qalam_test npm run test
 * انظر docs/testing.md لتجهيز القاعدة.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'

const CONNECTION = process.env.QALAM_TEST_DATABASE_URL
const suite = CONNECTION ? describe : describe.skip

const USER_A = '11111111-1111-1111-1111-11111111aaaa'
const USER_B = '22222222-2222-2222-2222-22222222bbbb'

suite('قاعدة البيانات — تكامل حقيقي', () => {
  let db: Client

  /**
   * ينفّذ بهوية مستخدم عبر دور authenticated ومطالبات JWT، تمامًا كما يفعل Supabase.
   *
   * `set` على مستوى الجلسة لا `set local`: الأخيرة تُلغى بنهاية كل عبارة خارج
   * المعاملات، فتعود الاستعلامات التالية بصلاحيات superuser وتصبح الاختبارات
   * السلبية بلا معنى — تنجح لأنها تعمل كمالك القاعدة لا كمستخدم مقيّد.
   */
  async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
    await db.query('set role authenticated')
    await db.query('select set_config($1, $2, false)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    try {
      return await run()
    } finally {
      // تنظيف بأفضل جهد: إن أجهض الاستعلامُ المعاملةَ فستفشل عبارة التنظيف
      // أيضًا، ويجب ألا تحجب الخطأ الأصلي الذي يفحصه الاختبار.
      await resetRole()
    }
  }

  /** إعادة الدور والمطالبات، ولو كانت المعاملة مُجهضة. */
  async function resetRole(): Promise<void> {
    try {
      await db.query('reset role')
      await db.query(`select set_config('request.jwt.claims', '', false)`)
    } catch {
      // معاملة مُجهضة — تتكفّل نقطة الحفظ أو rollback بالاستعادة.
    }
  }

  /**
   * يتوقّع رفض العبارة، ويستعيد المعاملة بعده.
   *
   * خطأ داخل معاملة يُجهضها، فتفشل كل عبارة تالية بـ«transaction is aborted».
   * نقطة الحفظ تعزل الفشل المتوقَّع فتبقى بقية الاختبار قابلة للتنفيذ.
   */
  async function expectDenied(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
    await db.query('savepoint expect_denied')
    let error: Error | null = null
    try {
      await run()
    } catch (err) {
      error = err as Error
    } finally {
      await db.query('rollback to savepoint expect_denied')
      await db.query('release savepoint expect_denied')
      await resetRole()
    }
    expect(error, 'كان يجب أن تُرفض هذه العملية').not.toBeNull()
    expect(error?.message).toMatch(pattern)
  }


  beforeAll(async () => {
    db = new Client({ connectionString: CONNECTION })
    await db.connect()
    await db.query(
      `insert into auth.users (id, email) values ($1,$2),($3,$4) on conflict (id) do nothing`,
      [USER_A, 'a@qalam.test', USER_B, 'b@qalam.test'],
    )
  })

  afterAll(async () => {
    await db.query('delete from auth.users where id = any($1)', [[USER_A, USER_B]])
    await db.end()
  })

  // كل اختبار داخل معاملة تُلغى بالكامل: لا أثر متسرّب بين الاختبارات،
  // ولا اعتماد على ترتيب التنفيذ، ونقاط الحفظ (savepoint) تعمل دائمًا.
  beforeEach(async () => {
    await db.query('begin')
  })

  afterEach(async () => {
    await db.query('rollback')
  })

  /* ------------------------------ حد المعدّل ------------------------------ */

  describe('حد المعدّل', () => {
    it('يسمح ضمن حد الاندفاع ويرفض بعده', async () => {
      const limits = await db.query(`select value from public.app_settings where key='ai_rate_limits'`)
      const burst = Number(limits.rows[0].value.burst_per_10s)

      for (let i = 0; i < burst; i += 1) {
        const row = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('improveText')`))
        expect(row.rows[0].allowed, `الطلب رقم ${i + 1} يجب أن يُسمح`).toBe(true)
      }

      const denied = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('improveText')`))
      expect(denied.rows[0].allowed).toBe(false)
      expect(denied.rows[0].reason).toBe('burst')
      expect(Number(denied.rows[0].retry_after_seconds)).toBeGreaterThan(0)
    })

    it('يعزل المستخدمين — استهلاك (أ) لا يؤثر في (ب)', async () => {
      const limits = await db.query(`select value from public.app_settings where key='ai_rate_limits'`)
      for (let i = 0; i < Number(limits.rows[0].value.burst_per_10s) + 2; i += 1) {
        await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      }

      const b = await asUser(USER_B, () => db.query(`select * from public.begin_ai_request('t')`))
      expect(b.rows[0].allowed).toBe(true)
    })

    it('يرفض عند بلوغ السقف اليومي ويطلب انتظارًا حتى الغد', async () => {
      const limits = await db.query(`select value from public.app_settings where key='ai_rate_limits'`)
      const perDay = Number(limits.rows[0].value.per_day)

      // نزرع طلبات اليوم خارج نافذة الاندفاع والدقيقة، فيبقى السقف اليومي وحده الفاصل.
      await db.query(
        `insert into public.ai_requests_metadata (user_id, task, status, created_at)
         select $1, 'seed', 'success', date_trunc('day', now()) + interval '1 hour'
         from generate_series(1, $2)`,
        [USER_A, perDay],
      )

      const denied = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      expect(denied.rows[0].allowed).toBe(false)
      expect(denied.rows[0].reason).toBe('daily_quota')
      expect(Number(denied.rows[0].remaining_today)).toBe(0)
    })

    it('يحترم الحدود المضبوطة في app_settings بلا نشر جديد', async () => {
      await db.query(
        `update public.app_settings set value = jsonb_set(value,'{burst_per_10s}','1') where key='ai_rate_limits'`,
      )
      const first = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      const second = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      expect(first.rows[0].allowed).toBe(true)
      expect(second.rows[0].allowed).toBe(false)
    })
  })

  /* --------------------------- تتبّع الاستخدام --------------------------- */

  describe('تتبّع الاستخدام', () => {
    it('يسجّل بيانات وصفية فقط — لا عمود يقبل نص مراسلة', async () => {
      const columns = await db.query(
        `select column_name from information_schema.columns
         where table_schema='public' and table_name='ai_requests_metadata'`,
      )
      const names = columns.rows.map((r) => r.column_name as string)
      for (const forbidden of ['body', 'prompt', 'text', 'content', 'subject', 'incoming_text']) {
        expect(names, `العمود ${forbidden} يجب ألا يوجد`).not.toContain(forbidden)
      }
    })

    it('لا يستطيع مستخدم حسم طلب مستخدم آخر', async () => {
      const reserved = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      const id = reserved.rows[0].request_id as string

      await asUser(USER_B, () =>
        db.query(`select public.finish_ai_request($1,'success',999)`, [id]),
      )

      const after = await db.query(`select status, duration_ms from public.ai_requests_metadata where id=$1`, [id])
      expect(after.rows[0].status).toBe('pending')
      expect(after.rows[0].duration_ms).toBeNull()
    })

    it('لا يمكن إعادة كتابة سجل محسوم', async () => {
      const reserved = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      const id = reserved.rows[0].request_id as string

      await asUser(USER_A, () => db.query(`select public.finish_ai_request($1,'success',1234)`, [id]))
      await asUser(USER_A, () => db.query(`select public.finish_ai_request($1,'error',9)`, [id]))

      const after = await db.query(`select status, duration_ms from public.ai_requests_metadata where id=$1`, [id])
      expect(after.rows[0].status).toBe('success')
      expect(after.rows[0].duration_ms).toBe(1234)
    })

    it('يرفض حالة غير معرّفة', async () => {
      const reserved = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      const id = reserved.rows[0].request_id as string
      await expectDenied(
        () => asUser(USER_A, () => db.query(`select public.finish_ai_request($1,'approved',1)`, [id])),
        /invalid status/,
      )
    })

    it('يقصّ رمز الخطأ فلا يصلح قناةً لتهريب نص', async () => {
      const reserved = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      const id = reserved.rows[0].request_id as string
      const long = 'ن'.repeat(500)

      await asUser(USER_A, () =>
        db.query(`select public.finish_ai_request($1,'error',1,null,null,null,$2)`, [id, long]),
      )

      const after = await db.query(`select error_code from public.ai_requests_metadata where id=$1`, [id])
      expect((after.rows[0].error_code as string).length).toBeLessThanOrEqual(40)
    })
  })

  /* ------------------------------ اختبارات سلبية ------------------------------ */

  describe('اختبارات سلبية — ما يجب ألا يستطيعه المستخدم', () => {
    it('لا يقرأ app_settings من المتصفح', async () => {
      await expectDenied(
        () => asUser(USER_A, () => db.query('select * from public.app_settings')),
        /permission denied/,
      )
    })

    it('لا يستدعي app_setting() مباشرة', async () => {
      await expectDenied(
        () => asUser(USER_A, () => db.query(`select public.app_setting('ai_rate_limits')`)),
        /permission denied/,
      )
    })

    it('لا يقرأ الدعوات ولا يُنشئها', async () => {
      await expectDenied(
        () => asUser(USER_A, () => db.query('select * from public.signup_invites')),
        /permission denied/,
      )
      await expectDenied(
        () => asUser(USER_A, () => db.query(`insert into public.signup_invites (email) values ('x@y.z')`)),
        /permission denied/,
      )
    })

    it('لا يُعدّل سجل استخدام AI مباشرة — الجدول بلا سياسة UPDATE', async () => {
      const reserved = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      const id = reserved.rows[0].request_id as string

      // RLS لا يرمي خطأ عند غياب سياسة UPDATE: شرط USING لا يطابق أي صف،
      // فيُحدَّث صفر صفوف بصمت. الضمان المطلوب هو أن الصف لم يتغيّر — لا أن
      // العبارة فشلت. الادّعاء الصحيح هو عدّ الصفوف المتأثرة والتحقق من القيمة.
      const attempt = await asUser(USER_A, () =>
        db.query(`update public.ai_requests_metadata set task='hacked' where id=$1`, [id]),
      )
      expect(attempt.rowCount, 'يجب ألا يتأثر أي صف').toBe(0)

      const after = await db.query('select task, status from public.ai_requests_metadata where id=$1', [id])
      expect(after.rows[0].task).toBe('t')
      expect(after.rows[0].status).toBe('pending')
    })

    it('لا يحذف مستخدم سجل استخدام مستخدم آخر', async () => {
      const reserved = await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      const id = reserved.rows[0].request_id as string

      const attempt = await asUser(USER_B, () =>
        db.query('delete from public.ai_requests_metadata where id=$1', [id]),
      )
      expect(attempt.rowCount, 'يجب ألا يُحذف أي صف').toBe(0)

      const after = await db.query('select count(*)::int as n from public.ai_requests_metadata where id=$1', [id])
      expect(after.rows[0].n).toBe(1)
    })

    it('لا يرى بيانات استخدام مستخدم آخر', async () => {
      await asUser(USER_A, () => db.query(`select * from public.begin_ai_request('t')`))
      const seen = await asUser(USER_B, () => db.query('select count(*)::int as n from public.ai_requests_metadata'))
      expect(seen.rows[0].n).toBe(0)
    })

    it('لا يرى مراسلات مستخدم آخر', async () => {
      await asUser(USER_A, () =>
        db.query(
          `insert into public.correspondences (user_id, subject, body, language) values ($1,'س','ن','ar')`,
          [USER_A],
        ),
      )
      const seen = await asUser(USER_B, () =>
        db.query('select count(*)::int as n from public.correspondences where user_id=$1', [USER_A]),
      )
      expect(seen.rows[0].n).toBe(0)
    })

    it('لا ينتحل user_id عند الإدراج', async () => {
      await expectDenied(
        () =>
          asUser(USER_B, () =>
            db.query(
              `insert into public.correspondences (user_id, subject, body, language) values ($1,'س','ن','ar')`,
              [USER_A],
            ),
          ),
        /row-level security/,
      )
    })
  })

  /* ----------------------------- سياسة التسجيل ----------------------------- */

  describe('سياسة التسجيل', () => {
    it('الوضع الافتراضي عام — التسجيل يعمل بلا دعوة', async () => {
      expect((await db.query('select public.signup_mode() as m')).rows[0].m).toBe('public')
      const id = '99999999-9999-9999-9999-999999999999'
      await db.query('insert into auth.users (id,email) values ($1,$2)', [id, 'open@qalam.test'])
      const profile = await db.query('select count(*)::int as n from public.profiles where id=$1', [id])
      expect(profile.rows[0].n).toBe(1)
    })

    it('وضع الدعوة يرفض بريدًا غير مدعو ولا يُنشئ حسابًا', async () => {
      await db.query(`update public.app_settings set value='{"mode":"invite_only"}' where key='signup'`)
      await expectDenied(
        () => db.query('insert into auth.users (id,email) values (gen_random_uuid(),$1)', ['nope@qalam.test']),
        /invite-only/,
      )

      const created = await db.query('select count(*)::int as n from auth.users where email=$1', ['nope@qalam.test'])
      expect(created.rows[0].n, 'يجب ألا يبقى أي أثر لحساب مرفوض').toBe(0)
    })

    it('وضع الدعوة يقبل المدعوّ ويستهلك الدعوة مرة واحدة', async () => {
      await db.query(`update public.app_settings set value='{"mode":"invite_only"}' where key='signup'`)
      // المطابقة بلا حساسية لحالة الأحرف.
      await db.query(`insert into public.signup_invites (email) values ('Guest@Qalam.Test')`)

      const id = '77777777-7777-7777-7777-777777777777'
      await db.query('insert into auth.users (id,email) values ($1,$2)', [id, 'guest@qalam.test'])
      expect((await db.query('select count(*)::int as n from public.profiles where id=$1', [id])).rows[0].n).toBe(1)

      const invite = await db.query(
        `select accepted_at, accepted_by from public.signup_invites where lower(email)='guest@qalam.test'`,
      )
      expect(invite.rows[0].accepted_at).not.toBeNull()
      expect(invite.rows[0].accepted_by).toBe(id)

      // الدعوة نفسها لا تُستخدم مرتين.
      await expectDenied(
        () => db.query('insert into auth.users (id,email) values (gen_random_uuid(),$1)', ['guest@qalam.test']),
        /invite-only/,
      )
    })

    it('الدعوة المنتهية أو الملغاة لا تُقبل', async () => {
      await db.query(`update public.app_settings set value='{"mode":"invite_only"}' where key='signup'`)
      await db.query(
        `insert into public.signup_invites (email, expires_at) values ('old@qalam.test', now() - interval '1 day')`,
      )
      await expectDenied(
        () => db.query('insert into auth.users (id,email) values (gen_random_uuid(),$1)', ['old@qalam.test']),
        /invite-only/,
      )

      await db.query(
        `insert into public.signup_invites (email, revoked_at) values ('gone@qalam.test', now())`,
      )
      await expectDenied(
        () => db.query('insert into auth.users (id,email) values (gen_random_uuid(),$1)', ['gone@qalam.test']),
        /invite-only/,
      )
    })
  })
})
