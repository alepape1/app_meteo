import { createElement, useState, useEffect, useCallback, useRef } from 'react'
import ReactApexChart from 'react-apexcharts'
import { useAuth } from '../AuthContext'
import {
  Activity, AlertTriangle, CheckCircle, Gauge,
  Droplets, Zap, FlaskConical, RefreshCw, Info,
  Radio, Calendar, Search,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
function toMs(t) {
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
  { id: 'normal',      label: 'Normal',      hint: 'Sin anomalías' },
  { id: 'leak',        label: 'Fuga',        hint: '~0.3 L/min fuga' },
  { id: 'burst',       label: 'Rotura',      hint: 'Presión colapsa' },
  { id: 'obstruction', label: 'Obstrucción', hint: 'Presión alta, caudal ~0' },
]

const PIPELINE_MODES = [
  { id: 'sim', label: 'Simulación', hint: 'Usa el simulador del firmware' },
  { id: 'real', label: 'Hardware', hint: 'Preparado para sensor físico' },
]

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function ReadingCard({ title, icon, value, unit, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="bg-brand-50 p-1.5 rounded-lg">
          {icon && createElement(icon, { size: 14, className: 'text-brand-500' })}
        </div>
        <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">{title}</p>
      </div>
      <p className="text-3xl font-bold text-navy-900 leading-none">
        {value != null ? value : '—'}
        <span className="text-sm font-normal text-navy-300 ml-1">{unit}</span>
      </p>
      {sub && <p className="text-xs text-navy-300 mt-1.5 leading-relaxed">{sub}</p>}
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

function ScenarioSelector({
  current, onSelect, busy, mode, onModeChange,
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="bg-navy-50 p-1.5 rounded-lg">
          <FlaskConical size={14} className="text-navy-400" />
        </div>
        <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">
          Configuración pipeline
        </p>
      </div>

      <div className="mb-3">
        <p className="text-[11px] font-semibold text-navy-300 uppercase tracking-widest mb-1.5">
          Modo
        </p>
        <div className="flex flex-col gap-1.5">
          {PIPELINE_MODES.map(item => (
            <button
              key={item.id}
              onClick={() => onModeChange(item.id)}
              disabled={busy || mode === item.id}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all
                ${mode === item.id
                  ? 'bg-navy-700 text-white cursor-default'
                  : 'bg-navy-50 text-navy-600 hover:bg-navy-100 disabled:opacity-40'}`}
            >
              <span>{item.label}</span>
              <span className={`${mode === item.id ? 'text-navy-100' : 'text-navy-300'}`}>
                {item.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {SCENARIOS.map(sc => (
          <button
            key={sc.id}
            onClick={() => onSelect(sc.id)}
            disabled={busy || current === sc.id}
            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all
              ${current === sc.id
                ? 'bg-brand-500 text-white cursor-default'
                : 'bg-navy-50 text-navy-600 hover:bg-navy-100 disabled:opacity-40'}`}
          >
            <span>{sc.label}</span>
            <span className={`${current === sc.id ? 'text-brand-100' : 'text-navy-300'}`}>
              {sc.hint}
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-navy-200 mt-3 leading-relaxed">
        Los intervalos del equipo se ajustan ahora desde la pantalla de Configuración.
      </p>
    </div>
  )
}

function DetectionStats({ detection }) {
  if (!detection || detection.status === 'NO_DATA') return null

  const rows = [
    ['Presión EWMA',   detection.ewma_pressure     != null ? `${detection.ewma_pressure} bar`    : '—'],
    ['Caudal EWMA',    detection.ewma_flow          != null ? `${detection.ewma_flow} L/min`       : '—'],
    ['Base presión',   detection.baseline_pressure  != null ? `${detection.baseline_pressure} bar` : '—'],
    ['Base caudal',    detection.baseline_flow      != null ? `${detection.baseline_flow} L/min`   : '—'],
    ['σ presión',      detection.std_pressure       != null ? `±${detection.std_pressure} bar`     : '—'],
    ['σ caudal',       detection.std_flow           != null ? `±${detection.std_flow} L/min`       : '—'],
  ]

  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-4">
      <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest mb-3">
        Estadísticos de detección
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2">
        {rows.map(([label, val]) => (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-navy-400">{label}</span>
            <span className="font-mono font-medium text-navy-700">{val}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-navy-50 space-y-1">
        <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest mb-2">
          Métodos activos
        </p>
        {[
          ['Umbral absoluto', 'Caudal > 0.10 L/min con válvula cerrada → LEAK'],
          ['dP/dt',           'Caída de presión > 20% en 20 s → BURST'],
          ['EWMA (λ=0.15)',   'Deriva estadística > 2.5σ en presión/caudal → LEAK_SUSPECTED'],
        ].map(([name, desc]) => (
          <div key={name} className="flex gap-2 text-xs">
            <span className="font-semibold text-navy-600 shrink-0">{name}:</span>
            <span className="text-navy-400">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PipelineChart({ readings, mode, histLoading }) {
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

  const samples = Array.from(deduped.values())
    .filter(p => Number.isFinite(p.x) && (Number.isFinite(p.pressure) || Number.isFinite(p.flow)))
    .sort((a, b) => a.x - b.x)

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

  const series = [
    { name: 'Presión (bar)', data: pressure },
    { name: 'Caudal (L/min)', data: flow },
  ]

  const hasAnyPoint = pressure.length > 0 || flow.length > 0
  const hasVisibleSeries = pressure.length > 1 || flow.length > 1
  const chartKey = `${mode}-${samples.length}-${samples.at(-1)?.x ?? 'empty'}`

  const options = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
      background: '#ffffff',
      fontFamily: '"DM Sans", system-ui, sans-serif',
    },
    colors: ['#0d9488', '#2563eb'],
    stroke: {
      show: true,
      curve: 'smooth',
      lineCap: 'round',
      width: [3.6, 3.6],
    },
    markers: {
      size: 2,
      colors: ['#14b8a6', '#3b82f6'],
      strokeColors: ['#0d9488', '#2563eb'],
      strokeWidth: 0.8,
      hover: { size: 4.5 },
    },
    fill: {
      type: 'solid',
      opacity: 0.16,
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { fontSize: '11px', colors: '#8a9aaa', fontFamily: '"DM Sans"' },
        datetimeUTC: false,
        formatter: (val) => {
          if (val == null) return ''
          const ms = typeof val === 'number' ? val : toMs(val)
          if (ms == null) return ''
          const d = new Date(ms)
          if (Number.isNaN(d.getTime())) return ''
          return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        },
      },
      axisBorder: { show: false },
      axisTicks:  { show: false },
    },
    yaxis: [
      {
        seriesName: 'Presión (bar)',
        title: { text: 'Presión (bar)', style: { fontSize: '11px', color: '#14b8a6', fontFamily: '"DM Sans"' } },
        min: pressureAxis.min,
        max: pressureAxis.max,
        forceNiceScale: true,
        decimalsInFloat: 2,
        labels: {
          style: { colors: '#14b8a6', fontSize: '11px', fontFamily: '"DM Sans"' },
          formatter: v => {
            const n = Number(v)
            return Number.isFinite(n) ? `${n.toFixed(2)}` : ''
          },
        },
      },
      {
        seriesName: 'Caudal (L/min)',
        opposite: true,
        title: { text: 'Caudal (L/min)', style: { fontSize: '11px', color: '#3b82f6', fontFamily: '"DM Sans"' } },
        min: flowAxis.min,
        max: flowAxis.max,
        forceNiceScale: true,
        decimalsInFloat: 1,
        labels: {
          style: { colors: '#3b82f6', fontSize: '11px', fontFamily: '"DM Sans"' },
          formatter: v => {
            const n = Number(v)
            return Number.isFinite(n) ? `${n.toFixed(1)}` : ''
          },
        },
      },
    ],
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '12px',
      fontFamily: '"DM Sans"',
      labels: { colors: '#3d506a' },
      markers: { size: 5, shape: 'circle', offsetX: -2 },
      itemMargin: { horizontal: 8 },
    },
    tooltip: {
      theme: 'light',
      shared: true,
      intersect: false,
      x: { format: 'dd MMM HH:mm:ss' },
      y: [
        { formatter: v => Number.isFinite(Number(v)) ? `${Number(v).toFixed(3)} bar` : '—' },
        { formatter: v => Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)} L/min` : '—' },
      ],
      style: { fontSize: '12px', fontFamily: '"DM Sans"' },
    },
    grid: {
      borderColor: '#e8eef5',
      strokeDashArray: 3,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
      padding: { left: 6, right: 10 },
    },
    dataLabels: { enabled: false },
  }

  const title = mode === 'live' ? 'Presión y Caudal — En vivo' : 'Presión y Caudal — Histórico'

  return (
    <div className="pipeline-chart bg-white rounded-2xl border border-black/[.06] shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-1">
        <Activity size={15} className="text-navy-300 shrink-0" />
        <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
        <span className="ml-auto text-xs text-navy-200">
          {histLoading ? 'Cargando…' : `${readings.length} muestras`}
        </span>
      </div>
      {hasVisibleSeries ? (
        <div className="px-2 pb-2">
          <ReactApexChart key={chartKey} options={options} series={series} type="line" height={320} />
        </div>
      ) : (
        <div className="flex items-center justify-center text-navy-300 text-sm text-center px-6" style={{ height: 260 }}>
          {histLoading
            ? 'Cargando datos…'
            : hasAnyPoint
              ? 'Aún no hay suficientes muestras válidas para dibujar una línea continua.'
              : 'No se están recibiendo datos válidos de presión y caudal.'}
        </div>
      )}
    </div>
  )
}

// ── Vista principal ────────────────────────────────────────────────────────────

export default function PipelineView({ selectedMac }) {
  const { authFetch } = useAuth()
  const [status,   setStatus]   = useState(null)
  const [readings, setReadings] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [scenario, setScenario] = useState('normal')
  const [pipelineMode, setPipelineMode] = useState('sim')
  const [applyBusy, setApplyBusy] = useState(false)
  const timerRef = useRef(null)

  // Historical mode
  const [mode, setMode] = useState('live')  // 'live' | 'history'
  const [histLoading, setHistLoading] = useState(false)
  const now      = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
  const [startDt, setStartDt] = useState(toInputVal(yesterday))
  const [endDt,   setEndDt]   = useState(toInputVal(now))
  const [histReadings, setHistReadings] = useState([])

  const fetchLive = useCallback(async () => {
    try {
      const statusUrl = selectedMac
        ? `/api/pipeline/status?mac=${encodeURIComponent(selectedMac)}`
        : '/api/pipeline/status'
      const readingsUrl = selectedMac
        ? `/api/pipeline/readings?n=90&mac=${encodeURIComponent(selectedMac)}`
        : '/api/pipeline/readings?n=90'

      const [sRes, rRes] = await Promise.all([
        authFetch(statusUrl),
        authFetch(readingsUrl),
      ])
      const [s, r] = await Promise.all([sRes.json(), rRes.json()])
      setStatus(s)
      setReadings(Array.isArray(r) ? r : [])
      if (s.config?.scenario) setScenario(s.config.scenario)
      if (s.config?.mode) setPipelineMode(s.config.mode)
    } catch {
      // Ignorar fallos transitorios del pipeline en vivo.
    }
    finally { setLoading(false) }
  }, [authFetch, selectedMac])

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
      const res  = await authFetch(`/api/pipeline/readings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${macPart}`)
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
      const res = await authFetch('/api/pipeline/config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...patch, mac: selectedMac }),
      })
      if (res.ok) {
        const cfg = await res.json()
        if (cfg.scenario) setScenario(cfg.scenario)
        if (cfg.mode) setPipelineMode(cfg.mode)
      }
      if (mode === 'live') await fetchLive()
    } catch {
      // Ignorar fallos transitorios al aplicar configuración del pipeline.
    }
    finally { setApplyBusy(false) }
  }

  const applyScenario = async (sc) => applyConfig({ scenario: sc })
  const applyMode = async (nextMode) => applyConfig({ mode: nextMode })

  const cur = status?.current
  const det = status?.detection
  const cfg = status?.config

  const chartReadings = mode === 'live' ? readings : histReadings

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-4">

      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-50 p-2 rounded-xl border border-brand-100">
            <Activity size={16} className="text-brand-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-navy-900">Pipeline · Caudal y Presión</h2>
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

      {/* ── Cards de lectura actual + selector de escenario ── */}
      {mode === 'live' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ReadingCard
            title="Presión"
            icon={Gauge}
            value={cur?.pressure_bar}
            unit="bar"
            sub={`Estática: ${cfg?.static_pressure_bar ?? '—'} bar · Dinámica: ${cfg?.dynamic_pressure_bar ?? '—'} bar`}
          />
          <ReadingCard
            title="Caudal"
            icon={Droplets}
            value={cur?.flow_lpm}
            unit="L/min"
            sub={`Nominal: ${cfg?.nominal_flow_lpm ?? '—'} L/min`}
          />
          <ScenarioSelector
            current={scenario}
            onSelect={applyScenario}
            busy={applyBusy}
            mode={pipelineMode}
            onModeChange={applyMode}
          />
        </div>
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
            <p className="text-xs text-navy-300 ml-auto">Auto-refresh cada 20 s</p>
          )}
        </div>
      </div>

      {/* ── Gráfico presión + caudal ── */}
      <PipelineChart readings={chartReadings} mode={mode} histLoading={histLoading} />

      {/* ── Estadísticos de detección (solo en vivo) ── */}
      {mode === 'live' && <DetectionStats detection={det} />}

      {/* ── Nota ── */}
      <p className="text-xs text-navy-200 text-center pb-2">
        Modo activo: {pipelineMode === 'real' ? 'hardware' : 'simulación'} · Fuente: {cfg?.source ?? '—'}
      </p>

    </main>
  )
}
