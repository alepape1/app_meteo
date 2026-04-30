import { useState, useEffect, useRef } from 'react'
import { Thermometer, Droplets, Gauge, Wind, Compass, Sun, Sprout, RefreshCw, WifiOff, Menu, Power } from 'lucide-react'
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
import BrandLogo from './components/BrandLogo'
import './index.css'

function degreesToCompass(deg) {
  if (deg == null) return null
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  return dirs[Math.round(deg / 45) % 8]
}

function minOf(arr) { return arr.length ? Math.min(...arr.filter(v => v != null)) : null }
function maxOf(arr) { return arr.length ? Math.max(...arr.filter(v => v != null)) : null }

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
  const isIrrigation = deviceProfile === 'IRRIGATION'
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

  // Polling ligero del contador de alertas no resueltas (cada 60s)
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await authFetch('/api/alerts?acked=0')
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
  }, [authFetch])

  const handleViewChange = (view) => {
    setActiveView(view)
    setSidebarOpen(false)
    if (view === 'device' || view === 'riego') fetchDeviceInfo()
  }
  const ts = data.timestamp
  const hasDevices = devices.length > 0
  const showNoDevicesState = devicesLoaded && !hasDevices && activeView !== 'devices' && activeView !== 'claim'

  return (
    <div className="flex h-screen bg-[#fafaf8] overflow-hidden font-sans">
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
        <header className="bg-white border-b border-black/[.08] px-4 py-3 flex items-center justify-between shrink-0 gap-2">

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
              <span className="flex items-center gap-1.5 text-xs text-navy-300 bg-navy-50 px-2.5 py-1.5 rounded-full border border-navy-100">
                <WifiOff size={11} />
                <span className="hidden sm:inline">Sin conexión</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-navy-400 bg-navy-50 px-2.5 py-1.5 rounded-full border border-navy-100">
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
              className="flex items-center justify-center rounded-lg border border-black/[.08] bg-white p-2 text-navy-500 hover:border-brand-300 hover:text-navy-900 disabled:opacity-40 transition-all"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Logo de salida + usuario */}
            <div className="flex items-center gap-2 pl-2 border-l border-black/[.08]">
              <button
                onClick={logout}
                title="Salir"
                className="group flex items-center gap-2 rounded-xl px-1.5 py-1 transition-all hover:bg-red-50 active:bg-red-100"
              >
                <span className="relative inline-flex items-center justify-center">
                  <BrandLogo size="sm" showText={false} className="justify-start" />
                  <span className="absolute -right-1 -bottom-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm transition-all group-hover:scale-110 group-hover:bg-red-600 group-hover:text-white group-active:bg-red-600 group-active:text-white">
                    <Power size={11} />
                  </span>
                </span>
                <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold text-red-600 opacity-0 transition-all duration-200 group-hover:max-w-16 group-hover:opacity-100 group-focus-visible:max-w-16 group-focus-visible:opacity-100 group-active:max-w-16 group-active:opacity-100">
                  Salir
                </span>
              </button>
              <span className="text-xs text-navy-400 hidden sm:block truncate max-w-[80px]">{user?.display_name}</span>
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
            {activeView === 'device'    && <DeviceStatus data={data} latest={latest} deviceInfo={deviceInfo} timestamps={ts} />}
            {activeView === 'riego'     && <IrrigationView latest={latest} selectedMac={selectedMac} deviceInfo={selectedDevice ?? deviceInfo} />}
            {activeView === 'nodos'     && <NodesView />}
            {activeView === 'pipeline'  && <PipelineView selectedMac={selectedMac} />}
            {activeView === 'alerts'    && <AlertsPanel />}
            {activeView === 'settings'  && <SettingsView />}
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
            ) : (
              <StatCard
                title="Suelo" icon={Sprout} color="green" unit="%"
                value={latest.soil_moisture}
                min={minOf(data.soil_moisture)} max={maxOf(data.soil_moisture)}
              />
            )}
          </div>

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WeatherChart
              title="Temperatura" icon={Thermometer} timestamps={ts}
              series={[
                { name: latest.temperature_source || 'Exterior', data: data.temperature },
                { name: 'Barométrica', data: data.temperature_bar },
                { name: 'BMP280', data: data.bmp280_temperature },
              ]}
              colors={['#BA7517', '#c4730a', '#534AB7']}
              yUnit="°C" type="area" hideLegend
            />
            <WeatherChart
              title="Humedad Relativa" icon={Droplets} timestamps={ts}
              series={[
                { name: isAgrometeo ? 'HDC1080' : 'HTU2x', data: data.humidity },
              ]}
              colors={['#0c8ecc']}
              yUnit="%" yMin={0} yMax={100} type="area"
            />
            <WeatherChart
              title="Presión Atmosférica" icon={Gauge} timestamps={ts}
              series={[
                { name: latest.pressure_source || 'Presión principal', data: data.pressure },
                { name: 'BMP280', data: data.bmp280_pressure },
              ]}
              colors={['#012d5c', '#534AB7']}
              yUnit=" hPa" minYRange={40} type="area"
            />
            <WeatherChart
              title="Luz Ambiente" icon={Sun} timestamps={ts}
              series={[{ name: 'Lux', data: data.light }]}
              colors={['#BA7517']}
              yUnit=" lx" yMin={0} type="area"
            />
            {isAgrometeo ? (
              <>
                <WeatherChart
                  title="Punto de Rocío" icon={Droplets} timestamps={ts}
                  series={[{ name: 'Pto. rocío', data: data.dew_point }]}
                  colors={['#0c8ecc']}
                  yUnit="°C" type="area"
                />
                <WeatherChart
                  title="Humedad Absoluta" icon={Droplets} timestamps={ts}
                  series={[{ name: 'Hum. absoluta', data: data.abs_humidity }]}
                  colors={['#10b981']}
                  yUnit=" g/m³" yMin={0} type="area"
                />
              </>
            ) : (
              <>
                <WeatherChart
                  title="Velocidad del Viento" icon={Wind} timestamps={ts}
                  series={[
                    { name: 'Velocidad', data: data.windSpeed },
                    { name: 'Filtrada',  data: data.windSpeedFiltered },
                  ]}
                  colors={['#0c8ecc', '#012d5c']}
                  yUnit=" m/s" type="line"
                />
                <WeatherChart
                  title="Dirección del Viento" icon={Compass} timestamps={ts}
                  series={[
                    { name: 'Dirección', data: data.windDirection },
                    { name: 'Filtrada',  data: data.windDirectionFiltered },
                  ]}
                  colors={['#534AB7', '#8b83dc']}
                  yUnit="°" yMin={0} yMax={360} type="scatter" height={210}
                />
                <WeatherChart
                  title="Humedad del Suelo" icon={Sprout} timestamps={ts}
                  series={[{ name: 'Suelo', data: data.soil_moisture }]}
                  colors={['#10b981']}
                  yUnit="%" yMin={0} yMax={100} type="area"
                />
              </>
            )}
          </div>

            </main>
          </>
        )}
      </div>
    </div>
  )
}
