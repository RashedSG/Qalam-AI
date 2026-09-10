/**
 * المرحلة ٢ — اختبارات تكامل للتفويض على Postgres حقيقي.
 *
 * هذه هي الاختبارات التي لا يُغني عنها التحليل الساكن: قراءة ملف SQL لا تُثبت
 * أن مستخدمًا في مؤسسة (أ) لا يرى صفًا في مؤسسة (ب). الإثبات الوحيد هو
 * التنفيذ الفعلي بدور authenticated ومطالبات JWT حقيقية.
 *
 * تعمل فقط عند ضبط QALAM_TEST_DATABASE_URL — راجع docs/testing.md.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'

const CONNECTION = process.env.QALAM_TEST_DATABASE_URL
const suite = CONNECTION ? describe : describe.skip

/** مؤسسة (أ): جذر ← مالية ← حسابات، و«موارد بشرية» بجانب المالية. */
const OWNER = '0a000000-0000-4000-8000-000000000001' // مدير المؤسسة
const MGR = '0a000000-0000-4000-8000-000000000002' // مدير الإدارة المالية
const STAFF = '0a000000-0000-4000-8000-000000000003' // موظف في قسم الحسابات
const HR = '0a000000-0000-4000-8000-000000000004' // موظف في الموارد البشرية
/** مؤسسة (ب): مسؤول مراسلات بنطاق «المؤسسة كاملة». */
const OUTSIDER = '0b000000-0000-4000-8000-000000000001'

