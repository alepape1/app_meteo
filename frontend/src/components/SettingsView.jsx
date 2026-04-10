import { useState, useEffect, useCallback } from 'react'
import { Settings, Droplets, MapPin, Check, AlertTriangle } from 'lucide-react'
import { useAuth } from '../AuthContext'

function SettingField({ label, description, value, onChange, type = 'text', unit, min, max, step }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-navy-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy-900">{label}</p>
        {description && <p className="text-xs text-navy-400 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          min={min} max={max} step={step}
          className="w-28 text-sm text-right bg-navy-50 border border-navy-100 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors"
        />
        {unit && <span className="text-xs text-navy-400 w-10">{unit}</span>}
      </div>
    </div>
  )
}

function SettingTextField({ label, description, value, onChange }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-navy-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy-900">{label}</p>
        {description && <p className="text-xs text-navy-400 mt-0.5">{description}</p>}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-44 text-sm bg-navy-50 border border-navy-100 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400 focus:bg-white transition-colors"
      />
    </div>
  )
}

export default function SettingsView() {
  const { authFetch } = useAuth()
  const [form, setForm] = useState({
    flow_lpm:         '5.0',
    baseline_daily_l: '15.0',
    station_name:     'Aquantia',
    station_location: 'Lanzarote',
  })
  const [status, setStatus] = useState(null)   // 'saving' | 'saved' | 'error'

  useEffect(() => {
    authFetch('/api/settings')
      .then(r => r.json())
      .then(s => setForm(f => ({ ...f, ...s })))
      .catch(() => {})
  }, [])

  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }))

  const save = useCallback(async () => {
    setStatus('saving')
    try {
      await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setStatus('saved')
      setTimeout(() => setStatus(null), 2500)
    } catch (_) {
      setStatus('error')
      setTimeout(() => setStatus(null), 3000)
    }
  }, [form])

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-navy-100 p-2 rounded-xl">
            <Settings size={16} className="text-navy-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-navy-900">Configuración</h2>
            <p className="text-xs text-navy-400">Parámetros generales de la aplicación</p>
          </div>
        </div>

        <button
          onClick={save}
          disabled={status === 'saving'}
          className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all ${
            status === 'saved'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : status === 'error'
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-brand-500 text-white hover:bg-brand-600'
          } disabled:opacity-50`}
        >
          {status === 'saved'  && <Check size={14} />}
          {status === 'error'  && <AlertTriangle size={14} />}
          {status === 'saving' ? 'Guardando…' : status === 'saved' ? 'Guardado' : status === 'error' ? 'Error' : 'Guardar cambios'}
        </button>
      </div>

      {/* ── Sección Riego ── */}
      <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-brand-50 p-1.5 rounded-lg">
            <Droplets size={15} className="text-brand-500" />
          </div>
          <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">
            Riego
          </p>
        </div>

        <SettingField
          label="Caudal nominal"
          description="Litros por minuto que suministra la electroválvula principal a plena apertura."
          value={form.flow_lpm}
          onChange={set('flow_lpm')}
          type="number" min={0.1} max={100} step={0.1}
          unit="L/min"
        />
        <SettingField
          label="Referencia diaria"
          description="Litros/día de riego manual que se usa como base para calcular el ahorro."
          value={form.baseline_daily_l}
          onChange={set('baseline_daily_l')}
          type="number" min={1} max={10000} step={0.5}
          unit="L/día"
        />
      </div>

      {/* ── Sección Estación ── */}
      <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-navy-50 p-1.5 rounded-lg">
            <MapPin size={15} className="text-navy-400" />
          </div>
          <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest">
            Estación meteorológica
          </p>
        </div>

        <SettingTextField
          label="Nombre"
          description="Nombre que aparece en la cabecera de la aplicación."
          value={form.station_name}
          onChange={set('station_name')}
        />
        <SettingTextField
          label="Ubicación"
          description="Localización de la estación."
          value={form.station_location}
          onChange={set('station_location')}
        />
      </div>

      {/* ── Info técnica (solo lectura) ── */}
      <div className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-5">
        <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest mb-4">
          Parámetros técnicos (solo lectura)
        </p>
        <div className="space-y-3">
          {[
            ['Intervalo de envío ESP32', '20 s'],
            ['GPIO relay (ESP32)',        'GPIO 26'],
            ['Modelo relay',             'JQC-3FF-S-Z · activo-HIGH'],
            ['Puerto OTA',               '3232'],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between items-center text-xs">
              <span className="text-navy-400">{label}</span>
              <span className="font-mono text-navy-600 bg-navy-50 px-2 py-0.5 rounded">{val}</span>
            </div>
          ))}
        </div>
      </div>

    </main>
  )
}
