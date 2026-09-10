import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllSnapshots,
  clearSnapshot,
  isReplySnapshotUseful,
  isWriteSnapshotUseful,
  loadSnapshot,
  saveSnapshot,
  type ReplySnapshot,
  type WriteSnapshot,
} from './workspaceStorage'

const emptyWrite: WriteSnapshot = {
  idea: '',
  language: 'ar',
  recipient: '',
  correspondenceType: '',
  formality: '',
  priority: '',
  analysis: null,
  variants: null,
  review: null,
  draftId: null,
}

const emptyReply: ReplySnapshot = {
  incomingText: '',
  replyLanguage: 'ar',
  tone: 'formal',
  analysis: null,
  answers: {},
  variants: null,
  coverage: [],
  review: null,
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('حفظ واستعادة لقطة العمل', () => {
  it('يحفظ ويستعيد نفس القيمة', () => {
    const snapshot: WriteSnapshot = { ...emptyWrite, idea: 'متابعة طلب متأخر', recipient: 'الإدارة المالية' }
    saveSnapshot('write', snapshot)
    expect(loadSnapshot<WriteSnapshot>('write')).toEqual(snapshot)
  })

  it('يعزل مساحتَي الكتابة والرد', () => {
    saveSnapshot('write', { ...emptyWrite, idea: 'فكرة' })
    expect(loadSnapshot<ReplySnapshot>('reply')).toBeNull()
  })

  it('يعيد null عندما لا توجد لقطة', () => {
    expect(loadSnapshot<WriteSnapshot>('write')).toBeNull()
  })

  it('يمسح اللقطة عند الطلب', () => {
    saveSnapshot('write', { ...emptyWrite, idea: 'فكرة' })
    clearSnapshot('write')
    expect(loadSnapshot<WriteSnapshot>('write')).toBeNull()
  })

  it('يمسح كل المساحات عند تسجيل الخروج', () => {
    saveSnapshot('write', { ...emptyWrite, idea: 'فكرة' })
    saveSnapshot('reply', { ...emptyReply, incomingText: 'وارد' })
    clearAllSnapshots()
    expect(loadSnapshot<WriteSnapshot>('write')).toBeNull()
    expect(loadSnapshot<ReplySnapshot>('reply')).toBeNull()
  })
})

describe('متانة القراءة', () => {
  it('يتجاهل لقطة بإصدار مختلف ويحذفها', () => {
    window.localStorage.setItem(
      'qalam.workspace.write',
      JSON.stringify({ v: 999, savedAt: '2026-01-01', data: { idea: 'قديمة' } }),
    )
    expect(loadSnapshot<WriteSnapshot>('write')).toBeNull()
    expect(window.localStorage.getItem('qalam.workspace.write')).toBeNull()
  })

  it('يتجاهل محتوى تالفًا بلا رمي استثناء', () => {
    window.localStorage.setItem('qalam.workspace.write', 'ليس JSON')
    expect(() => loadSnapshot<WriteSnapshot>('write')).not.toThrow()
    expect(loadSnapshot<WriteSnapshot>('write')).toBeNull()
  })

  it('لا يفشل عندما يكون التخزين معطّلًا', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => saveSnapshot('write', emptyWrite)).not.toThrow()
    expect(loadSnapshot<WriteSnapshot>('write')).toBeNull()
  })
})

describe('متى تستحق اللقطة الاستعادة', () => {
  it('لقطة كتابة فارغة لا تستحق', () => {
    expect(isWriteSnapshotUseful(emptyWrite)).toBe(false)
    expect(isWriteSnapshotUseful({ ...emptyWrite, idea: '   ' })).toBe(false)
  })

  it('تستحق عند وجود فكرة أو صيغ أو تحليل', () => {
    expect(isWriteSnapshotUseful({ ...emptyWrite, idea: 'فكرة' })).toBe(true)
    expect(
      isWriteSnapshotUseful({
        ...emptyWrite,
        variants: [{ kind: 'recommended', title: '', subject: 'موضوع', body: 'نص', wordCount: 1 }],
      }),
    ).toBe(true)
  })

  it('لقطة رد فارغة لا تستحق، وتستحق عند وجود نص وارد', () => {
    expect(isReplySnapshotUseful(emptyReply)).toBe(false)
    expect(isReplySnapshotUseful({ ...emptyReply, incomingText: 'مراسلة واردة' })).toBe(true)
  })
})
