import { useState, useEffect, useCallback } from 'react'
import { Bell, CheckCheck, AlertTriangle, Info, RefreshCw, ShieldAlert, Thermometer, Droplets, Wifi, WifiOff, Activity, Trash2 } from 'lucide-react'
import { useAuth } from '../AuthContext'

function resolveAlertIcon(alertType = '', severity = 'info') {
  const t = alertType.toLowerCase()
  if (t.includes('temp')  || t.includes('temperature'))  return Thermometer
  if (t.includes('humid') || t.includes('moisture'))     return Droplets
  if (t.includes('connect') || t.includes('online'))     return Wifi
  if (t.includes('disconnect') || t.includes('offline')) return WifiOff
  if (t.includes('flow')  || t.includes('caudal'))       return Activity
  if (severity === 'critical') return ShieldAlert
  if (severity === 'warning')  return AlertTriangle
  return Info
}

const SEVERITY = {
  critical: {
    label:      'Crítico',
    bar:        'bg-red-500',
    badge:      'bg-red-100 text-red-700 border-red-200',
    icon:       'bg-red-50 text-red-500 border-red-100',
    card:       'bg-white border-slate-200 shadow-sm',
    cardAcked:  'bg-slate-50 border-slate-100 opacity-50',
    dot:        'bg-red-500',
    pulse:      true,
  },
  warning: {
    label:      'Aviso',
    bar:        'bg-amber-400',
    badge:      'bg-amber-50 text-amber-700 border-amber-200',
    icon:       'bg-amber-50 text-amber-500 border-amber-100',
    card:       'bg-white border-slate-200 shadow-sm',
    cardAcked:  'bg-slate-50 border-slate-100 opacity-50',
    dot:        'bg-amber-400',
    pulse:      false,
  },
  info: {
    label:      'Info',
    bar:        'bg-sky-400',
    badge:      'bg-sky-50 text-sky-700 border-sky-200',
    icon:       'bg-sky-50 text-sky-500 border-sky-100',
    card:       'bg-white border-slate-200 shadow-sm',
    cardAcked:  'bg-slate-50 border-slate-100 opacity-50',
    dot:        'bg-sky-400',
    pulse:      false,
  },
}

function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60)    return `hace ${diff}s`
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

function AlertRow({ alert, onAck, onDelete }) {
  const sev   = SEVERITY[alert.severity] ?? SEVERITY.info
  const Icon  = resolveAlertIcon(alert.alert_type, alert.severity)
  const acked = Boolean(alert.acked)

  return (
    <div className={`relative flex items-start gap-3 pl-4 pr-3 py-3.5 rounded-xl border transition-all duration-300 overflow-hidden ${
      acked ? sev.cardAcked : sev.card
    }`}>

      {/* Left severity bar */}
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl ${acked ? 'bg-slate-300' : sev.bar}`} />

      {/* Icon */}
      <div className={`shrink-0 mt-0.5 p-2 rounded-lg border ${sev.icon}`}>
        <Icon size={15} strokeWidth={2} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center flex-wrap gap-1.5">
          <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${sev.badge}`}>
            {sev.label}
          </span>
          <span className="text-xs font-semibold text-slate-700 tracking-tight">
            {alert.alert_type ?? '—'}
          </span>
          {alert.finca_id && (
            <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
              {alert.finca_id}
            </span>
          )}
          <span className="ml-auto text-[10px] text-slate-400 shrink-0 font-mono tabular-nums">
            {timeAgo(alert.created_at)}
          </span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          {alert.message || '—'}
        </p>

        {alert.device_mac && (
          <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${acked ? 'bg-slate-300' : sev.dot} ${!acked && sev.pulse ? 'animate-pulse' : ''}`} />
            {alert.device_mac}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 self-center flex flex-col items-center gap-1">
        {!acked && (
          <button
            onClick={() => onAck(alert.id)}
            title="Marcar como resuelto"
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-all"
          >
            <CheckCheck size={14} />
          </button>
        )}
        <button
          onClick={() => onDelete(alert.id)}
          title="Eliminar"
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

export default function AlertsPanel() {
  const { authFetch } = useAuth()
  const [alerts, setAlerts]   = useState([])
  const [filter, setFilter]   = useState('pending')
  const [loading, setLoading] = useState(false)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const qs = filter === 'pending' ? '?acked=0' : ''
      const res = await authFetch(`/api/alerts${qs}`)
      if (!res.ok) throw new Error()
      setAlerts(await res.json())
    } catch (_) {
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  useEffect(() => {
    const id = setInterval(fetchAlerts, 30000)
    return () => clearInterval(id)
  }, [fetchAlerts])

  const ackAlert = async (id) => {
    await authFetch(`/api/alerts/${id}/ack`, { method: 'POST' })
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acked: 1 } : a))
  }

  const deleteAlert = async (id) => {
    await authFetch(`/api/alerts/${id}`, { method: 'DELETE' })
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const deleteAllAlerts = async () => {
    await authFetch('/api/alerts', { method: 'DELETE' })
    setAlerts([])
  }

  const pending = alerts.filter(a => !a.acked).length

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-sm">
                <Bell size={16} className="text-slate-500" />
              </div>
              {pending > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 items-center justify-center">
                    <span className="text-[9px] font-black text-white leading-none">{pending > 9 ? '9+' : pending}</span>
                  </span>
                </span>
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-700 leading-tight">Alertas</h2>
              <p className="text-[11px] text-slate-400 leading-tight">
                {pending > 0 ? `${pending} pendiente${pending > 1 ? 's' : ''}` : 'Todo en orden'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter toggle */}
            <div className="flex bg-white border border-slate-200 rounded-xl p-0.5 shadow-sm">
              {[['pending', 'Pendientes'], ['all', 'Todas']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 ${
                    filter === val
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {alerts.length > 0 && (
              <button
                onClick={deleteAllAlerts}
                title="Eliminar todas"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-all bg-white shadow-sm"
              >
                <Trash2 size={12} />
                Eliminar todas
              </button>
            )}

            <button
              onClick={fetchAlerts}
              disabled={loading}
              title="Refrescar"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:border-slate-300 shadow-sm transition-all disabled:opacity-30"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <Bell size={26} className="text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">
                {filter === 'pending' ? 'Sin alertas pendientes' : 'Sin alertas registradas'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Las alertas de los dispositivos aparecerán aquí
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map(a => (
              <AlertRow key={a.id} alert={a} onAck={ackAlert} onDelete={deleteAlert} />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
