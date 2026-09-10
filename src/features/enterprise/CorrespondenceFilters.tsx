import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Field } from '@/components/ui/Field'
import { useI18n } from '@/hooks/useI18n'
import { listOrgUnits } from '@/services/db/organization'
import { CORRESPONDENCE_STATUSES } from '@/types/database'
import type { DirectionFilters } from '@/services/db/enterprise'
import type { ClassificationLevel } from '@/types/database'
import type { TranslationKey } from '@/i18n'

/**
 * شريط البحث والتصفية للمراسلات.
 *
 * التصفية هنا تضييقٌ لما تسمح به القاعدة، لا توسيعٌ له: من لا يرى وحدةً لا
 * يراها ولو اختارها من القائمة. القائمة نفسها تأتي من `listOrgUnits` وتخضع
 * لـRLS كسائر الاستعلامات.
 */
export function CorrespondenceFilters({
  organizationId,
  levels,
  value,
  onChange,
}: {
  organizationId: string
  levels: ClassificationLevel[]
  value: DirectionFilters
  onChange: (next: DirectionFilters) => void
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)

  const units = useQuery({
    queryKey: ['org-units', organizationId],
    queryFn: () => listOrgUnits(organizationId),
    enabled: Boolean(organizationId) && open,
  })

  const set = (patch: Partial<DirectionFilters>) => onChange({ ...value, ...patch })
  const active = Object.entries(value).filter(([, v]) => v !== undefined && v !== '' && v !== false).length
  const Chevron = open ? ChevronUp : ChevronDown

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[rgb(var(--q-text-muted))]"
            aria-hidden="true"
          />
          <Input
            value={value.search ?? ''}
            onChange={(e) => set({ search: e.target.value || undefined })}
            placeholder={t('search.placeholder')}
            aria-label={t('common.search')}
            className="ps-9"
          />
        </div>
        <Button variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Chevron className="size-4" aria-hidden="true" />
          {t('search.filters')}
          {active > 0 ? ` (${active})` : ''}
        </Button>
        {active > 0 ? (
          <Button variant="ghost" onClick={() => onChange({})}>
            <X className="size-4" aria-hidden="true" />
            {t('search.clear')}
          </Button>
        ) : null}
      </div>

      {/* التسوية العربية تحدث في القاعدة — نقولها للمستخدم فلا يظنّ البحث حرفيًّا. */}
      <p className="q-muted text-xs leading-6">{t('search.arabicNote')}</p>

      {open ? (
        <div className="grid gap-4 rounded-xl border border-[rgb(var(--q-border))] p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('search.reference')}>
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                value={value.reference ?? ''}
                onChange={(e) => set({ reference: e.target.value || undefined })}
              />
            )}
          </Field>

          <Field label={t('search.party')} hint={t('search.partyHint')}>
            {(p) => (
              <Input
                {...p}
                value={value.party ?? ''}
                onChange={(e) => set({ party: e.target.value || undefined })}
              />
            )}
          </Field>

          <Field label={t('search.unit')}>
            {(p) => (
              <Select
                {...p}
                value={value.unitId ?? ''}
                onChange={(e) => set({ unitId: e.target.value || undefined })}
              >
                <option value="">{t('common.all')}</option>
                {(units.data ?? []).map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {'\u00a0'.repeat(unit.depth * 2)}
                    {lang === 'en' && unit.name_en ? unit.name_en : unit.name_ar}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('reports.status')}>
            {(p) => (
              <Select
                {...p}
                value={value.status ?? ''}
                onChange={(e) => set({ status: e.target.value || undefined })}
              >
                <option value="">{t('common.all')}</option>
                {CORRESPONDENCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`status.${status}` as TranslationKey)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('corr.classification')}>
            {(p) => (
              <Select
                {...p}
                value={value.classification ?? ''}
                onChange={(e) => set({ classification: e.target.value || undefined })}
              >
                <option value="">{t('common.all')}</option>
                {levels.map((level) => (
                  <option key={level.key} value={level.key}>
                    {lang === 'en' && level.name_en ? level.name_en : level.name_ar}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('reports.from')}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={value.from ? value.from.slice(0, 10) : ''}
                  onChange={(e) =>
                    set({ from: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : undefined })
                  }
                />
              )}
            </Field>
            <Field label={t('reports.to')}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={value.to ? value.to.slice(0, 10) : ''}
                  onChange={(e) =>
                    set({
                      to: e.target.value ? new Date(`${e.target.value}T23:59:59.999`).toISOString() : undefined,
                    })
                  }
                />
              )}
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[rgb(var(--q-gold))]"
              checked={value.overdueOnly ?? false}
              onChange={(e) => set({ overdueOnly: e.target.checked || undefined })}
            />
            {t('search.overdueOnly')}
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[rgb(var(--q-gold))]"
              checked={value.includeArchived ?? false}
              onChange={(e) => set({ includeArchived: e.target.checked || undefined })}
            />
            {t('search.includeArchived')}
          </label>
        </div>
      ) : null}
    </div>
  )
}
