import { useState, useEffect, useCallback, useRef } from 'react'
import ReactApexChart from 'react-apexcharts'
import {
  Activity, AlertTriangle, CheckCircle, Gauge,
  Droplets, Zap, FlaskConical, RefreshCw, Info,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
function toMs(t) {
  if (t == null) return null
  return new Date(String(t).replace(' ', 'T')).getTime()
}

// ── Configuración de estados de detección ─────────────────────────────────────
const STATUS_CFG = {
  NORMAL:         { label: 'Sistema normal',          color: 'emerald', Icon: CheckCircle },
  LEAK_SUSPECTED: { label: 'Fuga sospechada (EWMA)',  color: 'amber',   Icon: AlertTriangle },
  LEAK:           { label: 'Fuga detectada',          color: 'orange',  Icon: AlertTriangle },
  BURST:          { label: 'Rotura detectada',        color: 'red',     Icon: Zap },
  NO_DATA:        { label: 'Sin datos suficientes',   color: 'navy',    Icon: Info },
}

const COLOR = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   bar: 'bg-amber-400' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  bar: 'bg-orange-500' },
  red:     { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     bar: 'bg-red-500' },
  navy:    { bg: 'bg-navy-50',    text: 'text-navy-500',    border: 'border-navy-100',    bar: 'bg-navy-300' },
}

const SCENARIOS = [
  { id: 'normal', label: 'Normal',   hint: 'Sin anomalías' },
  { id: 'leak',   label: 'Fuga',     hint: '~0.3 L/min fuga' },
  { id: 'burst',  label: 'Rotura',   hint: 'Presión colapsa' },
]

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function ReadingCard({ title, icon: Icon, value, unit, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="bg-brand-50 p-1.5 rounded-lg">
          <Icon size={14} className="text-brand-500" />
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

function ScenarioSelector({ current, onSelect, busy }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="bg-navy-50 p-1.5 rounded-lg">
          <FlaskConical size={14} className="text-navy-400" />
        </div>
        <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">
          Escenario simulado
        </p>
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
      <p className="text-xs text-navy-200 mt-2.5 leading-relaxed">
        Cambia el escenario para probar los algoritmos de detección.
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

function PipelineChart({ readings }) {
  const ts       = readings.map(r => toMs(r.timestamp))
  const pressure = readings.map((r, i) => ({ x: ts[i], y: r.pressure_bar }))
  const flow     = readings.map((r, i) => ({ x: ts[i], y: r.flow_lpm }))

  const series = [
    { name: 'Presión (bar)',   data: pressure },
    { name: 'Caudal (L/min)', data: flow },
  ]

  const options = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      animations: { enabled: false },
      background: 'transparent',
      fontFamily: '"DM Sans", system-ui, sans-serif',
    },
    colors: ['#0c8ecc', '#10b981'],
    stroke: { curve: 'smooth', width: [2.5, 2.5] },
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.02, stops: [0, 100] },
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { fontSize: '11px', colors: '#8a9aaa', fontFamily: '"DM Sans"' },
        datetimeUTC: false,
      },
      axisBorder: { show: false },
      axisTicks:  { show: false },
    },
    yaxis: [
      {
        title: { text: 'Presión (bar)', style: { fontSize: '11px', color: '#0c8ecc', fontFamily: '"DM Sans"' } },
        min: 0,
        labels: {
          style: { colors: '#0c8ecc', fontSize: '11px', fontFamily: '"DM Sans"' },
          formatter: v => v != null ? `${v.toFixed(2)}` : '',
        },
      },
      {
        opposite: true,
        title: { text: 'Caudal (L/min)', style: { fontSize: '11px', color: '#10b981', fontFamily: '"DM Sans"' } },
        min: 0,
        labels: {
          style: { colors: '#10b981', fontSize: '11px', fontFamily: '"DM Sans"' },
          formatter: v => v != null ? `${v.toFixed(1)}` : '',
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
        { formatter: v => v != null ? `${v.toFixed(3)} bar` : '—' },
        { formatter: v => v != null ? `${v.toFixed(2)} L/min` : '—' },
      ],
      style: { fontSize: '12px', fontFamily: '"DM Sans"' },
    },
    grid: {
      borderColor: '#f3f3ef',
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      padding: { left: 4, right: 8 },
    },
    dataLabels: { enabled: false },
  }

  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-1">
        <Activity size={15} className="text-navy-300 shrink-0" />
        <h3 className="text-sm font-semibold text-navy-900">Presión y Caudal — Histórico</h3>
        <span className="ml-auto text-xs text-navy-200">{readings.length} muestras</span>
      </div>
      {readings.length > 0 ? (
        <ReactApexChart options={options} series={series} type="line" height={260} />
      ) : (
        <div className="flex items-center justify-center text-navy-200 text-sm" style={{ height: 260 }}>
          Sin datos históricos
        </div>
      )}
    </div>
  )
}

// ── Vista principal ────────────────────────────────────────────────────────────

export default function PipelineView() {
  const [status,   setStatus]   = useState(null)
  const [readings, setReadings] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [scenario, setScenario] = useState('normal')
  const [applyBusy, setApplyBusy] = useState(false)
  const timerRef = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, rRes] = await Promise.all([
        fetch('/api/pipeline/status'),
        fetch('/api/pipeline/readings?n=90'),
      ])
      const [s, r] = await Promise.all([sRes.json(), rRes.json()])
      setStatus(s)
      setReadings(Array.isArray(r) ? r : [])
      if (s.config?.scenario) setScenario(s.config.scenario)
    } catch (_) {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchAll()
    timerRef.current = setInterval(fetchAll, 20000)
    return () => clearInterval(timerRef.current)
  }, [fetchAll])

  const applyScenario = async (sc) => {
    setApplyBusy(true)
    try {
      await fetch('/api/pipeline/scenario', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scenario: sc }),
      })
      setScenario(sc)
      await fetchAll()
    } catch (_) {}
    finally { setApplyBusy(false) }
  }

  const cur = status?.current
  const det = status?.detection
  const cfg = status?.config

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
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-navy-500 hover:text-navy-900 bg-white border border-black/[.08] hover:border-brand-300 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-all"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {/* ── Banner de estado ── */}
      <StatusBanner detection={det} />

      {/* ── Cards de lectura actual + selector de escenario ── */}
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
        />
      </div>

      {/* ── Gráfico presión + caudal ── */}
      <PipelineChart readings={readings} />

      {/* ── Estadísticos de detección ── */}
      <DetectionStats detection={det} />

      {/* ── Nota ── */}
      <p className="text-xs text-navy-200 text-center pb-2">
        Valores simulados — caudalímetro y sensor de presión pendientes de instalación física
      </p>

    </main>
  )
}
