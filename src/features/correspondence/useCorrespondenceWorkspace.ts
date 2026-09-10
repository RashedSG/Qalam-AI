import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ai, type CorrespondenceVariant, type IncomingAnalysis, type ReviewResult } from '@/services/ai'
import { useAuth } from '@/hooks/useAuth'
import { usePreferences } from '@/hooks/useProfile'
import { useToast } from '@/components/ui/Toast'
import { useI18n } from '@/hooks/useI18n'
import { createDraft, updateDraft } from '@/services/db/drafts'
import { createCorrespondence } from '@/services/db/correspondences'
import { deriveTitle } from '@/lib/utils'
import type { CorrespondenceSource } from '@/types/database'
import type { ImproveAction, Language, Priority } from '@/types/domain'
import { AiError } from '@/services/ai/types'

export interface SaveMeta {
  language: Language
  correspondenceType: string
  tone: string
  priority: Priority
  recipient: string
  departmentKey: string | null
  source: CorrespondenceSource
  originalInput: string | null
  analysis: unknown
}

/**
 * منطق مشترك بين "كتابة مراسلة" و"الرد على مراسلة":
 * تعديل الصيغ، إعادة الصياغة، الترجمة، المراجعة، والحفظ.
 */
export function useCorrespondenceWorkspace(
  initialVariants: CorrespondenceVariant[] | null = null,
  initialReview: ReviewResult | null = null,
) {
  const { user, accessToken } = useAuth()
  const { data: preferences } = usePreferences()
  const { toast } = useToast()
  const { t } = useI18n()
  const queryClient = useQueryClient()

  // القيم الأولية تأتي من لقطة العمل المستعادة بعد تحديث الصفحة.
  const [variants, setVariants] = useState<CorrespondenceVariant[] | null>(initialVariants)
  const [review, setReview] = useState<ReviewResult | null>(initialReview)
  const [busyKind, setBusyKind] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reset = useCallback(() => {
    setVariants(null)
    setReview(null)
    setBusyKind(null)
  }, [])

  const updateVariant = useCallback((next: CorrespondenceVariant) => {
    setVariants((prev) => prev?.map((v) => (v.kind === next.kind ? next : v)) ?? prev)
  }, [])

  const handleAiError = useCallback(
    (err: unknown) => {
      toast(err instanceof AiError ? err.message : t('error.generic'), 'error')
    },
    [toast, t],
  )

  /** إعادة صياغة صيغة واحدة في مكانها. */
  const refine = useCallback(
    async (variant: CorrespondenceVariant, action: ImproveAction, language: Language) => {
      setBusyKind(variant.kind)
      try {
        const result = await ai.improveText(
          { text: variant.body, actions: [action], language },
          { accessToken },
        )
        updateVariant({ ...variant, body: result.improved })
        setReview(null)
        toast(t('common.saved'), 'success')
      } catch (err) {
        handleAiError(err)
      } finally {
        setBusyKind(null)
      }
    },
    [accessToken, updateVariant, toast, t, handleAiError],
  )

  /** ترجمة صيغة إلى اللغة الأخرى في مكانها. */
  const translate = useCallback(
    async (variant: CorrespondenceVariant, currentLanguage: Language) => {
      const target: Language = currentLanguage === 'ar' ? 'en' : 'ar'
      setBusyKind(variant.kind)
      try {
        const result = await ai.translateCorporate(
          { text: variant.body, targetLanguage: target },
          { accessToken },
        )
        const subject = variant.subject
          ? (await ai.translateCorporate({ text: variant.subject, targetLanguage: target }, { accessToken }))
              .translated
          : ''
        updateVariant({ ...variant, body: result.translated, subject })
        setReview(null)
      } catch (err) {
        handleAiError(err)
      } finally {
        setBusyKind(null)
      }
    },
    [accessToken, updateVariant, handleAiError],
  )

  /** مراجعة قبل الإرسال — مع تحقق من تغطية نقاط المراسلة الواردة إن وُجدت. */
  const runReview = useCallback(
    async (variant: CorrespondenceVariant, language: Language, incomingAnalysis?: IncomingAnalysis | null) => {
      setBusyKind(variant.kind)
      setReview(null)
      try {
        const result = await ai.reviewBeforeSend(
          { text: variant.body, language, incomingAnalysis: incomingAnalysis ?? null },
          { accessToken },
        )
        setReview(result)
        return result
      } catch (err) {
        handleAiError(err)
        return null
      } finally {
        setBusyKind(null)
      }
    },
    [accessToken, handleAiError],
  )

  /**
   * يحفظ مسودة. عند تمرير draftId يُحدّث المسودة نفسها بدل إنشاء نسخة جديدة،
   * فتبقى حلقة «فتح ← تعديل ← حفظ» على صف واحد.
   * يعيد معرّف المسودة ليتابع الاستدعاء عليه لاحقًا.
   */
  const saveDraft = useCallback(
    async (variant: CorrespondenceVariant, meta: SaveMeta, draftId?: string | null) => {
      if (!user) return null
      setSaving(true)
      try {
        const payload = {
          title: deriveTitle(variant.subject, variant.body),
          subject: variant.subject,
          body: variant.body,
          language: meta.language,
          correspondence_type: meta.correspondenceType,
          recipient: meta.recipient,
          department_key: meta.departmentKey,
          original_input: meta.originalInput,
          analysis: meta.analysis ?? null,
        }

        const saved = draftId
          ? await updateDraft(draftId, payload)
          : await createDraft({ user_id: user.id, ...payload })

        await queryClient.invalidateQueries({ queryKey: ['drafts'] })
        toast(t('common.saved'), 'success')
        return saved
      } catch {
        toast(t('error.saveFailed'), 'error')
        return null
      } finally {
        setSaving(false)
      }
    },
    [user, queryClient, toast, t],
  )

  const saveFinal = useCallback(
    async (variant: CorrespondenceVariant, meta: SaveMeta) => {
      if (!user) return null
      // احترام تفضيل الخصوصية: عند إيقاف حفظ السجل لا نكتب أي مراسلة.
      if (preferences && preferences.save_history === false) {
        toast('حفظ السجل موقوف من الإعدادات. فعّله من الإعدادات ← الخصوصية.', 'info')
        return null
      }
      setSaving(true)
      try {
        const saved = await createCorrespondence({
          user_id: user.id,
          title: deriveTitle(variant.subject, variant.body),
          subject: variant.subject,
          body: variant.body,
          language: meta.language,
          correspondence_type: meta.correspondenceType,
          tone: meta.tone,
          priority: meta.priority,
          recipient: meta.recipient,
          department_key: meta.departmentKey,
          source: meta.source,
          original_input: meta.originalInput,
          analysis: meta.analysis ?? null,
          review: review ?? null,
        })
        await queryClient.invalidateQueries({ queryKey: ['correspondences'] })
        toast(t('common.saved'), 'success')
        return saved
      } catch {
        toast(t('error.saveFailed'), 'error')
        return null
      } finally {
        setSaving(false)
      }
    },
    [user, preferences, queryClient, review, toast, t],
  )

  return {
    variants,
    setVariants,
    updateVariant,
    review,
    setReview,
    busyKind,
    saving,
    reset,
    refine,
    translate,
    runReview,
    saveDraft,
    saveFinal,
  }
}
