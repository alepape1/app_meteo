import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginView from '../components/LoginView'

// Mock useAuth before importing the component
const mockLogin    = vi.fn()
const mockRegister = vi.fn()

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, register: mockRegister }),
}))

describe('LoginView', () => {
  beforeEach(() => {
    mockLogin.mockReset()
    mockRegister.mockReset()
  })

  afterEach(() => vi.clearAllMocks())

  it('renders login tab by default with email and password fields', () => {
    render(<LoginView />)
    expect(screen.getByPlaceholderText('usuario@ejemplo.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
    // Name field should NOT be visible on login tab
    expect(screen.queryByPlaceholderText('Tu nombre')).not.toBeInTheDocument()
  })

  it('shows name field after switching to "Crear cuenta" tab', async () => {
    const user = userEvent.setup()
    render(<LoginView />)
    await user.click(screen.getByText('Crear cuenta'))
    expect(screen.getByPlaceholderText('Tu nombre')).toBeInTheDocument()
  })

  it('submit on login tab calls login() with email and password', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValueOnce(undefined)
    render(<LoginView />)

    await user.type(screen.getByPlaceholderText('usuario@ejemplo.com'), 'test@example.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'mypassword')
    // Both the tab and the submit button have the text 'Entrar' — pick the submit button
    await user.click(screen.getAllByRole('button', { name: /Entrar/i }).at(-1))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'mypassword')
    })
  })

  it('submit on register tab calls register() with email, password and name', async () => {
    const user = userEvent.setup()
    mockRegister.mockResolvedValueOnce(undefined)
    render(<LoginView />)

    await user.click(screen.getByText('Crear cuenta'))
    await user.type(screen.getByPlaceholderText('Tu nombre'), 'Alice')
    await user.type(screen.getByPlaceholderText('usuario@ejemplo.com'), 'alice@example.com')
    await user.type(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'securepassword')
    // Both the tab and the submit button have text 'Crear cuenta' — pick the submit button
    await user.click(screen.getAllByRole('button', { name: /Crear cuenta/i }).at(-1))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('alice@example.com', 'securepassword', 'Alice')
    })
  })

  it('displays error message when login() throws', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValueOnce(new Error('Credenciales inválidas'))
    render(<LoginView />)

    await user.type(screen.getByPlaceholderText('usuario@ejemplo.com'), 'bad@example.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpass')
    await user.click(screen.getAllByRole('button', { name: /Entrar/i }).at(-1))

    await screen.findByText('Credenciales inválidas')
  })

  it('submit button is disabled while loading', async () => {
    const user = userEvent.setup()
    let resolveLogin
    mockLogin.mockReturnValueOnce(new Promise(r => { resolveLogin = r }))
    render(<LoginView />)

    await user.type(screen.getByPlaceholderText('usuario@ejemplo.com'), 'a@b.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass')
    await user.click(screen.getAllByRole('button', { name: /Entrar/i }).at(-1))

    // While the promise is pending the button text changes to "Cargando…" and is disabled
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Cargando/i })).toBeDisabled()
    )

    resolveLogin()
  })

  it('clears error when switching tabs', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValueOnce(new Error('Error de autenticación'))
    render(<LoginView />)

    await user.type(screen.getByPlaceholderText('usuario@ejemplo.com'), 'a@b.com')
    await user.type(screen.getByPlaceholderText('••••••••'), 'pass')
    await user.click(screen.getAllByRole('button', { name: /Entrar/i }).at(-1))

    await screen.findByText('Error de autenticación')

    await user.click(screen.getByText('Crear cuenta'))
    expect(screen.queryByText('Error de autenticación')).not.toBeInTheDocument()
  })
})
