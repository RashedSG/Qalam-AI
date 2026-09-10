/**
 * إعدادات المراسلة المؤسسية على Postgres حقيقي.
 *
 * ⚠️ الخطر هنا ليس «من يكتب» — RLS تحسمه منذ المرحلة الثانية — بل «ماذا
 * يُكتب». مسؤولٌ يضبط إعدادًا في شاشة هو من يُنتج صيغةً بلا تسلسل، أو يخفض
 * رتبة تصنيف فيكشف ما كان محجوبًا. هذه الاختبارات عن ذلك.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'

const CONNECTION = process.env.QALAM_TEST_DATABASE_URL
const suite = CONNECTION ? describe : describe.skip

const ADMIN = '15000000-0000-4000-8000-000000000001'
const STAFF = '15000000-0000-4000-8000-000000000002'
const OUTSIDER = '15000000-0000-4000-8000-000000000003'

suite('إعدادات المراسلة المؤسسية', () => {
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
      try {
        await db.query('reset role')
        await db.query(`select set_config('request.jwt.claims','',false)`)
      } catch {
        /* معاملة مُجهضة */
      }
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
      try {
        await db.query('reset role')
        await db.query(`select set_config('request.jwt.claims','',false)`)
      } catch {
        /* تجاهل */
      }
    }
    expect(error, 'كان يجب أن تُرفض هذه العملية').not.toBeNull()
    expect(error?.message).toMatch(pattern)
  }

  beforeAll(async () => {
    db = new Client({ connectionString: CONNECTION })
    await db.connect()

    const users = [ADMIN, STAFF, OUTSIDER]
    await db.query('delete from auth.users where id = any($1)', [users])
    await db.query(`delete from public.organizations where code in ('P8A','P8B')`)
    await db.query(
      `insert into auth.users (id,email) select v.id::uuid, v.id || '@p8.test' from unnest($1::text[]) as v(id)`,
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
    id.orgA = await org('P8A', 'وزارة الإعدادات')
    id.orgB = await org('P8B', 'مؤسسة أخرى')

    const unit = async (orgId: string, code: string) =>
      (
        await db.query(
          `insert into public.org_units (organization_id,code,name_ar,kind)
           values ($1,$2,$2,'organization') returning id`,
          [orgId, code],
        )
      ).rows[0].id as string
    id.aRoot = await unit(id.orgA, 'FIN')
    id.bRoot = await unit(id.orgB, 'BROOT')

    const member = async (orgId: string, user: string, unitId: string, roles: string[], clearance = 3) => {
      const res = await db.query(
        `insert into public.memberships (organization_id,user_id,org_unit_id,status,clearance_rank)
         values ($1,$2,$3,'active',$4) returning id`,
        [orgId, user, unitId, clearance],
      )
      for (const key of roles) {
        await db.query(
          `insert into public.membership_roles (membership_id,role_id)
           select $1, id from public.roles where key=$2 and organization_id is null`,
          [res.rows[0].id, key],
        )
      }
    }
    await member(id.orgA, ADMIN, id.aRoot, [
      'organization_admin', 'correspondence_officer', 'signatory', 'approver', 'employee',
    ])
    await member(id.orgA, STAFF, id.aRoot, ['employee'], 1)
    await member(id.orgB, OUTSIDER, id.bRoot, ['organization_admin'])
  })

  afterAll(async () => {
    await db.query('delete from auth.users where id = any($1)', [[ADMIN, STAFF, OUTSIDER]])
    await db.query('delete from public.organizations where id = any($1)', [[id.orgA, id.orgB]])
    await db.end()
  })

  beforeEach(() => db.query('begin'))
  afterEach(() => db.query('rollback'))

  /* ==================== صيغة رقم المراسلة ==================== */

  describe('صيغة رقم المراسلة', () => {
    it('⚠️ ترفض صيغة بلا {SEQ} — وإلا حمل كل مراسلات السنة الرقم نفسه', async () => {
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query('select public.update_reference_policy($1,$2,4,true,true,true)', [
              id.orgA, '{ORG}/{YYYY}',
            ]),
          ),
        /missing_seq/,
      )
    })

    it('ترفض رمزًا مجهولًا بدل تركه حرفيًّا في رقمٍ رسمي', async () => {
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query('select public.update_reference_policy($1,$2,4,true,true,true)', [
              id.orgA, '{ORG}/{DEPT}/{SEQ}',
            ]),
          ),
        /unknown_placeholder:\{DEPT\}/,
      )
    })

    it('⚠️ القيد على الجدول يمنع الصيغة الفاسدة ولو كُتبت بغير الدالة', async () => {
      // المسؤول يملك حق الكتابة المباشرة عبر RLS؛ القيد هو الحاجز الأخير.
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query(
              `update public.reference_number_policies set format='{ORG}/{YYYY}'
               where organization_id=$1 and direction is null`,
              [id.orgA],
            ),
          ),
        /reference_policies_format_check/,
      )
    })

    it('تقبل الصيغة السليمة وتُسجّلها', async () => {
      await asUser(ADMIN, () =>
        db.query('select public.update_reference_policy($1,$2,5,true,true,true)', [
          id.orgA, '{ORG}-{DIR}-{YY}-{SEQ}',
        ]),
      )
      const saved = await db.query(
        `select format, seq_padding from public.reference_number_policies
         where organization_id=$1 and direction is null`,
        [id.orgA],
      )
      expect(saved.rows[0].format).toBe('{ORG}-{DIR}-{YY}-{SEQ}')
      expect(saved.rows[0].seq_padding).toBe(5)

      const log = await db.query(
        `select action from public.audit_log where organization_id=$1 and entity_type='reference_number_policy'`,
        [id.orgA],
      )
      expect(log.rows.map((r) => r.action)).toContain('reference_policy.updated')
    })

    it('المعاينة تستبدل {YY} كما يفعل المُصدِر — لا تكذب على المستخدم', async () => {
      const preview = await asUser(ADMIN, () =>
        db.query(`select public.preview_reference_format('{ORG}/{YY}/{SEQ}', 3) as p`),
      )
      expect(preview.rows[0].p).not.toContain('{YY}')
      expect(preview.rows[0].p).toMatch(/^MOF\/\d{2}\/001$/)
    })

    it('من لا يملك organization.manage لا يغيّر السياسة', async () => {
      await expectDenied(
        () =>
          asUser(STAFF, () =>
            db.query('select public.update_reference_policy($1,$2,4,true,true,true)', [
              id.orgA, '{ORG}/{SEQ}',
            ]),
          ),
        /not permitted to manage organization settings/,
      )
    })

    it('⚠️ ولا يغيّر مسؤولُ مؤسسةٍ سياسةَ مؤسسةٍ أخرى', async () => {
      await expectDenied(
        () =>
          asUser(OUTSIDER, () =>
            db.query('select public.update_reference_policy($1,$2,4,true,true,true)', [
              id.orgA, '{ORG}/{SEQ}',
            ]),
          ),
        /not permitted to manage organization settings/,
      )
    })
  })

  /* ==================== تصادم الترقيم ==================== */

  describe('تعافي المُصدِر من تصادم الأرقام', () => {
    async function letter(subject = 'مراسلة'): Promise<string> {
      const res = await db.query(
        `insert into public.correspondences
           (user_id, created_by, organization_id, owner_unit_id, classification_key,
            direction, current_status, subject, body, language)
         values ($1,$1,$2,$3,'internal','outgoing','approved',$4,'نص','ar')
         returning id`,
        [ADMIN, id.orgA, id.aRoot, subject],
      )
      return res.rows[0].id as string
    }

    it('⚠️ تغيير نطاق العدّاد لا يُنتج رقمًا مكرّرًا', async () => {
      const first = await letter('الأولى')
      const firstRef = await asUser(ADMIN, () =>
        db.query('select public.issue_reference_number($1) as r', [first]),
      )

      // المسؤول يُطفئ per_unit: النطاق يتغيّر والعدّاد الجديد يبدأ من ١.
      await asUser(ADMIN, () =>
        db.query('select public.update_reference_policy($1,$2,4,true,false,true)', [
          id.orgA, '{ORG}/{DIR}/{YYYY}/{SEQ}',
        ]),
      )
      // ونعيد ضبط صيغة الأولى إلى الصيغة نفسها كي يقع التصادم فعلًا.
      await db.query(
        `update public.correspondences set reference_number = $2 where id = $1`,
        [first, firstRef.rows[0].r],
      )

      const second = await letter('الثانية')
      const secondRef = await asUser(ADMIN, () =>
        db.query('select public.issue_reference_number($1) as r', [second]),
      )

      expect(secondRef.rows[0].r, 'رقمان متطابقان في سجل رسمي').not.toBe(firstRef.rows[0].r)
    })

    it('الرقم الصادر نهائي — إعادة الإصدار تُعيده لا تُصدر غيره', async () => {
      const only = await letter()
      const a = await asUser(ADMIN, () => db.query('select public.issue_reference_number($1) as r', [only]))
      const b = await asUser(ADMIN, () => db.query('select public.issue_reference_number($1) as r', [only]))
      expect(b.rows[0].r).toBe(a.rows[0].r)
    })

    it('عدد المحاولات مُسجَّل — فجوة الترقيم تصير مفسَّرة لا غامضة', async () => {
      const one = await letter()
      await asUser(ADMIN, () => db.query('select public.issue_reference_number($1)', [one]))
      const log = await db.query(
        `select metadata from public.audit_log
         where entity_id=$1 and action='correspondence.reference_issued'`,
        [one],
      )
      expect(log.rows[0].metadata).toHaveProperty('attempts')
    })
  })

  /* ==================== مستويات التصنيف ==================== */

  describe('مستويات التصنيف', () => {
    it('يضيف مستوى جديدًا في الأعلى ويُسجّله', async () => {
      await asUser(ADMIN, () =>
        db.query(`select public.upsert_classification_level($1,'top_secret','سري للغاية','Top Secret',false)`, [
          id.orgA,
        ]),
      )
      const row = await db.query(
        `select rank, name_ar from public.classification_levels where organization_id=$1 and key='top_secret'`,
        [id.orgA],
      )
      expect(row.rows[0].rank, 'يُلحَق بعد أعلى رتبة قائمة').toBe(4)

      const log = await db.query(
        `select action from public.audit_log where organization_id=$1 and entity_type='classification_level'`,
        [id.orgA],
      )
      expect(log.rows.map((r) => r.action)).toContain('classification.created')
    })

    it('⚠️ تبديل مستويين يعمل — والحالة الوسيطة فيها رتبتان متساويتان', async () => {
      // قيدٌ فوريّ يجعل هذا مستحيلًا؛ ولذلك هو مؤجَّل.
      await asUser(ADMIN, () =>
        db.query(`select public.reorder_classification_levels($1, array['confidential','restricted','internal'])`, [
          id.orgA,
        ]),
      )
      const ranks = await db.query(
        `select key, rank from public.classification_levels where organization_id=$1 order by rank`,
        [id.orgA],
      )
      expect(ranks.rows.map((r) => r.key)).toEqual(['confidential', 'restricted', 'internal'])
    })

    it('⚠️ تغيير الرتبة يُسجَّل بوصفه تغييرًا في الوصول، باتجاهه وعدد المتأثرين', async () => {
      await db.query(
        `insert into public.correspondences
           (user_id, created_by, organization_id, owner_unit_id, classification_key,
            direction, current_status, subject, body, language)
         values ($1,$1,$2,$3,'confidential','outgoing','draft','س','ن','ar')`,
        [ADMIN, id.orgA, id.aRoot],
      )
      await asUser(ADMIN, () =>
        db.query(`select public.reorder_classification_levels($1, array['confidential','restricted','internal'])`, [
          id.orgA,
        ]),
      )
      const log = await db.query(
        `select previous_status, new_status, metadata from public.audit_log
         where organization_id=$1 and action='classification.rank_changed'
           and metadata->>'key' = 'confidential'`,
        [id.orgA],
      )
      expect(log.rows).toHaveLength(1)
      expect(log.rows[0].previous_status, 'كان الأشدّ سرية').toBe('3')
      expect(log.rows[0].new_status, 'صار الأدنى').toBe('1')
      expect(log.rows[0].metadata.widens_access, 'التخفيض يكشف ما كان محجوبًا').toBe(true)
      expect(Number(log.rows[0].metadata.affected_correspondence)).toBe(1)
    })

    it('إعادة الترتيب ترفض قائمة ناقصة أو فيها مفتاح مجهول أو مكرّر', async () => {
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query(`select public.reorder_classification_levels($1, array['internal'])`, [id.orgA]),
          ),
        /reorder must list all 3 classification level/,
      )
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query(
              `select public.reorder_classification_levels($1, array['internal','restricted','ghost'])`,
              [id.orgA],
            ),
          ),
        /unknown classification key/,
      )
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query(
              `select public.reorder_classification_levels($1, array['internal','internal','restricted'])`,
              [id.orgA],
            ),
          ),
        /duplicate classification key/,
      )
    })

    it('⚠️ ولا يعيد مسؤولُ مؤسسةٍ ترتيبَ مؤسسةٍ أخرى', async () => {
      await expectDenied(
        () =>
          asUser(OUTSIDER, () =>
            db.query(
              `select public.reorder_classification_levels($1, array['confidential','restricted','internal'])`,
              [id.orgA],
            ),
          ),
        /not permitted to manage organization settings/,
      )
    })

    it('⚠️ المفتاح غير قابل للتغيير — وإلا أُعيد تصنيف مراسلات صادرة', async () => {
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query(
              `update public.classification_levels set key='renamed'
               where organization_id=$1 and key='confidential'`,
              [id.orgA],
            ),
          ),
        /key is immutable/,
      )
    })

    it('الافتراضي واحد — والتبديل ذرّي لا يفشل بخطأ قيد', async () => {
      await asUser(ADMIN, () =>
        db.query(`select public.upsert_classification_level($1,'restricted','مقيّد','Restricted',true)`, [
          id.orgA,
        ]),
      )
      const defaults = await db.query(
        `select key from public.classification_levels where organization_id=$1 and is_default=true`,
        [id.orgA],
      )
      expect(defaults.rows.map((r) => r.key)).toEqual(['restricted'])
    })

    it('المفتاح يلتزم صيغة ثابتة — لا مسافات ولا عربية', async () => {
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query(`select public.upsert_classification_level($1,'سري جدا','س','S',false)`, [id.orgA]),
          ),
        /classification key must match/,
      )
    })

    it('⚠️ لا يُحذف مستوى مستعمَل — والرسالة تقول العدد', async () => {
      await db.query(
        `insert into public.correspondences
           (user_id, created_by, organization_id, owner_unit_id, classification_key,
            direction, current_status, subject, body, language)
         values ($1,$1,$2,$3,'confidential','outgoing','draft','س','ن','ar')`,
        [ADMIN, id.orgA, id.aRoot],
      )
      await expectDenied(
        () =>
          asUser(ADMIN, () =>
            db.query(`select public.delete_classification_level($1,'confidential')`, [id.orgA]),
          ),
        /is used by 1 correspondence/,
      )
    })

    it('لا تبقى مؤسسة بلا مستوى تصنيف', async () => {
      await asUser(ADMIN, () => db.query(`select public.delete_classification_level($1,'confidential')`, [id.orgA]))
      await asUser(ADMIN, () => db.query(`select public.delete_classification_level($1,'restricted')`, [id.orgA]))
      await expectDenied(
        () => asUser(ADMIN, () => db.query(`select public.delete_classification_level($1,'internal')`, [id.orgA])),
        /at least one classification level/,
      )
    })

    it('حذف الافتراضي يُرقّي الأدنى رتبةً بدل ترك المؤسسة بلا افتراضي', async () => {
      // 'internal' هو الافتراضي المزروع (رتبة ١).
      await asUser(ADMIN, () => db.query(`select public.delete_classification_level($1,'internal')`, [id.orgA]))
      const defaults = await db.query(
        `select key from public.classification_levels where organization_id=$1 and is_default=true`,
        [id.orgA],
      )
      expect(defaults.rows.map((r) => r.key)).toEqual(['restricted'])
    })

    it('من لا يملك organization.manage لا يعدّل مستوى ولا يحذفه', async () => {
      await expectDenied(
        () =>
          asUser(STAFF, () =>
            db.query(`select public.upsert_classification_level($1,'internal','داخلي','Internal',true)`, [
              id.orgA,
            ]),
          ),
        /not permitted to manage organization settings/,
      )
      await expectDenied(
        () => asUser(STAFF, () => db.query(`select public.delete_classification_level($1,'restricted')`, [id.orgA])),
        /not permitted to manage organization settings/,
      )
    })

    it('⚠️ ولا يعدّل مسؤولُ مؤسسةٍ مستوياتِ مؤسسةٍ أخرى', async () => {
      await expectDenied(
        () =>
          asUser(OUTSIDER, () =>
            db.query(`select public.upsert_classification_level($1,'internal','مخترق','X',true)`, [id.orgA]),
          ),
        /not permitted to manage organization settings/,
      )
    })
  })

  /* ==================== أثر التغيير قبل تنفيذه ==================== */

  describe('حساب الأثر', () => {
    it('يقول كم مراسلة تتأثر وكم عضوًا يكسب الوصول', async () => {
      await db.query(
        `insert into public.correspondences
           (user_id, created_by, organization_id, owner_unit_id, classification_key,
            direction, current_status, subject, body, language)
         values ($1,$1,$2,$3,'confidential','outgoing','draft','س','ن','ar')`,
        [ADMIN, id.orgA, id.aRoot],
      )
      // STAFF تخليصه ١، وADMIN تخليصه ٣. 'confidential' رتبته ٣.
      const impact = await asUser(ADMIN, () =>
        db.query(`select * from public.classification_impact($1,'confidential',1)`, [id.orgA]),
      )
      const row = impact.rows[0]
      expect(Number(row.correspondence_count)).toBe(1)
      expect(Number(row.members_now), 'الآن: صاحب التخليص ٣ وحده').toBe(1)
      expect(Number(row.members_after), 'بعد التخفيض إلى ١: الاثنان').toBe(2)
    })

    it('الدالة `security invoker` — لا تكشف ما لا يراه المستدعي', async () => {
      const meta = await db.query(
        `select prosecdef from pg_proc
         where proname='classification_impact' and pronamespace='public'::regnamespace`,
      )
      expect(meta.rows[0].prosecdef).toBe(false)
    })
  })
})
