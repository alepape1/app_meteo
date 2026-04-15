import { useState, useEffect, useCallback, useRef } from 'react'
import ReactApexChart from 'react-apexcharts'
import {
  Droplets, AlertTriangle, Lock, Unlock, Leaf, Zap, FlaskConical, Power,
  CheckCircle, Clock, AlertCircle, CloudRain, ChevronDown, ChevronUp, RotateCcw,
  BarChart2,
} from 'lucide-react'
import { useAuth } from '../AuthContext'

// ── Modal de confirmación genérico ───────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 mx-4 max-w-sm w-full">
        <p className="text-sm font-semibold text-navy-900 mb-1">¿Confirmar acción?</p>
        <p className="text-xs text-navy-400 leading-relaxed mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-navy-500 bg-navy-50 rounded-xl hover:bg-navy-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors"
          >
            Restablecer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Penman-Monteith FAO-56 simplificado ──────────────────────────────────────
// Ra fijado en ~10 MJ/m²/día (media anual Lanzarote ~29°N)
function calcET0(temp, humidity, windSpeed) {
  if (temp == null) return null
  const T   = temp
  const RH  = Math.max(5, Math.min(100, humidity ?? 60))
  const u2  = Math.max(0.5, windSpeed ?? 2)
  const es  = 0.6108 * Math.exp((17.27 * T) / (T + 237.3))
  const ea  = (RH / 100) * es
  const delta = (4098 * es) / Math.pow(T + 237.3, 2)
  const gamma = 0.0668
  const Rn    = 10.0
  const et0   = (0.408 * delta * Rn + gamma * (900 / (T + 273)) * u2 * (es - ea)) /
                (delta + gamma * (1 + 0.34 * u2))
  return Math.max(0, et0).toFixed(1)
}

// ── Asesor de riego ──────────────────────────────────────────────────────────
function getAdvice(temp, humidity, wind, et0Num) {
  const hour = new Date().getHours()
  const optimalHour = (hour >= 6 && hour <= 10) || (hour >= 18 && hour <= 22)

  if (temp == null) return {
    level: 'nodata', color: 'amber',
    title: 'Sin datos del sensor',
    reason: 'No se reciben datos de temperatura del ESP32.',
  }
  if (humidity > 82) return {
    level: 'skip', color: 'blue',
    title: 'No necesario',
    reason: `Humedad alta (${humidity?.toFixed(0)}%) — el suelo probablemente está húmedo.`,
  }
  if (wind > 5) return {
    level: 'bad', color: 'orange',
    title: 'Evitar regar',
    reason: `Viento fuerte (${wind?.toFixed(1)} m/s) — riesgo de deriva del agua.`,
  }
  if (temp > 35) return {
    level: 'bad', color: 'red',
    title: 'Esperar al atardecer',
    reason: `Temperatura muy alta (${temp?.toFixed(1)}°C) — evaporación excesiva. Mejor regar a partir de las 18h.`,
  }
  if (et0Num >= 4 && optimalHour) return {
    level: 'go', color: 'green',
    title: 'Regar ahora',
    reason: `ET₀ alta (${et0Num} mm/día) con horario y condiciones óptimos.`,
  }
  if (et0Num >= 3 && !optimalHour) {
    const next = hour < 6 ? '6:00h' : hour < 18 ? '18:00h' : 'mañana a las 6h'
    return {
      level: 'wait', color: 'amber',
      title: `Regar a las ${next}`,
      reason: `ET₀ moderada-alta (${et0Num} mm/día) — espera la ventana óptima.`,
    }
  }
  if (et0Num < 3) return {
    level: 'ok', color: 'teal',
    title: 'Sin necesidad hoy',
    reason: `ET₀ baja (${et0Num ?? '—'} mm/día) — demanda hídrica reducida.`,
  }
  return {
    level: 'optional', color: 'amber',
    title: 'Riego opcional',
    reason: 'Condiciones aceptables si los cultivos lo requieren.',
  }
}

