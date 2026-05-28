import { useState, useEffect, useRef } from 'react'
import {
  Loader, LogIn, UserPlus, Mail, Lock, User, Eye, EyeOff,
  CheckCircle2, CircleAlert, AlertTriangle, LifeBuoy,
  Droplets, Leaf, Radio,
} from 'lucide-react'
import { useAuth } from '../AuthContext'
import aquantiaLogo from '../assets/aquantia_logo.png'
import dropletHero  from '../assets/icono_logout.png'

const LAST_EMAIL_KEY = 'aql.lastEmail'

function isEmailLike(s = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}
function pwStrength(pw = '') {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8)            s++
  if (pw.length >= 12)           s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw))             s++
  if (/[^A-Za-z0-9]/.test(pw))   s++
  return Math.min(4, s)
}
const STRENGTH_LABEL = ['', 'Débil', 'Aceptable', 'Buena', 'Fuerte']
const STRENGTH_BAR   = ['', 'bg-red-500', 'bg-amber-500', 'bg-brand-500', 'bg-emerald-500']

function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-navy-500 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-navy-300 leading-snug">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-red-600 font-medium leading-snug">{error}</p>}
    </div>
  )
}

function Input({ leading, trailing, className = '', ...props }) {
  return (
    <div className="relative">
      {leading && (
        <span className="absolute inset-y-0 left-3 flex items-center text-navy-300 pointer-events-none">
          {leading}
        </span>
      )}
      <input
        {...props}
        className={[
          'w-full bg-navy-50 border border-navy-200 rounded-xl text-sm text-navy-900',
          'placeholder:text-navy-300 transition-all',
          'focus:outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100',
          leading  ? 'pl-10' : 'pl-4',
          trailing ? 'pr-11' : 'pr-4',
          'py-2.5',
          className,
        ].join(' ')}
      />
      {trailing && (
        <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
      )}
    </div>
  )
}

function Checkbox({ id, checked, onChange, children }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 cursor-pointer select-none">
      <span className={`mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-md shrink-0 border transition-all
        ${checked
          ? 'bg-brand-500 border-brand-500 shadow-[0_2px_6px_rgba(12,142,204,.35)]'
          : 'bg-white border-navy-200 hover:border-brand-300'}`}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2 5.5l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
      <span className="text-[12px] text-navy-500 leading-snug">{children}</span>
    </label>
  )
}

