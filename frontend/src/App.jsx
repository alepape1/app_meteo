import { useState, useEffect, useRef } from 'react'
import { Thermometer, Droplets, Gauge, Wind, Compass, Sun, RefreshCw, WifiOff, Menu } from 'lucide-react'
import { useWeatherData } from './hooks/useWeatherData'
import { useAuth } from './AuthContext'
import StatCard from './components/StatCard'
import WeatherChart from './components/WeatherChart'
import Sidebar from './components/Sidebar'
import DeviceStatus from './components/DeviceStatus'
import IrrigationView from './components/IrrigationView'
import NodesView from './components/NodesView'
import SettingsView from './components/SettingsView'
import PipelineView from './components/PipelineView'
import AlertsPanel from './components/AlertsPanel'
import ClaimDeviceView from './components/ClaimDeviceView'
import DevicesView from './components/DevicesView'
import LoginView from './components/LoginView'
import PlantationView from './components/PlantationView'
import './index.css'

function degreesToCompass(deg) {
  if (deg == null) return null
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  return dirs[Math.round(deg / 45) % 8]
}

function minOf(arr) { return arr.length ? Math.min(...arr.filter(v => v != null)) : null }
function maxOf(arr) { return arr.length ? Math.max(...arr.filter(v => v != null)) : null }

// Drop path hw=54: M 66 6 C 66 6, 12 60, 12 96 C 12 124, 36 148, 66 148 C 96 148, 120 124, 120 96 C 120 60, 66 6, 66 6 Z
const SDB_PATH = 'M 66 6 C 66 6, 12 60, 12 96 C 12 124, 36 148, 66 148 C 96 148, 120 124, 120 96 C 120 60, 66 6, 66 6 Z'

function ShutdownDropSVG() {
  return (
    <>
      <style>{`
        .sdb-svg    { filter: drop-shadow(0 8px 14px rgba(11,79,136,.25)); transition: filter .35s ease; }
        .sdb-power  { transition: stroke .35s ease, filter .35s ease; }
        .sdb-glow   { transition: opacity .35s ease; opacity: 0; }
        .sdb-line   { transition: stroke .35s ease; }
        .group:hover .sdb-svg    { filter: drop-shadow(0 10px 20px rgba(226,59,59,.35)); }
        .group:hover .sdb-power  {
          stroke: #ff3838;
          filter: drop-shadow(0 0 6px rgba(255,56,56,.9)) drop-shadow(0 0 12px rgba(255,56,56,.55));
          animation: sdb-pulse 1.2s ease-in-out infinite;
        }
        .group:hover .sdb-glow  { opacity: 1; animation: sdb-glow-p 1.4s ease-in-out infinite; }
        .group:hover .sdb-line  { stroke: #b91c1c; }
        @keyframes sdb-pulse {
          0%,100% { filter: drop-shadow(0 0 6px rgba(255,56,56,.9)) drop-shadow(0 0 12px rgba(255,56,56,.55)); }
          50%     { filter: drop-shadow(0 0 10px rgba(255,56,56,1)) drop-shadow(0 0 22px rgba(255,56,56,.8)); }
        }
        @keyframes sdb-glow-p { 0%,100%{opacity:.6} 50%{opacity:1} }
      `}</style>
      <svg className="sdb-svg" width="46" height="55" viewBox="0 0 132 156" aria-hidden="true">
        <defs>
          <clipPath id="sdb-clip"><path d={SDB_PATH} /></clipPath>
          <linearGradient id="sdb-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#3fb6f0"/>
            <stop offset="100%" stopColor="#0b4f88"/>
          </linearGradient>
          <radialGradient id="sdb-rglow" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0%"   stopColor="#ff8a8a" stopOpacity="0.9"/>
            <stop offset="60%"  stopColor="#ff3030" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="#ff3030" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <g clipPath="url(#sdb-clip)">
          <rect x="0" y="0" width="132" height="156" fill="url(#sdb-grad)"/>
          <g stroke="#7fd0ff" strokeWidth="0.7" fill="none" opacity="0.7">
            <path d="M25 55 H45 V75"/><path d="M105 50 V70 H85"/>
            <path d="M35 112 H58"/>  <path d="M95 122 V102"/>
          </g>
          <g fill="#9fdcff" opacity="0.85">
            <circle cx="25" cy="55" r="1.6"/><circle cx="45" cy="75" r="1.6"/>
            <circle cx="105" cy="50" r="1.6"/><circle cx="85" cy="70" r="1.6"/>
            <circle cx="35" cy="112" r="1.6"/><circle cx="58" cy="112" r="1.6"/>
          </g>
          <ellipse cx="45" cy="52" rx="14" ry="22" fill="white" opacity="0.18" transform="rotate(-15,45,52)"/>
          <circle className="sdb-glow" cx="66" cy="92" r="42" fill="url(#sdb-rglow)"/>
          <g className="sdb-power" transform="translate(66 92)" stroke="#cfeeff" strokeWidth="5" fill="none" strokeLinecap="round">
            <path d="M -16 -6 A 18 18 0 1 0 16 -6"/>
            <line x1="0" y1="-22" x2="0" y2="-2"/>
          </g>
        </g>
        <path className="sdb-line" d={SDB_PATH} fill="none" stroke="#0b4f88" strokeWidth="2"/>
      </svg>
    </>
  )
}

