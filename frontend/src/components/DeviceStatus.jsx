import { useRef, useEffect } from 'react'
import { Wifi, HardDrive, Clock, CircuitBoard, Cpu, BatteryMedium, Zap, AlertTriangle, Activity, Globe, Hash, Database, Code2, Eye } from 'lucide-react'
import WeatherChart from './WeatherChart'
import * as echarts from 'echarts/core'
import { LineChart as ELineChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent,
} from 'echarts/components'
import { LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([ELineChart, GridComponent, TooltipComponent, LegendComponent, LegacyGridContainLabel, CanvasRenderer])

function ha(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-navy-300" />
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-navy-300">{label}</h2>
    </div>
  )
}

// ── Info chip ─────────────────────────────────────────────────────────────────
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

function formatLastSeen(ts) {
  if (!ts) return null
  const d = new Date(String(ts).trim().replace(' ', 'T') + (String(ts).includes('Z') || String(ts).includes('+') ? '' : 'Z'))
  if (isNaN(d)) return String(ts)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1)  return 'Ahora mismo'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)   return `hace ${diffH} h ${diffMin % 60} min`
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── Signal bars widget ────────────────────────────────────────────────────────
function SignalBars({ rssi }) {
  if (rssi == null) return <span className="text-navy-200 text-sm">—</span>
  const level = rssi >= -50 ? 4 : rssi >= -60 ? 3 : rssi >= -70 ? 2 : rssi >= -80 ? 1 : 0
  const color  = ['bg-red-400', 'bg-red-400', 'bg-[#BA7517]', 'bg-[#BA7517]', 'bg-[#0c8ecc]'][level]
  const label  = ['Sin señal', 'Muy débil', 'Débil', 'Buena', 'Excelente'][level]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`w-2.5 rounded-sm ${i <= level ? color : 'bg-navy-50'}`}
            style={{ height: `${8 + i * 5}px` }}
          />
        ))}
      </div>
      <p className="text-xs text-navy-300">{label} · {rssi} dBm</p>
    </div>
  )
}

// ── Heap bar widget ───────────────────────────────────────────────────────────
function HeapBar({ freeHeap }) {
  if (freeHeap == null) return <span className="text-navy-200 text-sm">—</span>
  const totalKb = 320
  const freeKb  = Math.round(freeHeap / 1024)
  const pct     = Math.min(100, Math.round((freeKb / totalKb) * 100))
  const color   = pct >= 60 ? '#534AB7' : pct >= 30 ? '#BA7517' : '#ef4444'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: ha(color, 0.12) }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p className="text-xs text-navy-300">{freeKb} KB libres · {pct}% disponible</p>
    </div>
  )
}

// ── Battery helpers ───────────────────────────────────────────────────────────
const BAT_FULL_V  = 12.2
const BAT_EMPTY_V = 10.5

function batPct(v) {
  if (v == null) return null
  return Math.max(0, Math.min(100, ((v - BAT_EMPTY_V) / (BAT_FULL_V - BAT_EMPTY_V)) * 100))
}

