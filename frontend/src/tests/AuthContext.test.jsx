import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../AuthContext'

// Helper component that exposes auth context values into the DOM
function TestConsumer() {
  const { token, user, login, register, logout, authFetch } = useAuth()
  return (
    <div>
      <span data-testid="token">{token ?? 'null'}</span>
      <span data-testid="user">{user ? user.email : 'null'}</span>
      <button onClick={() => login('a@b.com', 'pass')}>login</button>
      <button onClick={() => register('a@b.com', 'pass', 'Alice')}>register</button>
      <button onClick={logout}>logout</button>
      <button onClick={() => authFetch('/api/test')}>authfetch</button>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── login ─────────────────────────────────────────────────────────────────
  it('login: sets token and user in localStorage and state on success', async () => {
    const user = userEvent.setup()
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: 'tok-123', user: { email: 'a@b.com' } }),
    })

    renderWithProvider()
    await user.click(screen.getByText('login'))

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('tok-123')
      expect(screen.getByTestId('user').textContent).toBe('a@b.com')
    })
    expect(localStorage.getItem('aq_token')).toBe('tok-123')
    expect(JSON.parse(localStorage.getItem('aq_user')).email).toBe('a@b.com')
  })

  it('login: throws error message when API returns not-ok', async () => {
    const user = userEvent.setup()
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Credenciales inválidas' }),
    })

    // Wrap consumer to capture thrown errors
    let caughtMessage = ''
    function ErrorConsumer() {
      const { login } = useAuth()
      return (
        <button
          onClick={async () => {
            try { await login('a@b.com', 'wrong') } catch (e) { caughtMessage = e.message }
          }}
        >
          try-login
        </button>
      )
    }
    render(<AuthProvider><ErrorConsumer /></AuthProvider>)
    await user.click(screen.getByText('try-login'))
    await waitFor(() => expect(caughtMessage).toBe('Credenciales inválidas'))
  })

  // ── register ──────────────────────────────────────────────────────────────
  it('register: sets token and user in localStorage on success', async () => {
    const user = userEvent.setup()
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: 'reg-tok', user: { email: 'a@b.com' } }),
    })

    renderWithProvider()
    await user.click(screen.getByText('register'))

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('reg-tok')
    })
    expect(localStorage.getItem('aq_token')).toBe('reg-tok')
  })

  // ── logout ────────────────────────────────────────────────────────────────
  it('logout: clears localStorage and nulls token/user', async () => {
    localStorage.setItem('aq_token', 'existing')
    localStorage.setItem('aq_user', JSON.stringify({ email: 'a@b.com' }))
    const user = userEvent.setup()

    renderWithProvider()
    // Initially populated from localStorage
    expect(screen.getByTestId('token').textContent).toBe('existing')

    await user.click(screen.getByText('logout'))

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('null')
      expect(screen.getByTestId('user').textContent).toBe('null')
    })
    expect(localStorage.getItem('aq_token')).toBeNull()
    expect(localStorage.getItem('aq_user')).toBeNull()
  })

  // ── authFetch ─────────────────────────────────────────────────────────────
  it('authFetch: adds Authorization header when token exists', async () => {
    localStorage.setItem('aq_token', 'my-token')
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) })
    const user = userEvent.setup()

    renderWithProvider()
    await user.click(screen.getByText('authfetch'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
        })
      )
    })
  })

  it('authFetch: auto-logouts on 401 response', async () => {
    localStorage.setItem('aq_token', 'expired-token')
    localStorage.setItem('aq_user', JSON.stringify({ email: 'a@b.com' }))
    global.fetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
    const user = userEvent.setup()

    renderWithProvider()
    expect(screen.getByTestId('token').textContent).toBe('expired-token')

    await user.click(screen.getByText('authfetch'))

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('null')
    })
    expect(localStorage.getItem('aq_token')).toBeNull()
  })
})
