import { supabase } from '@/lib/supabase'
import type { LearningProgress, LearningSession } from '@/types/database'
import type { TutorEvaluation } from '@/services/ai/schemas'

export async function fetchProgress(userId: string): Promise<LearningProgress | null> {
  const { data, error } = await supabase
    .from('learning_progress')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as LearningProgress | null) ?? null
}

export async function listSessions(userId: string, limit = 20): Promise<LearningSession[]> {
  const { data, error } = await supabase
    .from('learning_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as LearningSession[]
}

export async function createSession(input: {
  user_id: string
  level: LearningSession['level']
  language: LearningSession['language']
  scenario: string
  expected_type?: string | null
  expected_tone?: string | null
}): Promise<LearningSession> {
  const { data, error } = await supabase.from('learning_sessions').insert(input).select('*').single()
  if (error) throw error
  return data as LearningSession
}

export async function completeSession(
  sessionId: string,
  userAnswer: string,
  evaluation: TutorEvaluation,
): Promise<LearningSession> {
  const { data, error } = await supabase
    .from('learning_sessions')
    .update({
      user_answer: userAnswer,
      score: evaluation.overallScore,
      evaluation,
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .single()
  if (error) throw error
  return data as LearningSession
}

/** يحدّث عدّاد التمارين والمتوسط والمستوى ذريًا عبر دالة قاعدة البيانات. */
export async function recordResult(score: number): Promise<LearningProgress> {
  const { data, error } = await supabase.rpc('record_learning_result', { p_score: score })
  if (error) throw error
  return data as LearningProgress
}

export async function updateProgressNotes(
  userId: string,
  strengths: string[],
  improvements: string[],
): Promise<void> {
  const { error } = await supabase
    .from('learning_progress')
    .update({ strengths: strengths.slice(0, 6), improvements: improvements.slice(0, 6) })
    .eq('user_id', userId)
  if (error) throw error
}
