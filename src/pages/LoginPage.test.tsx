import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/helpers'

const signInWithPassword = vi.fn()
const signInWithGoogle = vi.fn()

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    loading: false,
    accessToken: null,
    signInWithPassword,
    signInWithGoogle,
    signUpWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    sendPasswordReset: vi.fn(),
    signOut: vi.fn(),
  }),
}))

const { default: LoginPage } = await import('./LoginPage')

beforeEach(() => {
  signInWithPassword.mockReset()
  signInWithGoogle.mockReset()
})

describe('LoginPage', () => {
  it('يعرض حقول الدخول وخيار Google', () => {
    renderWithProviders(<LoginPage />)
    expect(screen.getByLabelText(/البريد الإلكتروني/)).toBeInTheDocument()
    expect(screen.getByLabelText(/كلمة المرور/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Google/ })).toBeInTheDocument()
  })

  it('يمنع الإرسال ويعرض خطأ عربيًا عند بريد غير صالح', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />)

    await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'not-an-email')
    await user.type(screen.getByLabelText(/كلمة المرور/), 'password123')
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    expect(await screen.findByText('أدخل بريدًا إلكترونيًا صحيحًا.')).toBeInTheDocument()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('يستدعي تسجيل الدخول ببيانات صحيحة', async () => {
    const user = userEvent.setup()
    signInWithPassword.mockResolvedValue(undefined)
    renderWithProviders(<LoginPage />)

    await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'user@example.com')
    await user.type(screen.getByLabelText(/كلمة المرور/), 'password123')
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith('user@example.com', 'password123')
    })
  })

  it('يترجم خطأ بيانات الاعتماد إلى رسالة عربية مفهومة', async () => {
    const user = userEvent.setup()
    signInWithPassword.mockRejectedValue(new Error('Invalid login credentials'))
    renderWithProviders(<LoginPage />)

    await user.type(screen.getByLabelText(/البريد الإلكتروني/), 'user@example.com')
    await user.type(screen.getByLabelText(/كلمة المرور/), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    expect(await screen.findByText('البريد الإلكتروني أو كلمة المرور غير صحيحة.')).toBeInTheDocument()
  })
})
