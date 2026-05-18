import { createElement, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../AuthContext'
import {
  Activity, AlertTriangle, CheckCircle, Gauge,
  Droplets, Zap, FlaskConical, RefreshCw, Info,
  Radio, Calendar, Search, Cpu, Wifi, CloudRain, Waves,
  Pipette, Filter, Siren, ShieldCheck,
} from 'lucide-react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
echarts.use([LineChart, GridComponent, TooltipComponent, LegacyGridContainLabel, CanvasRenderer])

function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1,3), 16)
  const g = parseInt(hex.slice(3,5), 16)
  const b = parseInt(hex.slice(5,7), 16)
  return `rgba(${r},${g},${b},${a})`
}
const ha = hexAlpha

// ── Animation styles ──────────────────────────────────────────────────────────
const PIPELINE_STYLES = `
@keyframes gaugeArcGlow {
  0%, 100% { opacity: 0.75; }
  50%       { opacity: 1;    }
}
@keyframes liveDotBlink {
  0%, 100% { opacity: 1;   transform: scale(1);   }
  50%       { opacity: 0.3; transform: scale(1.6); }
}
@keyframes liveRingPulse {
  0%   { opacity: 0.4; transform: scale(1);    }
  70%  { opacity: 0;   transform: scale(1.18); }
  100% { opacity: 0;   transform: scale(1.18); }
}
`
function InjectPipelineStyles() {
  useEffect(() => {
    const id = 'pipeline-anim-styles'
    if (document.getElementById(id)) return
    const el = document.createElement('style')
    el.id = id
    el.textContent = PIPELINE_STYLES
    document.head.appendChild(el)
    return () => document.getElementById(id)?.remove()
  }, [])
  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function toMs(t) {
  if (t == null) return null
  if (typeof t === 'number') return Number.isNaN(t) ? null : t
  const raw = String(t).trim()
  const parsed = Date.parse(raw)
  if (!Number.isNaN(parsed)) return parsed
  const ms = new Date(raw.includes(',') ? raw : raw.replace(' ', 'T')).getTime()
  return Number.isNaN(ms) ? null : ms
}

const pad = n => String(n).padStart(2, '0')
const toInputVal = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const toQueryStr = d => {
  const dd = new Date(d)
  return `${dd.getFullYear()}-${pad(dd.getMonth()+1)}-${pad(dd.getDate())} ${pad(dd.getHours())}:${pad(dd.getMinutes())}:${pad(dd.getSeconds())}`
}

const clampInput = (value, min, max) => {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

// ── Configuración de estados de detección ─────────────────────────────────────
const STATUS_CFG = {
  NORMAL:                { label: 'Sistema normal',             color: 'emerald', Icon: CheckCircle },
  LEAK_SUSPECTED:        { label: 'Fuga sospechada (EWMA)',     color: 'amber',   Icon: AlertTriangle },
  LEAK:                  { label: 'Fuga detectada',             color: 'orange',  Icon: AlertTriangle },
  BURST:                 { label: 'Rotura detectada',           color: 'red',     Icon: Zap },
  OBSTRUCTION_SUSPECTED: { label: 'Obstrucción parcial (EWMA)', color: 'purple',  Icon: AlertTriangle },
  OBSTRUCTION:           { label: 'Obstrucción detectada',      color: 'purple',  Icon: Search },
  NO_DATA:               { label: 'Sin datos suficientes',      color: 'navy',    Icon: Info },
}

const COLOR = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   bar: 'bg-amber-400' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  bar: 'bg-orange-500' },
  red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     bar: 'bg-red-500' },
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  bar: 'bg-purple-500' },
  navy:    { bg: 'bg-navy-50',    text: 'text-navy-500',    border: 'border-navy-100',    bar: 'bg-navy-300' },
}

const SCENARIOS = [
  { id: 'normal',      label: 'Normal',      hint: 'Sin anomalías',           icon: ShieldCheck, color: '#10b981' },
  { id: 'leak',        label: 'Fuga',        hint: '~0.3 L/min fuga',         icon: Droplets,    color: '#f59e0b' },
  { id: 'burst',       label: 'Rotura',      hint: 'Presión colapsa',         icon: Zap,         color: '#ef4444' },
  { id: 'obstruction', label: 'Obstrucción', hint: 'Presión alta, caudal ≈0', icon: Filter,      color: '#8b5cf6' },
]

const PIPELINE_MODES = [
  { id: 'sim',  label: 'Simulación', hint: 'Simulador firmware', icon: Cpu  },
  { id: 'real', label: 'Hardware',   hint: 'Sensor físico',     icon: Wifi },
]

const IRRIGATION_TYPES = [
  { id: 'sprinkler',       label: 'Aspersión',     hint: '2.8 bar · 5 L/min',   icon: CloudRain },
  { id: 'drip',            label: 'Goteo',         hint: '1.5 bar · 2 L/min',   icon: Droplets  },
  { id: 'drip_tape',       label: 'Cinta goteo',   hint: '0.8 bar · 0.8 L/min', icon: Waves     },
  { id: 'micro_sprinkler', label: 'Microaspersión',hint: '2.2 bar · 3.5 L/min', icon: Pipette   },
]

// ── Subcomponentes ─────────────────────────────────────────────────────────────

const READING_ACCENT = '#0c8ecc'

