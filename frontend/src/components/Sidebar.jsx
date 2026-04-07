import { useState } from 'react'
import {
  Search, ChevronLeft, ChevronRight,
  Calendar, Zap, Cpu, LayoutDashboard, Droplets, Radio, Settings, Activity,
  Server, Bell, PackagePlus,
} from 'lucide-react'

const fmt = d => {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const toInputVal = d => {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const PRESETS = [
  { label: 'Hoy',  getDates: () => { const d=new Date(); d.setHours(0,0,0,0); const e=new Date(); e.setHours(23,59,59,0); return [d,e] } },
  { label: 'Ayer', getDates: () => { const d=new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); const e=new Date(d); e.setHours(23,59,59,0); return [d,e] } },
  { label: '7d',   getDates: () => { const d=new Date(); d.setDate(d.getDate()-7); d.setHours(0,0,0,0); return [d, new Date()] } },
  { label: '30d',  getDates: () => { const d=new Date(); d.setDate(d.getDate()-30); d.setHours(0,0,0,0); return [d, new Date()] } },
]

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Meteorología',  icon: LayoutDashboard },
  { id: 'riego',     label: 'Riego',         icon: Droplets },
  { id: 'pipeline',  label: 'Pipeline',      icon: Activity },
  { id: 'nodos',     label: 'Nodos LoRa',    icon: Radio },
  { id: 'alerts',    label: 'Alertas',       icon: Bell },
  { id: 'device',    label: 'ESP32',         icon: Cpu },
  { id: 'settings',  label: 'Configuración', icon: Settings },
  { id: 'claim',     label: 'Añadir dispositivo', icon: PackagePlus },
]

function isOnline(ts) {
  if (!ts) return false
  return (Date.now() - new Date(ts.replace(' ', 'T')).getTime()) < 90000
}

