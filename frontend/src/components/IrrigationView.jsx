import { useState, useEffect, useCallback } from 'react'
import { Droplets, AlertTriangle, Lock, Unlock, Leaf, Zap, FlaskConical, Power } from 'lucide-react'

// Penman-Monteith FAO-56 simplificado
// Usa T, RH, u2. Ra fijado en ~10 MJ/m²/día (media anual Lanzarote ~29°N)
function calcET0(temp, humidity, windSpeed) {
  if (temp == null) return null
  const T  = temp
  const RH = Math.max(5, Math.min(100, humidity ?? 60))
  const u2 = Math.max(0.5, windSpeed ?? 2)
  const es = 0.6108 * Math.exp((17.27 * T) / (T + 237.3))
  const ea = (RH / 100) * es
  const delta = (4098 * es) / Math.pow(T + 237.3, 2)
  const gamma = 0.0668   // kPa/°C a ~50 m s.n.m.
  const Rn    = 10.0     // MJ/m²/día (estimación media Lanzarote)
  const et0   = (0.408 * delta * Rn + gamma * (900 / (T + 273)) * u2 * (es - ea)) /
                (delta + gamma * (1 + 0.34 * u2))
  return Math.max(0, et0).toFixed(1)
}

// Sectores de riego de ejemplo (9 nodos de campo)
const SECTORS = [
  { id: 1, name: 'Sector A1', crop: 'Tomate',     area: '0.3 ha', kc: 1.15 },
  { id: 2, name: 'Sector A2', crop: 'Pimiento',   area: '0.2 ha', kc: 1.05 },
  { id: 3, name: 'Sector B1', crop: 'Calabacín',  area: '0.4 ha', kc: 1.00 },
  { id: 4, name: 'Sector B2', crop: 'Lechuga',    area: '0.15 ha', kc: 1.00 },
  { id: 5, name: 'Sector C1', crop: 'Tomate',     area: '0.3 ha', kc: 1.15 },
  { id: 6, name: 'Sector C2', crop: 'Aloe vera',  area: '0.5 ha', kc: 0.50 },
  { id: 7, name: 'Sector D1', crop: 'Papa',       area: '0.6 ha', kc: 1.15 },
  { id: 8, name: 'Sector D2', crop: 'Cebolla',    area: '0.2 ha', kc: 1.05 },
  { id: 9, name: 'Sector E1', crop: 'Vid',        area: '0.8 ha', kc: 0.85 },
]

function SectorCard({ sector }) {
  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-navy-900">{sector.name}</p>
          <p className="text-xs text-navy-300">{sector.crop} · {sector.area}</p>
        </div>
        <span className="text-xs text-navy-300 bg-navy-50 px-2 py-0.5 rounded-full border border-navy-100">
          offline
        </span>
      </div>

      <div className="space-y-2.5">
        <div>
          <div className="flex justify-between text-xs text-navy-300 mb-1">
            <span>Humedad suelo</span><span>— %</span>
          </div>
          <div className="h-1.5 bg-navy-50 rounded-full">
            <div className="h-full bg-navy-100 rounded-full" style={{ width: '0%' }} />
          </div>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300">CE suelo</span>
          <span className="text-navy-300">— dS/m</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300">Temp. suelo</span>
          <span className="text-navy-300">— °C</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300">Kc cultivo</span>
          <span className="font-medium text-navy-500">{sector.kc}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-navy-50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Lock size={12} className="text-navy-300" />
          <span className="text-xs text-navy-300">Válvula cerrada</span>
        </div>
        <button
          disabled
          className="text-xs text-navy-300 bg-navy-50 border border-navy-100 px-2.5 py-1 rounded-lg opacity-50 cursor-not-allowed"
        >
          Regar
        </button>
      </div>
    </div>
  )
}

