import { Radio, Cpu, Battery, Signal, Clock, AlertTriangle } from 'lucide-react'

function ha(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

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
  const hex = isGateway ? '#0c8ecc' : '#1a3350'
  const grad = isGateway ? 'from-brand-500 to-brand-300' : 'from-[#001530] to-[#3d506a]'

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-px"
      style={{
        background: 'linear-gradient(150deg, #f8fafc, #fff 58%, #f0f4ff)',
        border: `1px solid ${ha(hex, 0.2)}`,
        boxShadow: `0 1px 3px rgba(0,0,0,0.05), 0 4px 14px ${ha(hex, 0.07)}`,
      }}
    >
      {/* Top accent bar */}
      <div
        className={`h-[3px] bg-gradient-to-r ${grad}`}
        style={{ boxShadow: `0 0 8px 2px ${ha(hex, 0.5)}` }}
      />

      {/* Header */}
      <div
        className="px-4 pt-3 pb-2.5 flex items-center gap-2.5"
        style={{ background: `linear-gradient(to bottom, ${ha(hex, 0.055)}, transparent)` }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${ha(hex, 0.2)}, ${ha(hex, 0.07)})`,
            border: `1px solid ${ha(hex, 0.28)}`,
            boxShadow: `0 2px 8px ${ha(hex, 0.22)}, 0 0 0 3px ${ha(hex, 0.06)}`,
          }}
        >
          {isGateway
            ? <Cpu size={15} style={{ color: hex, filter: `drop-shadow(0 0 4px ${ha(hex, 0.5)})` }} />
            : <Radio size={15} style={{ color: hex, filter: `drop-shadow(0 0 4px ${ha(hex, 0.5)})` }} />
          }
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-extrabold uppercase tracking-widest text-navy-600 leading-none truncate">
            {node.name}
          </p>
          <p className="text-[10px] text-navy-300 truncate mt-0.5">{node.role}</p>
        </div>
        {isGateway && (
          <span
            className="ml-auto shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: ha('#0d9488', 0.1),
              color: '#0d9488',
              border: `1px solid ${ha('#0d9488', 0.22)}`,
            }}
          >
            Central
          </span>
        )}
      </div>

      {/* Data rows */}
      <div className="px-4 pb-4 space-y-0">
        <div className="flex justify-between items-center text-xs py-1.5 border-t border-navy-50">
          <span className="text-navy-300 flex items-center gap-1"><Signal size={10} /> Estado</span>
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: ha(hex, 0.08),
              color: hex,
              border: `1px solid ${ha(hex, 0.18)}`,
            }}
          >
            offline
          </span>
        </div>
        <div className="flex justify-between items-center text-xs py-1.5 border-t border-navy-50">
          <span className="text-navy-300 flex items-center gap-1"><Battery size={10} /> Batería</span>
          <span className="text-navy-300">—</span>
        </div>
        <div className="flex justify-between items-center text-xs py-1.5 border-t border-navy-50">
          <span className="text-navy-300">Señal LoRa</span>
          <span className="text-navy-300">— dBm</span>
        </div>
        <div className="flex justify-between items-center text-xs py-1.5 border-t border-navy-50">
          <span className="text-navy-300 flex items-center gap-1"><Clock size={10} /> Últ. trama</span>
          <span className="text-navy-300">—</span>
        </div>
        <div className="flex justify-between items-center text-xs py-1.5 border-t border-navy-50">
          <span className="text-navy-300">Frecuencia</span>
          <span className="font-medium text-navy-500">{node.freq}</span>
        </div>
      </div>
    </div>
  )
}

const SUMMARY_CARDS = [
  { label: 'Nodos totales',   value: '10',     sub: '9 campo + 1 gateway', hex: '#534AB7', grad: 'from-[#534AB7] to-[#7b73d4]' },
  { label: 'Activos',         value: '0',      sub: 'Sin datos',            hex: '#10b981', grad: 'from-emerald-500 to-teal-400' },
  { label: 'Cobertura LoRa',  value: '>500 m', sub: 'Campo abierto',        hex: '#0c8ecc', grad: 'from-brand-500 to-brand-300'  },
  { label: 'Intervalo envío', value: '5 min',  sub: 'Configurado',          hex: '#BA7517', grad: 'from-[#BA7517] to-[#e8a042]'  },
]

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
        {SUMMARY_CARDS.map(item => (
          <div
            key={item.label}
            className="rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-px"
            style={{
              background: 'linear-gradient(150deg, #f8fafc, #fff 58%, #f0f4ff)',
              border: `1px solid ${ha(item.hex, 0.2)}`,
              boxShadow: `0 1px 3px rgba(0,0,0,0.05), 0 4px 14px ${ha(item.hex, 0.07)}`,
            }}
          >
            <div
              className={`h-[3px] bg-gradient-to-r ${item.grad}`}
              style={{ boxShadow: `0 0 8px 2px ${ha(item.hex, 0.5)}` }}
            />
            <div className="p-4">
              <p className="text-[11px] text-navy-300 mb-1 font-medium">{item.label}</p>
              <p
                className="text-2xl font-extrabold text-navy-900"
                style={{ textShadow: `0 0 20px ${ha(item.hex, 0.2)}` }}
              >
                {item.value}
              </p>
              <p className="text-[10px] text-navy-300 mt-0.5">{item.sub}</p>
            </div>
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
