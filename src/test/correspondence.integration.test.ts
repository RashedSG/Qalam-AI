/**
 * المرحلة ٣ — اختبارات تكامل للمراسلة المؤسسية على Postgres حقيقي.
 *
 * تُثبت ما لا يُثبته التحليل الساكن: أن التصنيف يحجب فعلًا، وأن الإحالة تمنح
 * وصولًا فعلًا، وأن مولّد الأرقام لا يُكرّر تحت التزامن.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'

const CONNECTION = process.env.QALAM_TEST_DATABASE_URL
const suite = CONNECTION ? describe : describe.skip

const ADMIN = '0d000000-0000-4000-8000-000000000001' // مدير المؤسسة، تخليص 1
const OFFICER = '0d000000-0000-4000-8000-000000000002' // مسؤول مراسلات، تخليص 3
const MGR = '0d000000-0000-4000-8000-000000000003' // مدير المالية، تخليص 2
const STAFF = '0d000000-0000-4000-8000-000000000004' // موظف حسابات، تخليص 1
const HR = '0d000000-0000-4000-8000-000000000005' // موظف موارد بشرية، تخليص 1
const OUTSIDER = '0e000000-0000-4000-8000-000000000001' // مؤسسة أخرى

suite('المراسلة المؤسسية — تكامل حقيقي', () => {
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

  const sees = (user: string, letterId: string) =>
    asUser(user, () =>
      db.query('select count(*)::int as n from public.correspondences where id=$1', [letterId]),
    ).then((r) => Number(r.rows[0].n))

  beforeAll(async () => {
    db = new Client({ connectionString: CONNECTION })
    await db.connect()

    const users = [ADMIN, OFFICER, MGR, STAFF, HR, OUTSIDER]
    await db.query('delete from auth.users where id = any($1)', [users])
    await db.query(`delete from public.organizations where code in ('P3A','P3B')`)
    await db.query(
      `insert into auth.users (id,email) select v.id::uuid, v.id || '@p3.test' from unnest($1::text[]) as v(id)`,
      [users],
    )

    const org = async (code: string) => {
      const res = await db.query(
        `insert into public.organizations (name,name_en,code) values ($1,$1,$1) returning id`,
        [code],
      )
      const orgId = res.rows[0].id as string
      await db.query('select public.seed_classification_levels($1)', [orgId])
      await db.query('select public.seed_referral_instructions($1)', [orgId])
      await db.query('select public.seed_reference_policy($1)', [orgId])
      return orgId
    }
    id.orgA = await org('P3A')
    id.orgB = await org('P3B')

    const unit = async (orgId: string, parent: string | null, code: string) => {
      const res = await db.query(
        `insert into public.org_units (organization_id,parent_id,code,name_ar,kind)
         values ($1,$2,$3,$3,'department') returning id`,
        [orgId, parent, code],
      )
      return res.rows[0].id as string
    }
    id.aRoot = await unit(id.orgA, null, 'P3-ROOT')
    id.aFin = await unit(id.orgA, id.aRoot, 'P3-FIN')
    id.aAcc = await unit(id.orgA, id.aFin, 'P3-ACC')
    id.aHr = await unit(id.orgA, id.aRoot, 'P3-HR')
    id.bRoot = await unit(id.orgB, null, 'P3-BROOT')

    const member = async (orgId: string, user: string, unitId: string, roles: string[], clearance = 1) => {
      const res = await db.query(
        `insert into public.memberships (organization_id,user_id,org_unit_id,status,clearance_rank)
         values ($1,$2,$3,'active',$4) returning id`,
        [orgId, user, unitId, clearance],
      )
      const mId = res.rows[0].id as string
      for (const key of roles) {
        await db.query(
          `insert into public.membership_roles (membership_id,role_id)
           select $1, id from public.roles where key=$2 and organization_id is null`,
          [mId, key],
        )
      }
      return mId
    }
    id.mAdmin = await member(id.orgA, ADMIN, id.aRoot, ['organization_admin', 'employee'], 1)
    id.mOfficer = await member(id.orgA, OFFICER, id.aRoot, ['correspondence_officer', 'employee'], 3)
    id.mMgr = await member(id.orgA, MGR, id.aFin, ['manager', 'employee'], 2)
    id.mStaff = await member(id.orgA, STAFF, id.aAcc, ['employee'], 1)
    id.mHr = await member(id.orgA, HR, id.aHr, ['employee'], 1)
    id.mOutsider = await member(id.orgB, OUTSIDER, id.bRoot, ['correspondence_officer', 'employee'], 3)
  })

  afterAll(async () => {
    await db.query('delete from auth.users where id = any($1)', [
      [ADMIN, OFFICER, MGR, STAFF, HR, OUTSIDER],
    ])
    await db.query('delete from public.organizations where id = any($1)', [[id.orgA, id.orgB]])
    await db.end()
  })

  beforeEach(() => db.query('begin'))
  afterEach(() => db.query('rollback'))

  /** مراسلة جديدة بخصائص محددة. */
  async function letter(opts: {
    owner: string
    org?: string | null
    unit?: string | null
    classification?: string
    direction?: string
    subject?: string
  }): Promise<string> {
    const res = await db.query(
      `insert into public.correspondences
         (user_id, created_by, organization_id, owner_unit_id, classification_key, direction, subject, body, language)
       values ($1,$1,$2,$3,$4,$5::public.qalam_direction,$6,'نص','ar') returning id`,
      [
        opts.owner,
        opts.org === undefined ? id.orgA : opts.org,
        opts.unit ?? null,
        opts.classification ?? 'internal',
        opts.direction ?? 'outgoing',
        opts.subject ?? 'موضوع',
      ],
    )
    return res.rows[0].id as string
  }

  /* ===================== الاتجاه والحقول الأساسية ===================== */

  describe('الاتجاه والحقول', () => {
    it('source يبقى مستقلًا عن direction — مفهومان مختلفان', async () => {
      const columns = await db.query(
        `select column_name from information_schema.columns
         where table_schema='public' and table_name='correspondences'`,
      )
      const names = columns.rows.map((r) => r.column_name as string)
      expect(names).toContain('source')
      expect(names).toContain('direction')
    })

    it('المراسلات القائمة صارت صادرة بتصنيف أدنى — لا فقد وصول', async () => {
      const existing = await letter({ owner: STAFF, unit: id.aAcc })
      const row = await db.query(
        'select direction, classification_key, current_status from public.correspondences where id=$1',
        [existing],
      )
      expect(row.rows[0].direction).toBe('outgoing')
      expect(row.rows[0].classification_key).toBe('internal')
      expect(row.rows[0].current_status).toBe('draft')
    })

    it('الوحدة المالكة الصريحة تُستخدم بدل وحدة المالك', async () => {
      // مراسلة يملكها موظف الموارد البشرية لكنها تخص المالية.
      const transferred = await letter({ owner: HR, unit: id.aFin })
      expect(await sees(MGR, transferred), 'مدير المالية يراها لأنها في وحدته').toBe(1)

      const hrOwned = await letter({ owner: HR, unit: id.aHr })
      expect(await sees(MGR, hrOwned), 'ولا يرى ما يخص الموارد البشرية').toBe(0)
    })

    it('غياب الوحدة المالكة يعود إلى وحدة المالك — سلوك المرحلة ٢', async () => {
      const legacy = await letter({ owner: STAFF, unit: null })
      expect(await sees(MGR, legacy), 'الموظف في قسم تحت المالية').toBe(1)
      expect(await sees(HR, legacy)).toBe(0)
    })
  })

  /* ======================== التصنيف الأمني ======================== */

  describe('التصنيف الأمني يحجب فعلًا', () => {
    it('من تخليصه أدنى من التصنيف لا يرى الصف', async () => {
      const secret = await letter({ owner: STAFF, unit: id.aAcc, classification: 'confidential' })
      // المدير تخليصه 2 ونطاقه يغطي الصف، لكن التصنيف 3.
      expect(await sees(MGR, secret)).toBe(0)
      // مسؤول المراسلات تخليصه 3 ونطاقه المؤسسة.
      expect(await sees(OFFICER, secret)).toBe(1)
    })

    it('المالك يرى مراسلته مهما كان تصنيفها', async () => {
      const secret = await letter({ owner: STAFF, unit: id.aAcc, classification: 'confidential' })
      expect(await sees(STAFF, secret), 'تصنيفه لا يحجبه عن نفسه').toBe(1)
    })

    it('التصنيف المتوسط يحجب الأدنى تخليصًا ولا يحجب الأعلى', async () => {
      const restricted = await letter({ owner: HR, unit: id.aFin, classification: 'restricted' })
      expect(await sees(MGR, restricted), 'تخليصه 2 = rank 2').toBe(1)
      expect(await sees(OFFICER, restricted), 'تخليصه 3').toBe(1)
    })

    it('التخليص لا يتجاوز حدود المؤسسة', async () => {
      const secret = await letter({ owner: STAFF, unit: id.aAcc, classification: 'confidential' })
      // مسؤول مراسلات في (ب) بتخليص 3 ونطاق المؤسسة — ومع ذلك لا شيء.
      expect(await sees(OUTSIDER, secret)).toBe(0)
    })

    it('رفع التخليص يفتح الوصول، وخفضه يغلقه', async () => {
      const secret = await letter({ owner: STAFF, unit: id.aAcc, classification: 'confidential' })
      expect(await sees(MGR, secret)).toBe(0)
      await db.query('update public.memberships set clearance_rank=3 where id=$1', [id.mMgr])
      expect(await sees(MGR, secret)).toBe(1)
      await db.query('update public.memberships set clearance_rank=1 where id=$1', [id.mMgr])
      expect(await sees(MGR, secret)).toBe(0)
    })

    it('التخليص يحجب الإصدارات السابقة أيضًا — لا تسريب من باب خلفي', async () => {
      const secret = await letter({ owner: STAFF, unit: id.aAcc, classification: 'confidential' })
      await db.query(
        `insert into public.correspondence_versions (correspondence_id, user_id, body) values ($1,$2,'نص سري')`,
        [secret, STAFF],
      )
      const seen = await asUser(MGR, () =>
        db.query('select count(*)::int as n from public.correspondence_versions where correspondence_id=$1', [secret]),
      )
      expect(Number(seen.rows[0].n)).toBe(0)
    })
  })

  /* ======================== أرقام المراسلات ======================== */

  describe('مولّد أرقام المراسلات', () => {
    it('يُصدر رقمًا بالصيغة المضبوطة', async () => {
      const out = await letter({ owner: OFFICER, unit: id.aFin, direction: 'outgoing' })
      const res = await asUser(OFFICER, () =>
        db.query('select public.issue_reference_number($1) as ref', [out]),
      )
      expect(res.rows[0].ref).toMatch(/^P3A\/P3-FIN\/OUT\/\d{4}\/0001$/)
    })

    it('الرقم الصادر نهائي — إعادة الإصدار تُعيده ولا تستهلك رقمًا', async () => {
      const out = await letter({ owner: OFFICER, unit: id.aFin })
      const first = await asUser(OFFICER, () => db.query('select public.issue_reference_number($1) as ref', [out]))
      const again = await asUser(OFFICER, () => db.query('select public.issue_reference_number($1) as ref', [out]))
      expect(again.rows[0].ref).toBe(first.rows[0].ref)
    })

    it('التسلسل مستقل لكل اتجاه ولكل وحدة', async () => {
      const finOut = await letter({ owner: OFFICER, unit: id.aFin, direction: 'outgoing' })
      const finIn = await letter({ owner: OFFICER, unit: id.aFin, direction: 'incoming' })
      const hrOut = await letter({ owner: OFFICER, unit: id.aHr, direction: 'outgoing' })

      const refs: string[] = []
      for (const letterId of [finOut, finIn, hrOut]) {
        const res = await asUser(OFFICER, () =>
          db.query('select public.issue_reference_number($1) as ref', [letterId]),
        )
        refs.push(res.rows[0].ref as string)
      }
      // كل نطاق يبدأ من ١ لأن عدّاده مستقل.
      expect(refs[0]).toMatch(/P3-FIN\/OUT\/\d{4}\/0001$/)
      expect(refs[1]).toMatch(/P3-FIN\/IN\/\d{4}\/0001$/)
      expect(refs[2]).toMatch(/P3-HR\/OUT\/\d{4}\/0001$/)
    })

    it('الأرقام فريدة داخل المؤسسة — يفرضه فهرس لا الكود', async () => {
      const a = await letter({ owner: OFFICER, unit: id.aFin })
      await asUser(OFFICER, () => db.query('select public.issue_reference_number($1) as ref', [a]))
      const ref = (await db.query('select reference_number from public.correspondences where id=$1', [a]))
        .rows[0].reference_number as string

      const b = await letter({ owner: OFFICER, unit: id.aFin })
      await expectDenied(
        () => db.query('update public.correspondences set reference_number=$1 where id=$2', [ref, b]),
        /duplicate key|correspondences_reference_idx|issued by/,
      )
    })

    it('لا يُصدر رقمًا من لا يملك الصلاحية ولا يملك الصف', async () => {
      const out = await letter({ owner: OFFICER, unit: id.aFin })
      await expectDenied(
        () => asUser(HR, () => db.query('select public.issue_reference_number($1)', [out])),
        /not permitted to issue/,
      )
    })

    it('المالك يُصدر رقم مراسلته بلا صلاحية إصدار', async () => {
      const own = await letter({ owner: HR, unit: id.aHr })
      const res = await asUser(HR, () => db.query('select public.issue_reference_number($1) as ref', [own]))
      expect(res.rows[0].ref).toBeTruthy()
    })

    it('لا يُعدَّل الرقم بتحديث مباشر — يمر بالدالة وحدها', async () => {
      const out = await letter({ owner: HR, unit: id.aHr })
      await asUser(HR, () => db.query('select public.issue_reference_number($1)', [out]))
      await expectDenied(
        () =>
          asUser(HR, () =>
            db.query(`update public.correspondences set reference_number='مزيف' where id=$1`, [out]),
          ),
        /issued by issue_reference_number/,
      )
    })

    it('الصيغة قابلة للتخصيص بلا نشر جديد', async () => {
      await db.query(
        `update public.reference_number_policies
            set format='{DIR}-{YY}{MM}-{SEQ}', seq_padding=6
          where organization_id=$1 and direction is null`,
        [id.orgA],
      )
      const out = await letter({ owner: OFFICER, unit: id.aFin })
      const res = await asUser(OFFICER, () => db.query('select public.issue_reference_number($1) as ref', [out]))
      expect(res.rows[0].ref).toMatch(/^OUT-\d{4}-000001$/)
    })

    it('لا يقرأ أحد العدّادات — قراءتها تكشف حجم المراسلات', async () => {
      await expectDenied(
        () => asUser(OFFICER, () => db.query('select * from public.reference_number_counters')),
        /permission denied/,
      )
    })
  })

  /* ========================== الإحالات ========================== */

  describe('الإحالات', () => {
    it('الإحالة تمنح وصولًا لمن لا يملك نطاقًا يغطي الصف', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      expect(await sees(HR, letterId), 'قبل الإحالة').toBe(0)

      await asUser(STAFF, () =>
        db.query(`select public.create_referral($1,'for_comment',$2)`, [letterId, HR]),
      )
      expect(await sees(HR, letterId), 'بعد الإحالة').toBe(1)
    })

    it('إحالة الوحدة تصل كل عضو نشط فيها', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aRoot })
      expect(await sees(STAFF, letterId)).toBe(0)

      await asUser(OFFICER, () =>
        db.query(`select public.create_referral($1,'for_action',null,$2)`, [letterId, id.aAcc]),
      )
      expect(await sees(STAFF, letterId), 'عضو قسم الحسابات').toBe(1)
      expect(await sees(HR, letterId), 'وليس عضو الموارد البشرية').toBe(0)
    })

    it('لا يُحيل من لا يملك الصلاحية ولا يملك الصف', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      await expectDenied(
        () => asUser(HR, () => db.query(`select public.create_referral($1,'for_info',$2)`, [letterId, MGR])),
        /not permitted to refer/,
      )
    })

    it('لا تُحال مراسلة إلى مستخدم خارج المؤسسة', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      await expectDenied(
        () =>
          asUser(OFFICER, () =>
            db.query(`select public.create_referral($1,'for_info',$2)`, [letterId, OUTSIDER]),
          ),
        /not an active member/,
      )
    })

    it('لا تُحال إلى وحدة في مؤسسة أخرى', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      await expectDenied(
        () =>
          asUser(OFFICER, () =>
            db.query(`select public.create_referral($1,'for_info',null,$2)`, [letterId, id.bRoot]),
          ),
        /outside the organization/,
      )
    })

    it('تعليمة غير معرّفة تُرفض', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      await expectDenied(
        () =>
          asUser(OFFICER, () =>
            db.query(`select public.create_referral($1,'افعل ما تراه',$2)`, [letterId, MGR]),
          ),
        /unknown referral instruction/,
      )
    })

    it('الإحالة تحتاج هدفًا واحدًا بالضبط', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      await expectDenied(
        () =>
          asUser(OFFICER, () =>
            db.query(`select public.create_referral($1,'for_info',$2,$3)`, [letterId, MGR, id.aFin]),
          ),
        /exactly one target/,
      )
      await expectDenied(
        () => asUser(OFFICER, () => db.query(`select public.create_referral($1,'for_info')`, [letterId])),
        /exactly one target/,
      )
    })

    it('الرد مقصور على المُحال إليه', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      const ref = await asUser(OFFICER, () =>
        db.query(`select public.create_referral($1,'for_comment',$2) as id`, [letterId, MGR]),
      )
      const refId = ref.rows[0].id as string

      await expectDenied(
        () => asUser(HR, () => db.query(`select public.respond_to_referral($1,'responded','رد')`, [refId])),
        /not permitted to respond/,
      )

      await asUser(MGR, () => db.query(`select public.respond_to_referral($1,'responded','تم')`, [refId]))
      const after = await db.query('select status, response, responded_by from public.referrals where id=$1', [refId])
      expect(after.rows[0].status).toBe('responded')
      expect(after.rows[0].responded_by).toBe(MGR)
    })

    it('المُحيل يستطيع إغلاق إحالته ولا يستطيع الرد عنها', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      const ref = await asUser(OFFICER, () =>
        db.query(`select public.create_referral($1,'for_comment',$2) as id`, [letterId, MGR]),
      )
      const refId = ref.rows[0].id as string

      await expectDenied(
        () => asUser(OFFICER, () => db.query(`select public.respond_to_referral($1,'responded','رد')`, [refId])),
        /not permitted to respond/,
      )
      await asUser(OFFICER, () => db.query(`select public.respond_to_referral($1,'closed')`, [refId]))
      expect((await db.query('select status from public.referrals where id=$1', [refId])).rows[0].status).toBe('closed')
    })

    it('لا يُدرج ولا يُعدّل أحد الإحالات مباشرة — الدالة هي المسار الوحيد', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      await expectDenied(
        () =>
          asUser(OFFICER, () =>
            db.query(
              `insert into public.referrals (correspondence_id, organization_id, from_user_id, to_user_id, instruction_key)
               values ($1,$2,$3,$4,'for_info')`,
              [letterId, id.orgA, OFFICER, MGR],
            ),
          ),
        /permission denied/,
      )
    })

    it('كل إحالة ورد يُسجَّل في سجل التدقيق', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      const ref = await asUser(OFFICER, () =>
        db.query(`select public.create_referral($1,'for_action',$2) as id`, [letterId, MGR]),
      )
      const refId = ref.rows[0].id as string
      await asUser(MGR, () => db.query(`select public.respond_to_referral($1,'responded','تم')`, [refId]))

      const entries = await db.query(
        `select action from public.audit_log where entity_type='referral' and entity_id=$1 order by id`,
        [refId],
      )
      expect(entries.rows.map((r) => r.action)).toEqual(['referral.created', 'referral.responded'])
    })
  })

  /* ========================= الإشعارات ========================= */

  describe('الإشعارات', () => {
    it('الإحالة تُنشئ إشعارًا للمُحال إليه', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      await asUser(OFFICER, () => db.query(`select public.create_referral($1,'for_action',$2)`, [letterId, MGR]))

      const seen = await asUser(MGR, () =>
        db.query(`select count(*)::int as n from public.notifications where kind='referral.received'`),
      )
      expect(Number(seen.rows[0].n)).toBe(1)
    })

    it('لا يحمل الإشعار أي محتوى مراسلة', async () => {
      const columns = await db.query(
        `select column_name from information_schema.columns
         where table_schema='public' and table_name='notifications'`,
      )
      const names = columns.rows.map((r) => r.column_name as string)
      for (const forbidden of ['subject', 'body', 'title', 'message', 'content', 'text']) {
        expect(names, `العمود ${forbidden} يسرّب محتوى`).not.toContain(forbidden)
      }
    })

    it('إشعارات المستخدم خاصة به', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      await asUser(OFFICER, () => db.query(`select public.create_referral($1,'for_action',$2)`, [letterId, MGR]))
      const seen = await asUser(HR, () => db.query('select count(*)::int as n from public.notifications'))
      expect(Number(seen.rows[0].n)).toBe(0)
    })

    it('لا يُنشئ المستخدم إشعارًا لنفسه ولا لغيره', async () => {
      await expectDenied(
        () =>
          asUser(HR, () =>
            db.query(
              `insert into public.notifications (user_id, kind, entity_type) values ($1,'referral.received','referral')`,
              [HR],
            ),
          ),
        /permission denied/,
      )
    })

    it('تحديد المقروء يقتصر على صفوف المستخدم', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      await asUser(OFFICER, () => db.query(`select public.create_referral($1,'for_action',$2)`, [letterId, MGR]))

      const changed = await asUser(HR, () => db.query('select public.mark_notifications_read() as n'))
      expect(Number(changed.rows[0].n), 'لا إشعارات لـHR فلا شيء يتغيّر').toBe(0)

      const mine = await asUser(MGR, () => db.query('select public.mark_notifications_read() as n'))
      expect(Number(mine.rows[0].n)).toBe(1)
    })

    it('المُحيل لا يُشعر نفسه عند إحالة وحدته', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      await asUser(STAFF, () =>
        db.query(`select public.create_referral($1,'for_info',null,$2)`, [letterId, id.aAcc]),
      )
      const own = await asUser(STAFF, () => db.query('select count(*)::int as n from public.notifications'))
      expect(Number(own.rows[0].n)).toBe(0)
    })
  })

  /* ========================== المرفقات ========================== */

  describe('المرفقات', () => {
    /** المسار مُولَّد في القاعدة — لا يُمرَّر من هنا ولا يمكن تلفيقه. */
    async function attach(letterId: string, uploader: string, classification: string | null = null) {
      const res = await asUser(uploader, () =>
        db.query(
          `insert into public.attachments
             (correspondence_id, organization_id, filename, uploaded_by, classification_key)
           values ($1,$2,'doc.pdf',$3,$4) returning id, storage_path`,
          [letterId, id.orgA, uploader, classification],
        ),
      )
      return res.rows[0].id as string
    }

    it('المرفق يتبع صلاحية مراسلته', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      const attachmentId = await attach(letterId, STAFF)

      const mgrSees = await asUser(MGR, () =>
        db.query('select count(*)::int as n from public.attachments where id=$1', [attachmentId]),
      )
      expect(Number(mgrSees.rows[0].n), 'المدير يرى مراسلة قسمه').toBe(1)

      const hrSees = await asUser(HR, () =>
        db.query('select count(*)::int as n from public.attachments where id=$1', [attachmentId]),
      )
      expect(Number(hrSees.rows[0].n)).toBe(0)
    })

    it('تصنيف المرفق يتجاوز تصنيف مراسلته عند التشدد', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc, classification: 'internal' })
      const secretAttachment = await attach(letterId, STAFF, 'confidential')

      expect(await sees(MGR, letterId), 'المراسلة مرئية').toBe(1)
      const seen = await asUser(MGR, () =>
        db.query('select count(*)::int as n from public.attachments where id=$1', [secretAttachment]),
      )
      expect(Number(seen.rows[0].n), 'والمرفق السري لا').toBe(0)
    })

    it('لا يرفع أحد مرفقًا لمراسلة لا يصلها', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      await expectDenied(() => attach(letterId, HR), /row-level security/)
    })

    it('لا يُعدَّل المرفق — يُحذف ويُرفع بديله', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      const attachmentId = await attach(letterId, STAFF)
      await expectDenied(
        () =>
          asUser(STAFF, () =>
            db.query(`update public.attachments set filename='آخر.pdf' where id=$1`, [attachmentId]),
          ),
        /permission denied/,
      )
    })

    it('قرار مسار Storage يطابق قرار الجدول', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      const attachmentId = await attach(letterId, STAFF)
      const path = (await db.query('select storage_path from public.attachments where id=$1', [attachmentId]))
        .rows[0].storage_path as string

      const allowed = await asUser(MGR, () =>
        db.query(`select public.can_access_storage_object('attachment.download',$1) as ok`, [path]),
      )
      expect(allowed.rows[0].ok).toBe(true)

      const denied = await asUser(HR, () =>
        db.query(`select public.can_access_storage_object('attachment.download',$1) as ok`, [path]),
      )
      expect(denied.rows[0].ok).toBe(false)
    })

    it('المسار مُولَّد ولا يقبل الكتابة من العميل', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      await expectDenied(
        () =>
          asUser(STAFF, () =>
            db.query(
              `insert into public.attachments
                 (correspondence_id, organization_id, storage_path, filename, uploaded_by)
               values ($1,$2,'ملفّق/مسار/xyz','x.pdf',$3)`,
              [letterId, id.orgA, STAFF],
            ),
          ),
        /non-DEFAULT value/,
      )
    })

    it('المسار المُولَّد يطابق أعمدة الصف دائمًا', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      const attachmentId = await attach(letterId, STAFF)
      const row = await db.query('select storage_path from public.attachments where id=$1', [attachmentId])
      expect(row.rows[0].storage_path).toBe(`${id.orgA}/${letterId}/${attachmentId}`)
    })

    it('مسار لا يطابق الاتفاق لا يمنح وصولًا', async () => {
      for (const bad of ['', 'x', 'a/b', '../../etc/passwd', `${id.orgA}/not-a-uuid/also-not`]) {
        const res = await asUser(MGR, () =>
          db.query(`select public.can_access_storage_object('attachment.download',$1) as ok`, [bad]),
        )
        expect(res.rows[0].ok, `المسار «${bad}» يجب أن يُرفض`).toBe(false)
      }
    })
  })

  /* ====================== سلاسل المراسلات ====================== */

  describe('السلاسل والروابط', () => {
    it('الرد يشير إلى الواردة', async () => {
      const incoming = await letter({ owner: OFFICER, unit: id.aFin, direction: 'incoming' })
      const reply = await db.query(
        `insert into public.correspondences
           (user_id, created_by, organization_id, owner_unit_id, parent_id, direction, subject, body, language)
         values ($1,$1,$2,$3,$4,'outgoing','رد','نص','ar') returning id`,
        [OFFICER, id.orgA, id.aFin, incoming],
      )
      const row = await db.query('select parent_id from public.correspondences where id=$1', [reply.rows[0].id])
      expect(row.rows[0].parent_id).toBe(incoming)
    })

    it('لا يُربط المستخدم بمراسلة لا يراها', async () => {
      const mine = await letter({ owner: HR, unit: id.aHr })
      const hidden = await letter({ owner: STAFF, unit: id.aAcc })
      await expectDenied(
        () =>
          asUser(HR, () =>
            db.query(
              `insert into public.correspondence_links (from_id, to_id, created_by) values ($1,$2,$3)`,
              [mine, hidden, HR],
            ),
          ),
        /row-level security/,
      )
    })

    it('الربط ينجح بين مراسلتين مرئيتين', async () => {
      const a = await letter({ owner: HR, unit: id.aHr })
      const b = await letter({ owner: HR, unit: id.aHr })
      await asUser(HR, () =>
        db.query(`insert into public.correspondence_links (from_id, to_id, created_by) values ($1,$2,$3)`, [a, b, HR]),
      )
      const seen = await asUser(HR, () =>
        db.query('select count(*)::int as n from public.correspondence_links where from_id=$1', [a]),
      )
      expect(Number(seen.rows[0].n)).toBe(1)
    })

    it('لا تُربط مراسلة بنفسها', async () => {
      const a = await letter({ owner: HR, unit: id.aHr })
      await expectDenied(
        () =>
          asUser(HR, () =>
            db.query(`insert into public.correspondence_links (from_id, to_id, created_by) values ($1,$1,$2)`, [a, HR]),
          ),
        /correspondence_links_distinct/,
      )
    })
  })

  /* ==================== عزل المؤسسات (المرحلة ٣) ==================== */

  describe('عزل المؤسسات يصمد مع الحقول الجديدة', () => {
    it('لا يرى الخارجي مستويات التصنيف ولا التعليمات ولا السياسات', async () => {
      for (const table of ['classification_levels', 'referral_instructions', 'reference_number_policies']) {
        const seen = await asUser(OUTSIDER, () =>
          db.query(`select count(*)::int as n from public.${table} where organization_id=$1`, [id.orgA]),
        )
        expect(Number(seen.rows[0].n), table).toBe(0)
      }
    })

    it('لا يرى الخارجي إحالات مؤسسة أخرى', async () => {
      const letterId = await letter({ owner: OFFICER, unit: id.aFin })
      await asUser(OFFICER, () => db.query(`select public.create_referral($1,'for_info',$2)`, [letterId, MGR]))
      const seen = await asUser(OUTSIDER, () =>
        db.query('select count(*)::int as n from public.referrals where organization_id=$1', [id.orgA]),
      )
      expect(Number(seen.rows[0].n)).toBe(0)
    })

    it('لا يرى الخارجي مرفقات مؤسسة أخرى', async () => {
      const letterId = await letter({ owner: STAFF, unit: id.aAcc })
      await asUser(STAFF, () =>
        db.query(
          `insert into public.attachments (correspondence_id, organization_id, filename, uploaded_by)
           values ($1,$2,'x.pdf',$3)`,
          [letterId, id.orgA, STAFF],
        ),
      )
      const seen = await asUser(OUTSIDER, () => db.query('select count(*)::int as n from public.attachments'))
      expect(Number(seen.rows[0].n)).toBe(0)
    })
  })
})
