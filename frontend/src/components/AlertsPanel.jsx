import { useState, useEffect, useCallback } from 'react'
import { Bell, CheckCheck, AlertTriangle, Info, RefreshCw, ShieldAlert, Thermometer, Droplets, Wifi, WifiOff, Activity } from 'lucide-react'
import { useAuth } from '../AuthContext'

// Map alert_type keywords → icon + override label
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
    label: 'Crítico',
    card:   'bg-gradient-to-br from-red-950/60 to-navy-900/80 border-red-500/50',
    badge:  'bg-red-500/20 text-red-300 border-red-500/40',
    icon:   'bg-red-500/20 text-red-400',
    ring:   'bg-red-500/40',
    glow:   'shadow-red-500/20 shadow-lg',
    anim:   'ping',   // ping = pulsating ring
    ackedCard: 'bg-navy-900/40 border-navy-800/50 opacity-40',
  },
  warning: {
    label: 'Aviso',
    card:   'bg-gradient-to-br from-amber-950/50 to-navy-900/80 border-amber-500/40',
    badge:  'bg-amber-500/20 text-amber-300 border-amber-500/40',
    icon:   'bg-amber-500/20 text-amber-400',
    ring:   'bg-amber-500/30',
    glow:   'shadow-amber-500/15 shadow-md',
    anim:   'bounce',
    ackedCard: 'bg-navy-900/40 border-navy-800/50 opacity-40',
  },
  info: {
    label: 'Info',
    card:   'bg-gradient-to-br from-sky-950/40 to-navy-900/80 border-sky-500/30',
    badge:  'bg-sky-500/20 text-sky-300 border-sky-500/30',
    icon:   'bg-sky-500/20 text-sky-400',
    ring:   'bg-sky-500/20',
    glow:   '',
    anim:   'pulse',
    ackedCard: 'bg-navy-900/40 border-navy-800/50 opacity-40',
  },
}

function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60)    return `hace ${diff}s`
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return `hace ${Math.floor(diff / 86400)}d`
}

function AnimatedIcon({ icon, sev, acked }) {
  const anim = sev.anim
  const AlertIcon = icon
  return (
    <div className="relative flex items-center justify-center shrink-0">
      {!acked && (
        <span className={`absolute inset-0 rounded-full ${sev.ring} ${
          anim === 'ping'  ? 'animate-ping opacity-75' :
          anim === 'pulse' ? 'animate-pulse opacity-50' : ''
        }`} />
      )}
      <div className={`relative z-10 p-2.5 rounded-full border ${sev.icon} ${
        !acked && anim === 'bounce' ? 'animate-bounce' : ''
      } border-white/10`}>
        <AlertIcon size={20} strokeWidth={2} />
      </div>
    </div>
  )
}

function AlertRow({ alert, onAck }) {
  const sev  = SEVERITY[alert.severity] ?? SEVERITY.info
  const Icon = resolveAlertIcon(alert.alert_type, alert.severity)
  const acked = Boolean(alert.acked)

  return (
    <div className={`relative flex items-start gap-4 p-4 rounded-2xl border transition-all duration-300 ${
      acked ? sev.ackedCard : `${sev.card} ${sev.glow}`
    }`}>

      <AnimatedIcon icon={Icon} sev={sev} acked={acked} />

      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Top row: badge + type + time */}
        <div className="flex items-center flex-wrap gap-1.5">
          <span className={`text-[11px] font-bold tracking-wide uppercase px-2.5 py-0.5 rounded-full border ${sev.badge}`}>
            {sev.label}
          </span>
          <span className="text-xs font-semibold text-navy-300 tracking-tight">
            {alert.alert_type ?? '—'}
          </span>
          {alert.finca_id && (
            <span className="text-[11px] text-navy-500 font-mono bg-navy-800/60 px-1.5 py-0.5 rounded-md">
              {alert.finca_id}
            </span>
          )}
          <span className="ml-auto text-[11px] text-navy-500 shrink-0 font-mono">
            {timeAgo(alert.created_at)}
          </span>
        </div>

        {/* Message */}
        <p className="text-sm font-medium text-navy-100 leading-relaxed">
          {alert.message || '—'}
        </p>

        {/* MAC footer */}
        {alert.device_mac && (
          <p className="text-[11px] text-navy-500 font-mono flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-navy-600" />
            {alert.device_mac}
          </p>
        )}
      </div>

      {/* Ack button */}
      {!acked && (
        <button
          onClick={() => onAck(alert.id)}
          title="Marcar como resuelto"
          className="shrink-0 self-center p-2 rounded-xl text-navy-500 hover:text-emerald-400 hover:bg-emerald-500/15 border border-transparent hover:border-emerald-500/30 transition-all duration-200"
        >
          <CheckCheck size={16} />
        </button>
      )}
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

  const pending = alerts.filter(a => !a.acked).length

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell size={18} className="text-navy-300" />
              {pending > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 items-center justify-center">
                    <span className="text-[9px] font-black text-white leading-none">{pending > 9 ? '9+' : pending}</span>
                  </span>
                </span>
              )}
            </div>
            <h2 className="text-sm font-bold text-navy-100 tracking-tight">Alertas MQTT</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter toggle */}
            <div className="flex bg-navy-800/60 border border-navy-700/50 rounded-xl p-0.5">
              {[['pending', 'Pendientes'], ['all', 'Todas']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-200 ${
                    filter === val
                      ? 'bg-navy-700 text-navy-100 shadow-sm'
                      : 'text-navy-500 hover:text-navy-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchAlerts}
              disabled={loading}
              title="Refrescar"
              className="p-2 rounded-xl text-navy-400 hover:text-navy-200 hover:bg-navy-700/50 border border-transparent hover:border-navy-600/50 transition-all duration-200 disabled:opacity-30"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="p-4 rounded-full bg-navy-800/50 border border-navy-700/50">
              <Bell size={28} className="text-navy-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-navy-400">
                {filter === 'pending' ? 'Sin alertas pendientes' : 'Sin alertas registradas'}
              </p>
              <p className="text-xs text-navy-600 mt-1">
                Las alertas MQTT aparecerán aquí en tiempo real
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {alerts.map(a => (
              <AlertRow key={a.id} alert={a} onAck={ackAlert} />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
