import { useState, useRef, useId, useCallback, useEffect } from 'react'
import { Calendar, Clock, ChevronDown, AlertCircle, Loader2 } from 'lucide-react'

const STOPS = [
  { label: '1h',  ms: 1  * 60 * 60 * 1000,      name: 'Última hora'      },
  { label: '3h',  ms: 3  * 60 * 60 * 1000,      name: 'Últimas 3 h'      },
  { label: '6h',  ms: 6  * 60 * 60 * 1000,      name: 'Últimas 6 h'      },
  { label: '12h', ms: 12 * 60 * 60 * 1000,      name: 'Últimas 12 h'     },
  { label: '24h', ms: 24 * 60 * 60 * 1000,      name: 'Último día'       },
  { label: '2d',  ms: 2  * 24 * 60 * 60 * 1000, name: 'Últimos 2 días'   },
  { label: '7d',  ms: 7  * 24 * 60 * 60 * 1000, name: 'Últimos 7 días'   },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000, name: 'Último mes'       },
]

const DEFAULT_STOP = 4 // 24h

const pad = n => String(n).padStart(2, '0')

const fmt = d =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

const toInputVal = d =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

const toDisplayDate = d =>
  d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function getDatesFromStop(idx) {
  const end   = new Date()
  const start = new Date(end.getTime() - STOPS[idx].ms)
  return [start, end]
}

// ─── Slider con thumb escalable ───────────────────────────────────────────────
const SLIDER_THUMB_BASE = `
  w-full h-1.5 rounded-full appearance-none cursor-pointer outline-none
  focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900
  [&::-webkit-slider-thumb]:appearance-none
  [&::-webkit-slider-thumb]:w-[18px]
  [&::-webkit-slider-thumb]:h-[18px]
  [&::-webkit-slider-thumb]:rounded-full
  [&::-webkit-slider-thumb]:bg-brand-500
  [&::-webkit-slider-thumb]:border-2
  [&::-webkit-slider-thumb]:border-white
  [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(12,142,204,0.25)]
  [&::-webkit-slider-thumb]:cursor-pointer
  [&::-webkit-slider-thumb]:transition-transform
  [&::-webkit-slider-thumb]:duration-100
  [&::-moz-range-thumb]:w-[18px]
  [&::-moz-range-thumb]:h-[18px]
  [&::-moz-range-thumb]:rounded-full
  [&::-moz-range-thumb]:bg-brand-500
  [&::-moz-range-thumb]:border-2
  [&::-moz-range-thumb]:border-white
  [&::-moz-range-thumb]:shadow-[0_0_0_3px_rgba(12,142,204,0.25)]
  [&::-moz-range-thumb]:cursor-pointer
  disabled:opacity-40 disabled:cursor-not-allowed
`

