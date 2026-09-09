import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useTheme } from '@/hooks/useTheme'
import { usePreferences, useUpdatePreferences } from '@/hooks/useProfile'
import { useToast } from '@/components/ui/Toast'
import { deleteMyAccount, deleteMyData } from '@/services/db/account'
import { TONES, type Language, type Tone } from '@/types/domain'
import { TONE_LABELS, label } from '@/data/reference'
import type { ThemeMode } from '@/types/database'

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n()
  const { theme, setTheme } = useTheme()
  const { data: prefs, isLoading, isError, refetch } = usePreferences()
  const updatePrefs = useUpdatePreferences()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [defaultTone, setDefaultTone] = useState<Tone>('formal')
  const [defaultLanguage, setDefaultLanguage] = useState<Language>('ar')
  const [aiSuggestTone, setAiSuggestTone] = useState(true)
  const [saveHistory, setSaveHistory] = useState(true)

  const [deleteDataOpen, setDeleteDataOpen] = useState(false)
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const [confirmWord, setConfirmWord] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!prefs) return
    setDefaultTone((prefs.default_tone as Tone) ?? 'formal')
    setDefaultLanguage(prefs.default_correspondence_language)
    setAiSuggestTone(prefs.ai_suggest_tone)
    setSaveHistory(prefs.save_history)
  }, [prefs])

  const persist = async (patch: Parameters<typeof updatePrefs.mutateAsync>[0]) => {
    try {
      await updatePrefs.mutateAsync(patch)
      toast(t('common.saved'), 'success')
    } catch {
      toast(t('error.saveFailed'), 'error')
    }
  }

  const runDeleteData = async () => {
    setBusy(true)
    try {
      await deleteMyData()
      toast(t('common.saved'), 'success')
      setDeleteDataOpen(false)
    } catch {
      toast(t('error.deleteFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const runDeleteAccount = async () => {
    setBusy(true)
    try {
      await deleteMyAccount()
      navigate('/', { replace: true })
    } catch {
      toast(t('error.deleteFailed'), 'error')
      setBusy(false)
    }
  }

  if (isLoading) return <Skeleton className="h-96" />
  if (isError) return <ErrorState message={t('error.loadFailed')} onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      </header>

      <Card>
        <CardHeader title={t('settings.appearance')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.theme')}>
            {(p) => (
              <Select
                {...p}
                value={theme}
                onChange={(e) => {
                  const next = e.target.value as ThemeMode
                  setTheme(next)
                  void persist({ theme: next })
                }}
              >
                <option value="light">{t('settings.theme.light')}</option>
                <option value="dark">{t('settings.theme.dark')}</option>
                <option value="system">{t('settings.theme.system')}</option>
              </Select>
            )}
          </Field>

          <Field label={t('settings.uiLanguage')}>
            {(p) => (
              <Select
                {...p}
                value={lang}
                onChange={(e) => {
                  const next = e.target.value as Language
                  setLang(next)
                  void persist({ ui_language: next })
                }}
              >
                <option value="ar">{t('common.arabic')}</option>
                <option value="en">{t('common.english')}</option>
              </Select>
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('settings.defaults')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.defaultTone')}>
            {(p) => (
              <Select
                {...p}
                value={defaultTone}
                onChange={(e) => {
                  const next = e.target.value as Tone
                  setDefaultTone(next)
                  void persist({ default_tone: next })
                }}
              >
                {TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {label(TONE_LABELS[tone], lang)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('settings.defaultLanguage')}>
            {(p) => (
              <Select
                {...p}
                value={defaultLanguage}
                onChange={(e) => {
                  const next = e.target.value as Language
                  setDefaultLanguage(next)
                  void persist({ default_correspondence_language: next })
                }}
              >
                <option value="ar">{t('common.arabic')}</option>
                <option value="en">{t('common.english')}</option>
              </Select>
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('settings.ai')} />
        <CardBody className="space-y-4">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>{t('settings.aiSuggestTone')}</span>
            <input
              type="checkbox"
              checked={aiSuggestTone}
              onChange={(e) => {
                setAiSuggestTone(e.target.checked)
                void persist({ ai_suggest_tone: e.target.checked })
              }}
              className="size-5 accent-navy-700"
            />
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('settings.privacy')} />
        <CardBody className="space-y-4">
          <label className="flex items-start justify-between gap-4 text-sm">
            <span>
              {t('settings.saveHistory')}
              <span className="q-muted mt-0.5 block text-xs">{t('settings.saveHistoryHint')}</span>
            </span>
            <input
              type="checkbox"
              checked={saveHistory}
              onChange={(e) => {
                setSaveHistory(e.target.checked)
                void persist({ save_history: e.target.checked })
              }}
              className="mt-0.5 size-5 shrink-0 accent-navy-700"
            />
          </label>
        </CardBody>
      </Card>

      <Card className="border-red-600/25">
        <CardHeader title={t('settings.dangerZone')} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('settings.deleteData')}</p>
              <p className="q-muted text-xs">{t('settings.deleteDataHint')}</p>
            </div>
            <Button variant="outline" onClick={() => setDeleteDataOpen(true)}>
              {t('settings.deleteData')}
            </Button>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
            style={{ borderColor: 'rgb(var(--q-border))' }}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('settings.deleteAccount')}</p>
              <p className="q-muted text-xs">{t('settings.deleteAccountHint')}</p>
            </div>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmWord('')
                setDeleteAccountOpen(true)
              }}
            >
              {t('settings.deleteAccount')}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={deleteDataOpen}
        onClose={() => setDeleteDataOpen(false)}
        title={t('settings.deleteData')}
        description={t('settings.deleteDataHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteDataOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy} onClick={runDeleteData}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2 text-sm leading-7">
          <AlertTriangle className="mt-1 size-4 shrink-0 text-red-600" aria-hidden="true" />
          سيتم حذف كل المراسلات والمسودات والتمارين نهائيًا. لا يمكن التراجع.
        </p>
      </Modal>

      <Modal
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        title={t('settings.deleteAccount')}
        description={t('settings.deleteAccountHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteAccountOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={confirmWord.trim() !== t('settings.deleteConfirmWord')}
              onClick={runDeleteAccount}
            >
              {t('settings.deleteAccount')}
            </Button>
          </>
        }
      >
        <Field label={t('settings.deleteConfirm')}>
          {(p) => <Input {...p} value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} />}
        </Field>
      </Modal>
    </div>
  )
}
