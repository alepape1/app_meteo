import { Thermometer, Droplets, Gauge, Wind, Compass, Sun, RefreshCw, Satellite, AlertCircle, Wifi, WifiOff } from 'lucide-react'
import { useWeatherData } from './hooks/useWeatherData'
import StatCard from './components/StatCard'
import WeatherChart from './components/WeatherChart'
import Sidebar from './components/Sidebar'
import './index.css'

function degreesToCompass(deg) {
  if (deg == null) return null
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  return dirs[Math.round(deg / 45) % 8]
}

function minOf(arr) { return arr.length ? Math.min(...arr.filter(v => v != null)) : null }
function maxOf(arr) { return arr.length ? Math.max(...arr.filter(v => v != null)) : null }

export default function App() {
  const { data, latest, loading, lastUpdate, error, fetchSamples, fetchFiltered } = useWeatherData()
  const ts = data.timestamp

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar
        onFetchSamples={fetchSamples}
        onFetchFiltered={fetchFiltered}
        loading={loading}
        sampleCount={ts.length}
      />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-cyan-50 p-2 rounded-xl">
              <Satellite size={18} className="text-cyan-500" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 leading-none tracking-tight">
                MeteoStation Dashboard
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Estación meteorológica doméstica</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {error ? (
              <span className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-full border border-red-200">
                <WifiOff size={12} /> Sin conexión con Flask
              </span>
            ) : lastUpdate ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <Wifi size={11} /> Actualizado {lastUpdate}
              </span>
            ) : null}

            <button
              onClick={() => fetchSamples(150)}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-all"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Cargando…' : 'Refrescar'}
            </button>
          </div>
        </header>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard
              title="Temperatura" icon={Thermometer} color="red" unit="°C"
              value={latest.temperature}
              min={minOf(data.temperature)} max={maxOf(data.temperature)}
            />
            <StatCard
              title="Temp. Baróm." icon={Thermometer} color="orange" unit="°C"
              value={latest.temperature_bar}
              min={minOf(data.temperature_bar)} max={maxOf(data.temperature_bar)}
            />
            <StatCard
              title="Humedad" icon={Droplets} color="blue" unit="%"
              value={latest.humidity}
              min={minOf(data.humidity)} max={maxOf(data.humidity)}
            />
            <StatCard
              title="Presión" icon={Gauge} color="green" unit=" hPa"
              value={latest.pressure}
              min={minOf(data.pressure)} max={maxOf(data.pressure)}
            />
            <StatCard
              title="Viento" icon={Wind} color="cyan" unit=" m/s"
              value={latest.windSpeed}
              min={minOf(data.windSpeed)} max={maxOf(data.windSpeed)}
            />
            <StatCard
              title="Dirección" icon={Compass} color="purple" unit="°"
              value={latest.windDirection}
              subtitle={degreesToCompass(latest.windDirection)}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WeatherChart
              title="Temperatura" icon={Thermometer} timestamps={ts}
              series={[
                { name: 'MCP9808 (ext)', data: data.temperature },
                { name: 'HTU2x (int)',   data: data.temperature_bar },
                { name: 'DHT11',         data: data.dht_temperature },
              ]}
              colors={['#ef4444', '#f97316', '#a855f7']}
              yUnit="°C" type="area"
            />
            <WeatherChart
              title="Humedad Relativa" icon={Droplets} timestamps={ts}
              series={[
                { name: 'HTU2x', data: data.humidity },
                { name: 'DHT11', data: data.dht_humidity },
              ]}
              colors={['#3b82f6', '#a855f7']}
              yUnit="%" yMin={0} yMax={100} type="area"
            />
            <WeatherChart
              title="Presión Atmosférica" icon={Gauge} timestamps={ts}
              series={[{ name: 'Presión', data: data.pressure }]}
              colors={['#10b981']}
              yUnit=" kPa" type="area"
            />
            <WeatherChart
              title="Luz Ambiente" icon={Sun} timestamps={ts}
              series={[{ name: 'Lux', data: data.light }]}
              colors={['#eab308']}
              yUnit=" lx" yMin={0} type="area"
            />
            <WeatherChart
              title="Velocidad del Viento" icon={Wind} timestamps={ts}
              series={[
                { name: 'Velocidad', data: data.windSpeed },
                { name: 'Filtrada',  data: data.windSpeedFiltered },
              ]}
              colors={['#06b6d4', '#0284c7']}
              yUnit=" m/s" type="line"
            />
            <WeatherChart
              title="Dirección del Viento" icon={Compass} timestamps={ts}
              series={[
                { name: 'Dirección', data: data.windDirection },
                { name: 'Filtrada',  data: data.windDirectionFiltered },
              ]}
              colors={['#8b5cf6', '#a78bfa']}
              yUnit="°" yMin={0} yMax={360} type="scatter" height={210}
            />
          </div>

        </main>
      </div>
    </div>
  )
}