export default function TimeRangeControl({ onFetchFiltered, loading }) {
  const sliderId    = useId()
  const debounceRef = useRef(null)
  const panelRef    = useRef(null)

  // ── Estado ──────────────────────────────────────────────────────────────────
  // stopIdx: índice confirmado (tras debounce o click en tick)
  // pendingIdx: índice visual inmediato del slider mientras el debounce está activo
  const [stopIdx,     setStopIdx]     = useState(DEFAULT_STOP)
  const [pendingIdx,  setPendingIdx]  = useState(DEFAULT_STOP)
  const [mode,        setMode]        = useState('relative')
  const [customOpen,  setCustomOpen]  = useState(false)
  const [rangeError,  setRangeError]  = useState('')
  const [thumbHover,  setThumbHover]  = useState(false)

  const [startDt, setStartDt] = useState(() => {
    const [s] = getDatesFromStop(DEFAULT_STOP)
    return toInputVal(s)
  })
  const [endDt, setEndDt] = useState(() => toInputVal(new Date()))

  // Limpiar debounce al desmontar
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const applyRelative = useCallback((idx) => {
    const [s, e] = getDatesFromStop(idx)
    setStartDt(toInputVal(s))
    setEndDt(toInputVal(e))
    setRangeError('')
    onFetchFiltered(fmt(s), fmt(e))
  }, [onFetchFiltered])

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleSliderChange = useCallback((ev) => {
    const idx = Number(ev.target.value)
    setPendingIdx(idx)
    setMode('relative')
    setRangeError('')

    const [s, e] = getDatesFromStop(idx)
    setStartDt(toInputVal(s))
    setEndDt(toInputVal(e))

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setStopIdx(idx)
      onFetchFiltered(fmt(s), fmt(e))
    }, 600)
  }, [onFetchFiltered])

  const handleTickClick = useCallback((idx) => {
    if (idx === pendingIdx && mode === 'relative') return
    clearTimeout(debounceRef.current)
    setPendingIdx(idx)
    setStopIdx(idx)
    setMode('relative')
    applyRelative(idx)
  }, [pendingIdx, mode, applyRelative])

  const handleCustomQuery = useCallback(() => {
    const s = new Date(startDt)
    const e = new Date(endDt)

    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      setRangeError('Las fechas introducidas no son válidas.')
      return
    }
    if (s >= e) {
      setRangeError('La fecha de inicio debe ser anterior a la fecha de fin.')
      return
    }
    if (e > new Date()) {
      setRangeError('La fecha de fin no puede ser futura.')
      return
    }

    setRangeError('')
    setMode('custom')
    onFetchFiltered(fmt(s), fmt(e))
  }, [startDt, endDt, onFetchFiltered])

  const handleCustomDateChange = useCallback((setter) => (ev) => {
    setter(ev.target.value)
    setMode('custom')
    setRangeError('')
  }, [])

  const handleToggleCustom = useCallback(() => setCustomOpen(o => !o), [])

  // ── Derivados ─────────────────────────────────────────────────────────────────
  const activeIdx     = mode === 'relative' ? pendingIdx : stopIdx
  const pct           = (pendingIdx / (STOPS.length - 1)) * 100
  const [previewStart] = getDatesFromStop(pendingIdx)
  const sliderBg      = `linear-gradient(to right, #0c8ecc ${pct}%, rgba(26,58,92,0.8) ${pct}%)`

  return (
    <section className="space-y-4" aria-label="Control de rango temporal">

      {/* ── Cabecera ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 uppercase tracking-widest">
          <Clock size={12} aria-hidden="true" />
          Rango de datos
        </p>

        {/* Badge de modo activo */}
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
            mode === 'relative'
              ? 'bg-brand-500/20 text-brand-400'
              : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          {mode === 'relative' ? 'Relativo' : 'Personalizado'}
        </span>
      </div>

      {/* ── Etiqueta de selección actual ─────────────────────────────────────── */}
      <div className="bg-navy-800/60 rounded-xl px-3 py-2.5 border border-navy-700/60">
        <p className="text-sm font-bold text-white leading-tight">
          {mode === 'relative' ? STOPS[pendingIdx].name : 'Rango personalizado'}
        </p>
        <p className="text-[11px] text-navy-300 mt-0.5">
          {mode === 'relative'
            ? <>{toDisplayDate(previewStart)} <span className="text-navy-500">→</span> ahora</>
            : <>{toDisplayDate(new Date(startDt))} <span className="text-navy-500">→</span> {toDisplayDate(new Date(endDt))}</>
          }
        </p>
      </div>

      {/* ── Slider ───────────────────────────────────────────────────────────── */}
      <div className="px-0.5 space-y-2">
        <label htmlFor={sliderId} className="sr-only">
          Seleccionar rango de tiempo
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={STOPS.length - 1}
          step={1}
          value={pendingIdx}
          onChange={handleSliderChange}
          onMouseEnter={() => setThumbHover(true)}
          onMouseLeave={() => setThumbHover(false)}
          disabled={loading}
          aria-label="Rango de tiempo relativo"
          aria-valuemin={0}
          aria-valuemax={STOPS.length - 1}
          aria-valuenow={pendingIdx}
          aria-valuetext={STOPS[pendingIdx].name}
          className={`${SLIDER_THUMB_BASE} ${thumbHover ? '[&::-webkit-slider-thumb]:scale-110' : ''}`}
          style={{ background: sliderBg }}
        />

        {/* Tick labels */}
        <div className="flex justify-between" role="list" aria-label="Presets de rango">
          {STOPS.map((stop, i) => {
            const isActive = activeIdx === i && mode === 'relative'
            return (
              <button
                key={stop.label}
                type="button"
                role="listitem"
                onClick={() => handleTickClick(i)}
                disabled={loading}
                aria-label={stop.name}
                aria-pressed={isActive}
                className={`
                  relative text-[10px] font-semibold leading-none transition-colors
                  disabled:cursor-not-allowed px-0.5 py-1 rounded
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400
                  ${isActive
                    ? 'text-white bg-brand-500/30 ring-1 ring-brand-400/50'
                    : 'text-white hover:text-brand-300'
                  }
                `}
              >
                {stop.label}
                {/* Indicador bajo el tick activo */}
                {isActive && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-500" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Rango personalizado (colapsable con animación) ────────────────────── */}
      <div>
        <button
          type="button"
          onClick={handleToggleCustom}
          aria-expanded={customOpen}
          aria-controls="custom-range-panel"
          className="flex items-center gap-2 w-full text-xs text-navy-500 hover:text-navy-300
            transition-colors focus-visible:outline-none focus-visible:ring-1
            focus-visible:ring-brand-400 rounded"
        >
          <div className="flex-1 h-px bg-navy-700/70" aria-hidden="true" />
          <span className="shrink-0 flex items-center gap-1 font-medium">
            <Calendar size={10} aria-hidden="true" />
            Personalizado
            <ChevronDown
              size={10}
              aria-hidden="true"
              className={`transition-transform duration-200 ${customOpen ? 'rotate-180' : ''}`}
            />
          </span>
          <div className="flex-1 h-px bg-navy-700/70" aria-hidden="true" />
        </button>

        {/* Panel colapsable con animación de altura */}
        <div
          id="custom-range-panel"
          ref={panelRef}
          role="region"
          aria-label="Selector de rango personalizado"
          className={`
            overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out
            ${customOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}
          `}
        >
          <div className="pt-3 space-y-2">
            {/* Desde */}
            <label className="flex items-center gap-2 bg-navy-800 rounded-xl px-3 py-2.5
              border border-navy-700 focus-within:border-brand-500/60
              transition-colors cursor-pointer group"
            >
              <Calendar size={12} className="text-navy-400 shrink-0 group-focus-within:text-brand-400 transition-colors" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-500 leading-none mb-1">
                  Desde
                </p>
                <input
                  type="datetime-local"
                  value={startDt}
                  onChange={handleCustomDateChange(setStartDt)}
                  max={endDt}
                  className="w-full bg-transparent text-white text-xs focus:outline-none [color-scheme:dark]"
                />
              </div>
            </label>

            {/* Hasta */}
            <label className="flex items-center gap-2 bg-navy-800 rounded-xl px-3 py-2.5
              border border-navy-700 focus-within:border-brand-500/60
              transition-colors cursor-pointer group"
            >
              <Calendar size={12} className="text-navy-400 shrink-0 group-focus-within:text-brand-400 transition-colors" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-navy-500 leading-none mb-1">
                  Hasta
                </p>
                <input
                  type="datetime-local"
                  value={endDt}
                  onChange={handleCustomDateChange(setEndDt)}
                  min={startDt}
                  max={toInputVal(new Date())}
                  className="w-full bg-transparent text-white text-xs focus:outline-none [color-scheme:dark]"
                />
              </div>
            </label>

            {/* Mensaje de error de validación */}
            {rangeError && (
              <div
                role="alert"
                className="flex items-start gap-2 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-xl text-[11px] text-red-300"
              >
                <AlertCircle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>{rangeError}</span>
              </div>
            )}

            {/* Botón Aplicar */}
            <button
              type="button"
              onClick={handleCustomQuery}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-500
                hover:bg-brand-600 active:scale-[0.98] active:bg-brand-700
                disabled:opacity-40 disabled:cursor-not-allowed
                text-white text-xs font-semibold rounded-xl px-3 py-2.5
                transition-all focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-brand-400 focus-visible:ring-offset-2
                focus-visible:ring-offset-navy-900"
            >
              {loading
                ? <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Cargando…</>
                : 'Aplicar rango'
              }
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