suite('التفويض المؤسسي — تكامل حقيقي', () => {
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
      /* معاملة مُجهضة — يتكفّل rollback بالاستعادة */
    }
  }

  /** عدد الصفوف المرئية لهذا المستخدم من هذا الاستعلام. */
  async function visible(userId: string, sql: string, params: unknown[] = []): Promise<number> {
    const res = await asUser(userId, () => db.query(sql, params))
    return Number(res.rows[0].n)
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

    // تنظيف أثر أي تشغيل سابق فاشل — البستر يجب أن يبدأ من حالة معروفة.
    const users = [OWNER, MGR, STAFF, HR, OUTSIDER]
    await db.query('delete from auth.users where id = any($1)', [users])
    await db.query(`delete from public.organizations where code in ('RBAC-A','RBAC-B')`)

    await db.query(
      `insert into auth.users (id,email)
       select v.id::uuid, v.id || '@rbac.test' from unnest($1::text[]) as v(id)`,
      [users],
    )

    // مؤسستان مستقلتان تمامًا.
    const orgA = await db.query(
      `insert into public.organizations (name,name_en,code) values ('مؤسسة أ','Org A','RBAC-A') returning id`,
    )
    const orgB = await db.query(
      `insert into public.organizations (name,name_en,code) values ('مؤسسة ب','Org B','RBAC-B') returning id`,
    )
    id.orgA = orgA.rows[0].id
    id.orgB = orgB.rows[0].id

    const unit = async (org: string, parent: string | null, code: string, kind: string) => {
      const res = await db.query(
        `insert into public.org_units (organization_id,parent_id,code,name_ar,kind)
         values ($1,$2,$3,$3,$4) returning id`,
        [org, parent, code, kind],
      )
      return res.rows[0].id as string
    }
    id.aRoot = await unit(id.orgA, null, 'A-ROOT', 'organization')
    id.aFin = await unit(id.orgA, id.aRoot, 'A-FIN', 'department')
    id.aAcc = await unit(id.orgA, id.aFin, 'A-ACC', 'section')
    id.aHr = await unit(id.orgA, id.aRoot, 'A-HR', 'department')
    id.bRoot = await unit(id.orgB, null, 'B-ROOT', 'organization')

    const roleId = async (key: string) => {
      const res = await db.query(`select id from public.roles where key=$1 and organization_id is null`, [key])
      return res.rows[0].id as string
    }
    const member = async (org: string, user: string, unitId: string, roles: string[]) => {
      const res = await db.query(
        `insert into public.memberships (organization_id,user_id,org_unit_id,status)
         values ($1,$2,$3,'active') returning id`,
        [org, user, unitId],
      )
      const membershipId = res.rows[0].id as string
      for (const key of roles) {
        await db.query(`insert into public.membership_roles (membership_id,role_id) values ($1,$2)`, [
          membershipId,
          await roleId(key),
        ])
      }
      return membershipId
    }

    id.mOwner = await member(id.orgA, OWNER, id.aRoot, ['organization_admin', 'employee'])
    id.mMgr = await member(id.orgA, MGR, id.aFin, ['manager', 'employee'])
    id.mStaff = await member(id.orgA, STAFF, id.aAcc, ['employee'])
    id.mHr = await member(id.orgA, HR, id.aHr, ['employee'])
    id.mOutsider = await member(id.orgB, OUTSIDER, id.bRoot, ['correspondence_officer', 'employee'])

    const letter = async (user: string, org: string | null, subject: string) => {
      const res = await db.query(
        `insert into public.correspondences (user_id,organization_id,subject,body,language)
         values ($1,$2,$3,'نص','ar') returning id`,
        [user, org, subject],
      )
      return res.rows[0].id as string
    }
    id.cOwner = await letter(OWNER, id.orgA, 'مراسلة المالك')
    id.cMgr = await letter(MGR, id.orgA, 'مراسلة المدير')
    id.cStaff = await letter(STAFF, id.orgA, 'مراسلة الموظف')
    id.cHr = await letter(HR, id.orgA, 'مراسلة الموارد البشرية')
    id.cOutsider = await letter(OUTSIDER, id.orgB, 'مراسلة المؤسسة ب')
    id.cOrphan = await letter(STAFF, null, 'مراسلة بلا مؤسسة')
  })

  afterAll(async () => {
    // ينجح فقط لأن audit_log بلا مفاتيح أجنبية: الحذف المتتالي كان سيصطدم
    // بمُشغّل «الإلحاق فقط» ويجعل حذف أي مؤسسة أو مستخدم مستحيلًا.
    await db.query('delete from auth.users where id = any($1)', [[OWNER, MGR, STAFF, HR, OUTSIDER]])
    await db.query('delete from public.organizations where id = any($1)', [[id.orgA, id.orgB]])
    await db.end()
  })

  beforeEach(() => db.query('begin'))
  afterEach(() => db.query('rollback'))

  const seesLetter = (user: string, letterId: string) =>
    visible(user, 'select count(*)::int as n from public.correspondences where id=$1', [letterId])

  /* ===================== انحدار: السلوك الشخصي لم يتغيّر ===================== */

  describe('انحدار — التطبيق الشخصي يعمل كما كان', () => {
    it('كل مستخدم يرى مراسلاته', async () => {
      expect(await seesLetter(STAFF, id.cStaff)).toBe(1)
      expect(await seesLetter(HR, id.cHr)).toBe(1)
    })

    it('موظف لا يرى مراسلات زميل في وحدة أخرى', async () => {
      expect(await seesLetter(HR, id.cStaff)).toBe(0)
      expect(await seesLetter(STAFF, id.cHr)).toBe(0)
    })

    it('صف بلا مؤسسة يبقى لمالكه وحده مهما كانت الأدوار', async () => {
      expect(await seesLetter(STAFF, id.cOrphan)).toBe(1)
      expect(await seesLetter(MGR, id.cOrphan), 'مديره لا يراه').toBe(0)
      expect(await seesLetter(OWNER, id.cOrphan), 'مدير المؤسسة لا يراه').toBe(0)
    })

    it('كل مستخدم يُنشئ مراسلاته فقط ولا ينتحل غيره', async () => {
      await expectDenied(
        () =>
          asUser(HR, () =>
            db.query(
              `insert into public.correspondences (user_id,organization_id,subject,body,language)
               values ($1,$2,'انتحال','نص','ar')`,
              [STAFF, id.orgA],
            ),
          ),
        /row-level security/,
      )
    })
  })

  /* ========================== نطاقات الأدوار ========================== */

  describe('نطاق الدور', () => {
    it('المدير يرى مراسلات وحدته وما تحتها', async () => {
      expect(await seesLetter(MGR, id.cStaff), 'قسم الحسابات تحت المالية').toBe(1)
    })

    it('المدير لا يرى وحدة شقيقة', async () => {
      expect(await seesLetter(MGR, id.cHr), 'الموارد البشرية ليست تحته').toBe(0)
    })

    it('المدير لا يرى أعلى منه في الشجرة', async () => {
      expect(await seesLetter(MGR, id.cOwner), 'الجذر فوق وحدته').toBe(0)
    })

    it('مدير المؤسسة يدير ولا يطّلع — لا يرى مراسلات أحد', async () => {
      expect(await seesLetter(OWNER, id.cStaff)).toBe(0)
      expect(await seesLetter(OWNER, id.cMgr)).toBe(0)
      expect(await seesLetter(OWNER, id.cHr)).toBe(0)
    })

    it('نطاق «المؤسسة» يرى كل مراسلات مؤسسته', async () => {
      const auditor = await db.query(`select id from public.roles where key='auditor' and organization_id is null`)
      await db.query(`insert into public.membership_roles (membership_id,role_id) values ($1,$2)`, [
        id.mHr,
        auditor.rows[0].id,
      ])
      expect(await seesLetter(HR, id.cStaff)).toBe(1)
      expect(await seesLetter(HR, id.cOwner)).toBe(1)
      // ولا يتجاوز حدود مؤسسته مع ذلك.
      expect(await seesLetter(HR, id.cOutsider)).toBe(0)
    })

    it('تعدد الأدوار يأخذ النطاق الأوسع لا الأضيق', async () => {
      const scope = await asUser(MGR, () =>
        db.query(`select public.permission_scope('correspondence.view',$1) as s`, [id.orgA]),
      )
      // manager يمنح descendants و employee يمنح own — الأوسع هو descendants.
      expect(scope.rows[0].s).toBe('descendants')
    })
  })

  /* ======================= عزل المؤسسات ======================= */

  describe('عزل المؤسسات — الضمان الأهم', () => {
    it('صاحب نطاق «المؤسسة كاملة» في (ب) لا يرى أي مراسلة في (أ)', async () => {
      expect(await seesLetter(OUTSIDER, id.cOwner)).toBe(0)
      expect(await seesLetter(OUTSIDER, id.cStaff)).toBe(0)
      expect(await visible(OUTSIDER, 'select count(*)::int as n from public.correspondences where organization_id=$1', [id.orgA])).toBe(0)
    })

    it('لا يرى المؤسسة الأخرى ولا هيكلها ولا أعضاءها', async () => {
      expect(await visible(OUTSIDER, 'select count(*)::int as n from public.organizations where id=$1', [id.orgA])).toBe(0)
      expect(await visible(OUTSIDER, 'select count(*)::int as n from public.org_units where organization_id=$1', [id.orgA])).toBe(0)
      expect(await visible(OUTSIDER, 'select count(*)::int as n from public.memberships where organization_id=$1', [id.orgA])).toBe(0)
    })

    it('لا يستطيع تعديل مراسلة في المؤسسة الأخرى', async () => {
      const res = await asUser(OUTSIDER, () =>
        db.query(`update public.correspondences set subject='مُخترَق' where id=$1`, [id.cStaff]),
      )
      expect(res.rowCount).toBe(0)
    })

    it('لا يستطيع إضافة عضو إلى المؤسسة الأخرى', async () => {
      await expectDenied(
        () =>
          asUser(OUTSIDER, () =>
            db.query(
              `insert into public.memberships (organization_id,user_id,org_unit_id,status)
               values ($1,$2,$3,'active')`,
              [id.orgA, OUTSIDER, id.aRoot],
            ),
          ),
        /row-level security/,
      )
    })

    it('لا يستطيع نقل وحدة تنظيمية عبر حدود المؤسسات', async () => {
      await expectDenied(
        () =>
          db.query(`insert into public.org_units (organization_id,parent_id,code,name_ar) values ($1,$2,'X','X')`, [
            id.orgB,
            id.aFin,
          ]),
        /same organization/,
      )
    })
  })

  /* ==================== إدارة المستخدمين والأدوار ==================== */

  describe('إدارة المستخدمين', () => {
    it('موظف عادي يرى عضويته فقط', async () => {
      expect(await visible(STAFF, 'select count(*)::int as n from public.memberships where organization_id=$1', [id.orgA])).toBe(1)
    })

    it('صاحب users.manage يرى كل أعضاء مؤسسته', async () => {
      expect(await visible(OWNER, 'select count(*)::int as n from public.memberships where organization_id=$1', [id.orgA])).toBe(4)
    })

    it('موظف عادي لا يستطيع إضافة عضو ولا تعطيل غيره', async () => {
      await expectDenied(
        () =>
          asUser(STAFF, () =>
            db.query(
              `insert into public.memberships (organization_id,user_id,org_unit_id,status)
               values ($1,$2,$3,'active')`,
              [id.orgA, OUTSIDER, id.aRoot],
            ),
          ),
        /row-level security/,
      )
      const res = await asUser(STAFF, () =>
        db.query(`update public.memberships set status='inactive' where id=$1`, [id.mMgr]),
      )
      expect(res.rowCount).toBe(0)
    })

    it('موظف عادي لا يستطيع منح نفسه دورًا', async () => {
      await expectDenied(
        () =>
          asUser(STAFF, () =>
            db.query(
              `insert into public.membership_roles (membership_id,role_id)
               select $1, id from public.roles where key='auditor' and organization_id is null`,
              [id.mStaff],
            ),
          ),
        /row-level security/,
      )
    })
  })

  describe('منع تصعيد الامتياز', () => {
    it('صاحب roles.manage لا يوسّع صلاحيات دور نظام', async () => {
      const res = await asUser(OWNER, () =>
        db.query(
          `update public.role_permissions set scope='organization'
           where role_id=(select id from public.roles where key='employee' and organization_id is null)
             and permission_key='correspondence.view'`,
        ),
      )
      expect(res.rowCount, 'أدوار النظام غير قابلة للتعديل').toBe(0)
    })

    it('صاحب roles.manage لا يعدّل دور نظام نفسه', async () => {
      const res = await asUser(OWNER, () =>
        db.query(`update public.roles set name_ar='مُخترَق' where key='employee' and organization_id is null`),
      )
      expect(res.rowCount).toBe(0)
    })

    it('لا أحد يعدّل فهرس الصلاحيات', async () => {
      await expectDenied(
        () => asUser(OWNER, () => db.query(`update public.permissions set key='x' where key='ai.use'`)),
        /permission denied/,
      )
    })

    it('منح الذات ممكن لصاحب roles.manage — لكنه مُسجَّل ومُعلَّم', async () => {
      // حدّ متأصل في RBAC: من يدير الأدوار يملكها. الضمان هو عدم قابلية الإنكار.
      const auditor = await db.query(`select id from public.roles where key='auditor' and organization_id is null`)
      await asUser(OWNER, () =>
        db.query(`insert into public.membership_roles (membership_id,role_id) values ($1,$2)`, [
          id.mOwner,
          auditor.rows[0].id,
        ]),
      )
      const entry = await db.query(
        `select action, actor_id, metadata from public.audit_log
         where entity_id=$1 and action='role.granted' order by id desc limit 1`,
        [id.mOwner],
      )
      expect(entry.rows[0].actor_id).toBe(OWNER)
      expect(entry.rows[0].metadata.self_grant, 'منح الذات يُعلَّم صراحةً').toBe(true)
    })
  })

  /* ==================== دورة حياة العضوية والمؤسسة ==================== */

  describe('دورة الحياة', () => {
    it('تعطيل العضوية يُنهي الوصول المُستمَد من الدور فورًا', async () => {
      expect(await seesLetter(MGR, id.cStaff)).toBe(1)
      await db.query(`update public.memberships set status='inactive' where id=$1`, [id.mMgr])
      expect(await seesLetter(MGR, id.cStaff)).toBe(0)
      expect(await seesLetter(MGR, id.cMgr), 'ويبقى يرى مراسلاته هو').toBe(1)
    })

    it('العضوية المدعوّة لا تمنح شيئًا قبل تفعيلها', async () => {
      await db.query(`update public.memberships set status='invited' where id=$1`, [id.mMgr])
      expect(await seesLetter(MGR, id.cStaff)).toBe(0)
    })

    it('تعليق المؤسسة يُنهي كل الوصول المُستمَد منها', async () => {
      await db.query(`update public.organizations set status='suspended' where id=$1`, [id.orgA])
      expect(await seesLetter(MGR, id.cStaff)).toBe(0)
      expect(await seesLetter(MGR, id.cMgr), 'الملكية تبقى').toBe(1)
    })

    it('نقل موظف بين الوحدات ينقل معه نطاق رؤيته', async () => {
      expect(await seesLetter(MGR, id.cHr)).toBe(0)
      await db.query(`update public.memberships set org_unit_id=$1 where id=$2`, [id.aFin, id.mHr])
      expect(await seesLetter(MGR, id.cHr), 'صار تحت المالية').toBe(1)
    })
  })

  /* ========================= شجرة الوحدات ========================= */

  describe('الهيكل التنظيمي', () => {
    it('يُصان المسار والعمق تلقائيًا', async () => {
      const res = await db.query('select code, depth, path from public.org_units where id=$1', [id.aAcc])
      expect(res.rows[0].depth).toBe(2)
      expect(res.rows[0].path).toBe(`/${id.aRoot}/${id.aFin}/${id.aAcc}`)
    })

    it('نقل عقدة يُعيد بناء مسارات أحفادها', async () => {
      await db.query(`update public.org_units set parent_id=$1 where id=$2`, [id.aHr, id.aFin])
      const res = await db.query('select depth, path from public.org_units where id=$1', [id.aAcc])
      expect(res.rows[0].path).toBe(`/${id.aRoot}/${id.aHr}/${id.aFin}/${id.aAcc}`)
      expect(res.rows[0].depth).toBe(3)
    })

    it('تُمنع الحلقات', async () => {
      await expectDenied(
        () => db.query(`update public.org_units set parent_id=$1 where id=$2`, [id.aAcc, id.aFin]),
        /own ancestor/,
      )
    })

    it('موظف عادي لا يعدّل الهيكل', async () => {
      const res = await asUser(STAFF, () =>
        db.query(`update public.org_units set name_ar='مُخترَق' where id=$1`, [id.aFin]),
      )
      expect(res.rowCount).toBe(0)
    })
  })

  /* ========================== سجل التدقيق ========================== */

  describe('سجل التدقيق', () => {
    it('يُسجَّل إسناد الأدوار تلقائيًا بلا تدخل من التطبيق', async () => {
      const before = await db.query('select count(*)::int as n from public.audit_log')
      const viewer = await db.query(`select id from public.roles where key='viewer' and organization_id is null`)
      await db.query(`insert into public.membership_roles (membership_id,role_id) values ($1,$2)`, [
        id.mStaff,
        viewer.rows[0].id,
      ])
      const after = await db.query('select count(*)::int as n from public.audit_log')
      expect(after.rows[0].n).toBeGreaterThan(before.rows[0].n)
    })

    it('يُسجَّل تعطيل العضوية مع الحالة السابقة والجديدة', async () => {
      await db.query(`update public.memberships set status='inactive' where id=$1`, [id.mStaff])
      const entry = await db.query(
        `select previous_status, new_status, action from public.audit_log
         where entity_id=$1 and action='membership.status_changed' order by id desc limit 1`,
        [id.mStaff],
      )
      expect(entry.rows[0].previous_status).toBe('active')
      expect(entry.rows[0].new_status).toBe('inactive')
    })

    it('السجل لا يقبل تعديلًا ولا حذفًا — حتى من مالك الجدول', async () => {
      await expectDenied(() => db.query(`update public.audit_log set action='مُزوَّر'`), /append-only/)
      await expectDenied(() => db.query(`delete from public.audit_log`), /append-only/)
    })

    it('لا يكتب فيه المستخدم مباشرة', async () => {
      await expectDenied(
        () => asUser(OWNER, () => db.query(`insert into public.audit_log (action,entity_type) values ('x','y')`)),
        /permission denied/,
      )
    })

    it('record_audit تأخذ الفاعل من الجلسة لا من الوسائط', async () => {
      await asUser(STAFF, () => db.query(`select public.record_audit('test.action','entity')`))
      const entry = await db.query(`select actor_id from public.audit_log order by id desc limit 1`)
      expect(entry.rows[0].actor_id).toBe(STAFF)
    })

    it('قراءة السجل تتطلب audit.view', async () => {
      expect(await visible(STAFF, 'select count(*)::int as n from public.audit_log where organization_id=$1', [id.orgA])).toBe(0)
      expect(
        await visible(OWNER, 'select count(*)::int as n from public.audit_log where organization_id=$1', [id.orgA]),
      ).toBeGreaterThan(0)
    })

    it('لا يرى مدقق مؤسسة سجل مؤسسة أخرى', async () => {
      expect(await visible(OWNER, 'select count(*)::int as n from public.audit_log where organization_id=$1', [id.orgB])).toBe(0)
    })

    it('السجل يبقى بعد حذف ما يوثّقه — ولا يمنع الحذف', async () => {
      // انحدار مُثبَت: مفتاح أجنبي هنا يجعل الحذف المتتالي UPDATE/DELETE على
      // جدول لا يقبلهما، فينكسر delete_my_account().
      const fks = await db.query(
        `select count(*)::int as n from information_schema.table_constraints
         where table_schema='public' and table_name='audit_log' and constraint_type='FOREIGN KEY'`,
      )
      expect(fks.rows[0].n, 'audit_log يجب أن يبقى بلا مفاتيح أجنبية').toBe(0)

      const tmp = '0c000000-0000-4000-8000-0000000000ff'
      await db.query(`insert into auth.users (id,email) values ($1,'tmp@rbac.test')`, [tmp])
      await db.query(
        `insert into public.memberships (organization_id,user_id,org_unit_id,status)
         values ($1,$2,$3,'active')`,
        [id.orgA, tmp, id.aRoot],
      )
      const before = await db.query('select count(*)::int as n from public.audit_log')

      await asUser(tmp, () => db.query('select public.delete_my_account()'))

      expect((await db.query('select count(*)::int as n from auth.users where id=$1', [tmp])).rows[0].n).toBe(0)
      const after = await db.query('select count(*)::int as n from public.audit_log')
      expect(after.rows[0].n, 'أثر الحذف نفسه يُسجَّل ولا يُمحى شيء').toBeGreaterThanOrEqual(before.rows[0].n)
    })

    it('لا يُخزَّن نص مراسلة في السجل', async () => {
      const columns = await db.query(
        `select column_name from information_schema.columns
         where table_schema='public' and table_name='audit_log'`,
      )
      const names = columns.rows.map((r) => r.column_name as string)
      for (const forbidden of ['body', 'subject', 'content', 'text', 'prompt']) {
        expect(names).not.toContain(forbidden)
      }
    })
  })
})
