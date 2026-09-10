/**
 * حاجز أول داخل الذاكرة، قبل أي اتصال بالشبكة.
 *
 * ⚠️ ليس هذا حد المعدّل. الحد الفعلي دائم وذرّي في قاعدة البيانات
 * (انظر `usage.ts` و `begin_ai_request`). هذه الوحدة تُسقط الاندفاع
 * الواضح داخل نسخة واحدة من الدالة قبل إنفاق رحلة شبكة عليه — لا أكثر.
 * ذاكرة الدالة غير مشتركة بين النسخ، فلا يُعتمد عليها حاجزًا أمنيًا.
 */

const WINDOW_MS = 10_000
const MAX_REQUESTS_PER_INSTANCE = 12

const hits = new Map<string, number[]>()

export function checkLocalBurst(userId: string): boolean {
  const now = Date.now()
  const list = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_REQUESTS_PER_INSTANCE) {
    hits.set(userId, list)
    return false
  }
  list.push(now)
  hits.set(userId, list)

  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key)
    }
  }
  return true
}