function ReadingCard({ title, icon, value, unit, sub }) {
  const accent = READING_ACCENT
  return (
    <div
      className="relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-px"
      style={{
        background: 'linear-gradient(150deg, #f8fafc 0%, #ffffff 55%, #f0f4ff 100%)',
        border: `1px solid ${hexAlpha(accent, 0.18)}`,
        boxShadow: `0 1px 3px rgba(0,0,0,0.05), 0 4px 14px ${hexAlpha(accent, 0.07)}, inset 0 1px 0 rgba(255,255,255,0.9)`,
      }}
    >
      {/* Accent bar */}
      <div style={{ height: 3, background: accent, boxShadow: `0 0 8px 2px ${hexAlpha(accent, 0.5)}` }} />
      {/* Header wash */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 3, left: 0, right: 0, height: 48,
          background: `linear-gradient(to bottom, ${hexAlpha(accent, 0.055)}, transparent)`,
          pointerEvents: 'none', zIndex: 0,
        }}
      />
      <div className="relative p-4" style={{ zIndex: 1 }}>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-xl shrink-0"
            style={{
              background: `linear-gradient(135deg, ${hexAlpha(accent, 0.14)}, ${hexAlpha(accent, 0.06)})`,
              border: `1px solid ${hexAlpha(accent, 0.22)}`,
              boxShadow: `0 2px 8px ${hexAlpha(accent, 0.15)}, inset 0 1px 0 rgba(255,255,255,0.7)`,
            }}
          >
            {icon && createElement(icon, { size: 13, style: { color: accent } })}
          </span>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>{title}</p>
        </div>
        <p
          className="text-[2rem] font-extrabold leading-none"
          style={{
            color: '#0f172a',
            textShadow: `0 0 18px ${hexAlpha(accent, 0.22)}`,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value != null ? value : '—'}
          <span className="text-sm font-normal ml-1" style={{ color: '#94a3b8' }}>{unit}</span>
        </p>
        {sub && <p className="text-xs mt-1.5 leading-relaxed" style={{ color: '#94a3b8' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── GaugeCard — animated SVG arc gauge ────────────────────────────────────────
const GAUGE_R = 46; const GAUGE_CX = 60; const GAUGE_CY = 60
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R
const GAUGE_ARC  = GAUGE_CIRC * 0.75  // 270° sweep

function GaugeCard({ title, value, unit, icon: Icon, max, colorHex, sub, live }) {
  const numVal = (value != null && Number.isFinite(Number(value))) ? Number(value) : null
  const pct    = numVal != null ? Math.min(1, Math.max(0, numVal / max)) : 0
  const offset = GAUGE_ARC * (1 - pct)
  const origin = `${GAUGE_CX}px ${GAUGE_CY}px`

  return (
    <div
      className="flex-1 flex flex-col items-center rounded-2xl p-3 transition-all duration-300"
      style={{
        background: 'linear-gradient(150deg, #f8fafc 0%, #ffffff 55%, #f0f4ff 100%)',
        border: `1px solid ${ha(colorHex, 0.2)}`,
        boxShadow: `0 1px 3px rgba(0,0,0,0.05), 0 4px 14px ${ha(colorHex, 0.08)}, inset 0 1px 0 rgba(255,255,255,0.9)`,
      }}
    >
      {/* Gauge */}
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        {/* Pulse ring */}
        {live && numVal != null && (
          <div style={{
            position: 'absolute', inset: -5, borderRadius: '50%',
            border: `1.5px solid ${colorHex}`,
            animation: 'liveRingPulse 2s ease-out infinite',
          }} />
        )}
        <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%' }}>
          {/* Track arc */}
          <circle
            cx={GAUGE_CX} cy={GAUGE_CY} r={GAUGE_R}
            fill="none" stroke={ha(colorHex, 0.10)} strokeWidth="8"
            strokeDasharray={`${GAUGE_ARC} ${GAUGE_CIRC}`} strokeLinecap="round"
            style={{ transform: 'rotate(135deg)', transformOrigin: origin }}
          />
          {/* Value arc */}
          <circle
            cx={GAUGE_CX} cy={GAUGE_CY} r={GAUGE_R}
            fill="none" stroke={colorHex} strokeWidth="8"
            strokeDasharray={`${GAUGE_ARC} ${GAUGE_CIRC}`}
            strokeDashoffset={offset} strokeLinecap="round"
            style={{
              transform: 'rotate(135deg)', transformOrigin: origin,
              transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)',
              filter: pct > 0.02 ? `drop-shadow(0 0 5px ${ha(colorHex, 0.65)})` : 'none',
              animation: live && pct > 0.02 ? 'gaugeArcGlow 2s ease-in-out infinite' : 'none',
            }}
          />
        </svg>
        {/* Center label */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 8,
        }}>
          {Icon && createElement(Icon, { size: 13, style: { color: colorHex } })}
          <span style={{
            fontSize: numVal != null && numVal >= 10 ? '1.35rem' : '1.6rem',
            fontWeight: 800, lineHeight: 1, color: '#0f172a',
            fontVariantNumeric: 'tabular-nums', marginTop: 2,
          }}>
            {numVal != null ? numVal : '—'}
          </span>
          <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 500 }}>{unit}</span>
        </div>
      </div>
      <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4, textAlign: 'center' }}>{title}</p>
      {sub && <p style={{ fontSize: '0.6rem', color: '#94a3b8', textAlign: 'center', marginTop: 2, lineHeight: 1.3 }}>{sub}</p>}
    </div>
  )
}

// ── CompactCounter ─────────────────────────────────────────────────────────────
function CompactCounter({ label, value, unit, icon: Icon, colorHex = '#64748b' }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
      style={{ background: ha(colorHex, 0.05), border: `1px solid ${ha(colorHex, 0.14)}` }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: ha(colorHex, 0.1), border: `1px solid ${ha(colorHex, 0.18)}`,
      }}>
        {Icon && createElement(Icon, { size: 12, style: { color: colorHex } })}
      </span>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: '0.6rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</p>
        <p style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
          {value != null ? value : <span style={{ color: '#cbd5e1' }}>—</span>}
          {value != null && <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 400, marginLeft: 3 }}>{unit}</span>}
        </p>
      </div>
    </div>
  )
}