export default function LoginView() {
  const { login, register } = useAuth()

  const [tab,       setTab]       = useState('login')
  const [email,     setEmail]     = useState(() => {
    try { return localStorage.getItem(LAST_EMAIL_KEY) || '' } catch { return '' }
  })
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [name,      setName]      = useState('')
  const [remember,  setRemember]  = useState(true)
  const [accepted,  setAccepted]  = useState(false)
  const [showPw,    setShowPw]    = useState(false)
  const [capsOn,    setCapsOn]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const loginRef = useRef(null)
  const regRef   = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  useEffect(() => {
    const el = tab === 'login' ? loginRef.current : regRef.current
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }, [tab])

  const handleCaps = (e) => {
    if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'))
  }

  const emailOK   = isEmailLike(email)
  const strength  = pwStrength(password)
  const pwMatch   = password === password2

  const canSubmit = tab === 'login'
    ? (emailOK && password.length >= 1 && !loading)
    : (emailOK && password.length >= 8 && pwMatch && accepted && name.trim().length >= 2 && !loading)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(email.trim(), password)
      } else {
        await register(email.trim(), password, name.trim())
      }
      try {
        if (remember) localStorage.setItem(LAST_EMAIL_KEY, email.trim())
        else          localStorage.removeItem(LAST_EMAIL_KEY)
      } catch (e) { void e }
    } catch (err) {
      setError(err?.message || 'No se pudo completar la operación.')
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (next) => { setTab(next); setError('') }

  return (
    <div className="min-h-screen w-full grid md:grid-cols-[1.05fr_1fr] bg-[#fafaf8]">

      {/* LEFT · brand hero */}
      <aside
        className="relative overflow-hidden hidden md:flex flex-col justify-between p-10 lg:p-14 text-white"
        style={{ background: 'radial-gradient(120% 80% at 20% 20%, #0a3766 0%, #062547 45%, #04162d 100%)' }}
      >
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full opacity-50"
            style={{ background: 'radial-gradient(circle, rgba(63,182,240,.35), transparent 60%)' }}
          />
          <svg className="absolute inset-0 w-full h-full opacity-[0.08]" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="aql-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 0 0 L 40 0 0 40" fill="none" stroke="#7fd0ff" strokeWidth=".5" />
                <circle cx="0" cy="0" r="1.2" fill="#7fd0ff" />
              </pattern>
            </defs>
            <rect width="600" height="800" fill="url(#aql-grid)" />
          </svg>
        </div>

        <header className="relative flex items-start justify-between z-10">
          <div className="flex items-end gap-3">
            <img src={aquantiaLogo} alt="" className="w-12 h-auto" />
            <span className="text-xl font-bold leading-none tracking-tight pb-1">
              <span>Aquant</span><span className="text-brand-300">IA</span><span>lab</span>
            </span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
              <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[11px] font-semibold tracking-wider uppercase text-white/90">
              Servicio activo
            </span>
          </div>
        </header>

        <div className="relative flex flex-col items-center justify-center text-center z-10 my-8">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 -m-8 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(63,182,240,.30), transparent 60%)', filter: 'blur(10px)' }}
            />
            <img
              src={dropletHero}
              alt=""
              className="relative w-56 h-auto drop-shadow-[0_20px_40px_rgba(12,142,204,.35)]"
            />
          </div>
          <h1 className="relative mt-6 text-3xl lg:text-4xl font-bold tracking-tight leading-tight max-w-md">
            Tu campo,<br/>
            <span className="text-brand-300">en tiempo real.</span>
          </h1>
          <p className="relative mt-3 text-sm text-white/70 max-w-md leading-relaxed">
            Monitoriza meteorología, riego y nodos LoRa desde un único panel.
            Detecta fugas, ahorra agua y actúa sobre tus electroválvulas a distancia.
          </p>
        </div>

        <div className="relative grid grid-cols-3 gap-4 z-10">
          {[
            { Icon: Droplets, label: 'Riego remoto',    sub: 'ESP32 + relés' },
            { Icon: Leaf,     label: 'Salud del suelo', sub: 'NPK · pH · CE' },
            { Icon: Radio,    label: 'Red LoRa',        sub: '9 nodos en finca' },
          ].map((feat) => (
            <div key={feat.label} className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/[.04] border border-white/[.08] backdrop-blur-sm">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-300/20 text-brand-300">
                <feat.Icon size={14} />
              </span>
              <span className="text-[12px] font-semibold leading-none">{feat.label}</span>
              <span className="text-[11px] text-white/50 leading-none">{feat.sub}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT · form panel */}
      <main className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px]">

          <div className="flex md:hidden flex-col items-center mb-6 gap-3">
            <img src={aquantiaLogo} className="w-16" alt="aquantIAlab" />
            <span className="text-2xl font-bold leading-none tracking-tight text-navy-900">
              <span>Aquant</span><span className="text-brand-300">IA</span><span>lab</span>
            </span>
          </div>

          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-300">
              {tab === 'login' ? 'Bienvenido de vuelta' : 'Crear una cuenta'}
            </p>
            <h2 className="mt-2 text-[26px] font-bold tracking-tight text-navy-900 leading-tight">
              {tab === 'login' ? 'Entra en tu panel' : 'Empieza a monitorizar tu finca'}
            </h2>
            <p className="mt-1.5 text-sm text-navy-400 leading-relaxed">
              {tab === 'login'
                ? 'Accede con tu correo y contraseña para ver tus dispositivos.'
                : 'Crea una cuenta gratuita y vincula tu primer ESP32 en minutos.'}
            </p>
          </div>

          <div className="relative flex border-b border-navy-100 mb-6">
            <button
              ref={loginRef}
              onClick={() => switchTab('login')}
              className={`relative flex-1 py-3 text-sm font-semibold transition-colors
                ${tab === 'login' ? 'text-brand-700' : 'text-navy-400 hover:text-navy-700'}`}
            >Entrar</button>
            <button
              ref={regRef}
              onClick={() => switchTab('register')}
              className={`relative flex-1 py-3 text-sm font-semibold transition-colors
                ${tab === 'register' ? 'text-brand-700' : 'text-navy-400 hover:text-navy-700'}`}
            >Crear cuenta</button>
            <span
              className="absolute bottom-0 h-[2px] bg-brand-500 rounded-sm transition-all duration-300"
              style={{
                left: indicator.left,
                width: indicator.width,
                boxShadow: '0 0 8px rgba(12,142,204,.5)',
              }}
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {tab === 'register' && (
              <Field label="Nombre">
                <Input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Tu nombre"
                  autoComplete="name"
                  leading={<User size={14} />}
                />
              </Field>
            )}

            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                required
                autoFocus
                autoComplete="email"
                leading={<Mail size={14} />}
                trailing={
                  email.length > 0 && (
                    <span className={`px-2 ${emailOK ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {emailOK ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                    </span>
                  )
                }
              />
            </Field>

            <Field label="Contraseña">
              <Input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyUp={handleCaps}
                onKeyDown={handleCaps}
                placeholder={tab === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
                required
                autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                leading={<Lock size={14} />}
                trailing={
                  <div className="flex items-center gap-1 pr-1">
                    {capsOn && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        CAPS
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPw(p => !p)}
                      tabIndex={-1}
                      title={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="p-1.5 rounded-lg text-navy-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                }
              />

              {tab === 'register' && password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map(i => (
                      <span
                        key={i}
                        className={`flex-1 h-1 rounded-sm transition-colors ${i <= strength ? STRENGTH_BAR[strength] : 'bg-navy-100'}`}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-navy-400">
                    Seguridad: <span className="font-semibold text-navy-700">{STRENGTH_LABEL[strength] || '—'}</span>
                    <span className="text-navy-300"> · usa mayúsculas, números y símbolos</span>
                  </p>
                </div>
              )}
            </Field>

            {tab === 'register' && (
              <Field
                label="Repetir contraseña"
                error={password2.length > 0 && !pwMatch ? 'Las contraseñas no coinciden.' : ''}
              >
                <Input
                  type={showPw ? 'text' : 'password'}
                  value={password2}
                  onChange={e => setPassword2(e.target.value)}
                  placeholder="Repite la contraseña"
                  required
                  autoComplete="new-password"
                  leading={<Lock size={14} />}
                  trailing={
                    password2.length > 0 && (
                      <span className={`px-2 ${pwMatch ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {pwMatch ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                      </span>
                    )
                  }
                />
              </Field>
            )}

            {tab === 'login' && (
              <div className="flex items-center justify-between">
                <Checkbox id="remember" checked={remember} onChange={setRemember}>
                  Recordar mi sesión
                </Checkbox>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault() }}
                  className="text-[12px] font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
            )}

            {tab === 'register' && (
              <Checkbox id="terms" checked={accepted} onChange={setAccepted}>
                Acepto los{' '}
                <a href="#" onClick={e => e.preventDefault()} className="text-brand-600 hover:text-brand-700 font-semibold">términos</a>
                {' '}y la{' '}
                <a href="#" onClick={e => e.preventDefault()} className="text-brand-600 hover:text-brand-700 font-semibold">política de privacidad</a>.
              </Checkbox>
            )}

            {error && (
              <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl px-4 py-3 mt-1 transition-all shadow-[0_2px_8px_rgba(12,142,204,.25)] hover:shadow-[0_4px_14px_rgba(12,142,204,.35)]"
            >
              {loading
                ? <><Loader size={14} className="animate-spin" /> Cargando…</>
                : tab === 'login'
                  ? <><LogIn size={14} /> Entrar</>
                  : <><UserPlus size={14} /> Crear cuenta</>
              }
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <span className="flex-1 h-px bg-navy-100" />
            <span className="text-[11px] uppercase tracking-widest text-navy-300">o</span>
            <span className="flex-1 h-px bg-navy-100" />
          </div>

          <button
            type="button"
            onClick={() => switchTab(tab === 'login' ? 'register' : 'login')}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-navy-700 bg-white border border-navy-200 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50/40 rounded-xl py-2.5 transition-all"
          >
            {tab === 'login'
              ? <><UserPlus size={14} /> Aún no tengo cuenta · Registrarme</>
              : <><LogIn size={14} /> Ya tengo cuenta · Entrar</>
            }
          </button>

          <footer className="mt-8 pt-6 border-t border-navy-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-navy-400">
              aquantIAlab · <span className="font-mono text-navy-500">meteo.aquantialab.com</span>
            </p>
            <div className="flex items-center gap-4 text-[11px] text-navy-400">
              <a href="#" onClick={e => e.preventDefault()} className="hover:text-navy-700 transition-colors">Privacidad</a>
              <a href="#" onClick={e => e.preventDefault()} className="hover:text-navy-700 transition-colors">Términos</a>
              <a href="#" onClick={e => e.preventDefault()} className="inline-flex items-center gap-1 hover:text-navy-700 transition-colors">
                <LifeBuoy size={11} /> Ayuda
              </a>
              <span className="inline-flex items-center text-[10px] font-mono text-navy-400 bg-navy-50 border border-navy-100 px-1.5 py-0.5 rounded">
                v2.4.1
              </span>
            </div>
          </footer>

        </div>
      </main>
    </div>
  )
}