// ── SVG Water Droplet animado ────────────────────────────────────────────────
// savingsPct 0-100: cuánto se ha ahorrado (más = más lleno = mejor)
function WaterDroplet({ savingsPct, color, size = 72 }) {
  const uid = useRef(`wd${Math.random().toString(36).slice(2, 7)}`).current
  const fill = Math.max(2, Math.min(98, savingsPct))
  // yWave: 12 (lleno) → 100 (vacío), dentro del viewBox 0 0 80 104
  const yWave = 100 - (fill / 100) * 88

  const palette = {
    green: { main: '#10b981', light: '#d1fae5', stroke: '#059669' },
    amber: { main: '#f59e0b', light: '#fef3c7', stroke: '#d97706' },
    red:   { main: '#ef4444', light: '#fee2e2', stroke: '#dc2626' },
  }
  const p = palette[color] ?? palette.green
  // Teardrop: punta arriba, semicírculo en la base (sweep=1 = horario = hacia abajo)
  const dropPath = 'M40,4 C40,4 12,50 12,72 A28,28 0 0 1 68,72 C68,50 40,4 40,4 Z'
  const wavePath = `M-80,${yWave} C-60,${yWave - 4} -40,${yWave + 4} -20,${yWave} `
    + `C0,${yWave - 4} 20,${yWave + 4} 40,${yWave} `
    + `C60,${yWave - 4} 80,${yWave + 4} 100,${yWave} `
    + `C120,${yWave - 4} 140,${yWave + 4} 160,${yWave} `
    + `L160,108 L-80,108 Z`

  return (
    <>
      <style>{`
        @keyframes wv-${uid} { 0%{transform:translateX(0)} 100%{transform:translateX(-80px)} }
        .wv-${uid} { animation: wv-${uid} 2.5s linear infinite; }
      `}</style>
      <svg
        width={size} height={size * 104 / 80}
        viewBox="0 0 80 104"
        style={{ overflow: 'visible', display: 'block' }}
      >
        <defs>
          <clipPath id={`cp-${uid}`}>
            <path d={dropPath} />
          </clipPath>
        </defs>
        {/* Gota fondo */}
        <path d={dropPath} fill={p.light} stroke={p.stroke} strokeWidth="1.5" />
        {/* Relleno + ola animada */}
        <g clipPath={`url(#cp-${uid})`}>
          <rect x="-5" y={yWave + 3} width="90" height="110" fill={p.main} opacity="0.35" />
          <g className={`wv-${uid}`}>
            <path d={wavePath} fill={p.main} opacity="0.75" />
          </g>
        </g>
        {/* Brillo */}
        <ellipse
          cx="28" cy="28" rx="5" ry="9" fill="white" opacity="0.22"
          transform="rotate(-25,28,28)"
        />
      </svg>
    </>
  )
}

// ── Sectores de riego ────────────────────────────────────────────────────────
const SECTORS = [
  { id: 1, name: 'Sector A1', crop: 'Tomate',    area: '0.3 ha', kc: 1.15 },
  { id: 2, name: 'Sector A2', crop: 'Pimiento',  area: '0.2 ha', kc: 1.05 },
  { id: 3, name: 'Sector B1', crop: 'Calabacín', area: '0.4 ha', kc: 1.00 },
  { id: 4, name: 'Sector B2', crop: 'Lechuga',   area: '0.15 ha', kc: 1.00 },
  { id: 5, name: 'Sector C1', crop: 'Tomate',    area: '0.3 ha', kc: 1.15 },
  { id: 6, name: 'Sector C2', crop: 'Aloe vera', area: '0.5 ha', kc: 0.50 },
  { id: 7, name: 'Sector D1', crop: 'Papa',      area: '0.6 ha', kc: 1.15 },
  { id: 8, name: 'Sector D2', crop: 'Cebolla',   area: '0.2 ha', kc: 1.05 },
  { id: 9, name: 'Sector E1', crop: 'Vid',       area: '0.8 ha', kc: 0.85 },
]

function SectorCard({ sector }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-navy-900">{sector.name}</p>
          <p className="text-xs text-navy-300">{sector.crop} · {sector.area}</p>
        </div>
        <span className="text-xs text-navy-300 bg-navy-50 px-2 py-0.5 rounded-full border border-navy-100">
          offline
        </span>
      </div>
      <div className="space-y-2.5">
        <div>
          <div className="flex justify-between text-xs text-navy-300 mb-1">
            <span>Humedad suelo</span><span>— %</span>
          </div>
          <div className="h-1.5 bg-navy-50 rounded-full">
            <div className="h-full bg-navy-100 rounded-full" style={{ width: '0%' }} />
          </div>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300">CE suelo</span>
          <span className="text-navy-300">— dS/m</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300">Temp. suelo</span>
          <span className="text-navy-300">— °C</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300">Kc cultivo</span>
          <span className="font-medium text-navy-500">{sector.kc}</span>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-navy-50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Lock size={12} className="text-navy-300" />
          <span className="text-xs text-navy-300">Válvula cerrada</span>
        </div>
        <button
          disabled
          className="text-xs text-navy-300 bg-navy-50 border border-navy-100 px-2.5 py-1 rounded-lg opacity-50 cursor-not-allowed"
        >
          Regar
        </button>
      </div>
    </div>
  )
}