export default function Sidebar({
  onFetchFiltered, loading, sampleCount, activeView, onViewChange,
  devices, selectedMac, onSelectDevice, unackedAlerts,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [activePreset, setActivePreset] = useState(null)

  const now     = new Date()
  const midnight = new Date(); midnight.setHours(0,0,0,0)
  const [startDt, setStartDt] = useState(toInputVal(midnight))
  const [endDt,   setEndDt]   = useState(toInputVal(now))

  const applyPreset = (preset, idx) => {
    const [s, e] = preset.getDates()
    setStartDt(toInputVal(s))
    setEndDt(toInputVal(e))
    setActivePreset(idx)
    onFetchFiltered(fmt(s), fmt(e))
  }

  const handleFilter = () => {
    setActivePreset(null)
    onFetchFiltered(fmt(new Date(startDt)), fmt(new Date(endDt)))
  }

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-72'} bg-navy-900 flex flex-col transition-all duration-200 shrink-0 border-r border-navy-800`}>

      {/* ── Logo ── */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-navy-800">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            {/* Aquantia droplet mark */}
            <div className="bg-brand-500/20 p-1.5 rounded-lg shrink-0">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M10 2C10 2 3.5 9.5 3.5 13.5a6.5 6.5 0 0013 0C16.5 9.5 10 2 10 2Z" fill="#5ab4e0"/>
                <path d="M7 15a3.5 3.5 0 003.5-3.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.7"/>
              </svg>
            </div>
            <div>
              <p className="font-serif font-normal text-white text-base leading-none tracking-tight">Aquantia</p>
              <p className="text-navy-300 text-xs mt-0.5">Estación meteorológica</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto bg-brand-500/20 p-1.5 rounded-lg">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M10 2C10 2 3.5 9.5 3.5 13.5a6.5 6.5 0 0013 0C16.5 9.5 10 2 10 2Z" fill="#5ab4e0"/>
              <path d="M7 15a3.5 3.5 0 003.5-3.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.7"/>
            </svg>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(p => !p)}
            className="text-navy-300 hover:text-white p-1.5 rounded-lg hover:bg-navy-800 ml-2 transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 text-navy-300 hover:text-white p-1.5 rounded-lg hover:bg-navy-800 transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      )}

      {/* ── Nav ── */}
      <div className={`px-3 py-3 border-b border-navy-800 flex flex-col gap-1`}>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors
              ${activeView === id
                ? 'bg-brand-500 text-white'
                : 'text-navy-300 hover:bg-navy-800 hover:text-white'}`}
          >
            <Icon size={14} className="shrink-0" />
            {!collapsed && label}
            {id === 'alerts' && unackedAlerts > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {unackedAlerts}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Dispositivos (collapsed: solo puntos de estado) */}
      {collapsed && devices.length > 0 && (
        <div className="flex flex-col items-center gap-2 px-2 py-3 border-b border-navy-800">
          {devices.map(d => (
            <button
              key={d.id}
              title={d.mac_address || `Dispositivo ${d.id}`}
              onClick={() => onSelectDevice(d.mac_address)}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors
                ${selectedMac === d.mac_address ? 'bg-brand-500' : 'bg-navy-800 hover:bg-navy-700'}`}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline(d.latest_reading) ? 'bg-emerald-400' : 'bg-navy-500'}`} />
            </button>
          ))}
        </div>
      )}

      {/* ── Controls (only when not collapsed) ── */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">

          {/* Selector de dispositivos */}
          {devices.length > 0 && (
            <section>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-300 uppercase tracking-widest mb-2">
                <Server size={11} /> Dispositivos
              </p>
              <div className="flex flex-col gap-1">
                {devices.map(d => {
                  const online = isOnline(d.latest_reading)
                  const mac = d.mac_address
                  const label = d.chip_model || (mac ? mac.slice(-8) : `ECU ${d.id}`)
                  const macSuffix = mac ? mac.slice(-5) : ''
                  return (
                    <button
                      key={d.id}
                      onClick={() => onSelectDevice(mac)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors
                        ${selectedMac === mac
                          ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                          : 'text-navy-300 hover:bg-navy-800 hover:text-white'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-emerald-400 animate-pulse' : 'bg-navy-500'}`} />
                      <span className="truncate">{label}</span>
                      {macSuffix && (
                        <span className="ml-auto font-mono text-navy-500 text-xs shrink-0">···{macSuffix}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {devices.length > 0 && <div className="border-t border-navy-800" />}

          {/* Filtro por fechas */}
          <section>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-300 uppercase tracking-widest mb-3">
              <Calendar size={11} /> Rango de datos
            </p>

            {/* Presets rápidos */}
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p, i)}
                  disabled={loading}
                  className={`text-xs font-semibold py-2 rounded-xl transition-colors ${
                    activePreset === i
                      ? 'bg-brand-500 text-white'
                      : 'bg-white/[.10] text-white border border-white/[.18] hover:bg-white/[.20]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Separador */}
            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 border-t border-navy-800" />
              <span className="text-xs text-navy-600">o personalizado</span>
              <div className="flex-1 border-t border-navy-800" />
            </div>

            {/* Date pickers compactos */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-navy-800 rounded-xl px-3 py-2 border border-navy-700 focus-within:border-brand-500">
                <Calendar size={12} className="text-navy-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-navy-500 text-xs leading-none mb-1">Desde</p>
                  <input
                    type="datetime-local"
                    value={startDt}
                    onChange={e => { setStartDt(e.target.value); setActivePreset(null) }}
                    className="w-full bg-transparent text-navy-100 text-xs focus:outline-none [color-scheme:dark]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 bg-navy-800 rounded-xl px-3 py-2 border border-navy-700 focus-within:border-brand-500">
                <Calendar size={12} className="text-navy-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-navy-500 text-xs leading-none mb-1">Hasta</p>
                  <input
                    type="datetime-local"
                    value={endDt}
                    onChange={e => { setEndDt(e.target.value); setActivePreset(null) }}
                    className="w-full bg-transparent text-navy-100 text-xs focus:outline-none [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleFilter}
              disabled={loading}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl px-3 py-2.5 transition-colors"
            >
              <Search size={13} />
              {loading ? 'Cargando…' : 'Consultar'}
            </button>
          </section>

          <div className="border-t border-navy-800" />

          {/* Registros cargados */}
          <section>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-300 uppercase tracking-widest mb-2">
              <Zap size={11} /> Datos cargados
            </p>
            <p className="text-2xl font-bold text-white">{sampleCount.toLocaleString()}</p>
            <p className="text-xs text-navy-300 mt-0.5">registros en vista</p>
          </section>

        </div>
      )}
    </aside>
  )
}