function StatusBanner({ detection }) {
  if (!detection) return null
  const cfg = STATUS_CFG[detection.status] ?? STATUS_CFG.NO_DATA
  const { Icon } = cfg
  const c   = COLOR[cfg.color] ?? COLOR.navy
  const pct = Math.round((detection.confidence ?? 0) * 100)

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4 flex gap-3`}>
      <Icon size={18} className={`${c.text} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={`text-sm font-bold ${c.text}`}>{cfg.label}</span>
          {pct > 0 && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${c.bg} ${c.text} ${c.border}`}>
              {pct}% confianza
            </span>
          )}
        </div>

        {detection.alerts?.length > 0 ? (
          <div className="space-y-1 mt-1">
            {detection.alerts.map((a, i) => (
              <p key={i} className="text-xs text-navy-500 leading-relaxed">
                <span className="font-semibold text-navy-700 uppercase text-[10px] tracking-wide mr-1">
                  [{a.method}]
                </span>
                {a.message}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-navy-400">
            Sistema operando dentro de parámetros normales.
          </p>
        )}

        {pct > 0 && (
          <div className="mt-2.5 h-1.5 bg-white/70 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${c.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function PillGroup({ label, items, active, onChange, busy, activeClass }) {
  return (
    <div>
      <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{label}</p>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {items.map(item => {
          const isActive = active === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              disabled={busy || isActive}
              title={item.hint}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 8, border: '1px solid',
                fontSize: '0.7rem', fontWeight: 600, cursor: isActive ? 'default' : 'pointer',
                transition: 'all 0.15s',
                ...(isActive
                  ? { background: activeClass, borderColor: activeClass, color: '#fff', boxShadow: `0 2px 8px ${ha(activeClass, 0.35)}` }
                  : { background: ha('#64748b', 0.04), borderColor: ha('#64748b', 0.12), color: '#475569' }),
                opacity: busy && !isActive ? 0.45 : 1,
              }}
            >
              {Icon && createElement(Icon, { size: 11, style: { flexShrink: 0, opacity: isActive ? 1 : 0.6 } })}
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OptionCard({ item, isActive, onClick, disabled, accentColor }) {
  const Icon = item.icon
  const color = isActive ? (accentColor ?? item.color ?? '#3b82f6') : '#94a3b8'
  return (
    <button
      onClick={onClick}
      disabled={disabled || isActive}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        gap: 3, padding: '8px 10px', borderRadius: 10,
        border: `1px solid ${isActive ? ha(color, 0.4) : ha('#64748b', 0.10)}`,
        background: isActive ? ha(color, 0.08) : ha('#64748b', 0.025),
        cursor: isActive ? 'default' : 'pointer',
        transition: 'all 0.15s', textAlign: 'left',
        boxShadow: isActive ? `0 0 0 1.5px ${ha(color, 0.25)}, 0 2px 8px ${ha(color, 0.12)}` : 'none',
        opacity: (disabled && !isActive) ? 0.45 : 1,
        flex: '1 1 calc(50% - 4px)', minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {Icon && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
            background: ha(color, 0.14), border: `1px solid ${ha(color, 0.22)}`,
          }}>
            {createElement(Icon, { size: 10, style: { color } })}
          </span>
        )}
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isActive ? color : '#334155' }}>{item.label}</span>
        {isActive && <CheckCircle size={10} style={{ color, marginLeft: 'auto', flexShrink: 0 }} />}
      </div>
      <span style={{ fontSize: '0.6rem', color: '#94a3b8', lineHeight: 1.3, paddingLeft: 25 }}>{item.hint}</span>
    </button>
  )
}

function ScenarioSelector({
  current, onSelect, busy, mode, onModeChange,
  irrigationType, onIrrigationChange, leakDetectTrained,
}) {
  const isReal = mode === 'real'
  const currentIrrigLabel = IRRIGATION_TYPES.find(t => t.id === irrigationType)?.label ?? irrigationType

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 7,
        background: 'linear-gradient(to right, rgba(248,250,252,1), rgba(240,244,255,0.6))',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 7, background: ha('#0891b2', 0.10),
          border: `1px solid ${ha('#0891b2', 0.2)}`, flexShrink: 0,
        }}>
          <FlaskConical size={12} style={{ color: '#0891b2' }} />
        </span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', letterSpacing: '0.02em' }}>Configuración pipeline</span>
        {busy && <RefreshCw size={11} style={{ color: '#94a3b8', marginLeft: 'auto', animation: 'spin 1s linear infinite' }} />}
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Modo — segmented control */}
        <div>
          <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Modo</p>
          <div style={{
            display: 'flex', background: ha('#64748b', 0.06), borderRadius: 10, padding: 3, gap: 2,
            border: `1px solid ${ha('#64748b', 0.10)}`,
          }}>
            {PIPELINE_MODES.map(item => {
              const isActive = mode === item.id
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => onModeChange(item.id)}
                  disabled={busy || isActive}
                  title={item.hint}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '5px 8px', borderRadius: 7, border: 'none',
                    fontSize: '0.72rem', fontWeight: 700,
                    cursor: isActive ? 'default' : 'pointer',
                    transition: 'all 0.18s',
                    ...(isActive
                      ? { background: '#1e3a5f', color: '#fff', boxShadow: '0 2px 6px rgba(30,58,95,0.28)' }
                      : { background: 'transparent', color: '#64748b' }),
                  }}
                >
                  {Icon && createElement(Icon, { size: 11, style: { flexShrink: 0 } })}
                  {item.label}
                  {isActive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#38bdf8', marginLeft: 1, boxShadow: '0 0 4px #38bdf8' }} />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tipo de riego */}
        <div>
          <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Tipo de riego</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {IRRIGATION_TYPES.map(item => (
              <OptionCard
                key={item.id} item={item}
                isActive={irrigationType === item.id}
                onClick={() => onIrrigationChange(item.id)}
                disabled={busy} accentColor="#2563eb"
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(0,0,0,0.05)' }} />

        {/* Escenario */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Escenario simulado</p>
            {isReal && (
              <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontStyle: 'italic' }}>Auto-detectado por firmware</span>
            )}
          </div>
          {isReal ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
              borderRadius: 9, background: ha('#64748b', 0.05), border: `1px solid ${ha('#64748b', 0.10)}`,
            }}>
              <CheckCircle size={12} style={{ color: '#10b981', flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', textTransform: 'capitalize' }}>{current}</span>
              <span style={{ fontSize: '0.62rem', color: '#94a3b8', marginLeft: 2 }}>— detectado automáticamente</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SCENARIOS.map(sc => (
                <OptionCard
                  key={sc.id} item={sc}
                  isActive={current === sc.id}
                  onClick={() => onSelect(sc.id)}
                  disabled={busy}
                />
              ))}
            </div>
          )}
        </div>

        {/* Baseline status (real mode) */}
        {isReal && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px',
            borderRadius: 9,
            background: leakDetectTrained ? ha('#10b981', 0.07) : ha('#f59e0b', 0.07),
            border: `1px solid ${leakDetectTrained ? ha('#10b981', 0.25) : ha('#f59e0b', 0.25)}`,
          }}>
            {leakDetectTrained
              ? <CheckCircle size={12} style={{ color: '#10b981', flexShrink: 0 }} />
              : <RefreshCw size={12} style={{ color: '#f59e0b', flexShrink: 0, animation: 'spin 1.2s linear infinite' }} />}
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: leakDetectTrained ? '#065f46' : '#92400e' }}>
              {leakDetectTrained ? `Detección activa · Perfil: ${currentIrrigLabel}` : 'Calibrando baseline… (20 muestras)'}
            </span>
          </div>
        )}

      </div>
    </div>
  )
}

const STATS_ACCENT = '#1a3350'

function DetectionStats({ detection, irrigationType, leakDetectTrained }) {
  if (!detection || detection.status === 'NO_DATA') return null

  const accent = STATS_ACCENT
  const irrigLabel = IRRIGATION_TYPES.find(t => t.id === irrigationType)?.label ?? irrigationType

  const rows = [
    ['Presión EWMA',   detection.ewma_pressure     != null ? `${detection.ewma_pressure} bar`    : '—'],
    ['Caudal EWMA',    detection.ewma_flow          != null ? `${detection.ewma_flow} L/min`       : '—'],
    ['Base presión',   detection.baseline_pressure  != null ? `${detection.baseline_pressure} bar` : '—'],
    ['Base caudal',    detection.baseline_flow      != null ? `${detection.baseline_flow} L/min`   : '—'],
    ['σ presión',      detection.std_pressure       != null ? `±${detection.std_pressure} bar`     : '—'],
    ['σ caudal',       detection.std_flow           != null ? `±${detection.std_flow} L/min`       : '—'],
    ['Perfil riego',   irrigLabel ?? '—'],
    ['Baseline HW',    leakDetectTrained ? 'Activo' : 'Calibrando…'],
  ]

  return (
    <div
      className="relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-px"
      style={{
        background: 'linear-gradient(150deg, #f8fafc 0%, #ffffff 55%, #f0f4ff 100%)',
        border: `1px solid ${hexAlpha(accent, 0.18)}`,
        boxShadow: `0 1px 3px rgba(0,0,0,0.05), 0 4px 14px ${hexAlpha(accent, 0.07)}, inset 0 1px 0 rgba(255,255,255,0.9)`,
      }}
    >
      {/* Accent bar */}
      <div style={{ height: 3, background: accent, boxShadow: `0 0 8px 2px ${hexAlpha(accent, 0.5)}` }} />
      {/* Header wash */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 3, left: 0, right: 0, height: 48,
          background: `linear-gradient(to bottom, ${hexAlpha(accent, 0.055)}, transparent)`,
          pointerEvents: 'none', zIndex: 0,
        }}
      />
      <div className="relative p-4" style={{ zIndex: 1 }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
          Estadísticos de detección
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2">
          {rows.map(([label, val]) => (
            <div key={label} className="flex justify-between text-xs">
              <span style={{ color: '#64748b' }}>{label}</span>
              <span className="font-mono font-medium" style={{ color: '#1e293b' }}>{val}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 space-y-1" style={{ borderTop: `1px solid ${hexAlpha(accent, 0.1)}` }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>
            Métodos activos
          </p>
          {[
            ['Umbral absoluto', 'Caudal > 0.10 L/min con válvula cerrada → LEAK'],
            ['dP/dt',           'Caída de presión > 20% en 20 s → BURST'],
            ['EWMA (λ=0.15)',   'Deriva estadística > 2.5σ en presión/caudal → LEAK_SUSPECTED'],
          ].map(([name, desc]) => (
            <div key={name} className="flex gap-2 text-xs">
              <span className="font-semibold shrink-0" style={{ color: '#334155' }}>{name}:</span>
              <span style={{ color: '#64748b' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const CHART_MAX_POINTS = 150

function downsampleChart(arr) {
  const n = arr.length
  if (n <= CHART_MAX_POINTS) return arr
  const step = (n - 1) / (CHART_MAX_POINTS - 1)
  const indices = new Set([0, n - 1])
  for (let i = 1; i < CHART_MAX_POINTS - 1; i++) indices.add(Math.round(i * step))
  return [...indices].sort((a, b) => a - b).map(i => arr[i])
}

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
  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: false, lazyUpdate: true })
  }, [option])
}

const PIPELINE_CHART_ACCENT1 = '#0891b2'
const PIPELINE_CHART_ACCENT2 = '#2563eb'

function PipelineChart({ readings, mode, histLoading, liveHours }) {
  const deduped = new Map()
  readings.forEach((r) => {
    const x = toMs(r.timestamp)
    if (!Number.isFinite(x)) return

    const current = deduped.get(x) || { x, pressure: null, flow: null }
    const pressure = Number(r.pressure_bar)
    const flow = Number(r.flow_lpm)

    if (Number.isFinite(pressure)) current.pressure = pressure
    if (Number.isFinite(flow)) current.flow = flow

    deduped.set(x, current)
  })

  const allSamples = Array.from(deduped.values())
    .filter(p => Number.isFinite(p.x) && (Number.isFinite(p.pressure) || Number.isFinite(p.flow)))
    .sort((a, b) => a.x - b.x)

  const windowed = mode === 'live' && allSamples.length > 0
    ? (() => {
        const cutoff = allSamples.at(-1).x - liveHours * 60 * 60 * 1000
        return allSamples.filter(p => p.x >= cutoff)
      })()
    : allSamples

  const samples = downsampleChart(windowed)

  const pressure = samples
    .filter(p => Number.isFinite(p.pressure))
    .map(p => ({ x: p.x, y: p.pressure }))

  const flow = samples
    .filter(p => Number.isFinite(p.flow))
    .map(p => ({ x: p.x, y: p.flow }))

  const pressureValues = pressure.map(p => p.y)
  const flowValues = flow.map(p => p.y)

  const buildAxisRange = (values, fallbackMax) => {
    if (!values.length) return { min: 0, max: fallbackMax }
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const span = Math.max(maxVal - minVal, fallbackMax * 0.08, 0.02)
    return {
      min: Math.max(0, minVal - span * 0.35),
      max: maxVal + span * 0.35,
    }
  }

  const pressureAxis = buildAxisRange(pressureValues, 4)
  const flowAxis = buildAxisRange(flowValues, 0.2)

  const hasData = pressure.length > 0 || flow.length > 0
  const title = mode === 'live' ? 'Presión y Caudal — En vivo' : 'Presión y Caudal — Histórico'

  const containerRef = useRef(null)

  const option = useMemo(() => ({
    animation: false,
    backgroundColor: 'transparent',
    grid: { top: 8, bottom: 28, left: 8, right: 12, containLabel: true },
    xAxis: {
      type: 'time',
      ...(mode === 'live' && samples.length > 0 && {
        min: samples[0].x,
        max: samples.at(-1).x + 30_000,
      }),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 10.5,
        fontFamily: '"DM Sans", system-ui, sans-serif',
        formatter: (val) => {
          const d = new Date(val)
          return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        },
      },
    },
    yAxis: [
      {
        type: 'value',
        name: 'bar',
        nameLocation: 'end',
        nameTextStyle: { color: PIPELINE_CHART_ACCENT1, fontSize: 10, align: 'right' },
        min: pressureAxis.min,
        max: pressureAxis.max,
        splitLine: {
          lineStyle: { color: hexAlpha(PIPELINE_CHART_ACCENT1, 0.07), type: [4, 6] },
        },
        axisLabel: {
          color: PIPELINE_CHART_ACCENT1,
          fontSize: 10.5,
          fontFamily: '"DM Sans", system-ui, sans-serif',
          formatter: v => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '',
        },
      },
      {
        type: 'value',
        name: 'L/min',
        nameLocation: 'end',
        nameTextStyle: { color: PIPELINE_CHART_ACCENT2, fontSize: 10 },
        position: 'right',
        min: flowAxis.min,
        max: flowAxis.max,
        splitLine: { show: false },
        axisLabel: {
          color: PIPELINE_CHART_ACCENT2,
          fontSize: 10.5,
          fontFamily: '"DM Sans", system-ui, sans-serif',
          formatter: v => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '',
        },
      },
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: hexAlpha(PIPELINE_CHART_ACCENT1, 0.35), width: 1 } },
      backgroundColor: 'transparent',
      borderWidth: 0,
      padding: 0,
      extraCssText: 'box-shadow:none;',
      formatter: (params) => {
        if (!params?.length) return ''
        const xVal = params[0].value?.[0] ?? params[0].axisValue
        let timeLabel = ''
        if (xVal != null) {
          const d = new Date(xVal)
          if (!isNaN(d.getTime())) {
            timeLabel = d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
          }
        }
        const rows = params.map(p => {
          const val = Array.isArray(p.value) ? p.value[1] : p.value
          const n = Number(val)
          const isFmt = Number.isFinite(n)
          const unit = p.seriesName?.includes('Presión') ? ' bar' : ' L/min'
          const decimals = p.seriesName?.includes('Presión') ? 3 : 2
          const formatted = isFmt ? `${n.toFixed(decimals)}${unit}` : '—'
          const color = p.color ?? PIPELINE_CHART_ACCENT1
          return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 6px ${color}88;"></span>
            <span style="color:rgba(148,163,184,0.85);font-size:11px;flex:1;">${p.seriesName}</span>
            <span style="color:#fff;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;">${formatted}</span>
          </div>`
        }).filter(Boolean).join('')
        const accent = PIPELINE_CHART_ACCENT1
        return `<div style="font-family:'DM Sans',system-ui,sans-serif;background:${hexAlpha(accent, 0.22)};backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:0;overflow:hidden;min-width:180px;">
          <div style="padding:6px 12px 5px;border-bottom:1px solid rgba(255,255,255,0.08);background:${hexAlpha(accent, 0.18)};color:rgba(148,163,184,0.9);font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">${timeLabel}</div>
          <div style="padding:6px 12px 8px;">${rows}</div>
        </div>`
      },
    },
    series: [
      {
        name: 'Presión (bar)',
        type: 'line',
        yAxisIndex: 0,
        data: pressure.map(p => [p.x, p.y]),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: PIPELINE_CHART_ACCENT1, width: 2.5, cap: 'round' },
        itemStyle: { color: PIPELINE_CHART_ACCENT1 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0,    color: hexAlpha(PIPELINE_CHART_ACCENT1, 0.22) },
              { offset: 0.75, color: hexAlpha(PIPELINE_CHART_ACCENT1, 0.04) },
              { offset: 1,    color: hexAlpha(PIPELINE_CHART_ACCENT1, 0) },
            ],
          },
        },
        emphasis: { disabled: true },
      },
      {
        name: 'Caudal (L/min)',
        type: 'line',
        yAxisIndex: 1,
        data: flow.map(p => [p.x, p.y]),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: PIPELINE_CHART_ACCENT2, width: 2.5, type: [6, 4], cap: 'round' },
        itemStyle: { color: PIPELINE_CHART_ACCENT2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0,    color: hexAlpha(PIPELINE_CHART_ACCENT2, 0.22) },
              { offset: 0.75, color: hexAlpha(PIPELINE_CHART_ACCENT2, 0.04) },
              { offset: 1,    color: hexAlpha(PIPELINE_CHART_ACCENT2, 0) },
            ],
          },
        },
        emphasis: { disabled: true },
      },
    ],
  }), [samples, pressure, flow, mode, pressureAxis, flowAxis])

  useEChart(containerRef, option)

  const legendItems = [
    { name: 'Presión (bar)', color: PIPELINE_CHART_ACCENT1 },
    { name: 'Caudal (L/min)', color: PIPELINE_CHART_ACCENT2 },
  ]

  return (
    <div
      className="relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-px"
      style={{
        background: 'linear-gradient(150deg, #f8fafc, #fff 58%, #f0f4ff)',
        border: `1px solid ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.18)}`,
        boxShadow: `0 1px 3px rgba(0,0,0,0.05), 0 4px 14px ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.07)}, inset 0 1px 0 rgba(255,255,255,0.9)`,
      }}
    >
      {/* Dual-color accent bar */}
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${PIPELINE_CHART_ACCENT1}, ${PIPELINE_CHART_ACCENT2})`,
          boxShadow: `0 0 8px 2px ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.5)}`,
        }}
      />
      {/* Header wash */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 3, left: 0, right: 0, height: 52,
          background: `linear-gradient(180deg, ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.055)} 0%, transparent 100%)`,
          pointerEvents: 'none', zIndex: 0,
        }}
      />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-5 pt-3.5 pb-2" style={{ zIndex: 1 }}>
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
          style={{
            background: `linear-gradient(135deg, ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.14)}, ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.06)})`,
            border: `1px solid ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.22)}`,
            boxShadow: `0 2px 8px ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.15)}, inset 0 1px 0 rgba(255,255,255,0.7)`,
          }}
        >
          <Activity size={15} style={{ color: PIPELINE_CHART_ACCENT1 }} />
        </span>
        <h3 className="font-semibold text-slate-700 text-sm tracking-tight">{title}</h3>
        <span
          className="ml-auto text-[10px] font-semibold tabular-nums px-2 py-0.5 rounded-md"
          style={{
            background: hexAlpha(PIPELINE_CHART_ACCENT1, 0.1),
            color: PIPELINE_CHART_ACCENT1,
            border: `1px solid ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.18)}`,
          }}
        >
          {histLoading ? 'Cargando…' : `${readings.length} muestras`}
        </span>
      </div>

      {/* Legend pills */}
      <div className="px-5 pb-2 flex flex-wrap gap-1.5" style={{ zIndex: 1, position: 'relative' }}>
        {legendItems.map((item) => (
          <span
            key={item.name}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              background: hexAlpha(item.color, 0.08),
              border: `1px solid ${hexAlpha(item.color, 0.22)}`,
              color: item.color,
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color, boxShadow: `0 0 5px ${item.color}90` }}
            />
            {item.name}
          </span>
        ))}
      </div>

      {/* Chart area — always rendered */}
      <div style={{ position: 'relative', height: 320 }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{
                background: hexAlpha(PIPELINE_CHART_ACCENT1, 0.08),
                border: `1px solid ${hexAlpha(PIPELINE_CHART_ACCENT1, 0.15)}`,
              }}
            >
              <Activity size={16} style={{ color: hexAlpha(PIPELINE_CHART_ACCENT1, 0.4) }} />
            </div>
            <span className="text-slate-300 text-xs">Sin datos</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Vista principal ────────────────────────────────────────────────────────────

export default function PipelineView({ selectedMac }) {
  const { authFetch } = useAuth()
  const authFetchRef = useRef(authFetch)
  useEffect(() => { authFetchRef.current = authFetch }, [authFetch])

  const [status,            setStatus]            = useState(null)
  const [readings,          setReadings]          = useState([])
  const [loading,           setLoading]           = useState(true)
  const [scenario,          setScenario]          = useState('normal')
  const [pipelineMode,      setPipelineMode]      = useState('sim')
  const [irrigationType,    setIrrigationType]    = useState('sprinkler')
  const [leakDetectTrained, setLeakDetectTrained] = useState(false)
  const [applyBusy,         setApplyBusy]         = useState(false)
  const timerRef = useRef(null)
  const liveAbortRef = useRef(null)

  const [liveHours, setLiveHours] = useState(1)

  // Historical mode
  const [mode, setMode] = useState('live')  // 'live' | 'history'
  const [histLoading, setHistLoading] = useState(false)
  const now      = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const [startDt, setStartDt] = useState(toInputVal(yesterday))
  const [endDt,   setEndDt]   = useState(toInputVal(now))
  const [histReadings, setHistReadings] = useState([])

  const fetchLive = useCallback(async () => {
    // Cancelar la petición anterior si sigue en vuelo
    if (liveAbortRef.current) liveAbortRef.current.abort()
    const controller = new AbortController()
    liveAbortRef.current = controller
    const signal = controller.signal
    try {
      // 20 s de intervalo de telemetría → puntos por hora ≈ 180; cap 1500
      const nPoints = Math.min(Math.ceil(liveHours * 180) + 10, 1500)
      const statusUrl = selectedMac
        ? `/api/pipeline/status?mac=${encodeURIComponent(selectedMac)}`
        : '/api/pipeline/status'
      const readingsUrl = selectedMac
        ? `/api/pipeline/readings?n=${nPoints}&mac=${encodeURIComponent(selectedMac)}`
        : `/api/pipeline/readings?n=${nPoints}`

      const [sRes, rRes] = await Promise.all([
        authFetchRef.current(statusUrl, { signal }),
        authFetchRef.current(readingsUrl, { signal }),
      ])
      const [s, r] = await Promise.all([sRes.json(), rRes.json()])
      setStatus(s)
      setReadings(Array.isArray(r) ? r : [])
      if (s.config?.scenario) setScenario(s.config.scenario)
      if (s.config?.mode) setPipelineMode(s.config.mode)
      if (s.config?.irrigation_type) setIrrigationType(s.config.irrigation_type)
      if (s.config?.leak_detect_trained != null) setLeakDetectTrained(Boolean(s.config.leak_detect_trained))
    } catch (e) {
      if (e.name !== 'AbortError') { /* ignorar fallos transitorios del pipeline */ }
    }
    finally { setLoading(false) }
  }, [selectedMac, liveHours])

  // Live auto-refresh
  useEffect(() => {
    if (mode !== 'live') return
    fetchLive()
    timerRef.current = setInterval(fetchLive, 20000)
    return () => clearInterval(timerRef.current)
  }, [fetchLive, mode])

  // When switching back to live, clear historical data
  const switchMode = (m) => {
    if (m === 'live') {
      clearInterval(timerRef.current)
      setMode('live')
      setLoading(true)
    } else {
      clearInterval(timerRef.current)
      setMode('history')
    }
  }

  const fetchHistory = async () => {
    setHistLoading(true)
    try {
      const from = toQueryStr(new Date(startDt))
      const to   = toQueryStr(new Date(endDt))
      const macPart = selectedMac ? `&mac=${encodeURIComponent(selectedMac)}` : ''
      const res  = await authFetchRef.current(`/api/pipeline/readings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&max_points=150${macPart}`)
      const data = await res.json()
      setHistReadings(Array.isArray(data) ? data : [])
    } catch {
      // Ignorar fallos transitorios al cargar histórico.
    }
    finally { setHistLoading(false) }
  }

  const applyConfig = async (patch) => {
    setApplyBusy(true)
    try {
      const res = await authFetchRef.current('/api/pipeline/config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...patch, mac: selectedMac }),
      })
      if (res.ok) {
        const cfg = await res.json()
        if (cfg.scenario) setScenario(cfg.scenario)
        if (cfg.mode) setPipelineMode(cfg.mode)
        if (cfg.irrigation_type) setIrrigationType(cfg.irrigation_type)
        if (cfg.leak_detect_trained != null) setLeakDetectTrained(Boolean(cfg.leak_detect_trained))
      }
      if (mode === 'live') await fetchLive()
    } catch {
      // Ignorar fallos transitorios al aplicar configuración del pipeline.
    }
    finally { setApplyBusy(false) }
  }

  const applyScenario      = async (sc)   => applyConfig({ scenario: sc })
  const applyMode          = async (m)    => applyConfig({ mode: m })
  const applyIrrigationType = async (type) => applyConfig({ irrigation_type: type })

  const [resetFlowBusy, setResetFlowBusy] = useState(false)
  const resetFlowCounters = async () => {
    if (!selectedMac) return
    setResetFlowBusy(true)
    try {
      await authFetchRef.current('/api/flow/reset', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mac: selectedMac }),
      })
    } catch { /* ignorar fallos transitorios */ }
    finally { setResetFlowBusy(false) }
  }

  const cur = status?.current
  const det = status?.detection
  const cfg = status?.config

  const chartReadings = mode === 'live' ? readings : histReadings

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-4">
      <InjectPipelineStyles />

      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-50 p-2 rounded-xl border border-brand-100">
            <Activity size={16} className="text-brand-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-navy-900">Pipeline · Caudal y Presión</h2>
              {mode === 'live' && !loading && (
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: ha('#10b981', 0.10), color: '#059669', border: `1px solid ${ha('#10b981', 0.25)}` }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0, display: 'inline-block', animation: 'liveDotBlink 1.4s ease-in-out infinite' }} />
                  EN VIVO
                </span>
              )}
            </div>
            <p className="text-xs text-navy-400">Detección de fugas y roturas — simulación de sensores</p>
          </div>
        </div>
        {mode === 'live' && (
          <button
            onClick={fetchLive}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium text-navy-500 hover:text-navy-900 bg-white border border-black/[.08] hover:border-brand-300 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-all"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        )}
      </div>

      {/* ── Banner de estado ── */}
      {mode === 'live' && <StatusBanner detection={det} />}

      {/* ── Badge diagnóstico de fuente de sensor ── */}
      {mode === 'live' && cur?.pipeline_source && (() => {
        const src = cur.pipeline_source
        const SRC_CFG = {
          real:       { label: 'Sensor real',                  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
          real_flow:  { label: 'Caudal real · Presión simulada', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
          fallback:   { label: 'Sensor sin respuesta · Datos estimados', cls: 'bg-red-50 text-red-700 border-red-200' },
          sim:        { label: 'Datos simulados (sin sensor físico)',     cls: 'bg-slate-50 text-slate-500 border-slate-200' },
        }
        const info = SRC_CFG[src] ?? { label: src, cls: 'bg-slate-50 text-slate-500 border-slate-200' }
        return (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium w-fit ${info.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${src === 'real' ? 'bg-emerald-500' : src === 'real_flow' ? 'bg-amber-400' : src === 'fallback' ? 'bg-red-500' : 'bg-slate-400'}`} />
            <span>Fuente presión:</span>
            <span className="font-semibold">{info.label}</span>
          </div>
        )
      })()}

      {/* ── Readings animados + config ── */}
      {mode === 'live' && (
        <>
          {/* Gauges + Contadores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Animated gauges */}
            <div className="flex gap-3">
              <GaugeCard
                title="Presión"
                icon={Gauge}
                value={cur?.pressure_bar}
                unit="bar"
                max={6}
                colorHex={PIPELINE_CHART_ACCENT1}
                sub={`Est. ${cfg?.static_pressure_bar ?? '—'} · Din. ${cfg?.dynamic_pressure_bar ?? '—'} bar`}
                live
              />
              <GaugeCard
                title="Caudal"
                icon={Droplets}
                value={cur?.flow_lpm}
                unit="L/min"
                max={15}
                colorHex={PIPELINE_CHART_ACCENT2}
                sub={`Nominal: ${cfg?.nominal_flow_lpm ?? '—'} L/min`}
                live
              />
            </div>
            {/* Compact counters */}
            <div className="flex flex-col gap-2">
              <CompactCounter
                label="Litros ciclo"
                value={cur?.flow_session_l != null ? cur.flow_session_l.toFixed(2) : null}
                unit="L" icon={FlaskConical} colorHex="#0891b2"
              />
              <CompactCounter
                label="Litros riego"
                value={cur?.flow_irrig_l != null ? cur.flow_irrig_l.toFixed(2) : null}
                unit="L" icon={Droplets} colorHex="#2563eb"
              />
              <CompactCounter
                label="Litros fuga"
                value={cur?.flow_leak_l != null ? cur.flow_leak_l.toFixed(2) : null}
                unit="L" icon={AlertTriangle} colorHex="#f59e0b"
              />
              <button
                onClick={resetFlowCounters}
                disabled={resetFlowBusy || !selectedMac}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-black/[.1] bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                title="Resetea los contadores de litros riego, fuga y ciclo en el ESP32"
              >
                <RefreshCw size={12} className={resetFlowBusy ? 'animate-spin' : ''} />
                {resetFlowBusy ? 'Enviando…' : 'Reset contadores'}
              </button>
            </div>
          </div>
          {/* Config panel */}
          <ScenarioSelector
            current={scenario}
            onSelect={applyScenario}
            busy={applyBusy}
            mode={pipelineMode}
            onModeChange={applyMode}
            irrigationType={irrigationType}
            onIrrigationChange={applyIrrigationType}
            leakDetectTrained={leakDetectTrained}
          />
        </>
      )}

      {/* ── Toggle En vivo / Histórico ── */}
      <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-navy-50 p-1 rounded-xl">
            <button
              onClick={() => switchMode('live')}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                mode === 'live'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-navy-400 hover:text-navy-700'
              }`}
            >
              <Radio size={12} />
              En vivo
            </button>
            <button
              onClick={() => switchMode('history')}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                mode === 'history'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-navy-400 hover:text-navy-700'
              }`}
            >
              <Calendar size={12} />
              Histórico
            </button>
          </div>

          {/* Date range pickers — only in history mode */}
          {mode === 'history' && (
            <>
              <div className="flex items-center gap-2 bg-navy-50 rounded-xl px-3 py-1.5 border border-navy-100 focus-within:border-brand-400">
                <p className="text-navy-400 text-xs shrink-0">Desde</p>
                <input
                  type="datetime-local"
                  value={startDt}
                  onChange={e => setStartDt(e.target.value)}
                  className="bg-transparent text-navy-700 text-xs focus:outline-none [color-scheme:light]"
                />
              </div>
              <div className="flex items-center gap-2 bg-navy-50 rounded-xl px-3 py-1.5 border border-navy-100 focus-within:border-brand-400">
                <p className="text-navy-400 text-xs shrink-0">Hasta</p>
                <input
                  type="datetime-local"
                  value={endDt}
                  onChange={e => setEndDt(e.target.value)}
                  className="bg-transparent text-navy-700 text-xs focus:outline-none [color-scheme:light]"
                />
              </div>
              <button
                onClick={fetchHistory}
                disabled={histLoading}
                className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                <Search size={12} />
                Consultar
              </button>
            </>
          )}

          {mode === 'live' && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-xs text-navy-400 shrink-0">Ventana:</span>
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={liveHours}
                onChange={e => setLiveHours(Number(e.target.value))}
                className="w-28 accent-brand-500"
              />
              <span className="text-xs font-semibold text-navy-600 w-12 shrink-0">
                {liveHours < 24 ? `${liveHours} h` : '24 h'}
              </span>
              <span className="text-xs text-navy-300">· Auto-refresh 20 s</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Gráfico presión + caudal ── */}
      <PipelineChart readings={chartReadings} mode={mode} histLoading={histLoading} liveHours={liveHours} />

      {/* ── Estadísticos de detección (solo en vivo) ── */}
      {mode === 'live' && (
        <DetectionStats
          detection={det}
          irrigationType={irrigationType}
          leakDetectTrained={leakDetectTrained}
        />
      )}

      {/* ── Nota ── */}
      <p className="text-xs text-navy-200 text-center pb-2">
        Modo activo: {pipelineMode === 'real' ? 'hardware' : 'simulación'} · Fuente: {cfg?.source ?? '—'}
      </p>

    </main>
  )
}
