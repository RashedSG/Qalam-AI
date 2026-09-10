/**
 * حفظ العمل غير المكتمل محليًا حتى لا يضيع بتحديث الصفحة أو إغلاقها.
 *
 * خصوصية: البيانات تبقى في متصفح المستخدم على جهازه فقط — لا تُرسل لأي خادم،
 * ولا تُكتب في قاعدة البيانات، وتُمسح عند الحفظ أو البدء من جديد أو تسجيل الخروج.
 */
import type { CorrespondenceVariant, CoverageItem, IncomingAnalysis, RequestAnalysis, ReviewResult } from '@/services/ai'
import type { CorrespondenceType, Formality, Language, Priority, Tone } from '@/types/domain'

/** يُزاد عند تغيير شكل اللقطة، فتُهمل اللقطات القديمة بدل أن تُعطب الصفحة. */
const SNAPSHOT_VERSION = 1

const KEYS = {
  write: 'qalam.workspace.write',
  reply: 'qalam.workspace.reply',
} as const

export type WorkspaceKey = keyof typeof KEYS

export interface WriteSnapshot {
  idea: string
  language: Language
  recipient: string
  correspondenceType: CorrespondenceType | ''
  formality: Formality | ''
  priority: Priority | ''
  analysis: RequestAnalysis | null
  variants: CorrespondenceVariant[] | null
  review: ReviewResult | null
  draftId: string | null
}

export interface ReplySnapshot {
  incomingText: string
  replyLanguage: Language
  tone: Tone
  analysis: IncomingAnalysis | null
  answers: Record<string, string>
  variants: CorrespondenceVariant[] | null
  coverage: CoverageItem[]
  review: ReviewResult | null
}

interface Envelope<T> {
  v: number
  savedAt: string
  data: T
}

/** هل تحمل اللقطة عملًا يستحق الاستعادة؟ */
export function isWriteSnapshotUseful(s: WriteSnapshot): boolean {
  return s.idea.trim().length > 0 || Boolean(s.variants?.length) || Boolean(s.analysis)
}

export function isReplySnapshotUseful(s: ReplySnapshot): boolean {
  return s.incomingText.trim().length > 0 || Boolean(s.variants?.length) || Boolean(s.analysis)
}

export function loadSnapshot<T>(key: WorkspaceKey): T | null {
  try {
    const raw = window.localStorage.getItem(KEYS[key])
    if (!raw) return null
    const parsed = JSON.parse(raw) as Envelope<T>
    if (parsed?.v !== SNAPSHOT_VERSION) {
      window.localStorage.removeItem(KEYS[key])
      return null
    }
    return parsed.data
  } catch {
    // تخزين معطّل أو محتوى تالف — نتجاهله بصمت ونبدأ من جديد.
    return null
  }
}

export function saveSnapshot<T>(key: WorkspaceKey, data: T): void {
  try {
    const envelope: Envelope<T> = { v: SNAPSHOT_VERSION, savedAt: new Date().toISOString(), data }
    window.localStorage.setItem(KEYS[key], JSON.stringify(envelope))
  } catch {
    // قد يمتلئ التخزين أو يكون معطّلًا — لا نُفشل العملية بسبب ذلك.
  }
}

export function clearSnapshot(key: WorkspaceKey): void {
  try {
    window.localStorage.removeItem(KEYS[key])
  } catch {
    // تجاهل
  }
}

/** يُستدعى عند تسجيل الخروج حتى لا يرى المستخدم التالي عمل السابق. */
export function clearAllSnapshots(): void {
  for (const key of Object.keys(KEYS) as WorkspaceKey[]) clearSnapshot(key)
}
