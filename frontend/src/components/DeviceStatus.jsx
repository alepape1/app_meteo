import { useRef, useEffect } from 'react'
import { Wifi, HardDrive, Clock, Server, CircuitBoard, Cpu, BatteryMedium, Zap, AlertTriangle, Activity } from 'lucide-react'
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

// ── Info row inside device card ───────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-navy-50 last:border-0">
      <span className="text-[11px] text-navy-300">{label}</span>
      <span className="text-[11px] font-semibold text-navy-700 font-mono">{value ?? '—'}</span>
    </div>
  )
}

// ── Metric card (PlantationView ParameterCard style) ──────────────────────────
function MetricCard({ label, symbol, value, unit, accent, icon: Icon, children }) {
  return (
    <div
      className="bg-white border border-black/[.07] rounded-2xl p-4 flex flex-col gap-3 shadow-sm"
      style={{ borderTop: `3px solid ${ha(accent, 0.75)}` }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: ha(accent, 0.12) }}
        >
          <Icon size={14} style={{ color: accent }} />
        </div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-navy-300 leading-none">{label}</p>
        {symbol && (
          <p className="text-[9px] font-semibold text-navy-200 leading-none ml-auto">{symbol}</p>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[2rem] font-extrabold leading-none tabular-nums tracking-tight"
          style={{ color: '#0f172a', textShadow: `0 0 20px ${ha(accent, 0.18)}` }}
        >
          {value}
        </span>
        {unit && <span className="text-xs font-semibold text-navy-300">{unit}</span>}
      </div>
      {children}
    </div>
  )
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

function BatteryBar({ voltage }) {
  const pct = batPct(voltage)
  if (pct == null) return <span className="text-navy-200 text-sm">—</span>
  const color  = pct >= 60 ? '#10b981' : pct >= 25 ? '#BA7517' : '#ef4444'
  const label  = pct >= 60 ? 'Carga buena' : pct >= 25 ? 'Carga baja' : 'Batería crítica'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1 h-5 rounded-md overflow-hidden border-2" style={{ borderColor: color }}>
          <div
            className="absolute inset-y-0 left-0 rounded-[3px] transition-all duration-700"
            style={{ width: `${pct}%`, background: color, opacity: 0.85 }}
          />
          <span
            className="absolute inset-0 flex items-center justify-center text-[10px] font-bold mix-blend-multiply"
            style={{ color }}
          >
            {Math.round(pct)}%
          </span>
        </div>
        <div className="w-2 h-2.5 rounded-r-sm" style={{ background: color, opacity: 0.7 }} />
      </div>
      <p className="text-xs" style={{ color }}>{label} · {Number(voltage).toFixed(2)} V</p>
    </div>
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

      {/* ── Info del dispositivo (Hardware + Red fusionados) ─────────────── */}
      <div className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden">
        <div
          className="px-5 py-3 border-b border-black/[.06] flex items-center gap-2"
          style={{ background: ha('#1a3350', 0.04) }}
        >
          <Server size={14} style={{ color: '#1a3350' }} />
          <span className="text-sm font-semibold text-navy-900">Información del Dispositivo</span>
          {deviceInfo?.last_seen && (
            <span className="ml-auto text-[10px] text-navy-300">último boot: {deviceInfo.last_seen}</span>
          )}
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
          {/* Hardware */}
          <div>
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300 mb-2 flex items-center gap-1.5">
              <Cpu size={11} />Hardware
            </p>
            <InfoRow label="Modelo"   value={deviceInfo?.chip_model} />
            <InfoRow label="Revisión" value={formatRevision(deviceInfo?.chip_revision)} />
            <InfoRow label="CPU"      value={deviceInfo?.cpu_freq_mhz != null ? `${deviceInfo.cpu_freq_mhz} MHz` : null} />
            <InfoRow label="Flash"    value={deviceInfo?.flash_size_mb != null ? `${deviceInfo.flash_size_mb} MB` : null} />
            <InfoRow label="SDK"      value={deviceInfo?.sdk_version} />
          </div>
          {/* Red */}
          <div>
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300 mb-2 flex items-center gap-1.5">
              <Wifi size={11} />Red
            </p>
            <InfoRow label="IP"        value={deviceInfo?.ip_address} />
            <InfoRow label="MAC"       value={deviceInfo?.mac_address} />
            <InfoRow label="RSSI act." value={latest.rssi != null ? `${Math.round(latest.rssi)} dBm` : null} />
          </div>
        </div>
      </div>

      {/* ── Métricas en tiempo real ───────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader icon={Activity} label="Métricas del sistema" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          <MetricCard
            label="Señal WiFi"
            symbol="Tiempo real"
            value={latest.rssi != null ? Math.round(latest.rssi) : '—'}
            unit="dBm"
            accent="#0c8ecc"
            icon={Wifi}
          >
            <SignalBars rssi={latest.rssi} />
          </MetricCard>

          <MetricCard
            label="Memoria libre"
            symbol={`de 320 KB`}
            value={latest.free_heap != null ? Math.round(latest.free_heap / 1024) : '—'}
            unit="KB"
            accent="#534AB7"
            icon={HardDrive}
          >
            <HeapBar freeHeap={latest.free_heap} />
          </MetricCard>

          <MetricCard
            label="Uptime"
            value={formatUptime(latest.uptime_s)}
            unit=""
            accent="#10b981"
            icon={Clock}
          >
            <p className="text-xs text-navy-300">
              {latest.uptime_s != null ? `${Number(latest.uptime_s).toLocaleString()} segundos activo` : '—'}
            </p>
          </MetricCard>

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            <MetricCard
              label="Batería 12 V"
              symbol="Bus voltage"
              value={latest.ina219_bus_voltage != null ? Number(latest.ina219_bus_voltage).toFixed(2) : '—'}
              unit="V"
              accent="#10b981"
              icon={BatteryMedium}
            >
              <BatteryBar voltage={latest.ina219_bus_voltage} />
            </MetricCard>

            <MetricCard
              label="Corriente"
              symbol={
                latest.ina219_current_ma != null && latest.ina219_current_ma > 1300
                  ? '⚠ Elevada'
                  : 'INA219'
              }
              value={latest.ina219_current_ma != null ? Number(latest.ina219_current_ma).toFixed(0) : '—'}
              unit="mA"
              accent="#0c8ecc"
              icon={Zap}
            >
              {latest.ina219_current_ma != null && (
                <p className="text-xs" style={{
                  color: latest.ina219_current_ma > 1900 ? '#ef4444'
                       : latest.ina219_current_ma > 1300 ? '#BA7517' : '#64748b'
                }}>
                  {latest.ina219_current_ma > 1900 ? 'Corriente crítica'
                   : latest.ina219_current_ma > 1300 ? 'Corriente elevada' : 'Normal'}
                </p>
              )}
            </MetricCard>

            <MetricCard
              label="Potencia"
              symbol="INA219"
              value={latest.ina219_power_mw != null ? Number(latest.ina219_power_mw / 1000).toFixed(2) : '—'}
              unit="W"
              accent="#BA7517"
              icon={Zap}
            >
              {latest.ina219_power_mw != null && (
                <p className="text-xs text-navy-300">{Number(latest.ina219_power_mw).toFixed(0)} mW</p>
              )}
            </MetricCard>

          </div>

          {/* Gráfica histórica multi-eje */}
          <div className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden">
            <div
              className="px-5 py-3 border-b border-black/[.06] flex items-center gap-2"
              style={{ background: ha('#10b981', 0.05) }}
            >
              <BatteryMedium size={14} style={{ color: '#10b981' }} />
              <span className="text-sm font-semibold text-navy-900">Voltaje · Corriente · Potencia</span>
            </div>
            <div className="p-4">
              <Ina219Chart data={data} timestamps={timestamps} />
            </div>
          </div>

        </div>
      )}

    </main>
  )
}
