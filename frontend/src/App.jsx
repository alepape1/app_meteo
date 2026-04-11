import { useState, useEffect, useRef } from 'react'
import { Thermometer, Droplets, Gauge, Wind, Compass, Sun, Sprout, RefreshCw, WifiOff, LogOut } from 'lucide-react'
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
    deviceInfo, deviceLastSeen,
    devices, selectedMac, setSelectedMac,
    fetchSamples, fetchFiltered, fetchDeviceInfo,
  } = useWeatherData()

  // Auto-seleccionar el primer dispositivo cuando cargue la lista
  const autoSelected = useRef(false)
  useEffect(() => {
    if (!autoSelected.current && devices.length > 0) {
      autoSelected.current = true
      setSelectedMac(devices[0].mac_address)
    }
  }, [devices, setSelectedMac])

  const isDeviceOnline = deviceLastSeen
    ? (Date.now() - new Date(deviceLastSeen.replace(' ', 'T')).getTime()) < 90000
    : false
  // Detectar ?serial= en la URL (QR de etiqueta del dispositivo)
  const serialFromUrl = new URLSearchParams(window.location.search).get('serial')
  const [activeView, setActiveView] = useState(serialFromUrl ? 'claim' : 'dashboard')
  const [claimSerial, setClaimSerial] = useState(serialFromUrl || '')
  const [unackedAlerts, setUnackedAlerts] = useState(0)

  // Polling ligero del contador de alertas no resueltas (cada 60s)
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await authFetch('/api/alerts?acked=0')
        if (!res.ok) return
        const data = await res.json()
        setUnackedAlerts(data.length)
      } catch (_) {}
    }
    fetchCount()
    const id = setInterval(fetchCount, 60000)
    return () => clearInterval(id)
  }, [])

  const handleViewChange = (view) => {
    setActiveView(view)
    if (view === 'device') fetchDeviceInfo()
  }
  const ts = data.timestamp

  return (
    <div className="flex h-screen bg-[#fafaf8] overflow-hidden font-sans">
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
      />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="bg-white border-b border-black/[.08] px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {/* Aquantia logo mark */}
            <div className="bg-brand-50 p-2 rounded-xl border border-brand-100">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2C10 2 3.5 9.5 3.5 13.5a6.5 6.5 0 0013 0C16.5 9.5 10 2 10 2Z" fill="#0c8ecc"/>
                <path d="M7 15a3.5 3.5 0 003.5-3.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.75"/>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-navy-900 leading-none tracking-tight font-serif">
                Aquantia
              </h1>
              <p className="text-xs text-navy-300 mt-0.5">Estación meteorológica · Lanzarote</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {error ? (
              <span className="flex items-center gap-1.5 text-xs text-navy-300 bg-navy-50 px-3 py-1.5 rounded-full border border-navy-100">
                <WifiOff size={11} /> Sin conexión con el servidor
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-navy-300 bg-navy-50 px-3 py-1.5 rounded-full border border-navy-100">
                {isDeviceOnline
                  ? <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                  : <span className="w-1.5 h-1.5 bg-navy-300 rounded-full shrink-0" />
                }
                {selectedMac ? `ECU ···${selectedMac.slice(-5)}` : 'ECUaquantia'}{' '}
                {isDeviceOnline ? 'online' : 'offline'}
                {lastUpdate && <span className="text-navy-200 pl-1.5 border-l border-navy-200 ml-0.5">{lastUpdate}</span>}
              </span>
            )}

            <button
              onClick={() => fetchSamples(150)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-medium text-navy-500 hover:text-navy-900 bg-white border border-black/[.08] hover:border-brand-300 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-all"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Cargando…' : 'Refrescar'}
            </button>

            <div className="flex items-center gap-2 pl-2 border-l border-black/[.08]">
              <span className="text-xs text-navy-400 hidden sm:block">{user?.display_name}</span>
              <button
                onClick={logout}
                title="Cerrar sesión"
                className="flex items-center gap-1 text-xs text-navy-400 hover:text-red-500 transition-colors"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </header>

        {/* ── Views ── */}
        {activeView === 'device'    && <DeviceStatus data={data} latest={latest} deviceInfo={deviceInfo} timestamps={ts} />}
        {activeView === 'riego'     && <IrrigationView latest={latest} selectedMac={selectedMac} deviceInfo={deviceInfo} />}
        {activeView === 'nodos'     && <NodesView />}
        {activeView === 'pipeline'  && <PipelineView />}
        {activeView === 'alerts'    && <AlertsPanel />}
        {activeView === 'settings'  && <SettingsView />}
        {activeView === 'devices'   && <DevicesView onNavigate={handleViewChange} />}
        {activeView === 'claim'     && <ClaimDeviceView initialSerial={claimSerial} />}

        <main className={`flex-1 overflow-y-auto p-5 space-y-5 ${activeView === 'dashboard' ? '' : 'hidden'}`}>

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard
              title="Temperatura" icon={Thermometer} color="amber" unit="°C"
              value={latest.temperature}
              min={minOf(data.temperature)} max={maxOf(data.temperature)}
            />
            <StatCard
              title="Temp. Baróm." icon={Thermometer} color="orange" unit="°C"
              value={latest.temperature_bar}
              min={minOf(data.temperature_bar)} max={maxOf(data.temperature_bar)}
            />
            <StatCard
              title="Humedad" icon={Droplets} color="teal" unit="%"
              value={latest.humidity}
              min={minOf(data.humidity)} max={maxOf(data.humidity)}
            />
            <StatCard
              title="Presión" icon={Gauge} color="navy" unit=" hPa"
              value={latest.pressure}
              min={minOf(data.pressure)} max={maxOf(data.pressure)}
            />
            <StatCard
              title="Viento" icon={Wind} color="teal" unit=" m/s"
              value={latest.windSpeed}
              min={minOf(data.windSpeed)} max={maxOf(data.windSpeed)}
            />
            <StatCard
              title="Dirección" icon={Compass} color="purple" unit="°"
              value={latest.windDirection}
              subtitle={degreesToCompass(latest.windDirection)}
            />
            <StatCard
              title="Humedad Suelo" icon={Sprout} color="green" unit="%"
              value={latest.soil_moisture}
              min={minOf(data.soil_moisture)} max={maxOf(data.soil_moisture)}
            />
          </div>

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WeatherChart
              title="Temperatura" icon={Thermometer} timestamps={ts}
              series={[
                { name: 'MCP9808 (ext)', data: data.temperature },
                { name: 'HTU2x (int)',   data: data.temperature_bar },
                { name: 'DHT11',         data: data.dht_temperature },
              ]}
              colors={['#BA7517', '#c4730a', '#534AB7']}
              yUnit="°C" type="area"
            />
            <WeatherChart
              title="Humedad Relativa" icon={Droplets} timestamps={ts}
              series={[
                { name: 'HTU2x', data: data.humidity },
                { name: 'DHT11', data: data.dht_humidity },
              ]}
              colors={['#0c8ecc', '#534AB7']}
              yUnit="%" yMin={0} yMax={100} type="area"
            />
            <WeatherChart
              title="Presión Atmosférica" icon={Gauge} timestamps={ts}
              series={[{ name: 'Presión', data: data.pressure }]}
              colors={['#012d5c']}
              yUnit=" kPa" type="area"
            />
            <WeatherChart
              title="Luz Ambiente" icon={Sun} timestamps={ts}
              series={[{ name: 'Lux', data: data.light }]}
              colors={['#BA7517']}
              yUnit=" lx" yMin={0} type="area"
            />
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
          </div>

        </main>
      </div>
    </div>
  )
}
