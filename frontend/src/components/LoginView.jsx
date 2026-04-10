import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { Loader, LogIn, UserPlus } from 'lucide-react'

export default function LoginView() {
  const { login, register } = useAuth()
  const [tab, setTab] = useState('login')   // 'login' | 'register'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email, password)
      } else {
        await register(email, password, name)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-brand-50 p-3 rounded-2xl border border-brand-100 mb-3">
            <svg width="28" height="28" viewBox="0 0 20 20" fill="none">
              <path d="M10 2C10 2 3.5 9.5 3.5 13.5a6.5 6.5 0 0013 0C16.5 9.5 10 2 10 2Z" fill="#0c8ecc"/>
              <path d="M7 15a3.5 3.5 0 003.5-3.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.75"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-navy-900 font-serif">Aquantia</h1>
          <p className="text-xs text-navy-400 mt-0.5">Estación meteorológica</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-black/[.08] rounded-2xl shadow-sm overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-black/[.08]">
            {[['login', 'Entrar'], ['register', 'Crear cuenta']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setTab(key); setError('') }}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  tab === key
                    ? 'text-brand-600 border-b-2 border-brand-500 bg-brand-50/50'
                    : 'text-navy-400 hover:text-navy-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {tab === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-navy-500 mb-1.5 uppercase tracking-wider">
                  Nombre
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full bg-navy-50 border border-navy-200 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-navy-500 mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                required
                autoFocus
                className="w-full bg-navy-50 border border-navy-200 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-navy-500 mb-1.5 uppercase tracking-wider">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={tab === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
                required
                className="w-full bg-navy-50 border border-navy-200 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder:text-navy-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors mt-2"
            >
              {loading
                ? <><Loader size={14} className="animate-spin" /> Cargando…</>
                : tab === 'login'
                  ? <><LogIn size={14} /> Entrar</>
                  : <><UserPlus size={14} /> Crear cuenta</>
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-navy-400 mt-4">
          Aquantia · meteo.aquantialab.com
        </p>
      </div>
    </div>
  )
}