// ── Animated battery SVG ─────────────────────────────────────────────────────
function AnimatedBattery({ percentage = 0, size = 80, charging = false }) {
  const fillRef = useRef(null)
  const glowRef = useRef(null)
  const boltRef = useRef(null)
  const rafId   = useRef(null)
  const state   = useRef({ displayed: 0, target: 0 })
  const uid     = useRef(`bat-${Math.random().toString(36).slice(2, 6)}`).current

  useEffect(() => { state.current.target = Math.max(0, Math.min(100, percentage)) }, [percentage])

  useEffect(() => {
    function tick(now) {
      const s = state.current
      s.displayed += (s.target - s.displayed) * 0.06
      const pct   = s.displayed / 100
      const color = pct >= 0.6 ? '#10b981' : pct >= 0.25 ? '#f59e0b' : '#ef4444'
      const glow  = pct >= 0.6 ? 'rgba(16,185,129,0.35)' : pct >= 0.25 ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.35)'
      if (fillRef.current) {
        fillRef.current.setAttribute('width', String(Math.max(0, 34 * pct).toFixed(2)))
        fillRef.current.setAttribute('fill', color)
      }
      if (glowRef.current) glowRef.current.setAttribute('stop-color', glow)
      if (boltRef.current) {
        if (charging) {
          const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 600))
          boltRef.current.setAttribute('opacity', String(pulse.toFixed(2)))
          boltRef.current.style.display = 'block'
        } else {
          boltRef.current.style.display = 'none'
        }
      }
      rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
  }, [charging])

  const w = size, h = Math.round(size * 0.48)
  return (
    <svg width={w} height={h} viewBox="0 0 52 25" style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <radialGradient id={`bg-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop ref={glowRef} offset="100%" stopColor="rgba(16,185,129,0.35)" />
        </radialGradient>
        <filter id={`glow-${uid}`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect x="1" y="1" width="44" height="23" rx="5" fill={`url(#bg-${uid})`} filter={`url(#glow-${uid})`} opacity="0.6" />
      <rect x="1" y="1" width="44" height="23" rx="4.5" fill="none" stroke="#1a3350" strokeWidth="2" opacity="0.8" />
      <rect x="46" y="9" width="5" height="7" rx="1.5" fill="#1a3350" opacity="0.7" />
      <rect ref={fillRef} x="4" y="4" width="0" height="17" rx="2.5" fill="#10b981" />
      <text x="22" y="15.5" textAnchor="middle" dominantBaseline="middle"
        fontSize="7.5" fontWeight="700" fontFamily='"DM Sans",system-ui,sans-serif'
        fill="#0f172a" opacity="0.75">
        {Math.round(state.current.displayed)}%
      </text>
      <g ref={boltRef} style={{ display: 'none' }}>
        <path d="M24 6 L20 13.5 L23.5 13.5 L22 19 L28 11.5 L24.5 11.5 Z" fill="#f59e0b" opacity="0.9" />
      </g>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatUptime(s) {
  if (s == null) return '—'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

function formatRevision(rev) {
  if (rev == null) return null
  if (rev > 100) return `v${Math.floor(rev / 100)}.${rev % 100}`
  return `rev${rev}`
}

function toMs2(t) {
  if (t == null) return null
  if (typeof t === 'number') return isNaN(t) ? null : t
  const parsed = Date.parse(String(t).trim())
  return Number.isNaN(parsed) ? null : parsed
}

// ── INA219 multi-axis chart ───────────────────────────────────────────────────
function Ina219Chart({ data, timestamps }) {
  const ref = useRef(null)
  const chartRef = useRef(null)

  const tsMs    = (timestamps ?? []).map(toMs2).filter(Boolean)
  const voltage = (data.ina219_bus_voltage ?? []).map((v, i) => [tsMs[i], v != null ? +Number(v).toFixed(3) : null]).filter(p => p[0] != null && p[1] != null)
  const current = (data.ina219_current_ma  ?? []).map((v, i) => [tsMs[i], v != null ? +Number(v).toFixed(1) : null]).filter(p => p[0] != null && p[1] != null)
  const power   = (data.ina219_power_mw    ?? []).map((v, i) => [tsMs[i], v != null ? +Number(v).toFixed(1) : null]).filter(p => p[0] != null && p[1] != null)

  useEffect(() => {
    if (!ref.current) return
    chartRef.current = echarts.init(ref.current, null, { renderer: 'canvas' })
    return () => { chartRef.current?.dispose(); chartRef.current = null }
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.setOption({
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#1a3350', fontSize: 11 },
        formatter: params => {
          const ts = new Date(params[0]?.axisValue).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
          return `<b>${ts}</b><br/>` + params.map(p =>
            `<span style="color:${p.color}">■</span> ${p.seriesName}: <b>${p.value[1]}</b> ${['V','mA','mW'][p.seriesIndex]}`
          ).join('<br/>')
        },
      },
      legend: {
        data: ['Voltaje', 'Corriente', 'Potencia'],
        bottom: 0,
        textStyle: { color: '#64748b', fontSize: 10 },
        itemWidth: 12, itemHeight: 8,
      },
      grid: { top: 12, left: 52, right: 64, bottom: 36, containLabel: false },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisLabel: { color: '#94a3b8', fontSize: 10, formatter: v => new Date(v).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) },
        splitLine: { show: false },
      },
      yAxis: [
        {
          name: 'V', nameTextStyle: { color: '#10b981', fontSize: 10 }, position: 'left',
          axisLabel: { color: '#10b981', fontSize: 10, formatter: v => `${v}V` },
          axisLine: { show: true, lineStyle: { color: '#10b981' } },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
        },
        {
          name: 'mA', nameTextStyle: { color: '#0c8ecc', fontSize: 10 }, position: 'right',
          axisLabel: { color: '#0c8ecc', fontSize: 10, formatter: v => `${v}` },
          axisLine: { show: true, lineStyle: { color: '#0c8ecc' } },
          splitLine: { show: false },
        },
        {
          name: 'mW', nameTextStyle: { color: '#BA7517', fontSize: 10 }, position: 'right',
          offset: 52,
          axisLabel: { color: '#BA7517', fontSize: 10, formatter: v => `${v}` },
          axisLine: { show: true, lineStyle: { color: '#BA7517' } },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Voltaje', type: 'line', yAxisIndex: 0, data: voltage,
          smooth: true, symbol: 'none',
          lineStyle: { color: '#10b981', width: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(16,185,129,0.18)' }, { offset: 1, color: 'rgba(16,185,129,0)' }] } },
        },
        {
          name: 'Corriente', type: 'line', yAxisIndex: 1, data: current,
          smooth: true, symbol: 'none',
          lineStyle: { color: '#0c8ecc', width: 1.5 },
        },
        {
          name: 'Potencia', type: 'line', yAxisIndex: 2, data: power,
          smooth: true, symbol: 'none',
          lineStyle: { color: '#BA7517', width: 1.5, type: 'dashed' },
        },
      ],
    }, true)
  }, [voltage.length, current.length, power.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const ro = new ResizeObserver(() => chart.resize())
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  if (!voltage.length && !current.length) {
    return (
      <div className="h-48 flex items-center justify-center text-navy-200 text-sm">
        Sin datos INA219
      </div>
    )
  }
  return <div ref={ref} style={{ width: '100%', height: 220 }} />
}

// ── Main component ────────────────────────────────────────────────────────────
const REALTIME_N = 30

export default function DeviceStatus({ data, latest, deviceInfo, timestamps }) {
  const hasIna = latest.ina219_bus_voltage != null || latest.ina219_current_ma != null
  const isOnline = latest.rssi != null

  const rtTs   = timestamps.slice(-REALTIME_N)
  const rtRssi = data.rssi.slice(-REALTIME_N)
  const rtHeap = data.free_heap.slice(-REALTIME_N)

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#1a3350] flex items-center justify-center shadow-sm shadow-navy-200/50">
          <CircuitBoard size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-navy-900 leading-tight">Estado del Dispositivo</h1>
          <p className="text-xs text-navy-300 leading-none mt-0.5">Diagnóstico y telemetría en tiempo real</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {deviceInfo?.firmware_version && (
            <span
              className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-md"
              style={{ background: ha('#1a3350', 0.08), color: '#1a3350', border: `1px solid ${ha('#1a3350', 0.2)}` }}
            >
              v{deviceInfo.firmware_version}
            </span>
          )}
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border leading-none ${
              isOnline
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-red-50 text-red-500 border-red-200'
            }`}
          >
            {isOnline ? '● En línea' : '○ Offline'}
          </span>
        </div>
      </div>

      {/* ── Métricas del sistema — card compacta ─────────────────────────── */}
      <div className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-2.5 border-b border-black/[.06] flex items-center gap-2">
          <Activity size={13} className="text-navy-300" />
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-navy-300">Métricas del sistema</span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-navy-50">

          {/* WiFi */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: ha('#0c8ecc', 0.12) }}>
                <Wifi size={11} style={{ color: '#0c8ecc' }} />
              </div>
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300">WiFi</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold tabular-nums leading-none text-navy-900">
                {latest.rssi != null ? Math.round(latest.rssi) : '—'}
              </span>
              <span className="text-[10px] font-semibold text-navy-300">dBm</span>
            </div>
            <SignalBars rssi={latest.rssi} />
          </div>

          {/* Memoria */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: ha('#534AB7', 0.12) }}>
                <HardDrive size={11} style={{ color: '#534AB7' }} />
              </div>
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300">Memoria</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold tabular-nums leading-none text-navy-900">
                {latest.free_heap != null ? Math.round(latest.free_heap / 1024) : '—'}
              </span>
              <span className="text-[10px] font-semibold text-navy-300">KB</span>
            </div>
            <HeapBar freeHeap={latest.free_heap} />
          </div>

          {/* Uptime */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: ha('#10b981', 0.12) }}>
                <Clock size={11} style={{ color: '#10b981' }} />
              </div>
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300">Uptime</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold tabular-nums leading-none text-navy-900">
                {formatUptime(latest.uptime_s)}
              </span>
            </div>
            <p className="text-[10px] text-navy-300">
              {latest.uptime_s != null ? `${Number(latest.uptime_s).toLocaleString()} s` : '—'}
            </p>
          </div>

        </div>
      </div>

      {/* ── Gráficas en tiempo real ───────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Activity} label="Histórico — últimas 30 lecturas" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <WeatherChart
            title="Señal WiFi" icon={Wifi} timestamps={rtTs}
            series={[{ name: 'RSSI', data: rtRssi }]}
            colors={['#0c8ecc']}
            yUnit=" dBm" yMin={-100} yMax={-20} type="line"
          />
          <WeatherChart
            title="Memoria libre" icon={HardDrive} timestamps={rtTs}
            series={[{ name: 'Heap libre', data: rtHeap.map(v => v != null ? Math.round(v / 1024) : null) }]}
            colors={['#534AB7']}
            yUnit=" KB" yMin={0} type="area"
          />
        </div>
      </div>

      {/* ── Panel INA219 — solo si hay datos ─────────────────────────────── */}
      {hasIna && (
        <div className="space-y-3">
          <SectionHeader icon={BatteryMedium} label="Alimentación — INA219" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

            {/* Card unificada de energía */}
            <div className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden" style={{ borderTop: `3px solid ${ha('#10b981', 0.75)}` }}>
              {/* Header */}
              <div
                className="px-5 py-3 border-b border-black/[.06] flex items-center gap-2.5"
                style={{ background: ha('#10b981', 0.05) }}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: ha('#10b981', 0.15) }}>
                  <BatteryMedium size={14} style={{ color: '#10b981' }} />
                </div>
                <span className="text-sm font-semibold text-navy-900">Alimentación</span>
                {latest.ina219_current_ma != null && latest.ina219_current_ma > 1300 && (
                  <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50">
                    <AlertTriangle size={11} className="text-amber-500" />
                    <span className="text-[10px] font-semibold text-amber-600">
                      {latest.ina219_current_ma > 1900 ? 'Corriente crítica' : 'Corriente elevada'}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4 space-y-4">
                {/* Batería animada */}
                {(() => {
                  const pct = batPct(latest.ina219_bus_voltage)
                  const color = pct == null ? '#94a3b8' : pct >= 60 ? '#10b981' : pct >= 25 ? '#f59e0b' : '#ef4444'
                  const label = pct == null ? '—' : pct >= 60 ? 'Carga buena' : pct >= 25 ? 'Carga baja' : 'Batería crítica'
                  return (
                    <div className="flex items-center gap-4">
                      <AnimatedBattery percentage={pct ?? 0} size={100} charging={false} />
                      <div>
                        <p className="text-lg font-extrabold tabular-nums leading-none" style={{ color }}>
                          {pct != null ? `${Math.round(pct)}%` : '—'}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color }}>{label}</p>
                        {latest.ina219_bus_voltage != null && (
                          <p className="text-[10px] text-navy-300 mt-0.5 font-mono">{Number(latest.ina219_bus_voltage).toFixed(2)} V</p>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Chips de métricas */}
                {(() => {
                  const ma    = latest.ina219_current_ma
                  const maColor = ma > 1900 ? '#ef4444' : ma > 1300 ? '#BA7517' : '#0c8ecc'
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      <InfoChip
                        icon={BatteryMedium}
                        label="Voltaje"
                        value={latest.ina219_bus_voltage != null ? `${Number(latest.ina219_bus_voltage).toFixed(2)} V` : null}
                        accent="#10b981"
                        mono
                      />
                      <InfoChip
                        icon={Zap}
                        label="Corriente"
                        value={ma != null ? `${Number(ma).toFixed(0)} mA` : null}
                        accent={maColor}
                        mono
                      />
                      <InfoChip
                        icon={Activity}
                        label="Potencia"
                        value={latest.ina219_power_mw != null ? `${Number(latest.ina219_power_mw / 1000).toFixed(2)} W` : null}
                        accent="#BA7517"
                        mono
                      />
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Gráfica histórica multi-eje */}
            <div className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden">
              <div
                className="px-5 py-3 border-b border-black/[.06] flex items-center gap-2.5"
                style={{ background: ha('#10b981', 0.05) }}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: ha('#10b981', 0.15) }}>
                  <Activity size={14} style={{ color: '#10b981' }} />
                </div>
                <span className="text-sm font-semibold text-navy-900">Voltaje · Corriente · Potencia</span>
              </div>
              <div className="p-4">
                <Ina219Chart data={data} timestamps={timestamps} />
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Información del Dispositivo (al final) ───────────────────────── */}
      <div className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div
          className="px-5 py-3 border-b border-black/[.06] flex items-center gap-2.5"
          style={{ background: ha('#1a3350', 0.04) }}
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: ha('#1a3350', 0.12) }}>
            <CircuitBoard size={14} style={{ color: '#1a3350' }} />
          </div>
          <span className="text-sm font-semibold text-navy-900">Información del Dispositivo</span>
          {deviceInfo?.last_seen && (
            <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full border" style={{ background: ha('#1a3350', 0.05), borderColor: ha('#1a3350', 0.15) }}>
              <Eye size={11} style={{ color: '#1a3350' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#1a3350' }}>
                {formatLastSeen(deviceInfo.last_seen)}
              </span>
            </div>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* Hardware */}
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-navy-300 mb-2 flex items-center gap-1.5">
              <Cpu size={10} />Hardware
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <InfoChip icon={CircuitBoard} label="Modelo"   value={deviceInfo?.chip_model} />
              <InfoChip icon={Hash}         label="Revisión" value={formatRevision(deviceInfo?.chip_revision)} mono />
              <InfoChip icon={Zap}          label="CPU"      value={deviceInfo?.cpu_freq_mhz != null ? `${deviceInfo.cpu_freq_mhz} MHz` : null} />
              <InfoChip icon={Database}     label="Flash"    value={deviceInfo?.flash_size_mb != null ? `${deviceInfo.flash_size_mb} MB` : null} />
              <InfoChip icon={Code2}        label="SDK"      value={deviceInfo?.sdk_version} mono />
              {deviceInfo?.firmware_version && (
                <InfoChip icon={Code2} label="Firmware" value={`v${deviceInfo.firmware_version}`} accent="#0c8ecc" mono />
              )}
            </div>
          </div>

          {/* Red */}
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-navy-300 mb-2 flex items-center gap-1.5">
              <Globe size={10} />Red
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <InfoChip icon={Globe} label="Dirección IP" value={deviceInfo?.ip_address} mono />
              <InfoChip icon={Hash}  label="MAC"          value={deviceInfo?.mac_address} mono />
            </div>
          </div>
        </div>
      </div>

    </main>
  )
}