// ── ValveCard — control individual de una electroválvula ─────────────────────
function ValveCard({ index, mac, flowLpm = 5, initialState }) {
  const { authFetch } = useAuth()
  const [desired, setDesired] = useState(initialState?.desired ?? false)
  const [actual,  setActual]  = useState(initialState?.actual  ?? false)
  const [busy, setBusy] = useState(false)
  const [retryRemainingMs, setRetryRemainingMs] = useState(0)
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionSeconds, setSessionSeconds] = useState(null)
  const pollRef = useRef(null)
  const retryTimerRef = useRef(null)

  // Sync state when parent passes new initialState
  useEffect(() => {
    if (initialState) {
      const nextDesired = Boolean(initialState.desired)
      const nextActual = Boolean(initialState.actual)
      setDesired(nextDesired)
      setActual(nextActual)
      if (nextDesired === nextActual) {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        if (retryTimerRef.current) {
          clearInterval(retryTimerRef.current)
          retryTimerRef.current = null
        }
        setRetryRemainingMs(0)
      }
    }
  }, [initialState?.desired, initialState?.actual])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (retryTimerRef.current) clearInterval(retryTimerRef.current)
  }, [])

  useEffect(() => {
    if (!sessionStart) return
    const id = setInterval(() => setSessionSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [sessionStart])

  const startRetryCooldown = useCallback((timeoutMs = 8000) => {
    if (retryTimerRef.current) clearInterval(retryTimerRef.current)
    const endsAt = Date.now() + timeoutMs
    setRetryRemainingMs(timeoutMs)
    retryTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, endsAt - Date.now())
      setRetryRemainingMs(remaining)
      if (remaining <= 0) {
        clearInterval(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }, 250)
  }, [])

  const startSyncPolling = useCallback((expected) => {
    if (pollRef.current) clearInterval(pollRef.current)
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const url = mac ? `/api/relay?mac=${encodeURIComponent(mac)}` : '/api/relay'
        const res = await authFetch(url)
        const arr = await res.json()
        const row = Array.isArray(arr) ? arr.find(r => r.index === index) : null
        if (row) {
          const backendDesired = Boolean(row.desired)
          const backendActual = Boolean(row.actual)
          setDesired(backendDesired)
          setActual(backendActual)
          if (backendActual === expected || backendDesired === backendActual || attempts >= 15) {
            clearInterval(pollRef.current)
            pollRef.current = null
          }
          if (backendDesired === backendActual && retryTimerRef.current) {
            clearInterval(retryTimerRef.current)
            retryTimerRef.current = null
            setRetryRemainingMs(0)
          }
        } else if (attempts >= 15) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      } catch (_) {
        if (attempts >= 15) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    }, 2000)
  }, [authFetch, mac, index])

  const synced = desired === actual
  const cooldownSeconds = Math.ceil(retryRemainingMs / 1000)
  const actionLocked = busy || retryRemainingMs > 0

  const toggle = useCallback(async () => {
    if (busy || retryRemainingMs > 0) return
    setBusy(true)
    const next = synced ? !desired : !actual
    try {
      await authFetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, index, state: next }),
      })
      setDesired(next)
      startRetryCooldown(8000)
      if (next) { setSessionStart(Date.now()); setSessionSeconds(0) }
      else { setSessionStart(null) }
      startSyncPolling(next)
    } finally {
      setBusy(false)
    }
  }, [busy, retryRemainingMs, synced, desired, actual, authFetch, mac, index, startRetryCooldown, startSyncPolling])
  const fmtTime = s => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  const sessionLiters = sessionSeconds != null ? (sessionSeconds / 60 * flowLpm).toFixed(1) : null

  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-1.5 rounded-lg ${desired ? 'bg-brand-50' : 'bg-navy-50'}`}>
          <Power size={15} className={desired ? 'text-brand-500' : 'text-navy-300'} />
        </div>
        <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">
          Válvula {index + 1}
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
          actual ? 'bg-emerald-400 animate-pulse' : 'bg-navy-200'
        }`} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-navy-900">
            {actual ? 'Abierta — Regando' : 'Cerrada'}
          </p>
          <p className="text-xs text-navy-300">
            {synced ? 'Sincronizado' : retryRemainingMs > 0 ? `Confirmando… ${cooldownSeconds}s` : 'Listo para reintentar'}
          </p>
        </div>
      </div>

      {(desired || sessionSeconds > 0) && (
        <div className={`rounded-xl p-3 mb-4 ${
          desired ? 'bg-brand-50 border border-brand-100' : 'bg-navy-50'
        }`}>
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1 text-navy-400">
              <Clock size={11} /> Tiempo abierta
            </span>
            <span className="font-semibold text-navy-700">{fmtTime(sessionSeconds ?? 0)}</span>
          </div>
          <div className="flex justify-between text-xs mt-1.5">
            <span className="flex items-center gap-1 text-navy-400">
              <Droplets size={11} /> Esta sesión
            </span>
            <span className="font-semibold text-brand-600">{sessionLiters} L</span>
          </div>
          <p className="text-xs text-navy-300 mt-1">Caudal: {flowLpm} L/min</p>
        </div>
      )}

      <button
        onClick={toggle}
        disabled={actionLocked}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          desired
            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
            : 'bg-brand-500 text-white hover:bg-brand-600'
        }`}
      >
        {desired ? <Lock size={14} /> : <Unlock size={14} />}
        {busy
          ? 'Enviando…'
          : retryRemainingMs > 0
            ? `Espera ${cooldownSeconds}s…`
            : !synced
              ? (actual ? 'Reintentar cierre' : 'Reintentar apertura')
              : desired ? 'Cerrar válvula' : 'Abrir válvula'}
      </button>
    </div>
  )
}

// ── RelayPanel — N válvulas según relay_count del dispositivo ─────────────────
function RelayPanel({ selectedMac, relayCount = 1, flowLpm = 5 }) {
  const { authFetch } = useAuth()
  const [states, setStates] = useState([])

  useEffect(() => {
    setStates([])
    const url = selectedMac
      ? `/api/relay?mac=${encodeURIComponent(selectedMac)}`
      : '/api/relay'
    authFetch(url)
      .then(r => r.json())
      .then(arr => {
        const normalized = Array.isArray(arr) ? arr : [{ index: 0, desired: arr.desired ?? false, actual: arr.actual ?? false }]
        setStates(normalized)
      })
      .catch(() => {})
    const id = setInterval(() => {
      authFetch(url).then(r => r.json()).then(arr => {
        const normalized = Array.isArray(arr) ? arr : [{ index: 0, desired: arr.desired ?? false, actual: arr.actual ?? false }]
        setStates(normalized)
      }).catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [authFetch, selectedMac])

  return (
    <>
      {Array.from({ length: relayCount }, (_, i) => (
        <ValveCard
          key={`${selectedMac || 'default'}-${i}`}
          index={i}
          mac={selectedMac}
          flowLpm={flowLpm}
          initialState={states.find(s => s.index === i)}
        />
      ))}
    </>
  )
}

// ── SavingsCard — droplet interactivo con ahorro mensual ─────────────────────
function SavingsCard({ stats }) {
  const [expanded, setExpanded] = useState(false)

  if (!stats) return (
    <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5 flex items-center justify-center min-h-[200px]">
      <p className="text-xs text-navy-300">Calculando ahorro…</p>
    </div>
  )

  const { monthly_liters, baseline_liters, savings_liters, today_liters, daily, days_elapsed } = stats
  const savingsPct = baseline_liters > 0
    ? Math.round((savings_liters / baseline_liters) * 100)
    : 0
  const color = savingsPct >= 60 ? 'green' : savingsPct >= 30 ? 'amber' : 'red'
  const cc = {
    green: { text: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-100' },
    amber: { text: 'text-amber-500',   badge: 'bg-amber-50 text-amber-700',     border: 'border-amber-200' },
    red:   { text: 'text-red-500',     badge: 'bg-red-50 text-red-700',         border: 'border-red-200' },
  }[color]

  return (
    <div
      className={`bg-white rounded-2xl border ${cc.border} shadow-sm p-5 cursor-pointer select-none transition-shadow hover:shadow-md`}
      onClick={() => setExpanded(e => !e)}
      role="button"
      aria-expanded={expanded}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-50 p-1.5 rounded-lg">
            <Leaf size={15} className="text-emerald-600" />
          </div>
          <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">
            Ahorro este mes
          </p>
        </div>
        {expanded
          ? <ChevronUp size={14} className="text-navy-300" />
          : <ChevronDown size={14} className="text-navy-300" />
        }
      </div>

      <div className="flex items-center gap-4">
        <WaterDroplet savingsPct={savingsPct} color={color} size={68} />
        <div className="flex-1 min-w-0">
          <p className="text-3xl font-bold text-navy-900 leading-none">
            {savings_liters.toFixed(0)}
            <span className="text-base font-normal text-navy-300 ml-1">L</span>
          </p>
          <p className="text-xs text-navy-400 mt-1 leading-snug">
            ahorrados vs riego manual diario
          </p>
          <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${cc.badge}`}>
            {savingsPct}% de ahorro
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-navy-50 space-y-2">
          {[
            ['Usado este mes',                       `${monthly_liters.toFixed(1)} L`],
            ['Usado hoy',                            `${today_liters.toFixed(1)} L`],
            [`Referencia (${days_elapsed}d × 15 L)`, `${baseline_liters.toFixed(0)} L`],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-navy-400">{label}</span>
              <span className="font-medium text-navy-700">{val}</span>
            </div>
          ))}
          <div className={`flex justify-between text-xs font-semibold pt-2 border-t border-navy-50 ${cc.text}`}>
            <span>Ahorro total</span>
            <span>{savings_liters.toFixed(1)} L ({savingsPct}%)</span>
          </div>

          {daily.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-navy-300 mb-2">Últimos riegos del mes:</p>
              <div className="space-y-1.5">
                {daily.slice(-5).map(d => (
                  <div key={d.date} className="flex justify-between text-xs">
                    <span className="text-navy-400">
                      {new Date(d.date + 'T12:00:00').toLocaleDateString('es-ES', {
                        weekday: 'short', day: 'numeric', month: 'short',
                      })}
                    </span>
                    <span className="font-medium text-brand-600">
                      {d.liters.toFixed(1)} L · {Math.floor(d.seconds / 60)}m {d.seconds % 60}s
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-navy-300 mt-3 text-center">Toca para ver detalles</p>
    </div>
  )
}

// ── Gráfico de consumo con selector de período ────────────────────────────────
const PERIODS = [
  { id: 'day',     label: 'Días',     hint: 'últimos 30 días' },
  { id: 'week',    label: 'Semanas',  hint: 'últimas 16 semanas' },
  { id: 'month',   label: 'Meses',    hint: 'últimos 12 meses' },
  { id: 'session', label: 'Sesiones', hint: 'últimas 60 sesiones' },
]

function toChartMs(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = String(value).trim()
  if (!raw) return null
  const parsed = Date.parse(raw)
  if (!Number.isNaN(parsed)) return parsed
  const fallback = new Date(raw.includes(',') ? raw : raw.replace(' ', 'T')).getTime()
  return Number.isNaN(fallback) ? null : fallback
}

function toChartNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function fmtPeriodLabel(key, periodId) {
  if (!key) return '—'

  if (periodId === 'day') {
    const ms = toChartMs(`${key}T12:00:00`)
    if (ms == null) return String(key)
    return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  }

  if (periodId === 'week') {
    const [, w] = String(key).split('-W')
    return w ? `Sem ${parseInt(w, 10)}` : String(key)
  }

  if (periodId === 'session') {
    const ms = toChartMs(key)
    if (ms == null) return 'Sesión'
    return new Date(ms)
      .toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      .replace(',', '')
  }

  // month: "2025-03"
  const [y, m] = String(key).split('-')
  if (!y || !m) return String(key)
  return new Date(+y, +m - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

function fmtDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function ConsumptionChart() {
  const { authFetch } = useAuth()
  const [period, setPeriod] = useState('day')
  const [history, setHistory] = useState([])
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    if (period === 'session') {
      authFetch('/api/irrigation/sessions')
        .then(r => r.json())
        .then(setSessions)
        .catch(() => {})
    } else {
      authFetch(`/api/irrigation/history?period=${period}`)
        .then(r => r.json())
        .then(setHistory)
        .catch(() => {})
    }
  }, [period])

  const hint = PERIODS.find(p => p.id === period)?.hint ?? ''

  // ── Sessions view ──
  if (period === 'session') {
    const normalizedSessions = sessions
      .map(s => ({
        ...s,
        startMs: toChartMs(s.start),
        liters: toChartNum(s.liters),
        duration_s: Math.max(0, Math.round(toChartNum(s.duration_s))),
      }))
      .filter(s => s.startMs != null)

    const sessionSeries = [{
      name: 'Consumo',
      data: normalizedSessions.map(s => ({ x: s.startMs, y: s.liters })),
    }]

    const sessionChartKey = `session-${normalizedSessions.length}-${normalizedSessions[normalizedSessions.length - 1]?.startMs ?? 'empty'}`

    const sessionOptions = {
      chart: {
        type: 'bar', toolbar: { show: false }, background: 'transparent',
        fontFamily: '"DM Sans", system-ui, sans-serif',
        animations: { enabled: false },
      },
      colors: ['#10b981'],
      plotOptions: { bar: { borderRadius: 3, columnWidth: '60%' } },
      dataLabels: { enabled: false },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { fontSize: '10px', colors: '#8a9aaa' },
          datetimeUTC: false,
          rotate: -35,
          hideOverlappingLabels: true,
          formatter: val => fmtPeriodLabel(val, 'session'),
        },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { fontSize: '11px', colors: '#8a9aaa' },
          formatter: v => `${toChartNum(v).toFixed(0)} L`,
        },
      },
      grid: {
        borderColor: '#f3f3ef',
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
        padding: { left: 0, right: 8, bottom: 8 },
      },
      tooltip: {
        theme: 'light',
        x: { formatter: val => fmtPeriodLabel(val, 'session') },
        custom: ({ dataPointIndex }) => {
          const s = normalizedSessions[dataPointIndex]
          if (!s) return ''
          return `<div style="padding:8px 12px;font-family:'DM Sans',sans-serif;font-size:12px">
            <div style="font-weight:600;color:#1e2d3d;margin-bottom:4px">${fmtDuration(s.duration_s)}</div>
            <div style="color:#5a7a9a">${s.liters.toFixed(1)} L consumidos</div>
          </div>`
        },
      },
    }

    const totalL = normalizedSessions.reduce((a, s) => a + s.liters, 0)

    return (
      <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-4 pb-2 flex-wrap">
          <BarChart2 size={15} className="text-navy-300 shrink-0" />
          <h3 className="font-semibold text-navy-900 text-sm">Historial de consumo</h3>
          {normalizedSessions.length > 0 && (
            <span className="text-xs text-navy-300">
              {normalizedSessions.length} sesiones · {totalL.toFixed(1)} L total
            </span>
          )}
          <div className="ml-auto flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  period === p.id
                    ? 'bg-brand-500 text-white'
                    : 'text-navy-400 hover:bg-navy-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {normalizedSessions.length > 0 ? (
          <ReactApexChart key={sessionChartKey} options={sessionOptions} series={sessionSeries} type="bar" height={240} />
        ) : (
          <div className="flex items-center justify-center text-navy-200 text-xs" style={{ height: 220 }}>
            Sin sesiones de riego registradas
          </div>
        )}
      </div>
    )
  }

  // ── Días / Semanas / Meses view ──
  const normalizedHistory = history
    .map(d => ({
      ...d,
      period: String(d.period ?? ''),
      liters: toChartNum(d.liters),
      seconds: Math.max(0, Math.round(toChartNum(d.seconds))),
    }))
    .filter(d => d.period)

  const series = [{ name: 'Consumo', data: normalizedHistory.map(d => ({ x: d.period, y: d.liters })) }]
  const historyChartKey = `${period}-${normalizedHistory.length}-${normalizedHistory[normalizedHistory.length - 1]?.period ?? 'empty'}`

  const options = {
    chart: {
      type: 'bar', toolbar: { show: false }, background: 'transparent',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      animations: { enabled: false },
    },
    colors: ['#0c8ecc'],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '58%' } },
    dataLabels: { enabled: false },
    xaxis: {
      type: 'category',
      labels: {
        style: { fontSize: '11px', colors: '#8a9aaa' },
        formatter: v => fmtPeriodLabel(v, period),
        rotate: -30,
        hideOverlappingLabels: true,
        trim: true,
      },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { fontSize: '11px', colors: '#8a9aaa' },
        formatter: v => `${toChartNum(v).toFixed(0)} L`,
      },
    },
    grid: {
      borderColor: '#f3f3ef',
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      padding: { left: 0, right: 8, bottom: 8 },
    },
    tooltip: {
      theme: 'light',
      x: { formatter: v => fmtPeriodLabel(v, period) },
      y: { formatter: v => `${toChartNum(v).toFixed(1)} L` },
      style: { fontSize: '12px', fontFamily: '"DM Sans"' },
    },
  }

  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2 flex-wrap">
        <BarChart2 size={15} className="text-navy-300 shrink-0" />
        <h3 className="font-semibold text-navy-900 text-sm">Historial de consumo</h3>
        <span className="text-xs text-navy-200 hidden sm:block">{hint}</span>
        <div className="ml-auto flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                period === p.id
                  ? 'bg-brand-500 text-white'
                  : 'text-navy-400 hover:bg-navy-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {normalizedHistory.length > 0 ? (
        <ReactApexChart key={historyChartKey} options={options} series={series} type="bar" height={240} />
      ) : (
        <div className="flex items-center justify-center text-navy-200 text-xs" style={{ height: 220 }}>
          Sin datos de riego en este período
        </div>
      )}
    </div>
  )
}

