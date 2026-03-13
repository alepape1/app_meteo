import { useState } from 'react'
import {
  SatelliteDish, BarChart2, Search, ChevronLeft, ChevronRight,
  Calendar, Hash, Zap
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
  { label: 'Hoy',    getDates: () => { const d=new Date(); d.setHours(0,0,0,0); const e=new Date(); e.setHours(23,59,59,0); return [d,e] } },
  { label: 'Ayer',   getDates: () => { const d=new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); const e=new Date(d); e.setHours(23,59,59,0); return [d,e] } },
  { label: '7d',     getDates: () => { const d=new Date(); d.setDate(d.getDate()-7); d.setHours(0,0,0,0); return [d, new Date()] } },
  { label: '30d',    getDates: () => { const d=new Date(); d.setDate(d.getDate()-30); d.setHours(0,0,0,0); return [d, new Date()] } },
]

export default function Sidebar({ onFetchSamples, onFetchFiltered, loading, sampleCount }) {
  const [collapsed, setCollapsed] = useState(false)
  const [samples, setSamples]     = useState(150)
  const [activePreset, setActivePreset] = useState(null)

  const now  = new Date()
  const midnight = new Date(); midnight.setHours(0,0,0,0)
  const [startDt, setStartDt] = useState(toInputVal(midnight))
  const [endDt,   setEndDt]   = useState(toInputVal(now))

  const handleSamples = (e) => {
    e.preventDefault()
    setActivePreset(null)
    onFetchSamples(samples)
  }

  const applyPreset = (preset, idx) => {
    const [s, e] = preset.getDates()
    setStartDt(toInputVal(s))
    setEndDt(toInputVal(e))
    setActivePreset(idx)
    onFetchFiltered(fmt(s), fmt(e))
  }

  const handleFilter = () => {
    setActivePreset(null)
    const s = new Date(startDt)
    const e = new Date(endDt)
    onFetchFiltered(fmt(s), fmt(e))
  }

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-72'} bg-slate-900 flex flex-col transition-all duration-200 shrink-0 border-r border-slate-800`}>

      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-800">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="bg-cyan-500/20 p-1.5 rounded-lg">
              <SatelliteDish size={18} className="text-cyan-400" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-none">MeteoStation</p>
              <p className="text-slate-500 text-xs mt-0.5">Dashboard v2</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(p => !p)}
          className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 ml-auto transition-colors"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">

          {/* Muestras rápidas */}
          <section>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              <Hash size={11} /> Muestras recientes
            </p>
            <form onSubmit={handleSamples} className="flex gap-2">
              <input
                type="number"
                value={samples}
                onChange={e => setSamples(Number(e.target.value))}
                min={1} max={5000}
                className="flex-1 w-0 bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-cyan-500 focus:outline-none placeholder:text-slate-600"
                placeholder="Ej: 200"
              />
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-900 font-semibold text-sm rounded-lg px-3 py-2 transition-colors"
              >
                <BarChart2 size={14} /> Ver
              </button>
            </form>
          </section>

          <div className="border-t border-slate-800" />

          {/* Filtro por fechas */}
          <section>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              <Calendar size={11} /> Filtrar por fecha
            </p>

            {/* Presets */}
            <div className="grid grid-cols-4 gap-1.5 mb-4">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p, i)}
                  disabled={loading}
                  className={`text-xs font-medium py-1.5 rounded-lg transition-colors ${
                    activePreset === i
                      ? 'bg-cyan-500 text-slate-900'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Date pickers */}
            <div className="space-y-2.5">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Desde</label>
                <input
                  type="datetime-local"
                  value={startDt}
                  onChange={e => { setStartDt(e.target.value); setActivePreset(null) }}
                  className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 border border-slate-700 focus:border-cyan-500 focus:outline-none [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Hasta</label>
                <input
                  type="datetime-local"
                  value={endDt}
                  onChange={e => { setEndDt(e.target.value); setActivePreset(null) }}
                  className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 border border-slate-700 focus:border-cyan-500 focus:outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            <button
              onClick={handleFilter}
              disabled={loading}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg px-3 py-2.5 transition-colors"
            >
              <Search size={14} />
              Consultar rango
            </button>
          </section>

          <div className="border-t border-slate-800" />

          {/* Stats rápidas */}
          <section>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
              <Zap size={11} /> Datos cargados
            </p>
            <p className="text-2xl font-bold text-white">{sampleCount.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">registros en vista</p>
          </section>

        </div>
      )}
    </aside>
  )
}
