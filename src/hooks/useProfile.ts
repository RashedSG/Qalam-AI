import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { fetchPreferences, fetchProfile, upsertPreferences, upsertProfile } from '@/services/db/profile'
import type { Profile, UserPreferences } from '@/types/database'

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  })
}

export function useUpdateProfile() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Profile>) => upsertProfile(user!.id, patch),
    onSuccess: (data) => {
      qc.setQueryData(['profile', user?.id], data)
    },
  })
}

export function usePreferences() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['preferences', user?.id],
    queryFn: () => fetchPreferences(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  })
}

export function useUpdatePreferences() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<UserPreferences>) => upsertPreferences(user!.id, patch),
    onSuccess: (data) => {
      qc.setQueryData(['preferences', user?.id], data)
    },
  })
}

/** سياق المستخدم الذي يُمرَّر إلى الـ prompts (اسم، قسم، مسمى، أسلوب). */
export function useUserContext() {
  const { data: profile } = useProfile()
  if (!profile) return undefined
  return {
    fullName: profile.full_name || undefined,
    department: profile.department_custom || profile.department_key || undefined,
    jobTitle: profile.job_title || undefined,
    writingStyle: profile.writing_style || undefined,
    preferredLanguage: profile.preferred_language,
  }
}
