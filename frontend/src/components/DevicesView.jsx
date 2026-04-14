import { useState, useEffect, useCallback } from 'react'
import { Cpu, Wifi, WifiOff, Trash2, PackagePlus, RefreshCw, Server } from 'lucide-react'
import { useAuth } from '../AuthContext'

function isOnline(ts) {
  if (!ts) return false
  const parsed = Date.parse(String(ts).trim())
  if (Number.isNaN(parsed)) return false
  return (Date.now() - parsed) < 90000
}

export default function DevicesView({ onNavigate }) {
  const { authFetch } = useAuth()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmMac, setConfirmMac] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/devices/mine')
      if (res.ok) setDevices(await res.json())
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { load() }, [load])

  const release = async (mac) => {
    const res = await authFetch(`/api/devices/${encodeURIComponent(mac)}`, { method: 'DELETE' })
    if (res.ok) setDevices(prev => prev.filter(d => d.mac_address !== mac))
    setConfirmMac(null)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-brand-50 p-2.5 rounded-xl border border-brand-100">
              <Server size={20} className="text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-navy-900">Mis dispositivos</h2>
              <p className="text-xs text-navy-400 mt-0.5">
                {devices.length} dispositivo{devices.length !== 1 ? 's' : ''} vinculado{devices.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs text-navy-500 hover:text-navy-900 border border-black/[.08] bg-white px-3 py-1.5 rounded-lg transition-all"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refrescar
            </button>
            <button
              onClick={() => onNavigate('claim')}
              className="flex items-center gap-1.5 text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <PackagePlus size={12} />
              Añadir dispositivo
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center text-navy-300 py-12 text-sm">Cargando…</div>
        ) : devices.length === 0 ? (
          <div className="text-center py-16 bg-white border border-black/[.08] rounded-2xl shadow-sm">
            <Cpu size={32} className="text-navy-200 mx-auto mb-3" />
            <p className="text-navy-500 text-sm font-medium">No tienes dispositivos vinculados</p>
            <p className="text-navy-300 text-xs mt-1 mb-5">Escanea el QR del dispositivo o añádelo manualmente</p>
            <button
              onClick={() => onNavigate('claim')}
              className="inline-flex items-center gap-2 text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <PackagePlus size={13} />
              Añadir dispositivo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map(d => {
              const mac = d.mac_address
              const online = isOnline(d.latest_reading)
              return (
                <div key={mac} className="bg-white border border-black/[.08] rounded-2xl p-5 shadow-sm">

                  {/* Card header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${online ? 'bg-emerald-50 border border-emerald-100' : 'bg-navy-50 border border-navy-100'}`}>
                        {online
                          ? <Wifi size={16} className="text-emerald-600" />
                          : <WifiOff size={16} className="text-navy-400" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-bold text-navy-900">
                          {d.nickname || d.serial_number || mac.slice(-8)}
                        </p>
                        <p className={`text-xs font-medium mt-0.5 ${online ? 'text-emerald-600' : 'text-navy-400'}`}>
                          {online ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>

                    {confirmMac === mac ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-navy-500">¿Confirmar?</span>
                        <button
                          onClick={() => release(mac)}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 bg-red-50 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          Sí, liberar
                        </button>
                        <button
                          onClick={() => setConfirmMac(null)}
                          className="text-xs text-navy-400 hover:text-navy-600 border border-navy-200 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmMac(mac)}
                        className="flex items-center gap-1.5 text-xs text-navy-400 hover:text-red-500 border border-black/[.08] hover:border-red-200 px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        <Trash2 size={12} />
                        Liberar
                      </button>
                    )}
                  </div>

                  {/* Device details */}
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs border-t border-black/[.05] pt-4">
                    {d.serial_number && <>
                      <dt className="text-navy-400">Número de serie</dt>
                      <dd className="font-mono font-semibold text-navy-900">{d.serial_number}</dd>
                    </>}
                    <dt className="text-navy-400">MAC</dt>
                    <dd className="font-mono text-navy-700">{mac}</dd>
                    {(d.claimed_by_finca_id || d.finca_id) && <>
                      <dt className="text-navy-400">Finca ID</dt>
                      <dd className="font-mono text-navy-700">{d.claimed_by_finca_id || d.finca_id}</dd>
                    </>}
                    {d.chip_model && <>
                      <dt className="text-navy-400">Modelo</dt>
                      <dd className="text-navy-700">{d.chip_model}</dd>
                    </>}
                    {d.relay_count != null && <>
                      <dt className="text-navy-400">Válvulas</dt>
                      <dd className="text-navy-700">{d.relay_count}</dd>
                    </>}
                    {d.ip_address && <>
                      <dt className="text-navy-400">IP</dt>
                      <dd className="font-mono text-navy-500">{d.ip_address}</dd>
                    </>}
                    {d.latest_reading && <>
                      <dt className="text-navy-400">Última lectura</dt>
                      <dd className="text-navy-500">{new Date(d.latest_reading).toLocaleString('es-ES')}</dd>
                    </>}
                    {d.claimed_at && <>
                      <dt className="text-navy-400">Vinculado el</dt>
                      <dd className="text-navy-500">{new Date(d.claimed_at).toLocaleString('es-ES')}</dd>
                    </>}
                  </dl>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
