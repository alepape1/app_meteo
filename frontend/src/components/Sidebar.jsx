import { createElement, useState } from 'react'
import {
  ChevronLeft, ChevronRight,
  Zap, Cpu, LayoutDashboard, Droplets, Radio, Settings, Activity,
  Server, Bell, Layers, Power,
} from 'lucide-react'
import BrandLogo from './BrandLogo'
import TimeRangeControl from './TimeRangeControl'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Meteorología',      icon: LayoutDashboard },
  { id: 'riego',     label: 'Riego',             icon: Droplets },
  { id: 'pipeline',  label: 'Pipeline',          icon: Activity },
  { id: 'nodos',     label: 'Nodos LoRa',        icon: Radio },
  { id: 'alerts',    label: 'Alertas',           icon: Bell },
  { id: 'device',    label: 'ESP32',             icon: Cpu },
  { id: 'devices',   label: 'Mis dispositivos',  icon: Layers },
  { id: 'settings',  label: 'Configuración',     icon: Settings },
]

const NAV_DESCRIPTIONS = {
  dashboard: {
    title: 'Meteorología',
    text: 'Monitoriza el clima en tiempo real, consulta las gráficas históricas, cambia el rango temporal y analiza la evolución de cada sensor del dispositivo seleccionado.',
  },
  riego: {
    title: 'Riego',
    text: 'Revisa el estado del riego y los indicadores clave para decidir cuándo actuar sobre la instalación.',
  },
  pipeline: {
    title: 'Pipeline',
    text: 'Visualiza el flujo de datos del sistema y entiende cómo se procesan y transportan las lecturas.',
  },
  nodos: {
    title: 'Nodos LoRa',
    text: 'Explora la conectividad de los nodos y consulta información general de la red inalámbrica.',
  },
  alerts: {
    title: 'Alertas',
    text: 'Gestiona avisos pendientes, revisa incidencias y marca las alertas atendidas cuando proceda.',
  },
  device: {
    title: 'ESP32',
    text: 'Consulta el estado técnico del dispositivo, su conectividad y la información principal del hardware.',
  },
  devices: {
    title: 'Mis dispositivos',
    text: 'Administra tus equipos registrados y selecciona qué dispositivo quieres supervisar en el panel.',
  },
  settings: {
    title: 'Configuración',
    text: 'Ajusta opciones generales de la aplicación y personaliza el comportamiento del panel.',
  },
}

function isOnline(ts) {
  if (!ts) return false
  const parsed = Date.parse(String(ts).trim())
  if (Number.isNaN(parsed)) return false
  return (Date.now() - parsed) < 90000
}