function RelayControl({ latest, setRelay }) {
  const [desired, setDesired] = useState(false)
  const [busy, setBusy] = useState(false)

  // Cargar estado deseado actual del servidor al montar
  useEffect(() => {
    fetch('/api/relay').then(r => r.json()).then(j => setDesired(j.state)).catch(() => {})
  }, [])

  const toggle = useCallback(async () => {
    setBusy(true)
    const next = !desired
    await setRelay(next)
    setDesired(next)
    setBusy(false)
  }, [desired, setRelay])

  const deviceRelay = latest.relay_active === 1
  const synced = desired === deviceRelay

  return (
    <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-1.5 rounded-lg ${desired ? 'bg-brand-50' : 'bg-navy-50'}`}>
          <Power size={15} className={desired ? 'text-brand-500' : 'text-navy-300'} />
        </div>
        <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">Electroválvula principal</p>
      </div>

      {/* Estado en tiempo real */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-3 h-3 rounded-full ${deviceRelay ? 'bg-emerald-400 animate-pulse' : 'bg-navy-200'}`} />
        <div>
          <p className="text-sm font-semibold text-navy-900">
            {deviceRelay ? 'Válvula abierta — Regando' : 'Válvula cerrada'}
          </p>
          <p className="text-xs text-navy-300">
            {synced ? 'Sincronizado con el dispositivo' : 'Sincronizando… (próximo ciclo 20s)'}
          </p>
        </div>
      </div>

      {/* Botón de control */}
      <button
        onClick={toggle}
        disabled={busy}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50
          ${desired
            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
            : 'bg-brand-500 text-white hover:bg-brand-600'
          }`}
      >
        {desired ? <Lock size={14} /> : <Unlock size={14} />}
        {busy ? 'Enviando…' : desired ? 'Cerrar válvula' : 'Abrir válvula'}
      </button>

      <p className="text-xs text-navy-300 mt-2.5 text-center">
        GPIO 26 · JQC-3FF-S-Z · Relay activo-LOW
      </p>
    </div>
  )
}

export default function IrrigationView({ latest, setRelay }) {
  const et0 = calcET0(latest.temperature, latest.humidity, latest.windSpeed)
  const et0Num = et0 != null ? parseFloat(et0) : null

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* ── Banner desarrollo ── */}
      <div className="bg-[#FAEEDA] border border-[#FAC775] rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-[#BA7517] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-[#BA7517]">Módulo de Riego — Hardware en desarrollo</p>
          <p className="text-xs text-[#BA7517]/80 mt-0.5 leading-relaxed">
            Los 9 nodos de campo y las electroválvulas están en fabricación.
            Los datos de suelo se activarán al instalar los sensores.
            El motor ET₀ ya funciona con los datos meteorológicos actuales de la estación.
          </p>
        </div>
      </div>

      {/* ── Control electroválvula ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RelayControl latest={latest} setRelay={setRelay} />

        {/* ET₀ calculado */}
        <div className="bg-white rounded-2xl border border-brand-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-brand-50 p-1.5 rounded-lg">
              <Zap size={15} className="text-brand-500" />
            </div>
            <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">ET₀ estimado hoy</p>
          </div>
          <p className="text-3xl font-bold text-navy-900 leading-none">
            {et0 ?? '—'}
            <span className="text-base font-normal text-navy-300 ml-1">mm/día</span>
          </p>
          {et0Num != null && (
            <div className="mt-3 pt-3 border-t border-navy-50">
              <div className="h-1.5 bg-brand-50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full"
                  style={{ width: `${Math.min(100, (et0Num / 8) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-navy-300 mt-1.5">
                {et0Num < 3 ? 'Baja evapotranspiración' : et0Num < 5 ? 'Evapotranspiración media' : 'Alta evapotranspiración'}
              </p>
            </div>
          )}
          <p className="text-xs text-navy-300 mt-2">Penman-Monteith FAO-56 · datos en tiempo real</p>
        </div>

        {/* Déficit hídrico */}
        <div className="bg-white rounded-2xl border border-[#c5c2ef] shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-[#EEEDFE] p-1.5 rounded-lg">
              <Droplets size={15} className="text-[#534AB7]" />
            </div>
            <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">Déficit hídrico</p>
          </div>
          <p className="text-3xl font-bold text-navy-900 leading-none">
            —
            <span className="text-base font-normal text-navy-300 ml-1">mm</span>
          </p>
          <p className="text-xs text-navy-300 mt-3 pt-3 border-t border-navy-50">
            Requiere nodos de suelo instalados
          </p>
        </div>

        {/* Ahorro acumulado */}
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-emerald-50 p-1.5 rounded-lg">
              <Leaf size={15} className="text-emerald-600" />
            </div>
            <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">Ahorro acumulado</p>
          </div>
          <p className="text-3xl font-bold text-navy-900 leading-none">
            —
            <span className="text-base font-normal text-navy-300 ml-1">m³</span>
          </p>
          <p className="text-xs text-navy-300 mt-3 pt-3 border-t border-navy-50">
            Se calculará al activar el sistema completo
          </p>
        </div>

      </div>

      {/* ── Sectores de riego ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-navy-900">
              Sectores de riego
              <span className="text-navy-300 font-normal ml-1">(9 nodos LoRa)</span>
            </h2>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-navy-300 bg-navy-50 px-2.5 py-1 rounded-full border border-navy-100">
            <span className="w-1.5 h-1.5 bg-navy-200 rounded-full" />
            Sin nodos conectados
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SECTORS.map(sector => (
            <SectorCard key={sector.id} sector={sector} />
          ))}
        </div>
      </div>

      {/* ── Banner automatización ── */}
      <div className="bg-navy-900 rounded-2xl p-5 flex items-start gap-4">
        <div className="bg-brand-500/20 p-2 rounded-xl shrink-0">
          <FlaskConical size={18} className="text-brand-300" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Control automático por sectores — Próximamente</p>
          <p className="text-xs text-navy-300 leading-relaxed">
            Cuando los nodos de campo estén instalados, el sistema calculará automáticamente el déficit hídrico
            por sector usando ET₀ real y humedad de suelo, abrirá las electroválvulas latch DC y registrará
            el consumo para justificación PERTE. Sin intervención humana.
          </p>
        </div>
      </div>

    </main>
  )
}
