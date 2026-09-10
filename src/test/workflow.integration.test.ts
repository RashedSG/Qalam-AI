/**
 * المرحلة ٤ — سير العمل والاعتماد والتوقيع والتفويض، على Postgres حقيقي.
 *
 * بوابة المرحلة تنص على ثلاثة اختبارات سلبية بعينها، وهي أول ما يُفحص هنا:
 *   موظف → اعتماد            يجب أن تفشل
 *   مراجع → توقيع بلا صلاحية  يجب أن تفشل
 *   مؤسسة أ → اعتماد في ب     يجب أن تفشل
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Client } from 'pg'

const CONNECTION = process.env.QALAM_TEST_DATABASE_URL
const suite = CONNECTION ? describe : describe.skip

const AUTHOR = '0f000000-0000-4000-8000-000000000001' // موظف — يكتب فقط
const REVIEWER = '0f000000-0000-4000-8000-000000000002' // مراجع
const APPROVER = '0f000000-0000-4000-8000-000000000003' // معتمِد
const SIGNER = '0f000000-0000-4000-8000-000000000004' // مخوَّل بالتوقيع
const OFFICER = '0f000000-0000-4000-8000-000000000005' // مسؤول مراسلات (إصدار)
const OUTSIDER = '0f100000-0000-4000-8000-000000000001' // مؤسسة أخرى

suite('سير العمل والاعتماد — تكامل حقيقي', () => {
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

  const move = (user: string, letterId: string, to: string, comment = '') =>
    asUser(user, () =>
      db.query('select public.transition_correspondence($1,$2,$3) as s', [letterId, to, comment]),
    )

  const statusOf = async (letterId: string): Promise<string> =>
    (await db.query('select current_status from public.correspondences where id=$1', [letterId])).rows[0]
      .current_status as string

  beforeAll(async () => {
    db = new Client({ connectionString: CONNECTION })
    await db.connect()

    const users = [AUTHOR, REVIEWER, APPROVER, SIGNER, OFFICER, OUTSIDER]
    await db.query('delete from auth.users where id = any($1)', [users])
    await db.query(`delete from public.organizations where code in ('P4A','P4B')`)
    await db.query(
      `insert into auth.users (id,email) select v.id::uuid, v.id || '@p4.test' from unnest($1::text[]) as v(id)`,
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
    id.orgA = await org('P4A')
    id.orgB = await org('P4B')

    const unit = async (orgId: string, code: string) =>
      (
        await db.query(
          `insert into public.org_units (organization_id,code,name_ar,kind)
           values ($1,$2,$2,'organization') returning id`,
          [orgId, code],
        )
      ).rows[0].id as string
    id.aRoot = await unit(id.orgA, 'P4-ROOT')
    id.bRoot = await unit(id.orgB, 'P4-BROOT')

    const member = async (orgId: string, user: string, unitId: string, roles: string[]) => {
      const res = await db.query(
        `insert into public.memberships (organization_id,user_id,org_unit_id,status,clearance_rank)
         values ($1,$2,$3,'active',3) returning id`,
        [orgId, user, unitId],
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
    id.mAuthor = await member(id.orgA, AUTHOR, id.aRoot, ['employee'])
    id.mReviewer = await member(id.orgA, REVIEWER, id.aRoot, ['reviewer', 'employee'])
    id.mApprover = await member(id.orgA, APPROVER, id.aRoot, ['approver', 'employee'])
    id.mSigner = await member(id.orgA, SIGNER, id.aRoot, ['signatory', 'employee'])
    id.mOfficer = await member(id.orgA, OFFICER, id.aRoot, ['correspondence_officer', 'employee'])
    id.mOutsider = await member(id.orgB, OUTSIDER, id.bRoot, ['approver', 'correspondence_officer', 'employee'])
  })

  afterAll(async () => {
    await db.query('delete from auth.users where id = any($1)', [
      [AUTHOR, REVIEWER, APPROVER, SIGNER, OFFICER, OUTSIDER],
    ])
    await db.query('delete from public.organizations where id = any($1)', [[id.orgA, id.orgB]])
    await db.end()
  })

  beforeEach(() => db.query('begin'))
  afterEach(() => db.query('rollback'))

  async function letter(status = 'draft', owner = AUTHOR, org = 'orgA'): Promise<string> {
    const res = await db.query(
      `insert into public.correspondences
         (user_id, created_by, organization_id, owner_unit_id, classification_key,
          direction, current_status, subject, body, language)
       values ($1,$1,$2,$3,'internal','outgoing',$4::public.qalam_correspondence_status,'موضوع','النص','ar')
       returning id`,
      [owner, id[org], org === 'orgA' ? id.aRoot : id.bRoot, status],
    )
    return res.rows[0].id as string
  }

  /* ================= بوابة المرحلة — الاختبارات الثلاثة المنصوص عليها ================= */

  describe('بوابة المرحلة', () => {
    it('موظف → اعتماد: تفشل', async () => {
      const letterId = await letter('in_approval')
      await expectDenied(() => move(AUTHOR, letterId, 'approved'), /not permitted to perform this transition/)
      expect(await statusOf(letterId)).toBe('in_approval')
    })

    it('مراجع → توقيع بلا صلاحية توقيع: تفشل', async () => {
      const letterId = await letter('approved')
      await expectDenied(() => move(REVIEWER, letterId, 'signed'), /not permitted to perform this transition/)
      await expectDenied(
        () => asUser(REVIEWER, () => db.query('select public.sign_correspondence($1)', [letterId])),
        /not permitted to perform this transition/,
      )
      expect(await statusOf(letterId)).toBe('approved')
    })

    it('مؤسسة (ب) → اعتماد مراسلة في (أ): تفشل', async () => {
      const letterId = await letter('in_approval')
      await expectDenied(() => move(OUTSIDER, letterId, 'approved'), /not permitted to perform this transition/)
      expect(await statusOf(letterId)).toBe('in_approval')
    })
  })

  /* ========================== آلة الحالة ========================== */

  describe('آلة الحالة', () => {
    it('الدورة الكاملة تمر بكل مرحلة', async () => {
      const letterId = await letter('draft')
      await move(REVIEWER, letterId, 'in_review')
      expect(await statusOf(letterId)).toBe('in_review')
      await move(REVIEWER, letterId, 'in_approval')
      await move(APPROVER, letterId, 'approved')
      expect(await statusOf(letterId)).toBe('approved')
      await asUser(SIGNER, () => db.query('select public.sign_correspondence($1)', [letterId]))
      expect(await statusOf(letterId)).toBe('signed')
      await move(OFFICER, letterId, 'issued')
      expect(await statusOf(letterId)).toBe('issued')
    })

    it('انتقال غير معرّف يُرفض ولو ملك الفاعل كل الصلاحيات', async () => {
      const letterId = await letter('draft')
      // القفز من المسودة إلى الاعتماد يتخطى المراجعة.
      await expectDenied(() => move(OFFICER, letterId, 'approved'), /is not allowed/)
      await expectDenied(() => move(OFFICER, letterId, 'signed'), /is not allowed/)
    })

    it('حالة غير موجودة تُرفض', async () => {
      const letterId = await letter('draft')
      await expectDenied(() => move(REVIEWER, letterId, 'مُعتمدة'), /unknown status/)
    })

    it('الإعادة والرفض يلزمهما تعليق', async () => {
      const letterId = await letter('in_review')
      await expectDenied(() => move(REVIEWER, letterId, 'returned'), /requires a comment/)
      await move(REVIEWER, letterId, 'returned', 'ينقص المرفق')
      expect(await statusOf(letterId)).toBe('returned')
    })

    it('الانتقال إلى نفس الحالة لا يُعد خطأ', async () => {
      const letterId = await letter('in_review')
      const res = await move(REVIEWER, letterId, 'in_review')
      expect(res.rows[0].s).toBe('in_review')
    })

    it('مراسلة بلا مؤسسة لا تدخل سير العمل', async () => {
      const res = await db.query(
        `insert into public.correspondences (user_id, created_by, subject, body, language)
         values ($1,$1,'شخصية','نص','ar') returning id`,
        [AUTHOR],
      )
      await expectDenied(
        () => move(AUTHOR, res.rows[0].id, 'in_review'),
        /has no organization/,
      )
    })

    it('الأرشفة تضبط is_archived معًا', async () => {
      const letterId = await letter('closed')
      await move(OFFICER, letterId, 'archived')
      const row = await db.query('select current_status, is_archived from public.correspondences where id=$1', [letterId])
      expect(row.rows[0].current_status).toBe('archived')
      expect(row.rows[0].is_archived).toBe(true)
    })
  })

  /* ==================== حماية عمود الحالة ==================== */

  describe('حماية عمود الحالة', () => {
    it('لا يُغيَّر بتحديث مباشر — صلاحية العمود مسحوبة', async () => {
      const letterId = await letter('draft')
      await expectDenied(
        () =>
          asUser(AUTHOR, () =>
            db.query(`update public.correspondences set current_status='approved' where id=$1`, [letterId]),
          ),
        /permission denied|must go through transition_correspondence/,
      )
      expect(await statusOf(letterId)).toBe('draft')
    })

    it('المالك نفسه لا يعتمد مراسلته بلا صلاحية', async () => {
      const letterId = await letter('in_approval', AUTHOR)
      // كتابة المراسلة لا تمنح اعتمادها — وهذا جوهر الفصل.
      await expectDenied(() => move(AUTHOR, letterId, 'approved'), /not permitted/)
    })
  })

  /* ================= النسخة المعتمدة لا تُعدَّل ================= */

  describe('النسخة المعتمدة', () => {
    it('لا يُعدَّل نص مراسلة معتمدة في مكانه', async () => {
      const letterId = await letter('approved')
      await expectDenied(
        () =>
          asUser(AUTHOR, () =>
            db.query(`update public.correspondences set body='نص آخر' where id=$1`, [letterId]),
          ),
        /approved content is immutable/,
      )
    })

    it('التنقيح يحفظ المعتمد إصدارًا ويعيد الدورة إلى مسودة', async () => {
      const letterId = await letter('approved')
      await asUser(AUTHOR, () =>
        db.query('select public.revise_correspondence($1,$2,$3,$4)', [
          letterId, 'موضوع منقّح', 'نص منقّح', 'تصحيح رقم',
        ]),
      )

      expect(await statusOf(letterId)).toBe('draft')
      const row = await db.query('select subject, body from public.correspondences where id=$1', [letterId])
      expect(row.rows[0].body).toBe('نص منقّح')

      const versions = await db.query(
        `select body, variant_kind from public.correspondence_versions
         where correspondence_id=$1 order by created_at desc limit 1`,
        [letterId],
      )
      expect(versions.rows[0].body, 'النص المعتمد محفوظ').toBe('النص')
      expect(versions.rows[0].variant_kind).toBe('approved')
    })

    it('التنقيح يلزمه سبب', async () => {
      const letterId = await letter('approved')
      await expectDenied(
        () =>
          asUser(AUTHOR, () =>
            db.query('select public.revise_correspondence($1,$2,$3,$4)', [letterId, 'س', 'ن', '  ']),
          ),
        /revision reason is required/,
      )
    })

    it('نص المسودة يُعدَّل بحرية', async () => {
      const letterId = await letter('draft')
      await asUser(AUTHOR, () =>
        db.query(`update public.correspondences set body='تعديل عادي' where id=$1`, [letterId]),
      )
      const row = await db.query('select body from public.correspondences where id=$1', [letterId])
      expect(row.rows[0].body).toBe('تعديل عادي')
    })
  })

  /* ========================== التوقيع ========================== */

  describe('التوقيع', () => {
    it('لا يُوقَّع إلا المعتمد', async () => {
      const letterId = await letter('in_review')
      await expectDenied(
        () => asUser(SIGNER, () => db.query('select public.sign_correspondence($1)', [letterId])),
        /only approved correspondence can be signed/,
      )
    })

    it('التوقيع يسجّل الموقّع وبصمة ما وقّع عليه', async () => {
      const letterId = await letter('approved')
      await asUser(SIGNER, () => db.query('select public.sign_correspondence($1)', [letterId]))

      const sig = await db.query('select * from public.signatures where correspondence_id=$1', [letterId])
      expect(sig.rows[0].signer_id).toBe(SIGNER)
      expect(sig.rows[0].method).toBe('internal_workflow')
      // بصمة sha256 — تُثبت أي نص وُقّع، فلا يُدَّعى توقيع نص آخر لاحقًا.
      expect(sig.rows[0].content_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(sig.rows[0].provider, 'لا مزوّد خارجي — ليس توقيعًا مؤهَّلًا قانونيًا').toBeNull()
    })

    it('التوقيع لا يُعدَّل إطلاقًا ولا يحذفه مستخدم', async () => {
      const letterId = await letter('approved')
      await asUser(SIGNER, () => db.query('select public.sign_correspondence($1)', [letterId]))

      // التعديل ممنوع حتى من مالك الجدول: توقيع قابل للتغيير ليس توقيعًا.
      await expectDenied(() => db.query(`update public.signatures set signer_id=$1`, [AUTHOR]), /immutable/)

      // الحذف ممنوع على المستخدم بسحب الصلاحية، لا بمُشغّل — فمُشغّل الحذف
      // كان سيمنع الحذف المتتالي ويجعل حذف المراسلة أو الحساب مستحيلًا.
      await expectDenied(
        () => asUser(SIGNER, () => db.query('delete from public.signatures where correspondence_id=$1', [letterId])),
        /permission denied/,
      )
      const still = await db.query('select count(*)::int as n from public.signatures where correspondence_id=$1', [letterId])
      expect(Number(still.rows[0].n)).toBe(1)
    })

    it('حذف المراسلة يُزيل توقيعها ولا يتعطّل', async () => {
      // انحدار مُثبَت: مُشغّل يرفض الحذف يشلّ كل حذف متتالٍ.
      const letterId = await letter('approved')
      await asUser(SIGNER, () => db.query('select public.sign_correspondence($1)', [letterId]))
      await db.query('delete from public.correspondences where id=$1', [letterId])
      const left = await db.query('select count(*)::int as n from public.signatures where correspondence_id=$1', [letterId])
      expect(Number(left.rows[0].n)).toBe(0)
    })
  })

  /* ======================= فصل المهام ======================= */

  describe('فصل المهام', () => {
    const enableSoD = () =>
      db.query(
        `update public.organizations
            set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{separation_of_duties}',
                  '{"creator_not_approver": true, "reviewer_not_signatory": true}')
          where id = $1`,
        [id.orgA],
      )

    it('مُطفأة افتراضيًا — لا تغيير سلوك على التثبيت القائم', async () => {
      const letterId = await letter('in_approval', APPROVER)
      // المعتمِد يعتمد مراسلته هو، والسياسة مُطفأة فيمر.
      await move(APPROVER, letterId, 'approved')
      expect(await statusOf(letterId)).toBe('approved')
    })

    it('عند التفعيل: من أعدّ المراسلة لا يعتمدها', async () => {
      await enableSoD()
      const letterId = await letter('in_approval', APPROVER)
      await expectDenied(() => move(APPROVER, letterId, 'approved'), /creator_not_approver/)
    })

    it('عند التفعيل: معتمِد آخر يمر', async () => {
      await enableSoD()
      const letterId = await letter('in_approval', AUTHOR)
      await move(APPROVER, letterId, 'approved')
      expect(await statusOf(letterId)).toBe('approved')
    })

    it('عند التفعيل: من راجعها لا يوقّعها', async () => {
      await enableSoD()
      // نمنح المراجع صلاحية التوقيع أيضًا لنعزل أثر السياسة عن أثر الصلاحية.
      await db.query(
        `insert into public.membership_roles (membership_id, role_id)
         select $1, id from public.roles where key='signatory' and organization_id is null`,
        [id.mReviewer],
      )
      const letterId = await letter('draft')
      await move(REVIEWER, letterId, 'in_review')
      await move(REVIEWER, letterId, 'in_approval')
      await move(APPROVER, letterId, 'approved')

      await expectDenied(() => move(REVIEWER, letterId, 'signed'), /reviewer_not_signatory/)
      // وموقّع لم يراجع يمر.
      await move(SIGNER, letterId, 'signed')
      expect(await statusOf(letterId)).toBe('signed')
    })
  })

  /* ======================== التفويض ======================== */

  describe('التفويض', () => {
    const delegate = (from: string, to: string, perms: string[], days = 7, unit: string | null = null) =>
      asUser(from, () =>
        db.query(`select public.create_delegation($1,$2,now() + ($3 || ' days')::interval,$4,null,'إجازة') as id`, [
          to, perms, String(days), unit,
        ]),
      )

    it('يمنح المفوَّض إليه صلاحية لم يكن يملكها', async () => {
      const letterId = await letter('in_approval')
      await expectDenied(() => move(REVIEWER, letterId, 'approved'), /not permitted/)

      await delegate(APPROVER, REVIEWER, ['correspondence.approve'])
      await move(REVIEWER, letterId, 'approved')
      expect(await statusOf(letterId)).toBe('approved')
    })

    it('لا يفوّض أحد ما لا يملك', async () => {
      await expectDenied(
        () => delegate(AUTHOR, REVIEWER, ['correspondence.approve']),
        /do not hold the permission/,
      )
    })

    it('ينتهي بنفسه — لا يعتمد على أحد ليُلغيه', async () => {
      const letterId = await letter('in_approval')
      const res = await delegate(APPROVER, REVIEWER, ['correspondence.approve'])
      const delegationId = res.rows[0].id as string

      // نُزيح المدة كلها إلى الماضي — تعديل النهاية وحدها يخرق قيد ends_at > starts_at.
      await db.query(
        `update public.delegations
            set starts_at = now() - interval '2 days', ends_at = now() - interval '1 hour'
          where id = $1`,
        [delegationId],
      )
      await expectDenied(() => move(REVIEWER, letterId, 'approved'), /not permitted/)
    })

    it('لا يسري قبل موعد بدايته', async () => {
      const letterId = await letter('in_approval')
      const res = await asUser(APPROVER, () =>
        db.query(
          `select public.create_delegation($1,$2,now() + interval '10 days',null,now() + interval '2 days','لاحقًا') as id`,
          [REVIEWER, ['correspondence.approve']],
        ),
      )
      expect(res.rows[0].id).toBeTruthy()
      await expectDenied(() => move(REVIEWER, letterId, 'approved'), /not permitted/)
    })

    it('يسقط فورًا إن فقد المفوِّض صلاحيته', async () => {
      const letterId = await letter('in_approval')
      await delegate(APPROVER, REVIEWER, ['correspondence.approve'])

      // نسحب دور المعتمِد من المفوِّض — يجب أن يسقط التفويض في اللحظة نفسها.
      await db.query(
        `delete from public.membership_roles mr using public.roles r
         where mr.role_id = r.id and mr.membership_id = $1 and r.key = 'approver'`,
        [id.mApprover],
      )
      await expectDenied(() => move(REVIEWER, letterId, 'approved'), /not permitted/)
    })

    it('الإلغاء يُنهيه فورًا', async () => {
      const letterId = await letter('in_approval')
      const res = await delegate(APPROVER, REVIEWER, ['correspondence.approve'])
      await asUser(APPROVER, () => db.query('select public.revoke_delegation($1)', [res.rows[0].id]))
      await expectDenied(() => move(REVIEWER, letterId, 'approved'), /not permitted/)
    })

    it('لا يُلغي التفويضَ غريبٌ عنه', async () => {
      const res = await delegate(APPROVER, REVIEWER, ['correspondence.approve'])
      await expectDenied(
        () => asUser(AUTHOR, () => db.query('select public.revoke_delegation($1)', [res.rows[0].id])),
        /not permitted to revoke/,
      )
    })

    it('لا تفويض بلا نهاية ولا لأكثر من سنة', async () => {
      await expectDenied(
        () =>
          asUser(APPROVER, () =>
            db.query(`select public.create_delegation($1,$2,null)`, [REVIEWER, ['correspondence.approve']]),
          ),
        /needs an end date/,
      )
      await expectDenied(() => delegate(APPROVER, REVIEWER, ['correspondence.approve'], 400), /exceed one year/)
    })

    it('لا تفويض للنفس ولا لخارج المؤسسة', async () => {
      await expectDenied(
        () => delegate(APPROVER, APPROVER, ['correspondence.approve']),
        /cannot delegate to yourself/,
      )
      await expectDenied(
        () => delegate(APPROVER, OUTSIDER, ['correspondence.approve']),
        /not an active member of your organization/,
      )
    })

    it('التفويض المحصور بوحدة لا يمنح نطاق المؤسسة', async () => {
      // مسؤول المراسلات نطاقه المؤسسة كاملة؛ التفويض المحصور يخفضه.
      const res = await asUser(OFFICER, () =>
        db.query(
          `select public.create_delegation($1,$2,now() + interval '7 days',$3,null,'محصور') as id`,
          [AUTHOR, ['correspondence.view'], id.aRoot],
        ),
      )
      expect(res.rows[0].id).toBeTruthy()

      const scope = await asUser(AUTHOR, () =>
        db.query(`select public.permission_scope('correspondence.view',$1) as s`, [id.orgA]),
      )
      expect(scope.rows[0].s, 'لا يتجاوز descendants').not.toBe('organization')
    })

    it('لا يُنشئ أحد تفويضًا بكتابة مباشرة', async () => {
      await expectDenied(
        () =>
          asUser(AUTHOR, () =>
            db.query(
              `insert into public.delegations (organization_id, delegator_id, delegate_id, ends_at)
               values ($1,$2,$3, now() + interval '1 day')`,
              [id.orgA, APPROVER, AUTHOR],
            ),
          ),
        /permission denied/,
      )
    })

    it('التفويض مرئي لطرفيه فقط', async () => {
      await delegate(APPROVER, REVIEWER, ['correspondence.approve'])
      for (const [user, expected] of [
        [APPROVER, 1],
        [REVIEWER, 1],
        [SIGNER, 0],
      ] as const) {
        const seen = await asUser(user, () => db.query('select count(*)::int as n from public.delegations'))
        expect(Number(seen.rows[0].n), `المستخدم ${user}`).toBe(expected)
      }
    })
  })

  /* ==================== السجل والانتقالات المتاحة ==================== */

  describe('السجل والانتقالات المتاحة', () => {
    it('كل انتقال يُسجَّل بمن ومن أين إلى أين', async () => {
      const letterId = await letter('draft')
      await move(REVIEWER, letterId, 'in_review')
      await move(REVIEWER, letterId, 'returned', 'ينقص المرفق')

      const log = await db.query(
        `select actor_id, from_status, to_status, comment
         from public.correspondence_transitions where correspondence_id=$1 order by created_at`,
        [letterId],
      )
      expect(log.rows).toHaveLength(2)
      expect(log.rows[1].actor_id).toBe(REVIEWER)
      expect(log.rows[1].from_status).toBe('in_review')
      expect(log.rows[1].to_status).toBe('returned')
      expect(log.rows[1].comment).toBe('ينقص المرفق')
    })

    it('كل انتقال يدخل سجل التدقيق أيضًا', async () => {
      const letterId = await letter('draft')
      await move(REVIEWER, letterId, 'in_review')
      const audit = await db.query(
        `select action, previous_status, new_status from public.audit_log
         where entity_id=$1 and entity_type='correspondence' order by id desc limit 1`,
        [letterId],
      )
      expect(audit.rows[0].action).toBe('correspondence.in_review')
      expect(audit.rows[0].previous_status).toBe('draft')
      expect(audit.rows[0].new_status).toBe('in_review')
    })

    it('الانتقالات المتاحة تختلف باختلاف الفاعل', async () => {
      const letterId = await letter('in_approval')

      const forApprover = await asUser(APPROVER, () =>
        db.query('select to_status from public.available_transitions($1)', [letterId]),
      )
      expect(forApprover.rows.map((r) => r.to_status)).toContain('approved')

      const forAuthor = await asUser(AUTHOR, () =>
        db.query('select to_status from public.available_transitions($1)', [letterId]),
      )
      expect(forAuthor.rows.map((r) => r.to_status), 'الموظف لا يعتمد').not.toContain('approved')
    })

    it('الانتقالات المتاحة تحترم فصل المهام', async () => {
      await db.query(
        `update public.organizations
            set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{separation_of_duties}',
                  '{"creator_not_approver": true}')
          where id = $1`,
        [id.orgA],
      )
      const own = await letter('in_approval', APPROVER)
      const available = await asUser(APPROVER, () =>
        db.query('select to_status from public.available_transitions($1)', [own]),
      )
      expect(available.rows.map((r) => r.to_status)).not.toContain('approved')
    })

    it('سجل الانتقالات يتبع صلاحية مراسلته', async () => {
      const letterId = await letter('draft')
      await move(REVIEWER, letterId, 'in_review')
      const seen = await asUser(OUTSIDER, () =>
        db.query('select count(*)::int as n from public.correspondence_transitions where correspondence_id=$1', [
          letterId,
        ]),
      )
      expect(Number(seen.rows[0].n)).toBe(0)
    })

    it('لا يكتب أحد في سجل الانتقالات مباشرة', async () => {
      const letterId = await letter('draft')
      await expectDenied(
        () =>
          asUser(AUTHOR, () =>
            db.query(
              `insert into public.correspondence_transitions
                 (correspondence_id, actor_id, from_status, to_status)
               values ($1,$2,'draft','approved')`,
              [letterId, AUTHOR],
            ),
          ),
        /permission denied/,
      )
    })
  })
})
