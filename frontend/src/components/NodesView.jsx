import { Radio, Cpu, Battery, Signal, Clock, AlertTriangle } from 'lucide-react'

const NODES = [
  { id: 0, name: 'Gateway Central',  type: 'gateway', role: 'ESP32 · LilyGo TTGO',    freq: '868 MHz' },
  { id: 1, name: 'Nodo A1',          type: 'field',   role: 'Sensor suelo · LoRa',     freq: '868 MHz' },
  { id: 2, name: 'Nodo A2',          type: 'field',   role: 'Sensor suelo · LoRa',     freq: '868 MHz' },
  { id: 3, name: 'Nodo B1',          type: 'field',   role: 'Sensor suelo · LoRa',     freq: '868 MHz' },
  { id: 4, name: 'Nodo B2',          type: 'field',   role: 'Sensor suelo · LoRa',     freq: '868 MHz' },
  { id: 5, name: 'Nodo C1',          type: 'field',   role: 'Sensor suelo · LoRa',     freq: '868 MHz' },
  { id: 6, name: 'Nodo C2',          type: 'field',   role: 'Sensor suelo · LoRa',     freq: '868 MHz' },
  { id: 7, name: 'Nodo D1',          type: 'field',   role: 'Sensor suelo · LoRa',     freq: '868 MHz' },
  { id: 8, name: 'Nodo D2',          type: 'field',   role: 'Sensor suelo · LoRa',     freq: '868 MHz' },
  { id: 9, name: 'Nodo E1',          type: 'field',   role: 'Sensor suelo · LoRa',     freq: '868 MHz' },
]

function NodeCard({ node }) {
  const isGateway = node.type === 'gateway'
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-4 border ${
      isGateway
        ? 'border-brand-100 ring-1 ring-brand-500/20'
        : 'border-black/[.06]'
    }`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`p-2 rounded-xl shrink-0 ${isGateway ? 'bg-brand-50' : 'bg-navy-50'}`}>
          {isGateway
            ? <Cpu size={14} className="text-brand-500" />
            : <Radio size={14} className="text-navy-500" />
          }
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-navy-900 truncate">{node.name}</p>
          <p className="text-xs text-navy-300 truncate">{node.role}</p>
        </div>
        {isGateway && (
          <span className="ml-auto shrink-0 text-xs text-brand-500 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100 font-medium">
            Central
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-navy-300 flex items-center gap-1"><Signal size={10} /> Estado</span>
          <span className="text-navy-300 bg-navy-50 px-2 py-0.5 rounded-full border border-navy-100">offline</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300 flex items-center gap-1"><Battery size={10} /> Batería</span>
          <span className="text-navy-300">—</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300">Señal LoRa</span>
          <span className="text-navy-300">— dBm</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300 flex items-center gap-1"><Clock size={10} /> Últ. trama</span>
          <span className="text-navy-300">—</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-navy-300">Frecuencia</span>
          <span className="font-medium text-navy-500">{node.freq}</span>
        </div>
      </div>
    </div>
  )
}

export default function NodesView() {
  const fieldNodes  = NODES.filter(n => n.type === 'field')
  const gatewayNode = NODES.find(n => n.type === 'gateway')

  return (
    <main className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* ── Banner ── */}
      <div className="bg-[#FAEEDA] border border-[#FAC775] rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-[#BA7517] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-[#BA7517]">Red LoRa 868 MHz — Hardware en fabricación</p>
          <p className="text-xs text-[#BA7517]/80 mt-0.5 leading-relaxed">
            9 nodos de campo autónomos + 1 gateway central. Alcance &gt;500 m en campo abierto.
            Energía 100% solar, sin cableado. Comunicación bidireccional para control de electroválvulas.
          </p>
        </div>
      </div>

      {/* ── Resumen de red ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Nodos totales',    value: '10',      sub: '9 campo + 1 gateway' },
          { label: 'Activos',          value: '0',       sub: 'Sin datos' },
          { label: 'Cobertura LoRa',   value: '>500 m',  sub: 'Campo abierto' },
          { label: 'Intervalo envío',  value: '5 min',   sub: 'Configurado' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-2xl border border-black/[.06] shadow-sm p-4">
            <p className="text-xs text-navy-300 mb-1">{item.label}</p>
            <p className="text-2xl font-bold text-navy-900">{item.value}</p>
            <p className="text-xs text-navy-300 mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Gateway ── */}
      <div>
        <h2 className="text-xs font-semibold text-navy-300 uppercase tracking-widest mb-3">Gateway</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <NodeCard node={gatewayNode} />
        </div>
      </div>

      {/* ── Nodos de campo ── */}
      <div>
        <h2 className="text-xs font-semibold text-navy-300 uppercase tracking-widest mb-3">
          Nodos de campo <span className="font-normal">({fieldNodes.length})</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fieldNodes.map(node => (
            <NodeCard key={node.id} node={node} />
          ))}
        </div>
      </div>

      {/* ── Arquitectura ── */}
      <div className="bg-navy-900 rounded-2xl p-5 flex items-start gap-4">
        <div className="bg-brand-500/20 p-2 rounded-xl shrink-0">
          <Radio size={18} className="text-brand-300" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">Arquitectura LoRa estrella</p>
          <p className="text-xs text-navy-300 leading-relaxed">
            Los nodos de campo transmiten sus lecturas de suelo cada 5 minutos al gateway central usando
            LoRa 868 MHz (protocolo propietario). El gateway agrega los datos, calcula el ET₀ y ejecuta
            las decisiones de riego de forma completamente autónoma, sin necesidad de conexión a internet.
          </p>
        </div>
      </div>

    </main>
  )
}
