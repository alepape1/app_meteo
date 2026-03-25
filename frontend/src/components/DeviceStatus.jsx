import { Wifi, HardDrive, Clock, Server, CircuitBoard } from 'lucide-react'
import WeatherChart from './WeatherChart'

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
      <span className="text-xs text-navy-300">{label}</span>
      <span className="text-xs font-medium text-navy-900 font-mono">{value ?? '—'}</span>
    </div>
  )
}

const REALTIME_N = 30

export default function DeviceStatus({ data, latest, deviceInfo, timestamps }) {
  const rtTs   = timestamps.slice(-REALTIME_N)
  const rtRssi = data.rssi.slice(-REALTIME_N)
  const rtHeap = data.free_heap.slice(-REALTIME_N)

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* Info estática */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <CircuitBoard size={16} className="text-navy-300" />
            <h3 className="font-semibold text-navy-900 text-sm">Hardware</h3>
            {deviceInfo?.last_seen && (
              <span className="ml-auto text-xs text-navy-300">últ. boot: {deviceInfo.last_seen}</span>
            )}
          </div>
          <InfoRow label="Modelo"    value={deviceInfo?.chip_model} />
          <InfoRow label="Revisión"  value={formatRevision(deviceInfo?.chip_revision)} />
          <InfoRow label="CPU"       value={deviceInfo?.cpu_freq_mhz != null ? `${deviceInfo.cpu_freq_mhz} MHz` : null} />
          <InfoRow label="Flash"     value={deviceInfo?.flash_size_mb != null ? `${deviceInfo.flash_size_mb} MB` : null} />
          <InfoRow label="SDK"       value={deviceInfo?.sdk_version} />
        </div>

        <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server size={16} className="text-navy-300" />
            <h3 className="font-semibold text-navy-900 text-sm">Red</h3>
          </div>
          <InfoRow label="IP"        value={deviceInfo?.ip_address} />
          <InfoRow label="MAC"       value={deviceInfo?.mac_address} />
          <InfoRow label="RSSI act." value={latest.rssi != null ? `${Math.round(latest.rssi)} dBm` : null} />
        </div>
      </div>

      {/* Métricas dinámicas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={16} className="text-navy-300" />
            <h3 className="font-semibold text-navy-900 text-sm">Señal WiFi</h3>
          </div>
          <p className="text-3xl font-bold text-navy-900 mb-3 leading-none">
            {latest.rssi != null ? Math.round(latest.rssi) : '—'}
            <span className="text-base font-normal text-navy-300 ml-1">dBm</span>
          </p>
          <SignalBars rssi={latest.rssi} />
        </div>

        <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive size={16} className="text-navy-300" />
            <h3 className="font-semibold text-navy-900 text-sm">Memoria libre</h3>
          </div>
          <p className="text-3xl font-bold text-navy-900 mb-3 leading-none">
            {latest.free_heap != null ? Math.round(latest.free_heap / 1024) : '—'}
            <span className="text-base font-normal text-navy-300 ml-1">KB</span>
          </p>
          <HeapBar freeHeap={latest.free_heap} />
        </div>

        <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-navy-300" />
            <h3 className="font-semibold text-navy-900 text-sm">Uptime</h3>
          </div>
          <p className="text-3xl font-bold text-navy-900 mb-1 leading-none">
            {formatUptime(latest.uptime_s)}
          </p>
          <p className="text-xs text-navy-300 mt-2">
            {latest.uptime_s != null ? `${Number(latest.uptime_s).toLocaleString()} s` : '—'}
          </p>
        </div>
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
