import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Droplets, AlertTriangle, Lock, Unlock, Leaf, Zap, FlaskConical, Power,
  CheckCircle, Clock, AlertCircle, CloudRain, ChevronDown, ChevronUp, RotateCcw,
  BarChart2, Activity, Timer, Gauge,
} from 'lucide-react'
import { useAuth } from '../AuthContext'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([BarChart, GridComponent, TooltipComponent, LegacyGridContainLabel, CanvasRenderer])

function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
const ha = hexAlpha

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-navy-300" />
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-navy-300">{label}</h2>
      {children}
    </div>
  )
}

// ── Info chip — identical to DeviceStatus ─────────────────────────────────────
function InfoChip({ icon: Icon, label, value, accent = '#1a3350', mono = false }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-navy-100/70" style={{ background: ha(accent, 0.04) }}>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: ha(accent, 0.1) }}>
        <Icon size={12} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-navy-300 leading-none">{label}</p>
        <p className={`text-[11px] font-semibold text-navy-800 leading-tight mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</p>
      </div>
    </div>
  )
}

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
export function calcET0(temp, humidity, windSpeed) {
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
export function getAdvice(temp, humidity, wind, et0Num) {
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

// ── Aquantia drop path ────────────────────────────────────────────────────────
const _HW = 54, _CX = 66, _TOP = 6, _BOT = 148, _SIDEY = 96, _BCY = 124
const _LX = _CX - _HW, _RX = _CX + _HW, _BCX = Math.round(_HW * 0.55)
const AQUANTIA_DROP_PATH =
  `M ${_CX} ${_TOP} C ${_CX} ${_TOP}, ${_LX} 60, ${_LX} ${_SIDEY} ` +
  `C ${_LX} ${_BCY}, ${_CX - _BCX} ${_BOT}, ${_CX} ${_BOT} ` +
  `C ${_CX + _BCX} ${_BOT}, ${_RX} ${_BCY}, ${_RX} ${_SIDEY} ` +
  `C ${_RX} 60, ${_CX} ${_TOP}, ${_CX} ${_TOP} Z`

function buildWave(amplitude, freq, phase, yBase, dir) {
  const W = 132, H = 156, steps = 24
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W
    const y = yBase + amplitude * Math.sin(freq * (x / W) * Math.PI * 2 + phase * dir)
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `M 0 ${H} L 0 ${pts[0].split(',')[1]} L ` + pts.join(' L ') + ` L ${W} ${H} Z`
}

export function getWaterColors(pct) {
  if (pct >= 100) return { top: '#ff6a6a', deep: '#a31818', stroke: '#b91c1c', bg: '#fee2e2' }
  if (pct >= 85)  return { top: '#ffae3b', deep: '#b86a07', stroke: '#b86a07', bg: '#fef3c7' }
  return               { top: '#3fb6f0', deep: '#0b4f88', stroke: '#0b4f88', bg: '#eaf5ff' }
}

function WaterDroplet({ consumptionPct = 0, size = 120, mode = 'normal' }) {
  const uid      = useRef(`wd${Math.random().toString(36).slice(2, 7)}`).current
  const svgRef   = useRef(null)
  const frontRef = useRef(null)
  const backRef  = useRef(null)
  const midRef   = useRef(null)
  const bgRef    = useRef(null)
  const stop0    = useRef(null)
  const stop1    = useRef(null)
  const outRef   = useRef(null)
  const glowRef  = useRef(null)
  const rafId    = useRef(null)
  const anim     = useRef({ displayedPct: 0, phase: 0, introStart: null, target: 0 })
  const modeRef  = useRef(mode)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { anim.current.target = Math.max(0, consumptionPct) }, [consumptionPct])

  useEffect(() => {
    const Y_TOP = 14, Y_BOTTOM = 150, INTRO_MS = 2500
    const Y_MIN = Y_BOTTOM - 0.20 * (Y_BOTTOM - Y_TOP)
    anim.current.introStart = performance.now()
    anim.current.displayedPct = 0

    function tick(now) {
      const a = anim.current
      const currentMode = modeRef.current
      const isFlowing = currentMode !== 'normal'
      const isLeak    = currentMode === 'flowing-leak'
      const WAVE_AMP   = isFlowing ? 13 : 9
      const WAVE_SPEED = isFlowing ? 1.1 : 0.5

      if (isFlowing) {
        const t = (now / 3200) % 1
        a.target = 32 + 38 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2))
      }

      const introP = Math.min(1, (now - a.introStart) / INTRO_MS)
      const eased  = 1 - Math.pow(1 - introP, 3)
      a.displayedPct += ((isFlowing ? a.target : a.target * eased) - a.displayedPct) * (isFlowing ? 0.04 : 0.08)
      a.phase += 0.035 * WAVE_SPEED

      const p     = Math.max(0, Math.min(1.25, a.displayedPct / 100))
      const yBase = Math.min(Y_BOTTOM - p * (Y_BOTTOM - Y_TOP), Y_MIN)

      if (frontRef.current) frontRef.current.setAttribute('d', buildWave(WAVE_AMP, 1.6, a.phase, yBase, +1))
      if (midRef.current)   midRef.current.setAttribute('d',   buildWave(WAVE_AMP * 0.8, 2.0, a.phase + 2.0, yBase + 2, +1))
      if (backRef.current)  backRef.current.setAttribute('d',  buildWave(WAVE_AMP * 1.2, 1.2, a.phase + 1.2, yBase + 5, -1))

      let c
      if (isLeak) {
        const leakPulse = 0.65 + 0.35 * Math.abs(Math.sin(now / 800))
        c = { top: `rgba(255,100,80,${leakPulse})`, deep: '#a31818', stroke: '#b91c1c', bg: '#fee2e2' }
        if (glowRef.current) {
          glowRef.current.setAttribute('stroke', `rgba(220,38,38,${leakPulse * 0.6})`)
          glowRef.current.setAttribute('stroke-width', `${6 + 4 * Math.abs(Math.sin(now / 600))}`)
        }
      } else if (isFlowing) {
        const flowPulse = 0.75 + 0.25 * Math.abs(Math.sin(now / 900))
        c = { top: `rgba(16,185,129,${flowPulse})`, deep: '#065f46', stroke: '#059669', bg: '#d1fae5' }
        if (glowRef.current) {
          glowRef.current.setAttribute('stroke', `rgba(16,185,129,${flowPulse * 0.5})`)
          glowRef.current.setAttribute('stroke-width', `${5 + 3 * Math.abs(Math.sin(now / 700))}`)
        }
      } else {
        c = getWaterColors(a.displayedPct)
        if (glowRef.current) {
          glowRef.current.setAttribute('stroke', '#3fb6f0')
          glowRef.current.setAttribute('stroke-width', '6')
        }
      }

      if (stop0.current) stop0.current.setAttribute('stop-color', c.top)
      if (stop1.current) stop1.current.setAttribute('stop-color', c.deep)
      if (outRef.current) outRef.current.setAttribute('stroke', c.stroke)
      if (bgRef.current)  bgRef.current.setAttribute('fill', c.bg)

      if (svgRef.current)
        svgRef.current.style.animation = (!isFlowing && a.displayedPct >= 100)
          ? `shk-${uid} 1.8s ease-in-out infinite` : ''

      rafId.current = requestAnimationFrame(tick)
    }

    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
  }, [uid])

  const h = Math.round(size * 156 / 132)
  return (
    <>
      <style>{`@keyframes shk-${uid}{0%,92%,100%{transform:translateX(0)}94%{transform:translateX(-2px)}96%{transform:translateX(2px)}98%{transform:translateX(-1px)}}`}</style>
      <svg ref={svgRef} width={size} height={h} viewBox="0 0 132 156" style={{ overflow: 'visible', display: 'block', flexShrink: 0 }}>
        <defs>
          <clipPath id={`cp-${uid}`}><path d={AQUANTIA_DROP_PATH} /></clipPath>
          <linearGradient id={`wg-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop ref={stop0} offset="0%"   stopColor="#3fb6f0" />
            <stop ref={stop1} offset="100%" stopColor="#0b4f88" />
          </linearGradient>
          <pattern id={`ct-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M0 5 H7 V0 M20 9 H13 V20 M5 20 V15 H15 V10" fill="none" stroke="#7fd0ff" strokeWidth="0.5" opacity="0.55"/>
            <circle cx="7" cy="5" r="0.9" fill="#9fdcff" opacity="0.7"/>
            <circle cx="13" cy="9" r="0.9" fill="#9fdcff" opacity="0.7"/>
          </pattern>
          <filter id={`glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <path ref={glowRef} d={AQUANTIA_DROP_PATH} fill="none" stroke="#3fb6f0" strokeWidth="6" opacity="0.25" filter={`url(#glow-${uid})`} />
        <path ref={bgRef} d={AQUANTIA_DROP_PATH} fill="#eaf5ff" stroke="none" />
        <g clipPath={`url(#cp-${uid})`}>
          <rect x="0" y="0" width="132" height="156" fill={`url(#ct-${uid})`} opacity="0.6" />
        </g>
        <g clipPath={`url(#cp-${uid})`}>
          <ellipse cx="45" cy="38" rx="9" ry="16" fill="white" opacity="0.22" transform="rotate(-25,45,38)" />
          <ellipse cx="35" cy="55" rx="5" ry="8"  fill="white" opacity="0.14" transform="rotate(-20,35,55)" />
          <ellipse cx="90" cy="42" rx="3" ry="5"  fill="white" opacity="0.10" transform="rotate(15,90,42)" />
        </g>
        <g clipPath={`url(#cp-${uid})`}>
          <path ref={backRef}  d="" fill={`url(#wg-${uid})`} opacity="0.45" />
          <path ref={midRef}   d="" fill={`url(#wg-${uid})`} opacity="0.60" />
          <path ref={frontRef} d="" fill={`url(#wg-${uid})`} opacity="1" />
        </g>
        <path ref={outRef} d={AQUANTIA_DROP_PATH} fill="none" stroke="#0b4f88" strokeWidth="2.5" />
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

const TIMER_PRESETS = [
  { label: '5m',  seconds: 300  },
  { label: '10m', seconds: 600  },
  { label: '20m', seconds: 1200 },
  { label: '30m', seconds: 1800 },
]



// ── SectorCard ───────────────────────────────────────────────────────────────
function SectorCard({ sector }) {
  return (
    <div
      className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden"
      style={{ borderTop: `3px solid ${ha('#1a3350', 0.4)}` }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-navy-900">{sector.name}</p>
            <p className="text-xs text-navy-300">{sector.crop} · {sector.area}</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-navy-50 text-navy-300 border border-navy-100 leading-none">
            offline
          </span>
        </div>
        <div className="space-y-2.5">
          <div>
            <div className="flex justify-between text-xs text-navy-300 mb-1">
              <span>Humedad suelo</span><span>— %</span>
            </div>
            <div className="h-1.5 bg-navy-50 rounded-full overflow-hidden">
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
    </div>
  )
}

// ── ValveCard ─────────────────────────────────────────────────────────────────
function ValveCard({ index, mac, flowLpm = 5, sensorFlowLpm, initialState }) {
  const { authFetch } = useAuth()
  const [desired, setDesired] = useState(initialState?.desired ?? false)
  const [actual,  setActual]  = useState(initialState?.actual  ?? false)
  const [busy, setBusy] = useState(false)
  const [retryRemainingMs, setRetryRemainingMs] = useState(0)
  const [sessionStart, setSessionStart] = useState(null)
  const [sessionSeconds, setSessionSeconds] = useState(null)
  const pollRef = useRef(null)
  const retryTimerRef = useRef(null)
  const autoCloseRef = useRef(null)
  const [timerPreset, setTimerPreset] = useState(null)
  const [timerRemaining, setTimerRemaining] = useState(null)

  useEffect(() => {
    if (initialState) {
      const nextDesired = Boolean(initialState.desired)
      const nextActual  = Boolean(initialState.actual)
      setDesired(nextDesired)
      setActual(nextActual)
      if (nextDesired === nextActual) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null }
        setRetryRemainingMs(0)
      }
    }
  }, [initialState?.desired, initialState?.actual])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (retryTimerRef.current) clearInterval(retryTimerRef.current)
    if (autoCloseRef.current) clearInterval(autoCloseRef.current)
  }, [])

  useEffect(() => {
    if (!sessionStart) return
    const id = setInterval(() => setSessionSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [sessionStart])

  useEffect(() => {
    if (autoCloseRef.current) { clearInterval(autoCloseRef.current); autoCloseRef.current = null }
    if (!desired || timerPreset == null) { setTimerRemaining(null); return }
    const endsAt = Date.now() + timerPreset * 1000
    setTimerRemaining(timerPreset)
    autoCloseRef.current = setInterval(async () => {
      const rem = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setTimerRemaining(rem)
      if (rem <= 0) {
        clearInterval(autoCloseRef.current); autoCloseRef.current = null
        setTimerPreset(null); setTimerRemaining(null); setSessionStart(null); setDesired(false)
        try {
          await authFetch('/api/relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mac, index, state: false }),
          })
        } catch (e) { void e }
      }
    }, 1000)
    return () => { if (autoCloseRef.current) { clearInterval(autoCloseRef.current); autoCloseRef.current = null } }
  }, [desired, timerPreset, authFetch, mac, index])

  const startRetryCooldown = useCallback((timeoutMs = 8000) => {
    if (retryTimerRef.current) clearInterval(retryTimerRef.current)
    const endsAt = Date.now() + timeoutMs
    setRetryRemainingMs(timeoutMs)
    retryTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, endsAt - Date.now())
      setRetryRemainingMs(remaining)
      if (remaining <= 0) { clearInterval(retryTimerRef.current); retryTimerRef.current = null }
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
          const backendActual  = Boolean(row.actual)
          setDesired(backendDesired)
          setActual(backendActual)
          if (backendActual === expected || backendDesired === backendActual || attempts >= 15) {
            clearInterval(pollRef.current); pollRef.current = null
          }
          if (backendDesired === backendActual && retryTimerRef.current) {
            clearInterval(retryTimerRef.current); retryTimerRef.current = null; setRetryRemainingMs(0)
          }
        } else if (attempts >= 15) {
          clearInterval(pollRef.current); pollRef.current = null
        }
      } catch (_) {
        if (attempts >= 15) { clearInterval(pollRef.current); pollRef.current = null }
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
      else {
        setSessionStart(null); setTimerPreset(null); setTimerRemaining(null)
        if (autoCloseRef.current) { clearInterval(autoCloseRef.current); autoCloseRef.current = null }
      }
      startSyncPolling(next)
    } finally { setBusy(false) }
  }, [busy, retryRemainingMs, synced, desired, actual, authFetch, mac, index, startRetryCooldown, startSyncPolling])

  const fmtTime = s => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  const effectiveFlowLpm = (sensorFlowLpm > 0) ? sensorFlowLpm : flowLpm
  const sessionLiters = sessionSeconds != null ? (sessionSeconds / 60 * effectiveFlowLpm).toFixed(1) : null

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors duration-200 ${
        desired ? 'bg-sky-50/40' : 'hover:bg-slate-50/30'
      }`}
    >
      {/* Number badge + status LED */}
      <div className="relative shrink-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center font-mono text-sm font-extrabold transition-all duration-300"
          style={desired
            ? { background: 'linear-gradient(135deg, #0369a1, #38bdf8)', color: '#fff', boxShadow: '0 0 14px rgba(14,165,233,0.4)' }
            : { background: '#f1f5f9', color: '#64748b' }}
        >
          {index + 1}
        </div>
        <span
          className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white transition-colors duration-300 ${actual ? 'bg-emerald-400' : 'bg-slate-300'}`}
          style={actual ? { boxShadow: '0 0 6px rgba(52,211,153,0.8)', animation: 'pulse 2s ease-in-out infinite' } : {}}
        />
      </div>

      {/* Center: label + session / presets */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-bold text-navy-700">Válvula {index + 1}</span>
          {!synced && retryRemainingMs > 0 && (
            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full leading-none">
              {cooldownSeconds}s
            </span>
          )}
          {!synced && retryRemainingMs === 0 && (
            <span className="text-[9px] text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full leading-none">↺</span>
          )}
        </div>
        {desired && sessionSeconds != null ? (
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-0.5 text-[10px] text-sky-600 font-medium tabular-nums">
              <Clock size={9} className="shrink-0" />{fmtTime(sessionSeconds)}
            </span>
            <span className="text-[10px] font-bold text-sky-700 tabular-nums">{sessionLiters} L</span>
            {timerRemaining != null && timerPreset != null && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 font-semibold tabular-nums">
                <Timer size={9} className="shrink-0" />{fmtTime(timerRemaining)}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Timer size={8} className="text-navy-300 shrink-0" />
            {TIMER_PRESETS.map(t => (
              <button
                key={t.label}
                onClick={e => { e.stopPropagation(); setTimerPreset(prev => prev === t.seconds ? null : t.seconds) }}
                className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-all border leading-none ${
                  timerPreset === t.seconds
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-navy-400 border-navy-100 hover:border-brand-300 hover:text-brand-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {desired && timerPreset != null && timerRemaining != null && (
          <div className="mt-1 h-0.5 bg-sky-100 rounded-full overflow-hidden w-20">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-1000"
              style={{ width: `${Math.round((timerRemaining / timerPreset) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Flow rate (only when active, sm+) */}
      {desired && (
        <div className="shrink-0 text-right hidden sm:block">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-navy-300 leading-none">Caudal</p>
          <p className="text-[11px] font-bold text-sky-600 tabular-nums mt-0.5">
            {effectiveFlowLpm}<span className="text-[9px] font-normal text-navy-300"> L/m</span>
          </p>
        </div>
      )}

      {/* Pill toggle switch */}
      <div className="shrink-0">
        <button
          onClick={toggle}
          disabled={actionLocked}
          title={
            busy ? 'Enviando…'
            : retryRemainingMs > 0 ? `Espera ${cooldownSeconds}s…`
            : !synced ? (actual ? 'Reintentar cierre' : 'Reintentar apertura')
            : desired ? 'Cerrar válvula' : 'Abrir válvula'
          }
          className="relative w-[52px] h-[28px] rounded-full transition-all duration-300 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: desired
              ? 'linear-gradient(135deg, #0369a1 0%, #38bdf8 100%)'
              : '#e2e8f0',
            boxShadow: desired
              ? '0 0 0 3px rgba(14,165,233,0.15), 0 2px 6px rgba(14,165,233,0.25)'
              : 'inset 0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          <span
            className="absolute top-[4px] w-5 h-5 bg-white rounded-full shadow flex items-center justify-center transition-all duration-300"
            style={{ left: desired ? 'calc(100% - 24px)' : '4px' }}
          >
            {busy
              ? <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" />
              : desired
                ? <Unlock size={8} className="text-sky-500" />
                : <Lock size={8} className="text-slate-400" />
            }
          </span>
        </button>
      </div>
    </div>
  )
}

// ── ValvePanel ────────────────────────────────────────────────────────────────
function ValvePanel({ selectedMac, relayCount = 1, flowLpm = 5, sensorFlowLpm }) {
  const { authFetch } = useAuth()
  const [states, setStates] = useState([])
  const [closingAll, setClosingAll] = useState(false)

  useEffect(() => {
    setStates([])
    const url = selectedMac ? `/api/relay?mac=${encodeURIComponent(selectedMac)}` : '/api/relay'
    authFetch(url).then(r => r.json()).then(arr => {
      const normalized = Array.isArray(arr) ? arr : [{ index: 0, desired: arr.desired ?? false, actual: arr.actual ?? false }]
      setStates(normalized)
    }).catch(() => {})
    const id = setInterval(() => {
      authFetch(url).then(r => r.json()).then(arr => {
        const normalized = Array.isArray(arr) ? arr : [{ index: 0, desired: arr.desired ?? false, actual: arr.actual ?? false }]
        setStates(normalized)
      }).catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [authFetch, selectedMac])

  const activeCount = states.filter(s => s.desired || s.actual).length
  const anyActive = activeCount > 0

  const closeAll = useCallback(async () => {
    setClosingAll(true)
    try {
      await Promise.all(
        Array.from({ length: relayCount }, (_, i) =>
          authFetch('/api/relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mac: selectedMac, index: i, state: false }),
          })
        )
      )
    } finally {
      setClosingAll(false)
    }
  }, [authFetch, selectedMac, relayCount])

  return (
    <div className="rounded-2xl border border-black/[.07] shadow-sm overflow-hidden">
      {/* Dark header */}
      <div
        className="px-4 py-3.5 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #050e1a 0%, #0c2040 100%)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(12,142,204,0.18)', border: '1px solid rgba(12,142,204,0.25)' }}
        >
          <Power size={14} className="text-sky-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-sky-400">Electroválvulas</p>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            {relayCount} config. · {activeCount} activa{activeCount !== 1 ? 's' : ''}
          </p>
        </div>
        {anyActive && (
          <button
            onClick={closeAll}
            disabled={closingAll}
            className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 shrink-0"
            style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            {closingAll ? '…' : 'Cerrar todo'}
          </button>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${anyActive ? 'bg-emerald-400' : 'bg-slate-600'}`}
            style={anyActive ? { animation: 'pulse 2s ease-in-out infinite', boxShadow: '0 0 6px rgba(52,211,153,0.7)' } : {}}
          />
          <span className="text-[10px] font-semibold text-slate-400">
            {anyActive ? 'Activo' : 'Reposo'}
          </span>
        </div>
      </div>

      {/* Animated flow pipe strip — visible only when any valve is active */}
      {anyActive && (
        <div
          className="px-4 py-2 flex items-center gap-2 border-b border-sky-100/60"
          style={{ background: 'rgba(14,165,233,0.04)' }}
        >
          <style>{`@keyframes flowPipe{from{background-position:0 0}to{background-position:32px 0}}`}</style>
          <Droplets size={10} className="text-sky-400 shrink-0" />
          <div
            className="flex-1 h-1.5 rounded-full"
            style={{
              background: 'repeating-linear-gradient(90deg,#38bdf8 0,#38bdf8 8px,rgba(56,189,248,0.12) 8px,rgba(56,189,248,0.12) 16px)',
              backgroundSize: '32px 100%',
              animation: 'flowPipe 0.7s linear infinite',
            }}
          />
          <span className="text-[9px] font-bold text-sky-500 tabular-nums shrink-0">
            {sensorFlowLpm > 0 ? `${Number(sensorFlowLpm).toFixed(1)} L/min` : `~${flowLpm} L/min`}
          </span>
        </div>
      )}

      {/* Valve rows */}
      <div style={{ background: 'rgba(248,250,252,0.7)' }}>
        {Array.from({ length: relayCount }, (_, i) => (
          <div key={`${selectedMac || 'default'}-${i}`} className={i < relayCount - 1 ? 'border-b border-black/[.04]' : ''}>
            <ValveCard
              index={i}
              mac={selectedMac}
              flowLpm={flowLpm}
              sensorFlowLpm={sensorFlowLpm}
              initialState={states.find(s => s.index === i)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SavingsCard ───────────────────────────────────────────────────────────────
function SavingsCard({ stats, latest }) {
  const [expanded, setExpanded] = useState(false)

  const liveFlow   = latest?.pipeline_flow ?? 0
  const relayOn    = latest?.relay_active > 0
  const hasFlow    = liveFlow > 0.1
  const flowMode   = hasFlow ? (relayOn ? 'flowing-irrigation' : 'flowing-leak') : 'normal'
  const isLeak     = hasFlow && !relayOn
  const isIrrigate = hasFlow && relayOn

  if (!stats) return (
    <div className="bg-white rounded-2xl border border-black/[.07] shadow-sm p-5 flex items-center justify-center min-h-[200px]">
      <p className="text-xs text-navy-300">Calculando ahorro…</p>
    </div>
  )

  const {
    monthly_liters, baseline_liters, savings_liters, today_liters, daily, days_elapsed,
    used_liters = monthly_liters, leak_liters = 0, today_leak_liters = 0, total_liters = monthly_liters,
  } = stats
  const savingsPct = baseline_liters > 0 ? Math.round((savings_liters / baseline_liters) * 100) : 0
  const consumptionPct = baseline_liters > 0 ? (total_liters / baseline_liters) * 100 : 0
  const hasLeak = leak_liters > 0.5

  const state = consumptionPct >= 100 ? 'danger' : consumptionPct >= 85 ? 'warn' : 'ok'
  const cc = {
    ok:     { text: 'text-emerald-600', borderColor: '#a7f3d0', pillStyle: { background: '#d6f4e6', color: '#16a36e' } },
    warn:   { text: 'text-amber-500',   borderColor: '#fcd34d', pillStyle: { background: '#fff3d6', color: '#b8861f' } },
    danger: { text: 'text-red-500',     borderColor: '#fca5a5', pillStyle: { background: '#ffe1e1', color: '#b91c1c' } },
  }[state]

  const borderColor = isLeak ? '#fca5a5' : isIrrigate ? '#6ee7b7' : cc.borderColor
  const accentColor = isLeak ? '#ef4444' : isIrrigate ? '#10b981' : '#0c8ecc'

  return (
    <div
      className="bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer select-none transition-shadow hover:shadow-md"
      style={{ border: `1px solid ${borderColor}`, borderTop: `3px solid ${accentColor}` }}
      onClick={() => setExpanded(e => !e)}
      role="button"
      aria-expanded={expanded}
    >
      <style>{`
        @keyframes dot-pulse{0%{box-shadow:0 0 0 0 currentColor;opacity:.8}80%{box-shadow:0 0 0 8px transparent;opacity:0}100%{box-shadow:0 0 0 0 transparent;opacity:0}}
        @keyframes flow-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(1.04)}}
      `}</style>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isLeak ? 'bg-red-50' : isIrrigate ? 'bg-emerald-50' : 'bg-sky-50'}`}>
              <Leaf size={14} style={{ color: accentColor }} />
            </div>
            <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-navy-300">Ahorro este mes</p>
          </div>
          {expanded ? <ChevronUp size={14} className="text-navy-300" /> : <ChevronDown size={14} className="text-navy-300" />}
        </div>

        {isLeak && (
          <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-300 rounded-xl px-3 py-1.5" style={{ animation: 'flow-pulse 1.4s ease-in-out infinite' }}>
            <AlertTriangle size={13} className="shrink-0" />
            ¡FUGA ACTIVA! · {liveFlow.toFixed(2)} L/min con válvula cerrada
          </div>
        )}
        {isIrrigate && (
          <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-1.5" style={{ animation: 'flow-pulse 1.8s ease-in-out infinite' }}>
            <Droplets size={13} className="shrink-0" />
            Regando ahora · {liveFlow.toFixed(2)} L/min
          </div>
        )}
        {hasLeak && !isLeak && (
          <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
            <AlertTriangle size={13} className="shrink-0" />
            Fuga detectada · {leak_liters.toFixed(1)} L perdidos este mes
          </div>
        )}

        <div className="flex items-center gap-4">
          <WaterDroplet consumptionPct={consumptionPct} size={90} mode={flowMode} />
          <div className="flex-1 min-w-0">
            {hasFlow ? (
              <>
                <p className="text-3xl font-extrabold leading-none" style={{ color: isLeak ? '#b91c1c' : '#059669' }}>
                  {liveFlow.toFixed(2)}
                  <span className="text-base font-normal text-navy-300 ml-1">L/min</span>
                </p>
                <p className="text-xs text-navy-400 mt-1 leading-snug">
                  {isLeak ? 'caudal detectado · válvula cerrada' : 'caudal activo · válvula abierta'}
                </p>
                <p className="text-xs text-navy-300 mt-1">
                  Ahorro acumulado: <span className="font-medium text-navy-600">{savings_liters.toFixed(0)} L ({savingsPct}%)</span>
                </p>
              </>
            ) : (
              <>
                <p className="text-3xl font-extrabold text-navy-900 leading-none">
                  {savings_liters.toFixed(0)}
                  <span className="text-base font-normal text-navy-300 ml-1">L</span>
                </p>
                <p className="text-xs text-navy-400 mt-1 leading-snug">
                  {consumptionPct >= 100 ? 'has superado el riego manual diario'
                    : consumptionPct >= 85 ? 'queda poco margen este mes'
                    : 'ahorrados vs riego manual diario'}
                </p>
                <span className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-2.5 py-1 rounded-full" style={cc.pillStyle}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" style={{ animation: 'dot-pulse 1.6s ease-in-out infinite' }} />
                  {consumptionPct >= 100
                    ? `+${(monthly_liters - baseline_liters).toFixed(0)} L sobre el límite`
                    : consumptionPct >= 85 ? `${savingsPct}% · cerca del límite`
                    : `${savingsPct}% de ahorro`}
                </span>
              </>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-navy-50 space-y-2">
            {[
              ['Agua de riego este mes', `${used_liters.toFixed(1)} L`],
              ['Agua de riego hoy',      `${today_liters.toFixed(1)} L`],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-navy-400">{label}</span>
                <span className="font-medium text-navy-700">{val}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs">
              <span className={hasLeak ? 'text-amber-600 font-semibold' : 'text-navy-400'}>Pérdida por fugas{hasLeak ? ' ⚠' : ''}</span>
              <span className={`font-medium ${hasLeak ? 'text-amber-700' : 'text-navy-700'}`}>
                {leak_liters.toFixed(1)} L {today_leak_liters > 0 ? `(hoy: ${today_leak_liters.toFixed(1)} L)` : ''}
              </span>
            </div>
            <div className="flex justify-between text-xs font-semibold pt-2 border-t border-navy-50 text-navy-800">
              <span>Total consumido</span><span>{total_liters.toFixed(1)} L</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-navy-400">{`Referencia (${days_elapsed}d × 15 L)`}</span>
              <span className="font-medium text-navy-700">{baseline_liters.toFixed(0)} L</span>
            </div>
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
                        {(() => {
                          const ms = Date.parse(d.date) || Date.parse(d.date + 'T12:00:00')
                          if (!ms || isNaN(ms)) return d.date
                          return new Date(ms).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
                        })()}
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
    </div>
  )
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
function useEChart(containerRef, option) {
  const chartRef = useRef(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = echarts.init(el, null, { renderer: 'canvas' })
    chartRef.current = chart
    chart.setOption(option, { notMerge: true })
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { chartRef.current?.setOption(option, { notMerge: false, lazyUpdate: true }) }, [option])
}

const PERIODS = [
  { id: 'day',     label: 'Días',     hint: 'últimos 30 días' },
  { id: 'week',    label: 'Semanas',  hint: 'últimas 16 semanas' },
  { id: 'month',   label: 'Meses',    hint: 'últimos 12 meses' },
  { id: 'session', label: 'Sesiones', hint: 'últimas 60 sesiones' },
]

export function toChartMs(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = String(value).trim()
  if (!raw) return null
  const parsed = Date.parse(raw)
  if (!Number.isNaN(parsed)) return parsed
  const fallback = new Date(raw.includes(',') ? raw : raw.replace(' ', 'T')).getTime()
  return Number.isNaN(fallback) ? null : fallback
}

export function toChartNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function fmtPeriodLabel(key, periodId) {
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
    return new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '')
  }
  const [y, m] = String(key).split('-')
  if (!y || !m) return String(key)
  return new Date(+y, +m - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

export function fmtDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export function getBarColumnWidth(count, periodId = 'default') {
  if (count <= 6) return '34%'
  if (count <= 12) return '42%'
  if (count <= 24) return '52%'
  if (periodId === 'session') return '68%'
  return '62%'
}

export function getChartMinWidth(count, periodId = 'default') {
  const base = periodId === 'session' ? 760 : 680
  const perItem = periodId === 'session' ? 26 : 32
  return Math.max(base, count * perItem)
}

// ── ConsumptionChart ──────────────────────────────────────────────────────────
function ConsumptionChart({ selectedMac }) {
  const { authFetch } = useAuth()
  const [period, setPeriod] = useState('day')
  const [history, setHistory] = useState([])
  const [sessions, setSessions] = useState([])
  const macParam = selectedMac ? `&mac=${encodeURIComponent(selectedMac)}` : ''

  useEffect(() => {
    if (period === 'session') {
      authFetch(`/api/irrigation/sessions${selectedMac ? `?mac=${encodeURIComponent(selectedMac)}` : ''}`)
        .then(r => r.json()).then(setSessions).catch(() => {})
    } else {
      authFetch(`/api/irrigation/history?period=${period}${macParam}`)
        .then(r => r.json()).then(setHistory).catch(() => {})
    }
  }, [period, selectedMac])

  const hint = PERIODS.find(p => p.id === period)?.hint ?? ''

  const normalizedSessions = useMemo(() => sessions
    .map(s => ({ ...s, startMs: toChartMs(s.start), liters: toChartNum(s.liters), duration_s: Math.max(0, Math.round(toChartNum(s.duration_s))) }))
    .filter(s => s.startMs != null), [sessions])

  const normalizedHistory = useMemo(() => history
    .map(d => ({ ...d, period: String(d.period ?? ''), liters: toChartNum(d.liters), seconds: Math.max(0, Math.round(toChartNum(d.seconds))) }))
    .filter(d => d.period), [history])

  const accentColor = period === 'session' ? '#10b981' : '#0c8ecc'
  const hasData = period === 'session' ? normalizedSessions.length > 0 : normalizedHistory.length > 0

  const option = useMemo(() => {
    const seriesData = period === 'session'
      ? normalizedSessions.map(s => [s.startMs, s.liters])
      : normalizedHistory.map(d => ({ value: d.liters, name: d.period }))
    const xAxisCategories = period !== 'session' ? normalizedHistory.map(d => d.period) : undefined

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { top: 8, bottom: 36, left: 8, right: 12, containLabel: true },
      xAxis: {
        type: period === 'session' ? 'time' : 'category',
        ...(xAxisCategories ? { data: xAxisCategories } : {}),
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 10.5, fontFamily: '"DM Sans", system-ui, sans-serif', formatter: v => fmtPeriodLabel(v, period), rotate: -30, hideOverlap: true, interval: 'auto' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: hexAlpha(accentColor, 0.07), type: [4, 6] } },
        axisLabel: { color: '#94a3b8', fontSize: 10.5, fontFamily: '"DM Sans", system-ui, sans-serif', formatter: v => `${Math.round(v)} L` },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'transparent', borderWidth: 0, padding: 0, extraCssText: 'box-shadow:none;',
        axisPointer: { type: 'shadow', shadowStyle: { color: hexAlpha(accentColor, 0.06) } },
        formatter: (params) => {
          if (!params?.length) return ''
          const p = params[0]
          const val = Number(Array.isArray(p.value) ? p.value[1] : p.value)
          const label = period === 'session' ? fmtPeriodLabel(p.value?.[0] ?? p.axisValue, 'session') : fmtPeriodLabel(p.axisValue ?? p.name, period)
          return `<div style="font-family:'DM Sans',sans-serif;background:${hexAlpha(accentColor, 0.22)};backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:0;overflow:hidden;min-width:140px;">
            <div style="padding:5px 12px 4px;border-bottom:1px solid rgba(255,255,255,0.08);background:${hexAlpha(accentColor, 0.18)};color:rgba(148,163,184,0.9);font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">${label}</div>
            <div style="padding:6px 12px 8px;display:flex;align-items:center;gap:8px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${accentColor};box-shadow:0 0 6px ${accentColor}88;flex-shrink:0;"></span>
              <span style="color:#fff;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;">${Number.isFinite(val) ? val.toFixed(1) : '—'} L</span>
            </div>
          </div>`
        },
      },
      series: [{ type: 'bar', data: seriesData, itemStyle: { color: accentColor, borderRadius: [6, 6, 0, 0] }, barMaxWidth: 40, emphasis: { disabled: true } }],
    }
  }, [period, normalizedSessions, normalizedHistory, accentColor])

  const containerRef = useRef(null)
  useEChart(containerRef, option)

  const totalL = period === 'session' ? normalizedSessions.reduce((a, s) => a + s.liters, 0) : 0

  return (
    <div
      className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden"
      style={{ borderTop: `3px solid ${ha(accentColor, 0.75)}` }}
    >
      <div className="flex items-center gap-3 px-5 pt-3.5 pb-2 flex-wrap">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: ha(accentColor, 0.12) }}>
          <BarChart2 size={14} style={{ color: accentColor }} />
        </div>
        <h3 className="font-semibold text-slate-700 text-sm tracking-tight">Historial de consumo</h3>
        {period === 'session' && normalizedSessions.length > 0 && (
          <span className="text-xs text-navy-300">{normalizedSessions.length} sesiones · {totalL.toFixed(1)} L total</span>
        )}
        {period !== 'session' && hint && (
          <span className="text-xs text-navy-200 hidden sm:block">{hint}</span>
        )}
        <div className="ml-auto flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                period === p.id ? 'bg-brand-500 text-white' : 'text-navy-400 hover:bg-navy-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', height: 250 }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-slate-300 text-xs">Sin datos de riego en este período</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── IrrigationAdvisor ─────────────────────────────────────────────────────────
function IrrigationAdvisor({ latest, onIrrigate }) {
  const et0    = calcET0(latest.temperature, latest.humidity, latest.windSpeed)
  const et0Num = et0 ? parseFloat(et0) : null
  const advice = getAdvice(latest.temperature, latest.humidity, latest.windSpeed, et0Num)
  const hour   = new Date().getHours()
  const optimalHour = (hour >= 6 && hour <= 10) || (hour >= 18 && hour <= 22)

  const palette = {
    green:  { hex: '#10b981', wrapBg: 'rgba(16,185,129,0.05)', border: 'rgba(16,185,129,0.25)' },
    teal:   { hex: '#0c8ecc', wrapBg: 'rgba(12,142,204,0.05)', border: 'rgba(12,142,204,0.2)'  },
    amber:  { hex: '#f59e0b', wrapBg: 'rgba(245,158,11,0.05)', border: 'rgba(245,158,11,0.25)' },
    orange: { hex: '#f97316', wrapBg: 'rgba(249,115,22,0.05)', border: 'rgba(249,115,22,0.2)'  },
    red:    { hex: '#ef4444', wrapBg: 'rgba(239,68,68,0.05)',  border: 'rgba(239,68,68,0.2)'   },
    blue:   { hex: '#3b82f6', wrapBg: 'rgba(59,130,246,0.05)', border: 'rgba(59,130,246,0.2)'  },
  }
  const c = palette[advice.color] ?? palette.amber

  const conditions = [
    { label: 'Temperatura', val: latest.temperature != null ? `${latest.temperature.toFixed(1)}°C` : '—', ok: latest.temperature != null && latest.temperature < 32 },
    { label: 'Humedad',     val: latest.humidity    != null ? `${latest.humidity.toFixed(0)}%`     : '—', ok: latest.humidity    != null && latest.humidity    < 75 },
    { label: 'Viento',      val: latest.windSpeed   != null ? `${latest.windSpeed.toFixed(1)} m/s` : '—', ok: latest.windSpeed   != null && latest.windSpeed   < 4  },
    { label: 'Horario',     val: `${hour}:00h`,                                                           ok: optimalHour },
  ]

  const Icon = { go: CheckCircle, wait: Clock, skip: CloudRain, ok: Leaf, bad: AlertCircle, optional: Zap, nodata: AlertTriangle }[advice.level] ?? AlertTriangle

  return (
    <div
      className="bg-white border rounded-2xl shadow-sm overflow-hidden"
      style={{ borderColor: c.border, borderTop: `3px solid ${c.hex}` }}
    >
      <div className="px-5 py-3 border-b flex items-center gap-2.5" style={{ background: c.wrapBg, borderColor: c.border }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: ha(c.hex.replace('#','') && c.hex, 0.15) }}>
          <Icon size={14} style={{ color: c.hex }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy-900 leading-tight">{advice.title}</p>
          <p className="text-xs mt-0.5 leading-relaxed text-navy-400">{advice.reason}</p>
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
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {conditions.map(cond => (
          <div
            key={cond.label}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-navy-100/70"
            style={{ background: ha(cond.ok ? '#10b981' : '#ef4444', 0.04) }}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${cond.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-navy-300 leading-none truncate">{cond.label}</p>
              <p className={`text-[11px] font-semibold leading-none mt-0.5 ${cond.ok ? 'text-navy-700' : 'text-red-600'}`}>{cond.val}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page header ───────────────────────────────────────────────────────────────
function IrrigationPageHeader({ latest }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  const relayOn = (latest?.relay_active ?? 0) > 0
  const hasFlow = (latest?.pipeline_flow ?? 0) > 0.1
  const isLeak  = hasFlow && !relayOn

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #001530 0%, #0a2040 55%, #0c3060 100%)' }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 60%, rgba(63,182,240,0.18) 0%, transparent 55%), ' +
            'radial-gradient(circle at 82% 25%, rgba(16,185,129,0.14) 0%, transparent 45%)',
        }}
      />
      <div className="relative px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: 'rgba(63,182,240,0.2)' }}>
              <Droplets size={18} className="text-brand-300" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-tight">Control de Riego</h1>
              <p className="text-xs text-slate-400 leading-none mt-0.5">Sistema Aquantia · Motor ET₀ Penman-Monteith</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {isLeak && (
            <span
              className="flex items-center gap-1.5 text-xs font-bold text-red-300 border border-red-500/40 px-3 py-1.5 rounded-full animate-pulse"
              style={{ background: 'rgba(127,29,29,0.45)' }}
            >
              <AlertTriangle size={12} /> FUGA ACTIVA
            </span>
          )}
          {relayOn && !isLeak && (
            <span
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(6,78,59,0.45)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              Regando
            </span>
          )}
          <div className="text-right">
            <p className="text-sm font-bold text-white tabular-nums">
              {now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-xs text-slate-400">
              {now.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── LiveKPIStrip ──────────────────────────────────────────────────────────────
function LiveKPIStrip({ latest, stats, et0 }) {
  const hasFlow  = (latest?.pipeline_flow ?? 0) > 0.1
  const relayOn  = (latest?.relay_active ?? 0) > 0
  const isLeak   = hasFlow && !relayOn
  const flowColor = isLeak ? '#ef4444' : hasFlow ? '#10b981' : '#0c8ecc'

  const kpis = [
    {
      icon: Gauge,
      label: 'Caudal',
      value: latest?.pipeline_flow != null ? latest.pipeline_flow.toFixed(2) : '—',
      unit: 'L/min',
      color: flowColor,
      pulse: hasFlow,
    },
    {
      icon: Activity,
      label: 'Presión',
      value: latest?.pipeline_pressure != null ? latest.pipeline_pressure.toFixed(1) : '—',
      unit: 'bar',
      color: '#0c8ecc',
    },
    {
      icon: Zap,
      label: 'ET₀ hoy',
      value: et0 ?? '—',
      unit: 'mm/d',
      color: '#f59e0b',
    },
    {
      icon: Leaf,
      label: 'Ahorro mes',
      value: stats ? stats.savings_liters.toFixed(0) : '—',
      unit: 'L',
      color: '#8b5cf6',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {kpis.map(kpi => (
        <div
          key={kpi.label}
          className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden"
          style={{ borderTop: `3px solid ${ha(kpi.color, 0.7)}` }}
        >
          <div className="p-3.5 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: ha(kpi.color, 0.12), border: `1px solid ${ha(kpi.color, 0.2)}` }}
            >
              <kpi.icon size={15} style={{ color: kpi.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300 leading-none">{kpi.label}</p>
              <p className="mt-0.5 text-xl font-extrabold text-navy-900 leading-none tabular-nums tracking-tight">
                {kpi.value}
                <span className="text-xs font-semibold text-navy-300 ml-1">{kpi.unit}</span>
              </p>
            </div>
            {kpi.pulse && (
              <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: kpi.color }} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Vista principal ───────────────────────────────────────────────────────────
export default function IrrigationView({ latest, selectedMac, deviceInfo }) {
  const { authFetch } = useAuth()
  const [stats, setStats] = useState(null)
  const [flowLpm, setFlowLpm] = useState(5.0)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const relayCount = deviceInfo?.relay_count ?? 1

  const loadStats = useCallback(() => {
    const url = selectedMac
      ? `/api/irrigation/stats?mac=${encodeURIComponent(selectedMac)}`
      : '/api/irrigation/stats'
    return authFetch(url).then(r => r.json()).then(setStats).catch(() => {})
  }, [selectedMac])

  useEffect(() => {
    authFetch('/api/settings').then(r => r.json()).then(s => setFlowLpm(parseFloat(s.flow_lpm ?? '5.0'))).catch(() => {})
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

  const et0    = calcET0(latest.temperature, latest.humidity, latest.windSpeed)
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

      {/* ── Cabecera ── */}
      <IrrigationPageHeader latest={latest} />

      {/* ── KPI strip ── */}
      <LiveKPIStrip latest={latest} stats={stats} et0={et0} />

      {/* ── Banner hardware en desarrollo ── */}
      <div className="bg-white border border-[#FAC775] rounded-2xl shadow-sm overflow-hidden" style={{ borderTop: '3px solid #BA7517' }}>
        <div className="px-5 py-3 flex items-start gap-3" style={{ background: 'rgba(186,117,23,0.05)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(186,117,23,0.12)' }}>
            <AlertTriangle size={14} style={{ color: '#BA7517' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#BA7517' }}>Módulo de Riego — Hardware en desarrollo</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(186,117,23,0.75)' }}>
              Los 9 nodos de campo y las electroválvulas están en fabricación.
              Los datos de suelo se activarán al instalar los sensores.
              El motor ET₀ ya funciona con los datos meteorológicos actuales.
            </p>
          </div>
        </div>
      </div>

      {/* ── Asesor de riego ── */}
      <IrrigationAdvisor latest={latest} onIrrigate={handleIrrigate} />

      {/* ── Electroválvulas + Métricas ── */}
      <div className="space-y-4">
        <SectionHeader icon={Power} label="Electroválvulas y telemetría" />

        {/* Panel unificado de válvulas — full width */}
        <ValvePanel selectedMac={selectedMac} relayCount={relayCount} flowLpm={flowLpm} sensorFlowLpm={latest?.pipeline_flow} />

        {/* Métricas — fila de 3 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* ET₀ card */}
          <div
            className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden"
            style={{ borderTop: `3px solid ${ha('#0c8ecc', 0.75)}` }}
          >
            <div className="px-5 py-3 border-b border-black/[.06] flex items-center gap-2.5" style={{ background: ha('#0c8ecc', 0.04) }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: ha('#0c8ecc', 0.12) }}>
                <Zap size={14} style={{ color: '#0c8ecc' }} />
              </div>
              <span className="text-sm font-semibold text-navy-900">ET₀ estimado hoy</span>
            </div>
            <div className="p-5">
              <p className="text-3xl font-extrabold text-navy-900 leading-none tabular-nums">
                {et0 ?? '—'}
                <span className="text-base font-normal text-navy-300 ml-1">mm/día</span>
              </p>
              {et0Num != null && (
                <div className="mt-3 pt-3 border-t border-navy-50">
                  <div className="h-2 bg-navy-50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (et0Num / 8) * 100)}%`, background: '#0c8ecc' }}
                    />
                  </div>
                  <p className="text-xs text-navy-300 mt-1.5">
                    {et0Num < 3 ? 'Baja evapotranspiración' : et0Num < 5 ? 'Evapotranspiración media' : 'Alta evapotranspiración'}
                  </p>
                </div>
              )}
              <p className="text-xs text-navy-300 mt-3">Penman-Monteith FAO-56 · datos en tiempo real</p>
            </div>
          </div>

          {/* Consumo card */}
          <div
            className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden"
            style={{ borderTop: `3px solid ${ha('#534AB7', 0.75)}` }}
          >
            <div className="px-5 py-3 border-b border-black/[.06] flex items-center justify-between" style={{ background: ha('#534AB7', 0.04) }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: ha('#534AB7', 0.12) }}>
                  <Droplets size={14} style={{ color: '#534AB7' }} />
                </div>
                <span className="text-sm font-semibold text-navy-900">Consumo de agua</span>
              </div>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 text-xs text-navy-400 hover:text-red-500 bg-navy-50 hover:bg-red-50 border border-navy-100 hover:border-red-200 px-2.5 py-1 rounded-lg transition-colors"
              >
                <RotateCcw size={11} />
                Resetear
              </button>
            </div>
            <div className="p-5">
              <p className="text-3xl font-extrabold text-navy-900 leading-none tabular-nums">
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
                    <p className="text-xs text-navy-300">Caudal: {flowLpm} L/min</p>
                    {stats.monthly_seconds > 0 && (
                      <p className="text-xs text-navy-300">
                        {Math.floor(stats.monthly_seconds / 60)}m {stats.monthly_seconds % 60}s activa este mes
                      </p>
                    )}
                  </div>
                  {stats.last_session && (
                    <div className="mt-3 pt-3 border-t border-navy-50 space-y-1.5">
                      <p className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300">Último ciclo</p>
                      {[
                        ['Inicio', (() => { const ms = Date.parse(stats.last_session.start); return ms && !isNaN(ms) ? new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—' })()],
                        ['Fin',    (() => { const ms = Date.parse(stats.last_session.end);   return ms && !isNaN(ms) ? new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—' })()],
                        ['Duración', fmtDuration(stats.last_session.duration_s)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-navy-300">{k}</span>
                          <span className="font-medium text-navy-600">{v}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs">
                        <span className="text-navy-300">Consumo</span>
                        <span className="font-semibold" style={{ color: '#534AB7' }}>{stats.last_session.liters.toFixed(1)} L</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-navy-300 mt-3 pt-3 border-t border-navy-50">Calculando…</p>
              )}
            </div>
          </div>

          {/* Ahorro mensual */}
          <SavingsCard stats={stats} latest={latest} />

        </div>
      </div>

      {/* ── Gráfico de consumo ── */}
      <ConsumptionChart selectedMac={selectedMac} />

      {/* ── Sectores de riego ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader icon={Leaf} label="Sectores de riego">
            <span className="text-navy-300 text-xs font-normal">(9 nodos LoRa)</span>
          </SectionHeader>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-navy-300 bg-navy-50 px-2.5 py-1 rounded-full border border-navy-100">
            <span className="w-1.5 h-1.5 bg-navy-200 rounded-full" />
            Sin nodos conectados
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SECTORS.map(sector => <SectorCard key={sector.id} sector={sector} />)}
        </div>
      </div>

      {/* ── Banner automatización ── */}
      <div
        className="rounded-2xl p-5 flex items-start gap-4"
        style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d2040 55%, #0f2d5a 100%)' }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(12,142,204,0.2)' }}>
          <FlaskConical size={18} className="text-brand-300" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Control automático por sectores — Próximamente</p>
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
