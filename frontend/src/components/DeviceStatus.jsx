import { useRef, useEffect } from 'react'
import { Wifi, HardDrive, Clock, Server, CircuitBoard, Cpu, BatteryMedium, Zap, AlertTriangle } from 'lucide-react'
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

function SignalBars({ rssi }) {
  if (rssi == null) return <span className="text-navy-200 text-sm">—</span>
  const level = rssi >= -50 ? 4 : rssi >= -60 ? 3 : rssi >= -70 ? 2 : rssi >= -80 ? 1 : 0
  const color  = ['bg-red-400', 'bg-red-400', 'bg-[#BA7517]', 'bg-[#BA7517]', 'bg-brand-500'][level]
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

function HeapBar({ freeHeap }) {
  if (freeHeap == null) return <span className="text-navy-200 text-sm">—</span>
  const totalKb = 320
  const freeKb  = Math.round(freeHeap / 1024)
  const pct     = Math.min(100, Math.round((freeKb / totalKb) * 100))
  const color   = pct >= 60 ? 'bg-brand-500' : pct >= 30 ? 'bg-[#BA7517]' : 'bg-red-400'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2.5 bg-navy-50 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-navy-300">{freeKb} KB libres · {pct}%</p>
    </div>
  )
}

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

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-navy-50 last:border-0">
      <span className="text-[11px] text-navy-300">{label}</span>
      <span className="text-[11px] font-semibold text-navy-700 font-mono">{value ?? '—'}</span>
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
      {/* Battery body */}
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
        {/* Nub */}
        <div className="w-2 h-2.5 rounded-r-sm" style={{ background: color, opacity: 0.7 }} />
      </div>
      <p className="text-xs" style={{ color }}>{label} · {Number(voltage).toFixed(2)} V</p>
    </div>
  )
}

function toMs2(t) {
  if (t == null) return null
  if (typeof t === 'number') return isNaN(t) ? null : t
  const parsed = Date.parse(String(t).trim())
  return Number.isNaN(parsed) ? null : parsed
}

