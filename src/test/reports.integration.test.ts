/**
 * المرحلة ٧ — التقارير والتحقق العلني وحوكمة القوالب، على Postgres حقيقي.
 *
 * أخطر ما هنا: `verify_correspondence` نقطةٌ يصلها **من لا حساب له**.
 * معظم الاختبارات أدناه تسأل سؤالًا واحدًا: ماذا يستطيع الغريب أن يعرف؟
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'

const CONNECTION = process.env.QALAM_TEST_DATABASE_URL
const suite = CONNECTION ? describe : describe.skip

const ADMIN = '13000000-0000-4000-8000-000000000001' // audit.view
const STAFF = '13000000-0000-4000-8000-000000000002'
const PEER = '13000000-0000-4000-8000-000000000003'
const OUTSIDER = '14000000-0000-4000-8000-000000000001'

suite('الجاهزية المؤسسية — تكامل حقيقي', () => {
  let db: Client
  const id: Record<string, string> = {}

  async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
    await db.query('set role authenticated')
    await db.query('select set_config($1,$2,false)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    try {
      return await run()
    } finally {
      await resetRole()
    }
  }

  /** ينفّذ بدور anon — أي زائر بلا حساب. */
  async function asAnon<T>(run: () => Promise<T>): Promise<T> {
    await db.query('set role anon')
    await db.query(`select set_config('request.jwt.claims','',false)`)
    try {
      return await run()
    } finally {
      await resetRole()
    }
  }

  async function resetRole(): Promise<void> {
    try {
      await db.query('reset role')
      await db.query(`select set_config('request.jwt.claims','',false)`)
    } catch {
      /* معاملة مُجهضة */
    }
  }

  async function expectDenied(run: () => Promise<unknown>, pattern: RegExp): Promise<void> {
    await db.query('savepoint sp')
    let error: Error | null = null
    try {
      await run()
    } catch (err) {
      error = err as Error
    } finally {
      await db.query('rollback to savepoint sp')
      await db.query('release savepoint sp')
      await resetRole()
    }
    expect(error, 'كان يجب أن تُرفض هذه العملية').not.toBeNull()
    expect(error?.message).toMatch(pattern)
  }

  beforeAll(async () => {
    db = new Client({ connectionString: CONNECTION })
    await db.connect()

    const users = [ADMIN, STAFF, PEER, OUTSIDER]
    await db.query('delete from auth.users where id = any($1)', [users])
    await db.query(`delete from public.organizations where code in ('P7A','P7B')`)
    await db.query(
      `insert into auth.users (id,email) select v.id::uuid, v.id || '@p7.test' from unnest($1::text[]) as v(id)`,
      [users],
    )

    const org = async (code: string, name: string) => {
      const res = await db.query(
        `insert into public.organizations (name,name_en,code) values ($1,$2,$3) returning id`,
        [name, code, code],
      )
      const orgId = res.rows[0].id as string
      await db.query('select public.seed_classification_levels($1)', [orgId])
      await db.query('select public.seed_reference_policy($1)', [orgId])
      return orgId
    }
    id.orgA = await org('P7A', 'وزارة الاختبار')
    id.orgB = await org('P7B', 'مؤسسة أخرى')

    const unit = async (orgId: string, code: string) =>
      (
        await db.query(
          `insert into public.org_units (organization_id,code,name_ar,kind)
           values ($1,$2,$2,'organization') returning id`,
          [orgId, code],
        )
      ).rows[0].id as string
    id.aRoot = await unit(id.orgA, 'P7-ROOT')
    id.bRoot = await unit(id.orgB, 'P7-BROOT')

    const member = async (orgId: string, user: string, unitId: string, roles: string[]) => {
      const res = await db.query(
        `insert into public.memberships (organization_id,user_id,org_unit_id,status,clearance_rank)
         values ($1,$2,$3,'active',3) returning id`,
        [orgId, user, unitId],
      )
      for (const key of roles) {
        await db.query(
          `insert into public.membership_roles (membership_id,role_id)
           select $1, id from public.roles where key=$2 and organization_id is null`,
          [res.rows[0].id, key],
        )
      }
    }
    // signatory ضروري لإتمام الدورة حتى الإصدار — نحن نختبر التحقق لا سلطة العمل.
    await member(id.orgA, ADMIN, id.aRoot, [
      'organization_admin', 'correspondence_officer', 'signatory', 'approver', 'employee',
    ])
    await member(id.orgA, STAFF, id.aRoot, ['employee'])
    await member(id.orgA, PEER, id.aRoot, ['employee'])
    await member(id.orgB, OUTSIDER, id.bRoot, [
      'organization_admin', 'correspondence_officer', 'signatory', 'employee',
    ])
  })

  afterAll(async () => {
    await db.query('delete from auth.users where id = any($1)', [[ADMIN, STAFF, PEER, OUTSIDER]])
    await db.query('delete from public.organizations where id = any($1)', [[id.orgA, id.orgB]])
    await db.end()
  })

  beforeEach(() => db.query('begin'))
  afterEach(() => db.query('rollback'))

  async function letter(opts: {
    owner: string
    org: string
    unit: string
    subject?: string
    direction?: string
    status?: string
    sender?: string
  }): Promise<string> {
    const res = await db.query(
      `insert into public.correspondences
         (user_id, created_by, organization_id, owner_unit_id, classification_key, direction,
          current_status, subject, body, sender_organization, language)
       values ($1,$1,$2,$3,'internal',$4::public.qalam_direction,
               $5::public.qalam_correspondence_status,$6,'نص المراسلة السري',$7,'ar')
       returning id`,
      [
        opts.owner, opts.org, opts.unit,
        opts.direction ?? 'outgoing',
        opts.status ?? 'draft',
        opts.subject ?? 'موضوع حساس جدًا',
        opts.sender ?? 'وزارة المالية',
      ],
    )
    return res.rows[0].id as string
  }

  /* ==================== التحقق العلني — أخطر سطح ==================== */

  describe('التحقق العلني', () => {
    async function issued(): Promise<{ letterId: string; token: string; reference: string }> {
      const letterId = await letter({ owner: ADMIN, org: id.orgA, unit: id.aRoot, status: 'approved' })
      await asUser(ADMIN, () => db.query('select public.issue_reference_number($1)', [letterId]))
      await asUser(ADMIN, () => db.query(`select public.transition_correspondence($1,'signed')`, [letterId]))
      await asUser(ADMIN, () => db.query(`select public.transition_correspondence($1,'issued')`, [letterId]))

      const row = await db.query(
        'select verification_token, reference_number from public.correspondences where id=$1',
        [letterId],
      )
      return {
        letterId,
        token: row.rows[0].verification_token as string,
        reference: row.rows[0].reference_number as string,
      }
    }

    it('الإصدار يُولّد رمزًا عشوائيًا طويلًا', async () => {
      const { token } = await issued()
      expect(token).toMatch(/^[0-9a-f]{48}$/)
    })

    it('زائر بلا حساب يتحقق من الرقم ويعرف الجهة والتاريخ', async () => {
      const { token, reference } = await issued()
      const result = await asAnon(() =>
        db.query('select * from public.verify_correspondence($1)', [token]),
      )
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].reference_number).toBe(reference)
      expect(result.rows[0].organization_name).toBe('وزارة الاختبار')
      expect(result.rows[0].issued_at).toBeTruthy()
    })

    it('⚠️ لا يكشف موضوعًا ولا نصًّا ولا أطرافًا ولا تصنيفًا', async () => {
      const { token } = await issued()
      const result = await asAnon(() =>
        db.query('select * from public.verify_correspondence($1)', [token]),
      )
      // الشكل نفسه هو الضمان: أربعة أعمدة لا خامس لها.
      expect(Object.keys(result.rows[0]).sort()).toEqual([
        'issued_at', 'organization_name', 'organization_name_en', 'reference_number',
      ])
      const serialized = JSON.stringify(result.rows[0])
      expect(serialized).not.toContain('موضوع حساس')
      expect(serialized).not.toContain('نص المراسلة السري')
      expect(serialized).not.toContain('وزارة المالية')
      expect(serialized).not.toContain('internal')
    })

    it('رمز خاطئ لا يكشف حتى وجود المراسلة', async () => {
      await issued()
      for (const bad of ['a'.repeat(48), '', 'short', '0'.repeat(48)]) {
        const result = await asAnon(() =>
          db.query('select * from public.verify_correspondence($1)', [bad]),
        )
        expect(result.rows, `الرمز «${bad.slice(0, 8)}…»`).toHaveLength(0)
      }
    })

    it('المسودة لا وجود لها علنًا', async () => {
      const draft = await letter({ owner: ADMIN, org: id.orgA, unit: id.aRoot, status: 'draft' })
      // نزرع رمزًا يدويًا لنثبت أن الحالة هي الفاصل لا غياب الرمز.
      await db.query(
        `update public.correspondences set verification_token = $1, reference_number = 'X/1' where id = $2`,
        ['b'.repeat(48), draft],
      )
      const result = await asAnon(() =>
        db.query('select * from public.verify_correspondence($1)', ['b'.repeat(48)]),
      )
      expect(result.rows).toHaveLength(0)
    })

    it('الزائر لا يقرأ أي جدول — الدالة هي كل ما يملك', async () => {
      for (const table of ['correspondences', 'organizations', 'org_units', 'memberships', 'audit_log']) {
        await expectDenied(
          () => asAnon(() => db.query(`select * from public.${table} limit 1`)),
          /permission denied/,
        )
      }
    })

    it('الزائر لا يستدعي أي إجراء آخر', async () => {
      await expectDenied(
        () => asAnon(() => db.query(`select * from public.report_correspondence_summary($1)`, [id.orgA])),
        /permission denied/,
      )
      await expectDenied(
        () => asAnon(() => db.query(`select public.agent_list_my_work()`)),
        /permission denied/,
      )
    })
  })

  /* ========================== التقارير ========================== */

  describe('التقارير تُجمِّع ما يراه القارئ فقط', () => {
    it('الملخّص يعدّ مراسلات المؤسسة للعضو المخوَّل', async () => {
      await letter({ owner: STAFF, org: id.orgA, unit: id.aRoot, direction: 'incoming' })
      await letter({ owner: PEER, org: id.orgA, unit: id.aRoot, direction: 'outgoing' })

      const rows = await asUser(ADMIN, () =>
        db.query('select * from public.report_correspondence_summary($1)', [id.orgA]),
      )
      const total = rows.rows.reduce((sum, row) => sum + Number(row.total), 0)
      expect(total).toBeGreaterThanOrEqual(2)
    })

    it('⚠️ موظف بنطاق «صفوفه» يرى أرقامه هو لا أرقام المؤسسة', async () => {
      await letter({ owner: STAFF, org: id.orgA, unit: id.aRoot })
      await letter({ owner: PEER, org: id.orgA, unit: id.aRoot })
      await letter({ owner: PEER, org: id.orgA, unit: id.aRoot })

      const rows = await asUser(STAFF, () =>
        db.query('select * from public.report_correspondence_summary($1)', [id.orgA]),
      )
      const total = rows.rows.reduce((sum, row) => sum + Number(row.total), 0)
      // التقرير تجميعٌ لما يراه القارئ: مراسلته وحدها.
      expect(total).toBe(1)
    })

    it('عضو مؤسسة أخرى يحصل على صفر — لا خطأ بل لا شيء', async () => {
      await letter({ owner: STAFF, org: id.orgA, unit: id.aRoot })
      const rows = await asUser(OUTSIDER, () =>
        db.query('select * from public.report_correspondence_summary($1)', [id.orgA]),
      )
      expect(rows.rows).toHaveLength(0)
    })

    it('تقرير الجهات الخارجية لا يتجاوز المؤسسة', async () => {
      await letter({ owner: STAFF, org: id.orgA, unit: id.aRoot, sender: 'جهة سرية' })
      const rows = await asUser(OUTSIDER, () =>
        db.query('select * from public.report_by_external_entity($1)', [id.orgA]),
      )
      expect(JSON.stringify(rows.rows)).not.toContain('جهة سرية')
    })

    it('تقرير استخدام الذكاء الاصطناعي يتطلب audit.view', async () => {
      await expectDenied(
        () => asUser(STAFF, () => db.query('select * from public.report_ai_usage($1,7)', [id.orgA])),
        /not permitted to view organization AI usage/,
      )
      const allowed = await asUser(ADMIN, () =>
        db.query('select * from public.report_ai_usage($1,7)', [id.orgA]),
      )
      expect(allowed.rows.length).toBe(7)
    })

    it('تقرير الاستخدام يعيد أعدادًا مُجمَّعة لا صفوفًا', async () => {
      const rows = await asUser(ADMIN, () =>
        db.query('select * from public.report_ai_usage($1,3)', [id.orgA]),
      )
      for (const row of rows.rows) {
        expect(Object.keys(row).sort()).toEqual(['agent_runs', 'day', 'simple_requests', 'total_tokens'])
      }
    })

    it('مدير مؤسسة أخرى لا يقرأ استخدام مؤسستنا', async () => {
      await expectDenied(
        () => asUser(OUTSIDER, () => db.query('select * from public.report_ai_usage($1,7)', [id.orgA])),
        /not permitted/,
      )
    })
  })

  /* ===================== حوكمة القوالب ===================== */

  describe('حوكمة القوالب', () => {
    async function orgTemplate(): Promise<string> {
      const res = await db.query(
        `insert into public.templates (user_id, organization_id, title_ar, body_ar, status)
         values ($1,$2,'قالب مؤسسي','نص','draft') returning id`,
        [ADMIN, id.orgA],
      )
      return res.rows[0].id as string
    }

    it('القالب غير المنشور لا يراه عامة الأعضاء', async () => {
      const templateId = await orgTemplate()
      const seen = await asUser(PEER, () =>
        db.query('select count(*)::int as n from public.templates where id=$1', [templateId]),
      )
      expect(Number(seen.rows[0].n)).toBe(0)
    })

    it('يراه من يملك templates.manage', async () => {
      const templateId = await orgTemplate()
      const seen = await asUser(ADMIN, () =>
        db.query('select count(*)::int as n from public.templates where id=$1', [templateId]),
      )
      expect(Number(seen.rows[0].n)).toBe(1)
    })

    it('النشر يجعله مرئيًا للجميع', async () => {
      const templateId = await orgTemplate()
      await asUser(ADMIN, () => db.query(`select public.transition_template($1,'published')`, [templateId]))

      const seen = await asUser(PEER, () =>
        db.query('select count(*)::int as n from public.templates where id=$1', [templateId]),
      )
      expect(Number(seen.rows[0].n)).toBe(1)
    })

    it('لا ينقل القالب من لا يملك الصلاحية', async () => {
      const templateId = await orgTemplate()
      await expectDenied(
        () => asUser(PEER, () => db.query(`select public.transition_template($1,'published')`, [templateId])),
        /not permitted to manage templates/,
      )
    })

    it('قوالب النظام لا تدخل الحوكمة', async () => {
      const system = await db.query(`select id from public.templates where is_system limit 1`)
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query(`select public.transition_template($1,'retired')`, [system.rows[0].id]),
          ),
        /managed by the platform/,
      )
    })

    it('القالب الشخصي لا يدخل الحوكمة ويبقى لصاحبه', async () => {
      const personal = await db.query(
        `insert into public.templates (user_id, title_ar, body_ar) values ($1,'قالبي','نص') returning id`,
        [PEER],
      )
      const templateId = personal.rows[0].id as string

      await expectDenied(
        () => asUser(ADMIN, () => db.query(`select public.transition_template($1,'published')`, [templateId])),
        /personal templates do not enter governance/,
      )
      const seen = await asUser(PEER, () =>
        db.query('select count(*)::int as n from public.templates where id=$1', [templateId]),
      )
      expect(Number(seen.rows[0].n), 'صاحبه يراه كما كان').toBe(1)
    })

    it('كل انتقال قالب يُسجَّل', async () => {
      const templateId = await orgTemplate()
      await asUser(ADMIN, () => db.query(`select public.transition_template($1,'in_review')`, [templateId]))
      await asUser(ADMIN, () => db.query(`select public.transition_template($1,'published')`, [templateId]))

      const log = await db.query(
        `select action from public.audit_log where entity_type='template' and entity_id=$1 order by id`,
        [templateId],
      )
      expect(log.rows.map((r) => r.action)).toEqual(['template.in_review', 'template.published'])
    })
  })

  /* ==================== البحث العربي والتصفية ==================== */

  describe('البحث والتصفية', () => {
    it('يتجاهل التشكيل والتطويل ويوحّد صور الألف', async () => {
      await db.query(
        `select public.qalam_normalize_ar('مُحَمَّـــد') = public.qalam_normalize_ar('محمد') as a,
                public.qalam_normalize_ar('إدارة') = public.qalam_normalize_ar('ادارة')   as b,
                public.qalam_normalize_ar('آمال')  = public.qalam_normalize_ar('امال')    as c,
                public.qalam_normalize_ar('مكتبة') = public.qalam_normalize_ar('مكتبه')   as d,
                public.qalam_normalize_ar('علي')   = public.qalam_normalize_ar('على')     as e`,
      ).then((r) => {
        expect(Object.values(r.rows[0]).every(Boolean), 'التسوية العربية ناقصة').toBe(true)
      })
    })

    it('يجد المراسلة بنصٍّ مشكولٍ وإن كُتب البحث بلا تشكيل', async () => {
      await letter({ owner: STAFF, org: id.orgA, unit: id.aRoot, subject: 'تعميم بشأن الإجازات' })
      const found = await asUser(STAFF, () =>
        db.query(
          `select id from public.search_correspondence($1, null, $2)`,
          [id.orgA, 'الاجازات'],
        ),
      )
      expect(found.rows).toHaveLength(1)
    })

    it('يبحث في الأطراف كما يبحث في الموضوع', async () => {
      await letter({ owner: STAFF, org: id.orgA, unit: id.aRoot, sender: 'وزارة الصحّة' })
      const byParty = await asUser(STAFF, () =>
        db.query(
          `select id from public.search_correspondence($1, null, null, null, $2)`,
          [id.orgA, 'الصحة'],
        ),
      )
      expect(byParty.rows).toHaveLength(1)
    })

    it('⚠️ البحث لا يتجاوز RLS: لا يرى أحدٌ مراسلة مؤسسةٍ أخرى ولو طابقت', async () => {
      await letter({ owner: OUTSIDER, org: id.orgB, unit: id.bRoot, subject: 'كلمة فريدة جدًا' })
      const asStaff = await asUser(STAFF, () =>
        db.query(`select id from public.search_correspondence($1, null, $2)`, [id.orgB, 'فريدة']),
      )
      expect(asStaff.rows, 'مؤسسة أخرى — يجب ألّا يظهر شيء').toHaveLength(0)

      const asOwner = await asUser(OUTSIDER, () =>
        db.query(`select id from public.search_correspondence($1, null, $2)`, [id.orgB, 'فريدة']),
      )
      expect(asOwner.rows, 'صاحبها يراها').toHaveLength(1)
    })

    it('⚠️ البحث لا يتجاوز التصنيف: تخليصٌ أدنى لا يرى الأشدّ سرية', async () => {
      // PEER يصير مديرًا فيرى الوحدة كلها — فلو ظهر الحجب فهو من التصنيف
      // وحده لا من ضيق النطاق. بغير هذه الخطوة يمرّ الاختبار لسببٍ خاطئ.
      await db.query(
        `insert into public.membership_roles (membership_id, role_id)
         select m.id, r.id from public.memberships m, public.roles r
         where m.organization_id=$1 and m.user_id=$2
           and r.key='manager' and r.organization_id is null`,
        [id.orgA, PEER],
      )
      await db.query(
        `update public.memberships set clearance_rank = 1 where organization_id=$1 and user_id=$2`,
        [id.orgA, PEER],
      )

      const plain = await letter({
        owner: ADMIN, org: id.orgA, unit: id.aRoot, subject: 'برقية عادية',
      })
      await db.query(
        `insert into public.correspondences
           (user_id, created_by, organization_id, owner_unit_id, classification_key, direction,
            current_status, subject, body, language)
         values ($1,$1,$2,$3,'confidential','outgoing','draft','برقية بالغة السرية','نص','ar')`,
        [ADMIN, id.orgA, id.aRoot],
      )

      const seen = await asUser(PEER, () =>
        db.query(`select id, subject from public.search_correspondence($1, null, $2)`, [id.orgA, 'برقية']),
      )
      expect(seen.rows.map((r) => r.id), 'نطاقه يكفي لرؤية العادية').toContain(plain)
      expect(
        seen.rows.map((r) => r.subject),
        'التصنيف يحجب حتى في نتائج البحث',
      ).not.toContain('برقية بالغة السرية')
    })

    it('⚠️ التصنيف المجهول يمنع لا يفتح', async () => {
      // كان يفتح: مفتاحٌ لا يقابله مستوى كان يمرّ بلا فحص تخليص إطلاقًا.
      const seen = await db.query(
        `select public.can_access_row('correspondence.view', $1, $2, $3, 'no_such_level') as ok`,
        [id.orgA, ADMIN, id.aRoot],
      )
      expect(seen.rows[0].ok, 'ما لا نعرفه نمنعه').not.toBe(true)
    })

    it('⚠️ لا يمكن كتابة مفتاح تصنيف لا وجود له', async () => {
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query(
              `insert into public.correspondences
                 (user_id, created_by, organization_id, owner_unit_id, classification_key,
                  direction, current_status, subject, body, language)
               values ($1,$1,$2,$3,'invented_level','outgoing','draft','x','y','ar')`,
              [ADMIN, id.orgA, id.aRoot],
            ),
          ),
        /correspondences_classification_fk|violates foreign key/,
      )
    })

    it('⚠️ لا يُحذف مستوى تصنيف مستعمَل فيتحوّل ما تحته إلى مجهول', async () => {
      await letter({ owner: ADMIN, org: id.orgA, unit: id.aRoot })
      await expectDenied(
        () =>
          db.query(`delete from public.classification_levels where organization_id=$1 and key='internal'`, [
            id.orgA,
          ]),
        /violates foreign key|still referenced/,
      )
    })

    it('يصفّي بالرقم وبالحالة وبالتاريخ', async () => {
      const letterId = await letter({ owner: ADMIN, org: id.orgA, unit: id.aRoot, status: 'approved' })
      const reference = await asUser(ADMIN, () =>
        db.query('select public.issue_reference_number($1) as ref', [letterId]),
      )
      const ref = reference.rows[0].ref as string

      const byRef = await asUser(ADMIN, () =>
        db.query(`select id from public.search_correspondence($1, null, null, $2)`, [id.orgA, ref.slice(-4)]),
      )
      expect(byRef.rows.map((r) => r.id)).toContain(letterId)

      const byStatus = await asUser(ADMIN, () =>
        db.query(
          `select id from public.search_correspondence($1, null, null, null, null, 'approved')`,
          [id.orgA],
        ),
      )
      expect(byStatus.rows.map((r) => r.id)).toContain(letterId)

      const future = new Date(Date.now() + 86_400_000).toISOString()
      const byDate = await asUser(ADMIN, () =>
        db.query(
          `select id from public.search_correspondence($1, null, null, null, null, null, null, null, $2::timestamptz)`,
          [id.orgA, future],
        ),
      )
      expect(byDate.rows, 'من الغد فصاعدًا — لا شيء').toHaveLength(0)
    })

    it('«المتأخرة فقط» لا تعدّ المراسلة المُصدَرة متأخرة', async () => {
      const past = new Date(Date.now() - 86_400_000).toISOString()
      const open = await letter({ owner: ADMIN, org: id.orgA, unit: id.aRoot, status: 'in_review' })
      const done = await letter({ owner: ADMIN, org: id.orgA, unit: id.aRoot, status: 'closed' })
      await db.query('update public.correspondences set due_at=$2 where id = any($1)', [[open, done], past])

      const overdue = await asUser(ADMIN, () =>
        db.query(
          `select id from public.search_correspondence($1, null, null, null, null, null, null, null, null, null, true)`,
          [id.orgA],
        ),
      )
      const ids = overdue.rows.map((r) => r.id)
      expect(ids).toContain(open)
      expect(ids, 'المغلقة ليست متأخرة').not.toContain(done)
    })

    it('الدالة `security invoker` — يُفحص من الكتالوج لا من قراءة الملف', async () => {
      const meta = await db.query(
        `select prosecdef, provolatile from pg_proc
         where proname='search_correspondence' and pronamespace='public'::regnamespace`,
      )
      expect(meta.rows[0].prosecdef, 'لو صارت definer لتجاوزت RLS').toBe(false)
      expect(meta.rows[0].provolatile).toBe('s')
    })

    it('التسوية IMMUTABLE — وإلا لما صلحت في فهرس', async () => {
      const meta = await db.query(
        `select provolatile from pg_proc
         where proname='qalam_normalize_ar' and pronamespace='public'::regnamespace`,
      )
      expect(meta.rows[0].provolatile).toBe('i')
    })
  })
})
