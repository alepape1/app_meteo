import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('aq_token'))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aq_user')) } catch { return null }
  })

  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error de autenticación')
    localStorage.setItem('aq_token', data.token)
    localStorage.setItem('aq_user', JSON.stringify(data.user))
    setToken(data.token)
    setUser(data.user)
  }, [])

  const register = useCallback(async (email, password, displayName) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Error al registrarse')
    localStorage.setItem('aq_token', data.token)
    localStorage.setItem('aq_user', JSON.stringify(data.user))
    setToken(data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('aq_token')
    localStorage.removeItem('aq_user')
    setToken(null)
    setUser(null)
  }, [])

  // Wrapper de fetch que incluye el token automáticamente
  const authFetch = useCallback((url, opts = {}) => {
    const headers = { ...(opts.headers || {}) }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return fetch(url, { ...opts, headers })
  }, [token])

  return (
    <AuthContext.Provider value={{ token, user, login, register, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
