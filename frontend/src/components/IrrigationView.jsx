import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Droplets, AlertTriangle, Lock, Unlock, Leaf, Zap, FlaskConical, Power,
  CheckCircle, Clock, AlertCircle, CloudRain, ChevronDown, ChevronUp, RotateCcw,
} from 'lucide-react'

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

// ── RelayControl con temporizador de sesión ──────────────────────────────────
function RelayControl({ setRelay }) {
  const [desired, setDesired] = useState(false)
  const [actual, setActual]   = useState(false)  // confirmado por ESP32 vía ACK
  const [busy, setBusy] = useState(false)
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const pollRef = useRef(null)

  // Carga el estado inicial (desired + actual) desde el servidor
  useEffect(() => {
    fetch('/api/relay')
      .then(r => r.json())
      .then(j => { setDesired(j.desired ?? false); setActual(j.actual ?? false) })
      .catch(() => {})
  }, [])

  // Limpia el polling al desmontar
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  useEffect(() => {
    if (!sessionStart) return
    const id = setInterval(() => setSessionSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [sessionStart])

  // Polling rápido hasta que el ESP32 confirme el nuevo estado (máx ~30s)
  const startSyncPolling = useCallback((expected) => {
    if (pollRef.current) clearInterval(pollRef.current)
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const res = await fetch('/api/relay')
        const j = await res.json()
        const confirmed = j.actual ?? false
        setActual(confirmed)
        if (confirmed === expected || attempts >= 15) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      } catch (_) {
        if (attempts >= 15) { clearInterval(pollRef.current); pollRef.current = null }
      }
    }, 2000)
  }, [])

  const toggle = useCallback(async () => {
    setBusy(true)
    const next = !desired
    await setRelay(next)
    setDesired(next)
    if (next) { setSessionStart(Date.now()); setSessionSeconds(0) }
    else { setSessionStart(null) }
    setBusy(false)
    startSyncPolling(next)
  }, [desired, setRelay, startSyncPolling])

  const synced = desired === actual
  const sessionLiters = (sessionSeconds / 60 * 5).toFixed(1)
  const fmtTime = s => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`

  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-1.5 rounded-lg ${desired ? 'bg-brand-50' : 'bg-navy-50'}`}>
          <Power size={15} className={desired ? 'text-brand-500' : 'text-navy-300'} />
        </div>
        <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">
          Electroválvula principal
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
          actual ? 'bg-emerald-400 animate-pulse' : 'bg-navy-200'
        }`} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-navy-900">
            {actual ? 'Válvula abierta — Regando' : 'Válvula cerrada'}
          </p>
          <p className="text-xs text-navy-300">
            {synced ? 'Sincronizado con el dispositivo' : 'Sincronizando…'}
          </p>
        </div>
      </div>

      {/* Info de sesión — visible cuando está abierta o recién cerrada */}
      {(desired || sessionSeconds > 0) && (
        <div className={`rounded-xl p-3 mb-4 ${
          desired ? 'bg-brand-50 border border-brand-100' : 'bg-navy-50'
        }`}>
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1 text-navy-400">
              <Clock size={11} /> Tiempo abierta
            </span>
            <span className="font-semibold text-navy-700">{fmtTime(sessionSeconds)}</span>
          </div>
          <div className="flex justify-between text-xs mt-1.5">
            <span className="flex items-center gap-1 text-navy-400">
              <Droplets size={11} /> Esta sesión
            </span>
            <span className="font-semibold text-brand-600">{sessionLiters} L</span>
          </div>
          <p className="text-xs text-navy-300 mt-1">Caudal nominal: 5 L/min</p>
        </div>
      )}

      <button
        onClick={toggle}
        disabled={busy}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50 ${
          desired
            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
            : 'bg-brand-500 text-white hover:bg-brand-600'
        }`}
      >
        {desired ? <Lock size={14} /> : <Unlock size={14} />}
        {busy ? 'Enviando…' : desired ? 'Cerrar válvula' : 'Abrir válvula'}
      </button>

      <p className="text-xs text-navy-300 mt-2.5 text-center">
        GPIO 26 · JQC-3FF-S-Z · Relay activo-LOW
      </p>
    </div>
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
    <div className={`rounded-2xl border p-5 ${c.wrap}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Recomendación */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Icon size={20} className={`${c.title} shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <p className={`font-bold text-sm ${c.title}`}>{advice.title}</p>
            <p className={`text-xs mt-0.5 leading-relaxed ${c.sub}`}>{advice.reason}</p>
          </div>
        </div>

        {/* Chips de condiciones */}
        <div className="flex flex-wrap gap-2">
          {conditions.map(cond => (
            <div
              key={cond.label}
              className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2.5 py-2 border border-white/80"
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                cond.ok ? 'bg-emerald-400' : 'bg-red-400'
              }`} />
              <div>
                <p className="text-xs text-navy-400 leading-none">{cond.label}</p>
                <p className={`text-xs font-semibold leading-none mt-0.5 ${
                  cond.ok ? 'text-navy-700' : 'text-red-600'
                }`}>{cond.val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Botón de acción rápida cuando condiciones son óptimas */}
        {advice.level === 'go' && (
          <button
            onClick={onIrrigate}
            className="shrink-0 flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            <Unlock size={14} />
            Regar ahora
          </button>
        )}
      </div>
    </div>
  )
}

// ── Vista principal ──────────────────────────────────────────────────────────
export default function IrrigationView({ latest, setRelay }) {
  const [stats, setStats] = useState(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const loadStats = useCallback(() =>
    fetch('/api/irrigation/stats').then(r => r.json()).then(setStats).catch(() => {}),
  [])

  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 120_000)
    return () => clearInterval(id)
  }, [loadStats])

  const handleIrrigate = useCallback(async () => {
    await setRelay(true)
  }, [setRelay])

  const handleReset = useCallback(async () => {
    setShowResetConfirm(false)
    await fetch('/api/irrigation/reset', { method: 'POST' })
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

        {/* Electroválvula + temporizador de sesión */}
        <RelayControl setRelay={setRelay} />

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
              title="Restablecer contador"
              className="p-1.5 rounded-lg text-navy-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <RotateCcw size={13} />
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