export default function Sidebar({
  onFetchFiltered, loading, sampleCount, activeView, onViewChange,
  devices, selectedMac, onSelectDevice, unackedAlerts, mobileOpen,
  onLogout,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredView, setHoveredView] = useState(null)

  const infoView = hoveredView || activeView
  const sectionInfo = NAV_DESCRIPTIONS[infoView]
  const showDashboardFilters = activeView === 'dashboard' && !hoveredView
  const showInfoCard = !!sectionInfo && !showDashboardFilters

  return (
    <aside className={`
      bg-navy-900 flex flex-col border-r border-navy-800 shrink-0 transition-all duration-200
      fixed inset-y-0 left-0 z-50 md:relative md:translate-x-0
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      ${collapsed ? 'w-16' : 'w-72'}
    `}>

      {/* ── Logo ── */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-navy-800">
        {!collapsed && (
          <div className="min-w-0">
            <BrandLogo size="md" dark className="justify-start" />
          </div>
        )}
        {collapsed && (
          <div className="w-full flex justify-start pl-0.5">
            <BrandLogo size="sm" dark showText={false} className="justify-start" />
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(p => !p)}
            className="text-slate-200 hover:text-white p-1.5 rounded-lg hover:bg-navy-800 ml-2 transition-colors"
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="mx-auto mt-2 text-slate-200 hover:text-white p-1.5 rounded-lg hover:bg-navy-800 transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      )}

      {/* ── Nav ── */}
      <div className={`px-3 py-3 border-b border-navy-800 flex flex-col gap-1`}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            onMouseEnter={() => setHoveredView(item.id)}
            onMouseLeave={() => setHoveredView(null)}
            onFocus={() => setHoveredView(item.id)}
            onBlur={() => setHoveredView(null)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors
              ${activeView === item.id
                ? 'bg-brand-500 text-white'
                : 'text-slate-100 hover:bg-navy-800 hover:text-white'}`}
          >
            {createElement(item.icon, { size: 14, className: 'shrink-0' })}
            {!collapsed && item.label}
            {item.id === 'alerts' && unackedAlerts > 0 && (
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
          {devices.map((d, idx) => {
            const deviceKey = d.mac_address || d.device_serial || `${d.id ?? 'device'}-${idx}`
            return (
              <button
                key={deviceKey}
                title={d.mac_address || `Dispositivo ${d.id ?? idx + 1}`}
                onClick={() => onSelectDevice(d.mac_address)}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors
                  ${selectedMac === d.mac_address ? 'bg-brand-500' : 'bg-navy-800 hover:bg-navy-700'}`}
              >
                <span className={`w-2 h-2 rounded-full ${isOnline(d.latest_reading) ? 'bg-emerald-400' : 'bg-navy-500'}`} />
              </button>
            )
          })}
        </div>
      )}

      {/* ── Controls (only when not collapsed) ── */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">

          {/* Selector de dispositivos */}
          {devices.length > 0 && (
            <section>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 uppercase tracking-widest mb-2">
                <Server size={11} /> Dispositivos
              </p>
              <div className="flex flex-col gap-1">
                {devices.map((d, idx) => {
                  const online = isOnline(d.latest_reading)
                  const mac = d.mac_address
                  const fincaLabel = d.claimed_by_finca_id || d.finca_id || d.nickname
                  const label = fincaLabel || d.chip_model || (mac ? mac.slice(-8) : `ECU ${d.id ?? idx + 1}`)
                  const macSuffix = mac ? mac.slice(-5) : ''
                  const deviceKey = mac || d.device_serial || `${d.id ?? 'device'}-${idx}`
                  return (
                    <button
                      key={deviceKey}
                      onClick={() => onSelectDevice(mac)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors
                        ${selectedMac === mac
                          ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                          : 'text-slate-100 hover:bg-navy-800 hover:text-white'}`}
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

          {(showInfoCard || showDashboardFilters) && <div className="border-t border-navy-800" />}

          {showInfoCard && (
            <section className="rounded-2xl border border-navy-800 bg-navy-800/50 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-300 mb-1">
                {sectionInfo.title}
              </p>
              <p className="text-xs leading-5 text-slate-200/90">
                {sectionInfo.text}
              </p>
            </section>
          )}

          {/* Filtro y contador — solo en dashboard */}
          {showDashboardFilters && <>
            <TimeRangeControl
              onFetchFiltered={onFetchFiltered}
              loading={loading}
            />

            <div className="border-t border-navy-800" />

            <section>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 uppercase tracking-widest mb-2">
                <Zap size={11} /> Datos cargados
              </p>
              <p className="text-2xl font-bold text-white">{sampleCount.toLocaleString()}</p>
              <p className="text-xs text-slate-200/80 mt-0.5">registros en vista</p>
            </section>
          </>}

        </div>
      )}

      {/* ── Logout ── */}
      <div className="px-3 py-3 border-t border-navy-800 shrink-0">
        {!collapsed ? (
          <button
            onClick={onLogout}
            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white hover:bg-navy-800 hover:text-white transition-all"
          >
            <span className="inline-flex items-center justify-center text-navy-500 group-hover:text-red-400 transition-colors drop-shadow-sm">
              <Power size={20} strokeWidth={2.6} className="shrink-0" />
            </span>
            <span className="truncate text-sm font-semibold text-white">Cerrar sesión</span>
          </button>
        ) : (
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            className="w-full flex items-center justify-center p-2 rounded-xl text-red-400 hover:bg-navy-800 hover:text-red-300 transition-all"
          >
            <Power size={18} strokeWidth={2.6} />
          </button>
        )}
      </div>
    </aside>
  )
}
