import { useMemo, useState } from 'react'
import { Sprout, Droplets, FlaskConical, Zap, Leaf, Thermometer, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import WeatherChart from './WeatherChart'
import TimeRangeControl from './TimeRangeControl'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v, decimals = 1) {
  return v != null && Number.isFinite(Number(v)) ? Number(v).toFixed(decimals) : '—'
}

function ha(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function getTrend(arr, threshold = 0.5) {
  if (!arr || arr.length < 4) return 'stable'
  const recent = arr.slice(-4).filter(v => v != null)
  if (recent.length < 2) return 'stable'
  const delta = recent.at(-1) - recent[0]
  if (delta >  threshold) return 'up'
  if (delta < -threshold) return 'down'
  return 'stable'
}

function getStatusFromMoisture(value) {
  if (value == null) return { label: 'Sin datos', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', tier: 'unknown' }
  if (value < 20)   return { label: 'Seco',          color: '#f97316', bg: 'rgba(249,115,22,0.1)',   tier: 'dry' }
  if (value < 40)   return { label: 'Bajo',           color: '#eab308', bg: 'rgba(234,179,8,0.1)',    tier: 'low' }
  if (value < 65)   return { label: 'Óptimo',         color: '#10b981', bg: 'rgba(16,185,129,0.1)',   tier: 'ok' }
  if (value < 80)   return { label: 'Alto',           color: '#0c8ecc', bg: 'rgba(12,142,204,0.1)',   tier: 'high' }
  return                    { label: 'Saturado',       color: '#534AB7', bg: 'rgba(83,74,183,0.1)',    tier: 'sat' }
}

// ── Circular gauge ─────────────────────────────────────────────────────────────
function SoilGauge({ value, color }) {
  const pct    = value != null ? Math.min(100, Math.max(0, value)) : 0
  const R       = 52
  const cx      = 64
  const cy      = 64
  const circum  = 2 * Math.PI * R
  // arc only spans 240° (starts at -210° = bottom-left, ends at bottom-right)
  const arcLen  = circum * (240 / 360)
  const gap     = circum - arcLen
  const filled  = arcLen * pct / 100
  const startAngle = 150 // deg from 3-o'clock

  return (
    <svg viewBox="0 0 128 128" className="w-full h-full" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={ha(color, 0.6)} />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
        <filter id="gauge-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke="rgba(0,0,0,0.06)"
        strokeWidth="10"
        strokeDasharray={`${arcLen} ${gap}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(${startAngle} ${cx} ${cy})`}
      />
      {/* Filled arc */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke="url(#gauge-grad)"
        strokeWidth="10"
        strokeDasharray={`${filled} ${circum - filled}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform={`rotate(${startAngle} ${cx} ${cy})`}
        filter="url(#gauge-glow)"
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)' }}
      />
      {/* Center value */}
      <text
        x={cx} y={cy - 5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="22"
        fontWeight="700"
        fontFamily='"DM Sans", system-ui, sans-serif'
        fill="#0f172a"
      >
        {value != null ? `${Math.round(value)}` : '—'}
      </text>
      <text
        x={cx} y={cy + 16}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="11"
        fontWeight="600"
        fontFamily='"DM Sans", system-ui, sans-serif'
        fill="#94a3b8"
      >
        {value != null ? '%' : ''}
      </text>
    </svg>
  )
}

// ── NPK + soil parameter card ──────────────────────────────────────────────────
function ParameterCard({ label, symbol, value, unit, description, accentColor, icon: Icon, available = false, onClick, selected }) {
  const accent = accentColor ?? '#10b981';
  return (
    <button
      type="button"
      className={`bg-white border border-black/[.07] rounded-2xl p-4 flex flex-col gap-3 shadow-sm transition-shadow outline-none focus:ring-2 focus:ring-brand-400 ${selected ? 'ring-2 ring-brand-400 border-brand-400' : 'hover:shadow-md'}`}
      style={{ borderTop: `3px solid ${ha(accent, 0.55)}`, cursor: available ? 'pointer' : 'not-allowed', opacity: available ? 1 : 0.6 }}
      onClick={available ? onClick : undefined}
      tabIndex={available ? 0 : -1}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: ha(accent, 0.12) }}
          >
            {Icon && <Icon size={14} style={{ color: accent }} />}
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-navy-300 leading-none">{label}</p>
            {symbol && (
              <p className="text-[9px] font-semibold text-navy-200 leading-none mt-0.5">{symbol}</p>
            )}
          </div>
        </div>
        {!available && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-navy-50 text-navy-300 border border-navy-100 leading-none">
            Próx.
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[2rem] font-extrabold leading-none tabular-nums tracking-tight"
          style={{ color: available ? '#0f172a' : '#cbd5e1', textShadow: available ? `0 0 20px ${ha(accent, 0.18)}` : 'none' }}
        >
          {available ? fmt(value, 0) : '—'}
        </span>
        {available && unit && (
          <span className="text-xs font-semibold text-navy-300">{unit}</span>
        )}
      </div>

      {description && (
        <p className="text-[10px] text-navy-300 leading-snug mt-auto">{description}</p>
      )}
    </button>
  );
}

// ── Trend icon ────────────────────────────────────────────────────────────────
function TrendBadge({ trend }) {
  if (trend === 'up')    return <TrendingUp   size={13} className="text-blue-500"    />
  if (trend === 'down')  return <TrendingDown size={13} className="text-orange-500"  />
  return                        <Minus        size={13} className="text-navy-300"    />
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function PlantationView({ data, latest, timestamps, paused, onFetchFiltered, loading }) {
  const soilValue  = latest?.soil_moisture;
  const soilSeries = data?.soil_moisture ?? [];
  const trend      = useMemo(() => getTrend(soilSeries), [soilSeries]);
  const status     = useMemo(() => getStatusFromMoisture(soilValue), [soilValue]);

  // Estado para la card seleccionada: 'soil_moisture', 'soil_n', 'soil_p', 'soil_k', null
  const [selected, setSelected] = useState(null);

  // Helper para saber si la selección es NPK
  const isNPK = selected === 'soil_n' || selected === 'soil_p' || selected === 'soil_k';

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-200">
          <Leaf size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-navy-900 leading-tight">Estado de la Plantación</h1>
          <p className="text-xs text-navy-300 leading-none mt-0.5">Monitorización de suelo y nutrientes</p>
        </div>
      </div>

      {/* ── Soil moisture hero card ───────────────────────────────────────── */}
      <div className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden">
        <div
          className="px-5 py-3 border-b border-black/[.06] flex items-center gap-2"
          style={{ background: ha(status.color, 0.06) }}
        >
          <Droplets size={15} style={{ color: status.color }} />
          <span className="text-sm font-semibold text-navy-900">Humedad del Suelo</span>
          <div className="ml-auto flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full leading-none"
              style={{ background: status.bg, color: status.color, border: `1px solid ${ha(status.color, 0.25)}` }}
            >
              {status.label}
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Gauge */}
            <div className="w-36 h-36 shrink-0">
              <SoilGauge value={soilValue} color={status.color} />
            </div>
            {/* Stats */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
              <button
                type="button"
                className={`flex flex-col gap-1 p-3 rounded-xl bg-navy-50/50 border border-navy-100/60 transition-shadow outline-none focus:ring-2 focus:ring-brand-400 ${selected === 'soil_moisture' ? 'ring-2 ring-brand-400 border-brand-400' : 'hover:shadow-md'}`}
                onClick={() => setSelected('soil_moisture')}
                aria-pressed={selected === 'soil_moisture'}
              >
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300">Actual</span>
                <span className="text-xl font-extrabold text-navy-900 tabular-nums leading-none">
                  {fmt(soilValue)} <span className="text-sm font-semibold text-navy-300">%</span>
                </span>
                <div className="flex items-center gap-1 mt-0.5">
                  <TrendBadge trend={trend} />
                  <span className="text-[9px] text-navy-300">
                    {trend === 'up' ? 'Subiendo' : trend === 'down' ? 'Bajando' : 'Estable'}
                  </span>
                </div>
              </button>
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-navy-50/50 border border-navy-100/60">
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300">Mín. periodo</span>
                <span className="text-xl font-extrabold text-navy-900 tabular-nums leading-none">
                  {fmt(soilSeries.filter(v => v != null).reduce((a, b) => Math.min(a, b), Infinity) === Infinity
                    ? null
                    : soilSeries.filter(v => v != null).reduce((a, b) => Math.min(a, b), Infinity)
                  )} <span className="text-sm font-semibold text-navy-300">%</span>
                </span>
              </div>
              <div className="flex flex-col gap-1 p-3 rounded-xl bg-navy-50/50 border border-navy-100/60">
                <span className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-navy-300">Máx. periodo</span>
                <span className="text-xl font-extrabold text-navy-900 tabular-nums leading-none">
                  {fmt(soilSeries.filter(v => v != null).reduce((a, b) => Math.max(a, b), -Infinity) === -Infinity
                    ? null
                    : soilSeries.filter(v => v != null).reduce((a, b) => Math.max(a, b), -Infinity)
                  )} <span className="text-sm font-semibold text-navy-300">%</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Nutrientes NPK ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical size={14} className="text-navy-300" />
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-navy-300">Nutrientes del Suelo (NPK)</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ParameterCard
            label="Nitrógeno"
            symbol="N — Nitratos"
            value={latest?.soil_n}
            unit="mg/kg"
            description="Esencial para el crecimiento vegetativo y síntesis de clorofila."
            accentColor="#10b981"
            icon={Leaf}
            available={latest?.soil_n != null}
            onClick={() => setSelected('soil_n')}
            selected={selected === 'soil_n'}
          />
          <ParameterCard
            label="Fósforo"
            symbol="P — Fosfatos"
            value={latest?.soil_p}
            unit="mg/kg"
            description="Clave para el desarrollo radicular y la floración."
            accentColor="#f97316"
            icon={Zap}
            available={latest?.soil_p != null}
            onClick={() => setSelected('soil_p')}
            selected={selected === 'soil_p'}
          />
          <ParameterCard
            label="Potasio"
            symbol="K — Potasio"
            value={latest?.soil_k}
            unit="mg/kg"
            description="Regula el balance hídrico y la resistencia al estrés."
            accentColor="#eab308"
            icon={Sprout}
            available={latest?.soil_k != null}
            onClick={() => setSelected('soil_k')}
            selected={selected === 'soil_k'}
          />
        </div>
      </div>


      {/* ── Parámetros adicionales ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Thermometer size={14} className="text-navy-300" />
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-navy-300">Parámetros del Suelo</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ParameterCard
            label="Temperatura"
            symbol="Suelo"
            value={latest?.soil_temperature}
            unit="°C"
            description="Temperatura a nivel radicular."
            accentColor="#BA7517"
            icon={Thermometer}
            available={latest?.soil_temperature != null}
            onClick={() => setSelected('soil_temperature')}
            selected={selected === 'soil_temperature'}
          />
          <ParameterCard
            label="pH"
            symbol="Acidez"
            value={latest?.soil_ph}
            unit=""
            description="Nivel de acidez o alcalinidad del suelo."
            accentColor="#534AB7"
            icon={FlaskConical}
            available={latest?.soil_ph != null}
            onClick={() => setSelected('soil_ph')}
            selected={selected === 'soil_ph'}
          />
          <ParameterCard
            label="Conductividad"
            symbol="CE"
            value={latest?.soil_ec}
            unit="dS/m"
            description="Salinidad del suelo y disponibilidad de nutrientes."
            accentColor="#0c8ecc"
            icon={Zap}
            available={latest?.soil_ec != null}
            onClick={() => setSelected('soil_ec')}
            selected={selected === 'soil_ec'}
          />
          <ParameterCard
            label="Salinidad"
            symbol="TDS"
            value={latest?.soil_tds}
            unit="ppm"
            description="Total de sólidos disueltos en la solución del suelo."
            accentColor="#8b83dc"
            icon={FlaskConical}
            available={latest?.soil_tds != null}
            onClick={() => setSelected('soil_tds')}
            selected={selected === 'soil_tds'}
          />
        </div>
      </div>




      {/* ── Gráfico y slider solo si hay selección ───────────────────────── */}
      {selected && (
        <div className="space-y-5">
          <div className="bg-white border border-black/[.07] rounded-2xl shadow-sm overflow-hidden mb-2">
            <div className="flex items-center justify-between px-5 pt-3.5 pb-0">
              <div className="flex items-center gap-3">
                {isNPK ? (
                  <FlaskConical size={15} className="text-fuchsia-500" />
                ) : selected === 'soil_moisture' ? (
                  <Sprout size={15} className="text-emerald-500" />
                ) : selected === 'soil_temperature' ? (
                  <Thermometer size={15} className="text-yellow-700" />
                ) : selected === 'soil_ph' ? (
                  <FlaskConical size={15} className="text-indigo-500" />
                ) : selected === 'soil_ec' ? (
                  <Zap size={15} className="text-sky-500" />
                ) : selected === 'soil_tds' ? (
                  <FlaskConical size={15} className="text-purple-400" />
                ) : null}
                <h3 className="font-semibold text-slate-700 text-sm tracking-tight">
                  {isNPK
                    ? 'Histórico de Nutrientes NPK'
                    : selected === 'soil_moisture' ? 'Historial Humedad del Suelo'
                    : selected === 'soil_temperature' ? 'Historial Temperatura del Suelo'
                    : selected === 'soil_ph' ? 'Historial pH del Suelo'
                    : selected === 'soil_ec' ? 'Historial Conductividad del Suelo'
                    : selected === 'soil_tds' ? 'Historial Salinidad del Suelo'
                    : ''}
                </h3>
              </div>
              <div className="ml-auto">
                <div style={{ minWidth: 180, maxWidth: 220 }} className="flex justify-end items-center">
                  <TimeRangeControl onFetchFiltered={onFetchFiltered} loading={loading} />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 pt-2">
              {isNPK ? (
                <WeatherChart
                  key="npk"
                  title=""
                  icon={null}
                  timestamps={timestamps}
                  paused={paused}
                  series={[
                    { name: 'Nitrógeno (N)', data: data?.soil_n ?? [] },
                    { name: 'Fósforo (P)', data: data?.soil_p ?? [] },
                    { name: 'Potasio (K)', data: data?.soil_k ?? [] },
                  ]}
                  colors={["#2563eb", "#d946ef", "#22c55e"]}
                  yUnit=" mg/kg"
                  type="line"
                />
              ) : selected === 'soil_moisture' ? (
                <WeatherChart
                  key="soil_moisture"
                  title=""
                  icon={null}
                  timestamps={timestamps}
                  paused={paused}
                  series={[{ name: 'Humedad suelo', data: soilSeries }]}
                  colors={["#10b981"]}
                  yUnit="%"
                  yMin={0}
                  yMax={100}
                  type="area"
                  hideLegend={true}
                />
              ) : selected === 'soil_temperature' ? (
                <WeatherChart
                  key="soil_temperature"
                  title=""
                  icon={null}
                  timestamps={timestamps}
                  paused={paused}
                  series={[{ name: 'Temperatura', data: data?.soil_temperature ?? [] }]}
                  colors={["#BA7517"]}
                  yUnit="°C"
                  type="line"
                />
              ) : selected === 'soil_ph' ? (
                <WeatherChart
                  key="soil_ph"
                  title=""
                  icon={null}
                  timestamps={timestamps}
                  paused={paused}
                  series={[{ name: 'pH', data: data?.soil_ph ?? [] }]}
                  colors={["#534AB7"]}
                  yUnit=""
                  type="line"
                />
              ) : selected === 'soil_ec' ? (
                <WeatherChart
                  key="soil_ec"
                  title=""
                  icon={null}
                  timestamps={timestamps}
                  paused={paused}
                  series={[{ name: 'Conductividad', data: data?.soil_ec ?? [] }]}
                  colors={["#0c8ecc"]}
                  yUnit="dS/m"
                  type="line"
                />
              ) : selected === 'soil_tds' ? (
                <WeatherChart
                  key="soil_tds"
                  title=""
                  icon={null}
                  timestamps={timestamps}
                  paused={paused}
                  series={[{ name: 'Salinidad', data: data?.soil_tds ?? [] }]}
                  colors={["#8b83dc"]}
                  yUnit="ppm"
                  type="line"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}


    </main>
  );
}
