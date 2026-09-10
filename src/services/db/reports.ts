/**
 * خدمات التقارير والتحقق والوثيقة النهائية.
 *
 * ⚠️ التقرير تجميعٌ لما يراه القارئ لا استعلامٌ يتجاوز الرؤية: الدوال في
 * القاعدة `security invoker` فتسري عليها RLS. لا منطق صلاحيات مكرّر هنا —
 * والتكرار هو ما يُنتج تسريبًا في التقارير عادةً.
 */
import { supabase } from '@/lib/supabase'
import type { CorrespondenceStatus, Direction, TemplateStatus } from '@/types/database'

export interface SummaryRow {
  direction: Direction
  current_status: CorrespondenceStatus
  total: number
  overdue: number
  avg_hours_to_issue: number | null
}

export interface UnitRow {
  unit_id: string
  unit_name: string
  incoming: number
  outgoing: number
  overdue: number
}

export interface ExternalRow {
  entity: string
  incoming: number
  outgoing: number
}

export interface ReferralReportRow {
  status: string
  total: number
  overdue: number
  avg_hours_to_respond: number | null
}

export interface AiUsageRow {
  day: string
  simple_requests: number
  agent_runs: number
  total_tokens: number
}

/**
 * يحوّل الأعداد التي يعيدها PostgREST لأعمدة bigint.
 * PostgREST يُسلسل bigint نصًّا حفاظًا على الدقة، فتصل «12» لا 12 — ويكسر
 * كل حساب أو مقارنة عددية بصمت.
 */
function toNumbers<T>(rows: T[], fields: Array<keyof T>): T[] {
  return rows.map((row) => {
    const next = { ...row }
    for (const field of fields) {
      const value = next[field]
      if (value !== null && value !== undefined) next[field] = Number(value) as T[keyof T]
    }
    return next
  })
}

export async function getSummary(
  organizationId: string,
  range: { from?: string; to?: string } = {},
): Promise<SummaryRow[]> {
  const { data, error } = await supabase.rpc('report_correspondence_summary', {
    p_organization_id: organizationId,
    p_from: range.from ?? null,
    p_to: range.to ?? null,
  })
  if (error) throw error
  return toNumbers((data ?? []) as SummaryRow[], ['total', 'overdue', 'avg_hours_to_issue'])
}

export async function getByUnit(
  organizationId: string,
  range: { from?: string; to?: string } = {},
): Promise<UnitRow[]> {
  const { data, error } = await supabase.rpc('report_by_unit', {
    p_organization_id: organizationId,
    p_from: range.from ?? null,
    p_to: range.to ?? null,
  })
  if (error) throw error
  return toNumbers((data ?? []) as UnitRow[], ['incoming', 'outgoing', 'overdue'])
}

export async function getByExternalEntity(organizationId: string, limit = 10): Promise<ExternalRow[]> {
  const { data, error } = await supabase.rpc('report_by_external_entity', {
    p_organization_id: organizationId,
    p_limit: limit,
  })
  if (error) throw error
  return toNumbers((data ?? []) as ExternalRow[], ['incoming', 'outgoing'])
}

export async function getReferralReport(organizationId: string): Promise<ReferralReportRow[]> {
  const { data, error } = await supabase.rpc('report_referrals', { p_organization_id: organizationId })
  if (error) throw error
  return toNumbers((data ?? []) as ReferralReportRow[], ['total', 'overdue', 'avg_hours_to_respond'])
}

/** يتطلب audit.view — القاعدة ترفض بلا صلاحية، فلا نُخفي الخطأ بل نُظهره. */
export async function getAiUsage(organizationId: string, days = 30): Promise<AiUsageRow[]> {
  const { data, error } = await supabase.rpc('report_ai_usage', {
    p_organization_id: organizationId,
    p_days: days,
  })
  if (error) throw error
  return toNumbers((data ?? []) as AiUsageRow[], ['simple_requests', 'agent_runs', 'total_tokens'])
}

/* ---------------------------- التحقق العلني ---------------------------- */

export interface VerificationResult {
  reference_number: string
  issued_at: string
  organization_name: string
  organization_name_en: string
}

/**
 * التحقق من وثيقة برمزها. متاح بلا تسجيل دخول — وهو الشيء الوحيد كذلك.
 * يعيد `null` لرمز غير صالح: لا نكشف حتى وجود المراسلة.
 */
export async function verifyDocument(token: string): Promise<VerificationResult | null> {
  const { data, error } = await supabase.rpc('verify_correspondence', { p_token: token })
  if (error) throw error
  const rows = (data ?? []) as VerificationResult[]
  return rows[0] ?? null
}

/* --------------------------- حوكمة القوالب --------------------------- */

export async function transitionTemplate(templateId: string, to: TemplateStatus): Promise<TemplateStatus> {
  const { data, error } = await supabase.rpc('transition_template', {
    p_template_id: templateId,
    p_to_status: to,
  })
  if (error) throw error
  return data as TemplateStatus
}
