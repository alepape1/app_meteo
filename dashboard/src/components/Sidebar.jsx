import { useState } from 'react'
import { SatelliteDish, Home, BarChart2, Search, ChevronLeft, ChevronRight } from 'lucide-react'

function daysAgoRange(days) {
  const pad = n => String(n).padStart(2, '0')
  const fmt = d =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  const start = new Date()
  const end   = new Date()
  if (days === 0) {
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
  } else {
    start.setDate(start.getDate() - days)
    start.setHours(0, 0, 0, 0)
    end.setDate(end.getDate() - days)
    end.setHours(23, 59, 59, 999)
  }
  return [fmt(start), fmt(end)]
}

export default function Sidebar({ onFetchSamples, onFetchFiltered, loading }) {
  const [collapsed, setCollapsed] = useState(false)
  const [samples, setSamples] = useState(150)
  const [days, setDays] = useState(0)

  const handleSamples = (e) => {
    e.preventDefault()
    onFetchSamples(samples)
  }

  const handleFilter = () => {
    const [start, end] = daysAgoRange(days)
    onFetchFiltered(start, end)
  }

  const dayLabel = days === 0 ? 'Hoy' : `Hace ${days} día${days > 1 ? 's' : ''}`

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-slate-900 flex flex-col transition-all duration-200 shrink-0`}>

      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <SatelliteDish size={20} className="text-cyan-400" />
            <span className="font-bold text-white text-sm">MeteoStation</span>
          </div>
        )}
        <button onClick={() => setCollapsed(p => !p)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 ml-auto">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">

          {/* Nav */}
          <nav className="space-y-1">
            <a href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium">
              <Home size={16} /> Dashboard
            </a>
          </nav>

          <div className="border-t border-slate-700 pt-4 space-y-5">

            {/* Muestras */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">
                <BarChart2 size={12} className="inline mr-1" />Muestras
              </p>
              <form onSubmit={handleSamples} className="flex gap-2">
                <input
                  type="number"
                  value={samples}
                  onChange={e => setSamples(Number(e.target.value))}
                  min={1} max={5000}
                  className="flex-1 bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:border-cyan-400 focus:outline-none w-0"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-900 font-semibold text-sm rounded-lg px-3 py-2"
                >
                  Ver
                </button>
              </form>
            </div>

            {/* Historial */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">
                Historial
              </p>
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Hoy</span><span>30d</span>
                </div>
                <input
                  type="range" min={0} max={30} value={days}
                  onChange={e => setDays(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <p className="text-center text-xs font-medium text-cyan-400">{dayLabel}</p>
                <button
                  onClick={handleFilter}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-3 py-2"
                >
                  <Search size={14} />
                  Consultar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </aside>
  )
}