// ── Asesor de riego (banner inteligente) ─────────────────────────────────────
function IrrigationAdvisor({ latest, onIrrigate }) {
  const et0 = calcET0(latest.temperature, latest.humidity, latest.windSpeed)
  const et0Num = et0 ? parseFloat(et0) : null
  const advice = getAdvice(latest.temperature, latest.humidity, latest.windSpeed, et0Num)
  const hour = new Date().getHours()
  const optimalHour = (hour >= 6 && hour <= 10) || (hour >= 18 && hour <= 22)

  const palette = {
    green:  { wrap: 'bg-emerald-50 border-emerald-200', title: 'text-emerald-800', sub: 'text-emerald-600' },
    teal:   { wrap: 'bg-brand-50 border-brand-100',     title: 'text-brand-800',   sub: 'text-brand-600' },
    amber:  { wrap: 'bg-amber-50 border-amber-200',     title: 'text-amber-800',   sub: 'text-amber-600' },
    orange: { wrap: 'bg-orange-50 border-orange-200',   title: 'text-orange-800',  sub: 'text-orange-600' },
    red:    { wrap: 'bg-red-50 border-red-200',         title: 'text-red-800',     sub: 'text-red-600' },
    blue:   { wrap: 'bg-blue-50 border-blue-200',       title: 'text-blue-800',    sub: 'text-blue-600' },
  }
  const c = palette[advice.color] ?? palette.amber

  const conditions = [
    {
      label: 'Temperatura',
      val: latest.temperature != null ? `${latest.temperature.toFixed(1)}°C` : '—',
      ok: latest.temperature != null && latest.temperature < 32,
    },
    {
      label: 'Humedad',
      val: latest.humidity != null ? `${latest.humidity.toFixed(0)}%` : '—',
      ok: latest.humidity != null && latest.humidity < 75,
    },
    {
      label: 'Viento',
      val: latest.windSpeed != null ? `${latest.windSpeed.toFixed(1)} m/s` : '—',
      ok: latest.windSpeed != null && latest.windSpeed < 4,
    },
    { label: 'Horario', val: `${hour}:00h`, ok: optimalHour },
  ]

  const Icon = {
    go: CheckCircle, wait: Clock, skip: CloudRain,
    ok: Leaf, bad: AlertCircle, optional: Zap, nodata: AlertTriangle,
  }[advice.level] ?? AlertTriangle

  return (
    <div className={`rounded-2xl border p-4 ${c.wrap}`}>
      {/* Fila título + botón */}
      <div className="flex items-start gap-3 mb-3">
        <Icon size={18} className={`${c.title} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm ${c.title}`}>{advice.title}</p>
          <p className={`text-xs mt-0.5 leading-relaxed ${c.sub}`}>{advice.reason}</p>
        </div>
        {advice.level === 'go' && (
          <button
            onClick={onIrrigate}
            className="shrink-0 flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Unlock size={12} /> Regar
          </button>
        )}
      </div>

      {/* Grid de chips — 2 col en móvil/estrecho, 4 col en ancho */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {conditions.map(cond => (
          <div
            key={cond.label}
            className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1.5 border border-white/80"
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              cond.ok ? 'bg-emerald-400' : 'bg-red-400'
            }`} />
            <div className="min-w-0">
              <p className="text-xs text-navy-400 leading-none truncate">{cond.label}</p>
              <p className={`text-xs font-semibold leading-none mt-0.5 ${
                cond.ok ? 'text-navy-700' : 'text-red-600'
              }`}>{cond.val}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Vista principal ──────────────────────────────────────────────────────────
export default function IrrigationView({ latest, selectedMac, deviceInfo }) {
  const { authFetch } = useAuth()
  const [stats, setStats] = useState(null)
  const [flowLpm, setFlowLpm] = useState(5.0)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const relayCount = deviceInfo?.relay_count ?? 1

  const loadStats = useCallback(() =>
    authFetch('/api/irrigation/stats').then(r => r.json()).then(setStats).catch(() => {}),
  [])

  useEffect(() => {
    authFetch('/api/settings')
      .then(r => r.json())
      .then(s => setFlowLpm(parseFloat(s.flow_lpm ?? '5.0')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 120_000)
    return () => clearInterval(id)
  }, [loadStats])

  const handleIrrigate = useCallback(async () => {
    await authFetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac: selectedMac, index: 0, state: true }),
    })
  }, [selectedMac])

  const handleReset = useCallback(async () => {
    setShowResetConfirm(false)
    await authFetch('/api/irrigation/reset', { method: 'POST' })
    loadStats()
  }, [loadStats])

  const et0 = calcET0(latest.temperature, latest.humidity, latest.windSpeed)
  const et0Num = et0 != null ? parseFloat(et0) : null

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-5">

      {showResetConfirm && (
        <ConfirmModal
          message="Se restablecerá el contador de litros consumidos. Los datos históricos de la base de datos no se borran."
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {/* ── Banner desarrollo ── */}
      <div className="bg-[#FAEEDA] border border-[#FAC775] rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-[#BA7517] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-[#BA7517]">
            Módulo de Riego — Hardware en desarrollo
          </p>
          <p className="text-xs text-[#BA7517]/80 mt-0.5 leading-relaxed">
            Los 9 nodos de campo y las electroválvulas están en fabricación.
            Los datos de suelo se activarán al instalar los sensores.
            El motor ET₀ ya funciona con los datos meteorológicos actuales de la estación.
          </p>
        </div>
      </div>

      {/* ── Asesor de riego ── */}
      <IrrigationAdvisor latest={latest} onIrrigate={handleIrrigate} />

      {/* ── Grid de control: 1 col → 2 col → 4 col ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* Electroválvulas — una card por relay */}
        <RelayPanel selectedMac={selectedMac} relayCount={relayCount} flowLpm={flowLpm} />

        {/* ET₀ estimado */}
        <div className="bg-white rounded-2xl border border-brand-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-brand-50 p-1.5 rounded-lg">
              <Zap size={15} className="text-brand-500" />
            </div>
            <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">
              ET₀ estimado hoy
            </p>
          </div>
          <p className="text-3xl font-bold text-navy-900 leading-none">
            {et0 ?? '—'}
            <span className="text-base font-normal text-navy-300 ml-1">mm/día</span>
          </p>
          {et0Num != null && (
            <div className="mt-3 pt-3 border-t border-navy-50">
              <div className="h-1.5 bg-brand-50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full"
                  style={{ width: `${Math.min(100, (et0Num / 8) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-navy-300 mt-1.5">
                {et0Num < 3
                  ? 'Baja evapotranspiración'
                  : et0Num < 5
                  ? 'Evapotranspiración media'
                  : 'Alta evapotranspiración'}
              </p>
            </div>
          )}
          <p className="text-xs text-navy-300 mt-2">
            Penman-Monteith FAO-56 · datos en tiempo real
          </p>
        </div>

        {/* Consumo de agua hoy / mes */}
        <div className="bg-white rounded-2xl border border-[#c5c2ef] shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#EEEDFE] p-1.5 rounded-lg">
                <Droplets size={15} className="text-[#534AB7]" />
              </div>
              <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">
                Consumo de agua
              </p>
            </div>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-1.5 text-xs text-navy-400 hover:text-red-500 bg-navy-50 hover:bg-red-50 border border-navy-100 hover:border-red-200 px-2.5 py-1 rounded-lg transition-colors"
            >
              <RotateCcw size={11} />
              Resetear
            </button>
          </div>
          <p className="text-3xl font-bold text-navy-900 leading-none">
            {stats ? stats.today_liters.toFixed(1) : '—'}
            <span className="text-base font-normal text-navy-300 ml-1">L hoy</span>
          </p>
          {stats ? (
            <>
              <p className="text-sm text-navy-500 mt-2 font-medium">
                {stats.monthly_liters.toFixed(1)}{' '}
                <span className="text-navy-300 font-normal text-xs">L este mes</span>
              </p>
              <div className="mt-3 pt-3 border-t border-navy-50 space-y-1">
                <p className="text-xs text-navy-300">Caudal nominal: 5 L/min</p>
                {stats.monthly_seconds > 0 && (
                  <p className="text-xs text-navy-300">
                    {Math.floor(stats.monthly_seconds / 60)}m {stats.monthly_seconds % 60}s
                    {' '}activa este mes
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-navy-300 mt-3 pt-3 border-t border-navy-50">
              Calculando…
            </p>
          )}
        </div>

        {/* Ahorro mensual — droplet interactivo */}
        <SavingsCard stats={stats} />

      </div>

      {/* ── Gráfico de consumo diario ── */}
      <ConsumptionChart />

      {/* ── Sectores de riego ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-navy-900">
            Sectores de riego
            <span className="text-navy-300 font-normal ml-1">(9 nodos LoRa)</span>
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-navy-300 bg-navy-50 px-2.5 py-1 rounded-full border border-navy-100">
            <span className="w-1.5 h-1.5 bg-navy-200 rounded-full" />
            Sin nodos conectados
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SECTORS.map(sector => (
            <SectorCard key={sector.id} sector={sector} />
          ))}
        </div>
      </div>

      {/* ── Banner automatización ── */}
      <div className="bg-navy-900 rounded-2xl p-5 flex items-start gap-4">
        <div className="bg-brand-500/20 p-2 rounded-xl shrink-0">
          <FlaskConical size={18} className="text-brand-300" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">
            Control automático por sectores — Próximamente
          </p>
          <p className="text-xs text-navy-300 leading-relaxed">
            Cuando los nodos de campo estén instalados, el sistema calculará automáticamente
            el déficit hídrico por sector usando ET₀ real y humedad de suelo, abrirá las
            electroválvulas latch DC y registrará el consumo para justificación PERTE.
            Sin intervención humana.
          </p>
        </div>
      </div>

    </main>
  )
}
