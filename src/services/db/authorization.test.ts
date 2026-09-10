import { describe, expect, it } from 'vitest'
import { can, EMPTY_AUTHORIZATION, type AuthorizationContext } from './authorization'
import { scopeCovers } from '@/types/permissions'
import { buildOrgTree } from './organization'
import type { OrgUnit } from '@/types/database'

const ctx = (scopes: AuthorizationContext['scopes']): AuthorizationContext => ({
  ...EMPTY_AUTHORIZATION,
  scopes,
})

describe('تغطية النطاقات', () => {
  it('الأوسع يغطي الأضيق', () => {
    expect(scopeCovers('organization', 'own')).toBe(true)
    expect(scopeCovers('organization', 'descendants')).toBe(true)
    expect(scopeCovers('descendants', 'unit')).toBe(true)
    expect(scopeCovers('unit', 'own')).toBe(true)
  })

  it('الأضيق لا يغطي الأوسع', () => {
    expect(scopeCovers('own', 'unit')).toBe(false)
    expect(scopeCovers('unit', 'descendants')).toBe(false)
    expect(scopeCovers('descendants', 'organization')).toBe(false)
  })

  it('غياب المنح لا يغطي شيئًا', () => {
    expect(scopeCovers(null, 'own')).toBe(false)
  })
})

describe('can()', () => {
  it('يمنع ما لم يُمنح', () => {
    expect(can(EMPTY_AUTHORIZATION, 'users.manage')).toBe(false)
    expect(can(ctx({ 'correspondence.view': 'own' }), 'users.manage')).toBe(false)
  })

  it('يسمح ضمن النطاق الممنوح ويمنع خارجه', () => {
    const manager = ctx({ 'correspondence.view': 'descendants' })
    expect(can(manager, 'correspondence.view')).toBe(true)
    expect(can(manager, 'correspondence.view', 'unit')).toBe(true)
    expect(can(manager, 'correspondence.view', 'descendants')).toBe(true)
    expect(can(manager, 'correspondence.view', 'organization')).toBe(false)
  })

  it('السياق الفارغ يمنع كل شيء — وهو حال من لا مؤسسة له', () => {
    for (const permission of ['correspondence.view', 'users.manage', 'audit.view'] as const) {
      expect(can(EMPTY_AUTHORIZATION, permission)).toBe(false)
    }
  })
})

describe('بناء شجرة الوحدات', () => {
  const unit = (id: string, parent: string | null, path: string): OrgUnit => ({
    id,
    organization_id: 'org',
    parent_id: parent,
    code: id,
    name_ar: id,
    name_en: '',
    kind: 'department',
    path,
    depth: path.split('/').length - 2,
    is_active: true,
    created_at: '',
    updated_at: '',
  })

  it('يبني التشجير من العلاقات', () => {
    const tree = buildOrgTree([
      unit('root', null, '/root'),
      unit('fin', 'root', '/root/fin'),
      unit('acc', 'fin', '/root/fin/acc'),
      unit('hr', 'root', '/root/hr'),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((c) => c.id)).toEqual(['fin', 'hr'])
    expect(tree[0].children[0].children[0].id).toBe('acc')
  })

  it('وحدة أبوها غير مرئي تظهر كجذر بدل أن تختفي', () => {
    // يحدث فعليًا: RLS قد تُخفي الأب دون الابن في بعض النطاقات.
    const tree = buildOrgTree([unit('acc', 'invisible-parent', '/x/acc')])
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('acc')
  })

  it('قائمة فارغة تُنتج شجرة فارغة', () => {
    expect(buildOrgTree([])).toEqual([])
  })
})
