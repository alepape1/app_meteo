import { Wifi, HardDrive, Clock, Server, CircuitBoard, Cpu } from 'lucide-react'
import WeatherChart from './WeatherChart'

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
  const rtTs   = timestamps.slice(-REALTIME_N)
  const rtRssi = data.rssi.slice(-REALTIME_N)
  const rtHeap = data.free_heap.slice(-REALTIME_N)

  const hexHW   = '#534AB7'
  const hexNet  = '#1a3350'
  const hexWifi = '#0c8ecc'
  const hexHeap = '#10b981'
  const hexUp   = '#BA7517'

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* Info estática */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Hardware */}
        <DeviceCard
          hex={hexHW}
          grad="from-[#534AB7] to-[#7b73d4]"
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
          grad="from-brand-500 to-brand-300"
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
          grad="from-emerald-500 to-teal-400"
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
          grad="from-[#BA7517] to-[#e8a042]"
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

    </main>
  )
}