function Ina219Chart({ data, timestamps }) {
  const ref = useRef(null)
  const chartRef = useRef(null)

  const tsMs = (timestamps ?? []).map(toMs2).filter(Boolean)
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

function DeviceCard({ hex, grad, icon: Icon, title, children, right }) {
  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-px"
      style={{
        background: 'linear-gradient(150deg, #f8fafc, #fff 58%, #f0f4ff)',
        border: `1px solid ${ha(hex, 0.2)}`,
        boxShadow: `0 1px 3px rgba(0,0,0,0.05), 0 4px 14px ${ha(hex, 0.07)}`,
      }}
    >
      <div
        className={`h-[3px] bg-gradient-to-r ${grad}`}
        style={{ boxShadow: `0 0 8px 2px ${ha(hex, 0.5)}` }}
      />
      <div
        className="px-4 pt-3 pb-2.5 flex items-center gap-2.5"
        style={{ background: `linear-gradient(to bottom, ${ha(hex, 0.055)}, transparent)` }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${ha(hex, 0.2)}, ${ha(hex, 0.07)})`,
            border: `1px solid ${ha(hex, 0.28)}`,
            boxShadow: `0 2px 8px ${ha(hex, 0.22)}, 0 0 0 3px ${ha(hex, 0.06)}`,
          }}
        >
          <Icon size={15} style={{ color: hex, filter: `drop-shadow(0 0 4px ${ha(hex, 0.5)})` }} />
        </div>
        <h3 className="text-[11.5px] font-extrabold uppercase tracking-widest text-navy-600 leading-none flex-1">
          {title}
        </h3>
        {right}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  )
}

const REALTIME_N = 30

export default function DeviceStatus({ data, latest, deviceInfo, timestamps }) {
  const hasIna = latest.ina219_bus_voltage != null || latest.ina219_current_ma != null

  const rtTs   = timestamps.slice(-REALTIME_N)
  const rtRssi = data.rssi.slice(-REALTIME_N)
  const rtHeap = data.free_heap.slice(-REALTIME_N)

  const hexHW   = '#1a3350'
  const hexNet  = '#1a3350'
  const hexWifi = '#1a3350'
  const hexHeap = '#1a3350'
  const hexUp   = '#1a3350'

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* Info estática */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Hardware */}
        <DeviceCard
          hex={hexHW}
          grad="from-[#001530] to-[#3d506a]"
          icon={CircuitBoard}
          title="Hardware"
          right={deviceInfo?.last_seen && (
            <span className="text-[11px] text-navy-300 shrink-0">últ. boot: {deviceInfo.last_seen}</span>
          )}
        >
          <InfoRow label="Modelo"   value={deviceInfo?.chip_model} />
          <InfoRow label="Revisión" value={formatRevision(deviceInfo?.chip_revision)} />
          <InfoRow label="CPU"      value={deviceInfo?.cpu_freq_mhz != null ? `${deviceInfo.cpu_freq_mhz} MHz` : null} />
          <InfoRow label="Flash"    value={deviceInfo?.flash_size_mb != null ? `${deviceInfo.flash_size_mb} MB` : null} />
          <InfoRow label="SDK"      value={deviceInfo?.sdk_version} />
          {deviceInfo?.firmware_version && (
            <div className="flex items-center justify-between py-2 border-b border-navy-50 last:border-0">
              <span className="flex items-center gap-1 text-[11px] text-navy-300">
                <Cpu size={11} />Firmware
              </span>
              <span
                className="text-[11px] font-semibold font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: ha(hexHW, 0.1),
                  color: hexHW,
                  border: `1px solid ${ha(hexHW, 0.22)}`,
                }}
              >
                v{deviceInfo.firmware_version}
              </span>
            </div>
          )}
        </DeviceCard>

        {/* Red */}
        <DeviceCard
          hex={hexNet}
          grad="from-[#001530] to-[#3d506a]"
          icon={Server}
          title="Red"
        >
          <InfoRow label="IP"        value={deviceInfo?.ip_address} />
          <InfoRow label="MAC"       value={deviceInfo?.mac_address} />
          <InfoRow label="RSSI act." value={latest.rssi != null ? `${Math.round(latest.rssi)} dBm` : null} />
        </DeviceCard>

      </div>

      {/* Métricas dinámicas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Señal WiFi */}
        <DeviceCard
          hex={hexWifi}
          grad="from-[#001530] to-[#3d506a]"
          icon={Wifi}
          title="Señal WiFi"
        >
          <p
            className="text-[2rem] font-extrabold text-navy-900 leading-none tabular-nums tracking-tight mb-3"
            style={{ textShadow: `0 0 20px ${ha(hexWifi, 0.18)}` }}
          >
            {latest.rssi != null ? Math.round(latest.rssi) : '—'}
            <span className="text-base font-medium text-navy-300 ml-1.5">dBm</span>
          </p>
          <SignalBars rssi={latest.rssi} />
        </DeviceCard>

        {/* Memoria libre */}
        <DeviceCard
          hex={hexHeap}
          grad="from-[#001530] to-[#3d506a]"
          icon={HardDrive}
          title="Memoria libre"
        >
          <p
            className="text-[2rem] font-extrabold text-navy-900 leading-none tabular-nums tracking-tight mb-3"
            style={{ textShadow: `0 0 20px ${ha(hexHeap, 0.18)}` }}
          >
            {latest.free_heap != null ? Math.round(latest.free_heap / 1024) : '—'}
            <span className="text-base font-medium text-navy-300 ml-1.5">KB</span>
          </p>
          <HeapBar freeHeap={latest.free_heap} />
        </DeviceCard>

        {/* Uptime */}
        <DeviceCard
          hex={hexUp}
          grad="from-[#001530] to-[#3d506a]"
          icon={Clock}
          title="Uptime"
        >
          <p
            className="text-[2rem] font-extrabold text-navy-900 leading-none tabular-nums tracking-tight mb-3"
            style={{ textShadow: `0 0 20px ${ha(hexUp, 0.18)}` }}
          >
            {formatUptime(latest.uptime_s)}
            <span className="text-base font-medium text-navy-300 ml-1.5"> </span>
          </p>
          <p className="text-xs text-navy-300">
            {latest.uptime_s != null ? `${Number(latest.uptime_s).toLocaleString()} s` : '—'}
          </p>
        </DeviceCard>

      </div>

      {/* Gráficas tiempo real */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WeatherChart
          title="Señal WiFi — últimas 30 lecturas" icon={Wifi} timestamps={rtTs}
          series={[{ name: 'RSSI', data: rtRssi }]}
          colors={['#0c8ecc']}
          yUnit=" dBm" yMin={-100} yMax={-20} type="line"
        />
        <WeatherChart
          title="Memoria libre — últimas 30 lecturas" icon={HardDrive} timestamps={rtTs}
          series={[{ name: 'Heap libre', data: rtHeap.map(v => v != null ? Math.round(v / 1024) : null) }]}
          colors={['#0c8ecc']}
          yUnit=" KB" yMin={0} type="area"
        />
      </div>

      {/* ── Panel INA219 — solo PROFILE_IRRIGATION ── */}
      {hasIna && (
        <div className="space-y-4">

          {/* Métricas instantáneas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Batería */}
            <DeviceCard
              hex="#10b981"
              grad="from-[#065f46] to-[#10b981]"
              icon={BatteryMedium}
              title="Batería 12 V"
            >
              <p
                className="text-[2rem] font-extrabold text-navy-900 leading-none tabular-nums tracking-tight mb-3"
                style={{ textShadow: '0 0 20px rgba(16,185,129,0.18)' }}
              >
                {latest.ina219_bus_voltage != null ? Number(latest.ina219_bus_voltage).toFixed(2) : '—'}
                <span className="text-base font-medium text-navy-300 ml-1.5">V</span>
              </p>
              <BatteryBar voltage={latest.ina219_bus_voltage} />
            </DeviceCard>

            {/* Corriente */}
            <DeviceCard
              hex="#0c8ecc"
              grad="from-[#0c5688] to-[#0c8ecc]"
              icon={Zap}
              title="Corriente"
              right={
                latest.ina219_current_ma != null && latest.ina219_current_ma > 1300
                  ? <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                  : null
              }
            >
              <p
                className="text-[2rem] font-extrabold text-navy-900 leading-none tabular-nums tracking-tight mb-3"
                style={{ textShadow: '0 0 20px rgba(12,142,204,0.18)' }}
              >
                {latest.ina219_current_ma != null ? Number(latest.ina219_current_ma).toFixed(0) : '—'}
                <span className="text-base font-medium text-navy-300 ml-1.5">mA</span>
              </p>
              {latest.ina219_current_ma != null && (
                <p className="text-xs" style={{
                  color: latest.ina219_current_ma > 1900 ? '#ef4444'
                       : latest.ina219_current_ma > 1300 ? '#BA7517' : '#64748b'
                }}>
                  {latest.ina219_current_ma > 1900 ? 'Corriente crítica'
                   : latest.ina219_current_ma > 1300 ? 'Corriente elevada' : 'Normal'}
                </p>
              )}
            </DeviceCard>

            {/* Potencia */}
            <DeviceCard
              hex="#BA7517"
              grad="from-[#78460d] to-[#BA7517]"
              icon={Zap}
              title="Potencia"
            >
              <p
                className="text-[2rem] font-extrabold text-navy-900 leading-none tabular-nums tracking-tight mb-3"
                style={{ textShadow: '0 0 20px rgba(186,117,23,0.18)' }}
              >
                {latest.ina219_power_mw != null ? Number(latest.ina219_power_mw / 1000).toFixed(2) : '—'}
                <span className="text-base font-medium text-navy-300 ml-1.5">W</span>
              </p>
              {latest.ina219_power_mw != null && (
                <p className="text-xs text-navy-300">{Number(latest.ina219_power_mw).toFixed(0)} mW</p>
              )}
            </DeviceCard>

          </div>

          {/* Gráfica histórica multi-eje */}
          <DeviceCard
            hex="#10b981"
            grad="from-[#065f46] to-[#10b981]"
            icon={BatteryMedium}
            title="Histórico — Voltaje · Corriente · Potencia"
          >
            <Ina219Chart data={data} timestamps={timestamps} />
          </DeviceCard>

        </div>
      )}

    </main>
  )
}
