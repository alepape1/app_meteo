import { useState } from 'react'
import { PackagePlus, CheckCircle, AlertCircle, Loader } from 'lucide-react'

export default function ClaimDeviceView() {
  const [serialNumber, setSerialNumber] = useState('')
  const [fincaId, setFincaId] = useState('')
  const [status, setStatus] = useState(null)   // null | 'loading' | 'ok' | 'error'
  const [result, setResult]   = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const sn = serialNumber.trim().toUpperCase()
    if (!sn) return
    setStatus('loading')
    setResult(null)
    setErrorMsg('')
    try {
      const res = await fetch('/api/devices/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial_number: sn, finca_id: fincaId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || `Error ${res.status}`)
        setStatus('error')
      } else {
        setResult(data)
        setStatus('ok')
        setSerialNumber('')
        setFincaId('')
      }
    } catch (err) {
      setErrorMsg('No se pudo conectar con el servidor.')
      setStatus('error')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-brand-50 p-2.5 rounded-xl border border-brand-100">
            <PackagePlus size={20} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-navy-900">Registrar dispositivo</h2>
            <p className="text-xs text-navy-400 mt-0.5">
              Introduce el número de serie que aparece en la etiqueta del dispositivo
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white border border-black/[.08] rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <label className="block text-xs font-semibold text-navy-500 mb-1.5 uppercase tracking-wider">
              Número de serie *
            </label>
            <input
              type="text"
              value={serialNumber}
              onChange={e => setSerialNumber(e.target.value)}
              placeholder="AQ-0001"
              required
              className="w-full bg-navy-50 border border-navy-200 rounded-xl px-4 py-2.5 text-sm font-mono text-navy-900 placeholder:text-navy-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-500 mb-1.5 uppercase tracking-wider">
              ID de finca <span className="text-navy-300 font-normal normal-case">(opcional — si se deja vacío, se usa el número de serie)</span>
            </label>
            <input
              type="text"
              value={fincaId}
              onChange={e => setFincaId(e.target.value)}
              placeholder="mi-finca"
              className="w-full bg-navy-50 border border-navy-200 rounded-xl px-4 py-2.5 text-sm font-mono text-navy-900 placeholder:text-navy-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
            />
            <p className="mt-1.5 text-xs text-navy-400">
              Este identificador se usará como prefijo en los topics MQTT del dispositivo.
            </p>
          </div>

          <button
            type="submit"
            disabled={status === 'loading' || !serialNumber.trim()}
            className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors"
          >
            {status === 'loading'
              ? <><Loader size={14} className="animate-spin" /> Verificando…</>
              : <><PackagePlus size={14} /> Reclamar dispositivo</>
            }
          </button>
        </form>

        {/* Result */}
        {status === 'ok' && result && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-3">
              <CheckCircle size={16} />
              Dispositivo registrado correctamente
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-navy-500">Número de serie</dt>
                <dd className="font-mono font-semibold text-navy-900">{result.serial_number}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-navy-500">Finca ID</dt>
                <dd className="font-mono font-semibold text-navy-900">{result.finca_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-navy-500">MAC</dt>
                <dd className="font-mono font-semibold text-navy-900">{result.mac}</dd>
              </div>
              {result.chip_model && (
                <div className="flex justify-between">
                  <dt className="text-navy-500">Modelo</dt>
                  <dd className="font-semibold text-navy-900">{result.chip_model}</dd>
                </div>
              )}
              {result.relay_count != null && (
                <div className="flex justify-between">
                  <dt className="text-navy-500">Válvulas</dt>
                  <dd className="font-semibold text-navy-900">{result.relay_count}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {status === 'error' && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-2.5 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

      </div>
    </div>
  )
}
