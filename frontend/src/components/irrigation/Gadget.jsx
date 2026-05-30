/* ─────────────────────────────────────────────────────────────────────────────
   Gadget.jsx — Three animated irrigation gadgets, aquantIAlab DNA.
   Shared props: { open:boolean, flow:number(L/min), leak:boolean, size:number }
   - PlantGadget  · una planta siendo regada (gotas + suelo que se humedece)
   - ValveGadget  · electroválvula de bola abriéndose (mecanismo + flujo)
   - PipeGadget   · tubería con flujo de agua animado
   Dispatcher: <Gadget metaphor="planta|valvula|tuberia" ... />
───────────────────────────────────────────────────────────────────────────── */
import { useRef, useMemo } from 'react'

const WATER = { hi: '#3fb6f0', mid: '#0c8ecc', deep: '#0b4f88' }
const LEAKC = { hi: '#ff7a6a', mid: '#ef4444', deep: '#b91c1c' }
const FLOWC = { hi: '#34d399', mid: '#10b981', deep: '#065f46' }

function pal(open, leak) { return leak ? LEAKC : open ? FLOWC : WATER }

/* ── 1 · PLANTA siendo regada ─────────────────────────────────────────────── */
export function PlantGadget({ open, flow = 0, leak = false, size = 200 }) {
  const id = useRef(`pl${Math.random().toString(36).slice(2, 7)}`).current
  const c = pal(open, leak)
  const moist = open && !leak ? 1 : leak ? 0.15 : 0.25
  const drops = useMemo(() => Array.from({ length: 9 }, (_, i) => ({
    x: 38 + (i * 15.5) % 124 + ((i % 3) - 1) * 4,
    delay: (i * 0.21).toFixed(2),
    dur: (1.05 + (i % 4) * 0.16).toFixed(2),
  })), [])

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4fbff" /><stop offset="100%" stopColor="#eaf5ff" />
        </linearGradient>
        <linearGradient id={`drop-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.hi} /><stop offset="100%" stopColor={c.mid} />
        </linearGradient>
        <linearGradient id={`leaf-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={open && !leak ? '#22c55e' : '#7ba88c'} />
          <stop offset="100%" stopColor={open && !leak ? '#15803d' : '#5e8a6f'} />
        </linearGradient>
        <clipPath id={`soil-${id}`}><path d="M14 138 h172 v40 a10 10 0 0 1 -10 10 H24 a10 10 0 0 1 -10 -10 Z" /></clipPath>
      </defs>
      <style>{`
        @keyframes fall-${id}{0%{transform:translateY(-26px);opacity:0}12%{opacity:1}82%{opacity:1}100%{transform:translateY(120px);opacity:0}}
        @keyframes sway-${id}{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
        @keyframes splash-${id}{0%,70%{opacity:0;transform:scale(.3)}82%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}
        .plant-${id}{transform-box:fill-box;transform-origin:50% 100%;${open ? `animation:sway-${id} 3.4s ease-in-out infinite` : ''}}
      `}</style>

      <rect x="6" y="6" width="188" height="188" rx="22" fill={`url(#sky-${id})`} stroke="rgba(12,142,204,.10)" />
      <circle cx="158" cy="44" r="15" fill={open && !leak ? '#fde68a' : '#e8eef4'} opacity={open && !leak ? '.9' : '.5'} />
      <circle cx="158" cy="44" r="22" fill="none" stroke={open && !leak ? '#fcd34d' : '#dde6ee'} strokeWidth="1.5" opacity=".4" />

      {open && drops.map((d, i) => (
        <g key={i} style={{ animation: `fall-${id} ${d.dur}s linear ${d.delay}s infinite` }}>
          <path d={`M ${d.x} 36 q -3.4 5 0 9 q 3.4 -4 0 -9 Z`} fill={`url(#drop-${id})`} />
        </g>
      ))}

      <g clipPath={`url(#soil-${id})`}>
        <rect x="14" y="138" width="172" height="60" fill="#c9aa7d" />
        <rect x="14" y={198 - moist * 60} width="172" height={moist * 60} fill={leak ? '#8a6d57' : '#6e5132'}
              style={{ transition: 'y .9s ease, height .9s ease' }} />
        {[28, 64, 96, 130, 168].map((x, i) => <circle key={i} cx={x} cy={150 + (i % 3) * 11} r="1.6" fill="#00000018" />)}
      </g>
      <path d="M14 138 h172 v40 a10 10 0 0 1 -10 10 H24 a10 10 0 0 1 -10 -10 Z" fill="none" stroke="rgba(0,0,0,.08)" />
      {open && !leak && <rect x="14" y="138" width="172" height="6" fill={c.hi} opacity=".35" />}

      {open && !leak && [54, 100, 146].map((x, i) => (
        <ellipse key={i} cx={x} cy="141" rx="7" ry="2.4" fill={c.hi}
                 style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `splash-${id} 1.3s ease-out ${i * 0.3 + 0.2}s infinite` }} />
      ))}

      <g className={`plant-${id}`}>
        <path d="M100 140 C 99 120 99 104 100 88" fill="none" stroke={open && !leak ? '#15803d' : '#6e8a78'} strokeWidth="4" strokeLinecap="round" />
        <path d="M100 116 C 80 110 70 96 72 82 C 88 84 99 98 100 116 Z" fill={`url(#leaf-${id})`} />
        <path d="M100 108 C 120 102 132 88 130 74 C 114 76 101 90 100 108 Z" fill={`url(#leaf-${id})`} />
        <path d="M100 100 C 86 92 82 78 86 66 C 97 72 102 86 100 100 Z" fill={`url(#leaf-${id})`} opacity=".95" />
        <path d="M100 90 C 95 80 96 70 100 62 C 104 70 105 80 100 90 Z" fill={open && !leak ? '#34d399' : '#9bbaa8'} />
        <circle cx="100" cy="60" r="3.4" fill={open && !leak ? '#fbbf24' : '#cdd9d1'} />
      </g>
    </svg>
  )
}

