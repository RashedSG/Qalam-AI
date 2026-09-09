import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/helpers'
import { CoverageChecklist } from './CoverageChecklist'
import type { CoverageItem } from '@/services/ai/schemas'

const items: CoverageItem[] = [
  { pointId: 'p1', point: 'حالة الطلب', covered: true, note: '' },
  { pointId: 'p2', point: 'موعد التوريد', covered: true, note: '' },
  { pointId: 'p3', point: 'سبب التأخير', covered: false, note: 'لم تُذكر الأسباب في الرد' },
]

describe('CoverageChecklist', () => {
  it('يعرض كل النقاط المطلوبة', () => {
    renderWithProviders(<CoverageChecklist items={items} />)
    expect(screen.getByText('حالة الطلب')).toBeInTheDocument()
    expect(screen.getByText('موعد التوريد')).toBeInTheDocument()
    expect(screen.getByText('سبب التأخير')).toBeInTheDocument()
  })

  it('ينبّه على النقطة التي لم يُجَب عنها', () => {
    renderWithProviders(<CoverageChecklist items={items} />)
    expect(screen.getByText('لم تُذكر الأسباب في الرد')).toBeInTheDocument()
  })

  it('يعرض عدّاد التغطية بشكل صحيح', () => {
    renderWithProviders(<CoverageChecklist items={items} />)
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('لا يعرض شيئًا عند غياب النقاط', () => {
    renderWithProviders(<CoverageChecklist items={[]} />)
    expect(screen.queryByText('تغطية النقاط')).not.toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