export default function App() {
  const { token, user, logout } = useAuth()

  // Guard: mostrar login si no hay sesión
  if (!token) return <LoginView />

  return <AppInner user={user} logout={logout} />
}

function AppInner({ user, logout }) {
  const { authFetch } = useAuth()
  const {
    data, latest, loading, lastUpdate, error,
    deviceInfo,
    devices, devicesLoaded, selectedMac, setSelectedMac,
    fetchSamples, fetchFiltered, fetchDeviceInfo,
  } = useWeatherData()
  const [nowMs, setNowMs] = useState(() => Date.now())

  // Auto-seleccionar el primer dispositivo cuando cargue la lista
  const autoSelected = useRef(false)
  useEffect(() => {
    if (!autoSelected.current && devices.length > 0) {
      autoSelected.current = true
      setSelectedMac(devices[0].mac_address)
    }
  }, [devices, setSelectedMac])

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const selectedDevice = devices.find(d => d.mac_address === selectedMac)
  const deviceProfile = (selectedDevice?.device_profile || deviceInfo?.device_profile || '').toUpperCase()
  const isAgrometeo = deviceProfile === 'AGROMETEO'

  const isDeviceOnline = selectedDevice?.latest_reading
    ? (() => {
        const parsed = Date.parse(String(selectedDevice.latest_reading).trim())
        return !Number.isNaN(parsed) && (nowMs - parsed) < 90000
      })()
    : false
  // Detectar ?serial= en la URL (QR de etiqueta del dispositivo)
  const serialFromUrl = new URLSearchParams(window.location.search).get('serial')
  const [activeView, setActiveView] = useState(serialFromUrl ? 'claim' : 'dashboard')
  const [claimSerial] = useState(serialFromUrl || '')
  const [unackedAlerts, setUnackedAlerts] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  // Ref estable para authFetch: evita que el effect de polling de alertas
  // se destruya y recree cada vez que cambia la referencia de authFetch.
  const authFetchRef = useRef(authFetch)
  useEffect(() => { authFetchRef.current = authFetch }, [authFetch])

  // Polling ligero del contador de alertas no resueltas (cada 60s)
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await authFetchRef.current('/api/alerts?acked=0')
        if (!res.ok) return
        const data = await res.json()
        setUnackedAlerts(data.length)
      } catch {
        // Ignorar errores transitorios del contador de alertas.
      }
    }
    fetchCount()
    const id = setInterval(fetchCount, 60000)
    return () => clearInterval(id)
  }, [])

  const handleViewChange = (view) => {
    setActiveView(view)
    setSidebarOpen(false)
    if (view === 'device' || view === 'riego') fetchDeviceInfo()
  }
  const ts = data.timestamp
  const hasDevices = devices.length > 0
  const showNoDevicesState = devicesLoaded && !hasDevices && activeView !== 'devices' && activeView !== 'claim' && activeView !== 'settings'

  return (
    <>
    <div className="flex h-screen app-bg overflow-hidden font-sans">
      {/* Backdrop móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        onFetchFiltered={fetchFiltered}
        loading={loading}
        sampleCount={ts.length}
        activeView={activeView}
        onViewChange={handleViewChange}
        devices={devices}
        selectedMac={selectedMac}
        onSelectDevice={setSelectedMac}
        unackedAlerts={unackedAlerts}
        mobileOpen={sidebarOpen}
        onLogout={logout}
      />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="bg-[#a5b8cb] border-b border-[#8a9aaa]/60 shadow-[0_1px_8px_rgba(0,0,0,0.10)] px-4 py-3 flex items-center justify-between shrink-0 gap-2">

          {/* Izquierda: hamburguesa */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="md:hidden p-1.5 rounded-lg text-navy-400 hover:text-navy-900 hover:bg-navy-50 transition-colors shrink-0"
            >
              <Menu size={18} />
            </button>
          </div>

          {/* Derecha: estado + acciones */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Indicador online/offline */}
            {error ? (
              <span className="flex items-center gap-1.5 text-xs text-navy-300 bg-white/70 px-2.5 py-1.5 rounded-full border border-navy-100 backdrop-blur-sm">
                <WifiOff size={11} />
                <span className="hidden sm:inline">Sin conexión</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-navy-500 bg-white/70 px-2.5 py-1.5 rounded-full border border-brand-200/50 backdrop-blur-sm">
                {isDeviceOnline
                  ? <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                  : <span className="w-1.5 h-1.5 bg-navy-300 rounded-full shrink-0" />
                }
                <span className="hidden sm:inline">
                  {selectedMac ? `Dispositivo ···${selectedMac.slice(-5)}` : 'Dispositivo'}
                  {' '}{isDeviceOnline ? 'online' : 'offline'}
                </span>
                <span className="sm:hidden">{isDeviceOnline ? 'Online' : 'Offline'}</span>
                {lastUpdate && <span className="text-navy-300 hidden md:inline pl-1.5 border-l border-navy-200 ml-0.5">{lastUpdate}</span>}
              </span>
            )}

            {/* Refrescar — solo icono */}
            <button
              onClick={() => fetchSamples(150)}
              disabled={loading}
              title="Refrescar"
              className="flex items-center justify-center rounded-lg border border-brand-200/50 bg-white/70 backdrop-blur-sm p-2 text-navy-500 hover:border-brand-400 hover:text-brand-600 disabled:opacity-40 transition-all"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Logo de salida + usuario */}
            <div className="pl-2 border-l border-black/[.08]">
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="group flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 transition-all hover:-translate-y-px active:translate-y-0"
              >
                <ShutdownDropSVG />
                <span className="text-[10px] text-navy-500 hidden sm:block truncate max-w-[72px] leading-none">{user?.display_name}</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Views ── */}
        {showNoDevicesState ? (
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl mx-auto bg-white border border-black/[.08] rounded-2xl shadow-sm p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 border border-brand-100 text-brand-600 text-xl font-bold">
                +
              </div>
              <h2 className="text-xl font-bold text-navy-900">Aún no tienes dispositivos registrados</h2>
              <p className="text-sm text-navy-400 mt-2">
                Puedes registrar uno nuevo desde la sección Mis dispositivos para empezar a ver sus datos.
              </p>
              <button
                onClick={() => handleViewChange('devices')}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Ir a Mis dispositivos
              </button>
            </div>
          </main>
        ) : (
          <>
            {activeView === 'device'      && <DeviceStatus data={data} latest={latest} deviceInfo={deviceInfo} timestamps={ts} />}
            {activeView === 'riego'       && <IrrigationView latest={latest} selectedMac={selectedMac} deviceInfo={selectedDevice ?? deviceInfo} />}
            {activeView === 'nodos'       && <NodesView />}
            {activeView === 'plantacion'  && <PlantationView data={data} latest={latest} timestamps={ts} paused={activeView !== 'plantacion'} />}
            {activeView === 'pipeline'  && <PipelineView selectedMac={selectedMac} />}
            {activeView === 'alerts'    && <AlertsPanel />}
            {activeView === 'settings'  && <SettingsView hasDevices={hasDevices} />}
            {activeView === 'devices'   && <DevicesView onNavigate={handleViewChange} />}
            {activeView === 'claim'     && <ClaimDeviceView initialSerial={claimSerial} />}

            <main key={selectedMac} className={`flex-1 overflow-y-auto p-5 space-y-5 ${activeView === 'dashboard' ? '' : 'hidden'}`}>

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <StatCard
              title="Temperatura" icon={Thermometer} color="amber"
              items={[
                {
                  label: 'Exterior',
                  value: latest.temperature,
                  unit: '°C',
                  subtitle: latest.temperature_source || 'Principal',
                  min: minOf(data.temperature),
                  max: maxOf(data.temperature),
                },
                {
                  label: 'Barométrica',
                  value: latest.temperature_bar,
                  unit: '°C',
                  min: minOf(data.temperature_bar),
                  max: maxOf(data.temperature_bar),
                },
              ]}
            />
            <StatCard
              title="Atmósfera" icon={Gauge} color="navy"
              items={[
                {
                  label: 'Humedad',
                  value: latest.humidity,
                  unit: '%',
                  min: minOf(data.humidity),
                  max: maxOf(data.humidity),
                },
                {
                  label: 'Presión',
                  value: latest.pressure,
                  unit: ' hPa',
                  subtitle: latest.pressure_source || 'Principal',
                  min: minOf(data.pressure),
                  max: maxOf(data.pressure),
                },
              ]}
            />
            <StatCard
              title="BMP280" icon={Gauge} color="purple"
              items={[
                {
                  label: 'Temperatura',
                  value: latest.bmp280_temperature,
                  unit: '°C',
                  subtitle: latest.bmp280_ok ? 'OK' : 'Sin dato',
                  min: minOf(data.bmp280_temperature),
                  max: maxOf(data.bmp280_temperature),
                },
                {
                  label: 'Presión',
                  value: latest.bmp280_pressure,
                  unit: ' hPa',
                  subtitle: 'BMP280',
                  min: minOf(data.bmp280_pressure),
                  max: maxOf(data.bmp280_pressure),
                },
              ]}
            />
            {isAgrometeo ? (
              <StatCard
                title="Agrometeorología" icon={Droplets} color="green"
                items={[
                  {
                    label: 'Pto. rocío',
                    value: latest.dew_point,
                    unit: '°C',
                    min: minOf(data.dew_point),
                    max: maxOf(data.dew_point),
                  },
                  {
                    label: 'Hum. absoluta',
                    value: latest.abs_humidity,
                    unit: ' g/m³',
                    min: minOf(data.abs_humidity),
                    max: maxOf(data.abs_humidity),
                  },
                ]}
              />
            ) : (
              <StatCard
                title="Viento" icon={Wind} color="teal"
                items={[
                  {
                    label: 'Velocidad',
                    value: latest.windSpeed,
                    unit: ' m/s',
                    min: minOf(data.windSpeed),
                    max: maxOf(data.windSpeed),
                  },
                  {
                    label: 'Dirección',
                    value: latest.windDirection,
                    unit: '°',
                    subtitle: degreesToCompass(latest.windDirection),
                  },
                ]}
              />
            )}
            {isAgrometeo ? (
              <StatCard
                title="Índice calor" icon={Thermometer} color="amber" unit="°C"
                value={latest.heat_index}
                min={minOf(data.heat_index)} max={maxOf(data.heat_index)}
              />
            ) : null}
          </div>

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WeatherChart
              title="Temperatura" icon={Thermometer} timestamps={ts} paused={activeView !== 'dashboard'}
              series={[
                { name: latest.temperature_source || 'Exterior', data: data.temperature },
                { name: 'Barométrica', data: data.temperature_bar },
                { name: 'BMP280', data: data.bmp280_temperature },
              ]}
              colors={['#BA7517', '#c4730a', '#534AB7']}
              yUnit="°C" type="area" hideLegend
            />
            <WeatherChart
              title="Humedad Relativa" icon={Droplets} timestamps={ts} paused={activeView !== 'dashboard'}
              series={[
                { name: isAgrometeo ? 'HDC1080' : 'HTU2x', data: data.humidity },
              ]}
              colors={['#0c8ecc']}
              yUnit="%" yMin={0} yMax={100} type="area"
            />
            <WeatherChart
              title="Presión Atmosférica" icon={Gauge} timestamps={ts} paused={activeView !== 'dashboard'}
              series={[
                { name: latest.pressure_source || 'Presión principal', data: data.pressure },
                { name: 'BMP280', data: data.bmp280_pressure },
              ]}
              colors={['#012d5c', '#534AB7']}
              yUnit=" hPa" minYRange={2} type="area"
            />
            <WeatherChart
              title="Luz Ambiente" icon={Sun} timestamps={ts} paused={activeView !== 'dashboard'}
              series={[{ name: 'Lux', data: data.light }]}
              colors={['#BA7517']}
              yUnit=" lx" yMin={0} type="area"
            />
            {isAgrometeo ? (
              <>
                <WeatherChart
                  title="Punto de Rocío" icon={Droplets} timestamps={ts} paused={activeView !== 'dashboard'}
                  series={[{ name: 'Pto. rocío', data: data.dew_point }]}
                  colors={['#0c8ecc']}
                  yUnit="°C" type="area"
                />
                <WeatherChart
                  title="Humedad Absoluta" icon={Droplets} timestamps={ts} paused={activeView !== 'dashboard'}
                  series={[{ name: 'Hum. absoluta', data: data.abs_humidity }]}
                  colors={['#10b981']}
                  yUnit=" g/m³" yMin={0} type="area"
                />
              </>
            ) : (
              <>
                <WeatherChart
                  title="Velocidad del Viento" icon={Wind} timestamps={ts} paused={activeView !== 'dashboard'}
                  series={[
                    { name: 'Velocidad', data: data.windSpeed },
                    { name: 'Filtrada',  data: data.windSpeedFiltered },
                  ]}
                  colors={['#0c8ecc', '#012d5c']}
                  yUnit=" m/s" type="line"
                />
                <WeatherChart
                  title="Dirección del Viento" icon={Compass} timestamps={ts} paused={activeView !== 'dashboard'}
                  series={[
                    { name: 'Dirección', data: data.windDirection },
                    { name: 'Filtrada',  data: data.windDirectionFiltered },
                  ]}
                  colors={['#534AB7', '#8b83dc']}
                  yUnit="°" yMin={0} yMax={360} type="scatter" height={210}
                />

              </>
            )}
          </div>

            </main>
          </>
        )}
      </div>
    </div>

    {/* ── Modal confirmación logout ── */}
    {showLogoutConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white border border-black/[.08] rounded-2xl shadow-2xl p-6 w-80 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-navy-900 font-semibold text-base">¿Cerrar sesión?</h3>
            <p className="text-navy-400 text-sm">Se cerrará tu sesión actual y tendrás que volver a iniciarla para acceder.</p>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-navy-500 hover:bg-navy-50 hover:text-navy-900 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => { setShowLogoutConfirm(false); logout() }}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-all"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
