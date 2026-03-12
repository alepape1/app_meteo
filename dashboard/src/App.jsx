import { Thermometer, Droplets, Gauge, Wind, Compass, RefreshCw, Satellite, AlertCircle } from 'lucide-react'
import { useWeatherData } from './hooks/useWeatherData'
import StatCard from './components/StatCard'
import WeatherChart from './components/WeatherChart'
import Sidebar from './components/Sidebar'
import './index.css'

function degreesToCompass(deg) {
  if (deg == null) return ''
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  return dirs[Math.round(deg / 45) % 8]
}

export default function App() {
  const { data, latest, loading, lastUpdate, error, fetchSamples, fetchFiltered } = useWeatherData()
  const ts = data.timestamp

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar onFetchSamples={fetchSamples} onFetchFiltered={fetchFiltered} loading={loading} />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Satellite size={20} className="text-cyan-500" />
            <div>
              <h1 className="text-base font-bold text-slate-800 leading-none">MeteoStation Dashboard</h1>
              <p className="text-xs text-slate-400 mt-0.5">{ts.length} muestras cargadas</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="flex items-center gap-1 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-full border border-red-200">
                <AlertCircle size={12} /> {error}
              </span>
            )}
            {lastUpdate && (
              <span className="text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
                Actualizado: {lastUpdate}
              </span>
            )}
            <button
              onClick={() => fetchSamples(150)}
              disabled={loading}
              className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Cargando...' : 'Refrescar'}
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Stat cards */}
          <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
            <StatCard title="Temperatura"     value={latest.temperature}     unit="°C"  icon={Thermometer} color="red"    />
            <StatCard title="Temp. Barómetro" value={latest.temperature_bar} unit="°C"  icon={Thermometer} color="purple" />
            <StatCard title="Humedad"         value={latest.humidity}        unit="%"   icon={Droplets}    color="blue"   />
            <StatCard title="Presión"         value={latest.pressure}        unit=" hPa" icon={Gauge}      color="green"  />
            <StatCard title="Viento"          value={latest.windSpeed}       unit=" m/s" icon={Wind}       color="cyan"   />
            <StatCard
              title="Dirección"
              value={latest.windDirection}
              unit="°"
              icon={Compass}
              color="purple"
              subtitle={degreesToCompass(latest.windDirection)}
            />
          </div>

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            <WeatherChart
              title="Temperatura"
              icon={Thermometer}
              timestamps={ts}
              series={[
                { name: 'Ambiente',   data: data.temperature },
                { name: 'Barómetro', data: data.temperature_bar },
              ]}
              colors={['#ef4444', '#a855f7']}
              yUnit="°C"
              type="area"
            />

            <WeatherChart
              title="Presión Atmosférica"
              icon={Gauge}
              timestamps={ts}
              series={[{ name: 'Presión', data: data.pressure }]}
              colors={['#22c55e']}
              yUnit=" hPa"
              type="area"
            />

            <WeatherChart
              title="Humedad Relativa"
              icon={Droplets}
              timestamps={ts}
              series={[{ name: 'Humedad', data: data.humidity }]}
              colors={['#3b82f6']}
              yUnit="%"
              yMin={0}
              yMax={100}
              type="area"
            />

            <WeatherChart
              title="Velocidad del Viento"
              icon={Wind}
              timestamps={ts}
              series={[
                { name: 'Velocidad', data: data.windSpeed },
                { name: 'Filtrada',  data: data.windSpeedFiltered },
              ]}
              colors={['#06b6d4', '#0284c7']}
              yUnit=" m/s"
              type="line"
            />

            <WeatherChart
              title="Dirección del Viento"
              icon={Compass}
              timestamps={ts}
              series={[
                { name: 'Dirección', data: data.windDirection },
                { name: 'Filtrada',  data: data.windDirectionFiltered },
              ]}
              colors={['#64748b', '#94a3b8']}
              yUnit="°"
              yMin={0}
              yMax={360}
              type="scatter"
              height={200}
            />

            <WeatherChart
              title="Temperatura Barómetro"
              icon={Thermometer}
              timestamps={ts}
              series={[{ name: 'Temp. barómetro', data: data.temperature_bar }]}
              colors={['#a855f7']}
              yUnit="°C"
              type="area"
            />

          </div>
        </main>
      </div>
    </div>
  )
}