/* ── 2 · ELECTROVÁLVULA de bola abriéndose ─────────────────────────────────── */
export function ValveGadget({ open, flow = 0, leak = false, size = 200 }) {
  const id = useRef(`vv${Math.random().toString(36).slice(2, 7)}`).current
  const c = pal(open, leak)
  const dur = open ? Math.max(0.45, 1.5 - Math.min(flow, 12) / 11) : 1

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" /><stop offset="58%" stopColor="#ffffff" /><stop offset="100%" stopColor="#f0f4ff" />
        </linearGradient>
        <linearGradient id={`metal-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e7eef5" /><stop offset="50%" stopColor="#b8c6d6" /><stop offset="100%" stopColor="#8a9bad" />
        </linearGradient>
        <radialGradient id={`ball-${id}`} cx="38%" cy="34%" r="72%">
          <stop offset="0%" stopColor="#3b4a5e" /><stop offset="100%" stopColor="#0f1c2e" />
        </radialGradient>
        <linearGradient id={`wflow-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={c.hi} /><stop offset="100%" stopColor={c.mid} />
        </linearGradient>
        <clipPath id={`pipe-${id}`}><rect x="6" y="92" width="188" height="30" rx="6" /></clipPath>
      </defs>
      <style>{`
        @keyframes drift-${id}{from{transform:translateX(0)}to{transform:translateX(48px)}}
        .lever-${id}{transition:transform .7s cubic-bezier(.34,1.4,.5,1)}
        .ball-${id}{transition:transform .7s cubic-bezier(.34,1.3,.5,1)}
      `}</style>

      <rect x="6" y="6" width="188" height="188" rx="22" fill={`url(#bg-${id})`} stroke="rgba(12,142,204,.10)" />
      <rect x="6" y="92" width="188" height="30" rx="6" fill={`url(#metal-${id})`} stroke="#7c8da0" />
      <rect x="40" y="86" width="7" height="42" rx="2" fill="#9aabbd" />
      <rect x="153" y="86" width="7" height="42" rx="2" fill="#9aabbd" />

      <g clipPath={`url(#pipe-${id})`}>
        <rect x="6" y="92" width="188" height="30" fill={open ? `url(#wflow-${id})` : '#cdd8e4'} opacity={open ? '.92' : '.5'} style={{ transition: 'opacity .5s' }} />
        {open && (
          <g style={{ animation: `drift-${id} ${dur}s linear infinite` }}>
            {[-48, 0, 48, 96, 144, 192].map((x, i) => (
              <g key={i}>
                <ellipse cx={x + 18} cy="101" rx="9" ry="3.4" fill="#ffffff" opacity=".5" />
                <circle cx={x + 38} cy="111" r="2.4" fill="#ffffff" opacity=".6" />
              </g>
            ))}
          </g>
        )}
      </g>

      <circle cx="100" cy="107" r="40" fill={`url(#metal-${id})`} stroke="#6f8298" strokeWidth="1.5" />
      <circle cx="100" cy="107" r="40" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity=".5" />
      <g className={`ball-${id}`} style={{ transformBox: 'view-box', transformOrigin: '100px 107px', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
        <circle cx="100" cy="107" r="30" fill={`url(#ball-${id})`} />
        <rect x="86" y="74" width="28" height="66" rx="8" fill={open ? `url(#wflow-${id})` : '#0a1422'} />
        <rect x="86" y="74" width="28" height="66" rx="8" fill="none" stroke="#ffffff14" />
      </g>
      <circle cx="100" cy="107" r="7" fill="#cfdae6" stroke="#7c8da0" />

      <g className={`lever-${id}`} style={{ transformBox: 'view-box', transformOrigin: '100px 67px', transform: open ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
        <rect x="96" y="22" width="8" height="48" rx="4" fill={c.mid} />
        <circle cx="100" cy="24" r="8" fill={c.hi} stroke="#ffffff" strokeWidth="2" />
      </g>
      <circle cx="100" cy="67" r="5" fill="#9aabbd" stroke="#6f8298" />
      <circle cx="166" cy="40" r="7" fill={open ? (leak ? '#ef4444' : '#10b981') : '#cbd5e1'} />
      <circle cx="166" cy="40" r="7" fill="none" stroke="#ffffff" strokeWidth="2" />
    </svg>
  )
}

/* ── 3 · TUBERÍA con flujo ─────────────────────────────────────────────────── */
export function PipeGadget({ open, flow = 0, leak = false, size = 200 }) {
  const id = useRef(`pp${Math.random().toString(36).slice(2, 7)}`).current
  const c = pal(open, leak)
  const dur = open ? Math.max(0.5, 2.0 - Math.min(flow, 12) / 8) : 1
  const PATH = 'M 18 54 H 96 Q 120 54 120 78 V 146'
  const bubbles = useMemo(() => Array.from({ length: 6 }, (_, i) => ((i / 6).toFixed(3))), [])

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={`pbg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" /><stop offset="100%" stopColor="#eef3fb" />
        </linearGradient>
        <linearGradient id={`flowln-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c.hi} /><stop offset="100%" stopColor={c.deep} />
        </linearGradient>
      </defs>
      <style>{`
        @keyframes march-${id}{to{stroke-dashoffset:-44}}
        @keyframes p0-${id}{from{offset-distance:0%}to{offset-distance:100%}}
        @keyframes glow-${id}{0%,100%{opacity:.55}50%{opacity:1}}
      `}</style>

      <rect x="6" y="6" width="188" height="188" rx="22" fill={`url(#pbg-${id})`} stroke="rgba(12,142,204,.10)" />
      <circle cx="18" cy="54" r="11" fill="#cdd8e4" stroke="#9aabbd" strokeWidth="2" />
      <rect x="108" y="146" width="24" height="16" rx="4" fill="#cdd8e4" stroke="#9aabbd" strokeWidth="2" />

      <path d={PATH} fill="none" stroke="#aab8c8" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATH} fill="none" stroke="#eef3f9" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      <path d={PATH} fill="none" stroke={open ? `url(#flowln-${id})` : '#d3deea'} strokeWidth="16"
            strokeLinecap="round" strokeLinejoin="round" opacity={open ? '1' : '.6'} style={{ transition: 'opacity .5s' }} />
      {open && (
        <path d={PATH} fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round"
              strokeDasharray="3 18" opacity=".75"
              style={{ animation: `march-${id} ${dur}s linear infinite, glow-${id} 2s ease-in-out infinite` }} />
      )}
      {open && bubbles.map((b, i) => (
        <circle key={i} r={i % 2 ? 3 : 2.2} fill="#ffffff" opacity=".85"
                style={{ offsetPath: `path('${PATH}')`, animation: `p0-${id} ${dur}s linear ${(-b * dur).toFixed(2)}s infinite` }} />
      ))}

      <circle cx="120" cy="78" r="9" fill={open ? c.mid : '#cbd5e1'} stroke="#ffffff" strokeWidth="2" />
      <rect x="117" y="64" width="6" height="12" rx="3" fill={open ? c.deep : '#94a3b8'}
            style={{ transformBox: 'fill-box', transformOrigin: 'center bottom', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .6s' }} />

      <g transform="translate(132 28)">
        <rect x="0" y="0" width="54" height="26" rx="8" fill="#0a1628" />
        <text x="27" y="13" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="11" fontWeight="700"
              fill={open ? c.hi : '#475569'}>{open ? flow.toFixed(1) : '0.0'}</text>
        <text x="27" y="22" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="6" fill="#64748b" letterSpacing="1">L/MIN</text>
      </g>
    </svg>
  )
}

/* ── Dispatcher ──────────────────────────────────────────────────────────────── */
export default function Gadget({ metaphor = 'planta', ...p }) {
  if (metaphor === 'valvula') return <ValveGadget {...p} />
  if (metaphor === 'tuberia') return <PipeGadget {...p} />
  return <PlantGadget {...p} />
}
