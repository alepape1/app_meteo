import { useState, useEffect, useCallback } from 'react'
import { Bell, CheckCheck, AlertTriangle, Info, Zap, RefreshCw } from 'lucide-react'

const SEVERITY = {
  critical: { label: 'Crítico',  color: 'bg-red-500/15 text-red-400 border-red-500/30',    icon: Zap },
  warning:  { label: 'Aviso',    color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: AlertTriangle },
  info:     { label: 'Info',     color: 'bg-brand-500/15 text-brand-400 border-brand-500/30', icon: Info },
}

function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60)   return `hace ${diff}s`
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

function AlertRow({ alert, onAck }) {
  const sev  = SEVERITY[alert.severity] ?? SEVERITY.info
  const Icon = sev.icon
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${
      alert.acked ? 'border-navy-800 opacity-50' : 'border-navy-700 bg-navy-800/50'
    }`}>
      <div className={`mt-0.5 p-1.5 rounded-lg border ${sev.color} shrink-0`}>
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sev.color}`}>
            {sev.label}
          </span>
          <span className="text-xs font-mono text-navy-400">{alert.alert_type}</span>
          {alert.finca_id && (
            <span className="text-xs text-navy-500 font-mono">· {alert.finca_id}</span>
          )}
          <span className="ml-auto text-xs text-navy-500 shrink-0">{timeAgo(alert.created_at)}</span>
        </div>
        <p className="text-sm text-navy-100 mt-1.5 leading-snug">
          {alert.message || '—'}
        </p>
        {alert.device_mac && (
          <p className="text-xs text-navy-500 font-mono mt-1">MAC {alert.device_mac}</p>
        )}
      </div>
      {!alert.acked && (
        <button
          onClick={() => onAck(alert.id)}
          title="Marcar como resuelto"
          className="shrink-0 mt-0.5 p-1.5 rounded-lg text-navy-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
        >
          <CheckCheck size={15} />
        </button>
      )}
    </div>
  )
}

export default function AlertsPanel() {
  const [alerts, setAlerts]     = useState([])
  const [filter, setFilter]     = useState('pending')   // 'all' | 'pending'
  const [loading, setLoading]   = useState(false)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const qs = filter === 'pending' ? '?acked=0' : ''
      const res = await fetch(`/api/alerts${qs}`)
      if (!res.ok) throw new Error()
      setAlerts(await res.json())
    } catch (_) {
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  // Auto-refresco cada 30s
  useEffect(() => {
    const id = setInterval(fetchAlerts, 30000)
    return () => clearInterval(id)
  }, [fetchAlerts])

  const ackAlert = async (id) => {
    await fetch(`/api/alerts/${id}/ack`, { method: 'POST' })
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acked: 1 } : a))
  }

  const pending = alerts.filter(a => !a.acked).length

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-navy-300" />
            <h2 className="text-sm font-bold text-navy-900">Alertas MQTT</h2>
            {pending > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {pending}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-navy-100 rounded-lg p-0.5">
              {[['pending', 'Sin resolver'], ['all', 'Todas']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                    filter === val
                      ? 'bg-white text-navy-900 shadow-sm'
                      : 'text-navy-500 hover:text-navy-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={fetchAlerts}
              disabled={loading}
              className="p-1.5 rounded-lg text-navy-400 hover:text-navy-700 hover:bg-navy-100 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Lista */}
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell size={32} className="text-navy-200 mb-3" />
            <p className="text-sm font-medium text-navy-400">
              {filter === 'pending' ? 'No hay alertas pendientes' : 'No hay alertas registradas'}
            </p>
            <p className="text-xs text-navy-300 mt-1">
              Las alertas MQTT de los dispositivos aparecerán aquí
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map(a => (
              <AlertRow key={a.id} alert={a} onAck={ackAlert} />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
