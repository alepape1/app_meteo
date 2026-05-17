// hex #RRGGBB → rgba(r,g,b,alpha)
function ha(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

const THEMES = {
  teal:   { grad: 'from-brand-500 to-brand-300',    hex: '#0c8ecc' },
  navy:   { grad: 'from-[#001530] to-[#3d506a]',    hex: '#1a3350' },
  amber:  { grad: 'from-[#BA7517] to-[#e8a042]',    hex: '#BA7517' },
  orange: { grad: 'from-[#c4730a] to-[#f0a844]',    hex: '#c4730a' },
  purple: { grad: 'from-[#534AB7] to-[#7b73d4]',    hex: '#534AB7' },
  green:  { grad: 'from-emerald-500 to-teal-400',   hex: '#10b981' },
  // legacy aliases
  red:    { grad: 'from-[#BA7517] to-[#e8a042]',    hex: '#BA7517' },
  blue:   { grad: 'from-brand-500 to-brand-300',    hex: '#0c8ecc' },
  cyan:   { grad: 'from-brand-500 to-brand-300',    hex: '#0c8ecc' },
}

function fmt(v) { return v != null ? Number(v).toFixed(1) : '—' }

function MetricColumn({ item, accent, single }) {
  const hasRange = item.min != null && item.max != null
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1">
      {/* Label */}
      {item.label && (
        <p
          className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] leading-none"
          style={{ color: ha(accent, 0.75) }}
        >
          {item.label}
        </p>
      )}

      {/* Value + unit */}
      <div className="flex items-baseline gap-1 flex-wrap">
        <span
          className={`font-extrabold leading-none tabular-nums tracking-tight ${single ? 'text-[2rem]' : 'text-[1.55rem]'}`}
          style={{ color: '#0f172a', textShadow: `0 0 20px ${ha(accent, 0.22)}` }}
        >
          {fmt(item.value)}
        </span>
        <span className="text-[11px] font-semibold text-navy-300">{item.unit}</span>
      </div>

      {/* Source badge */}
      {item.subtitle && (
        <span
          className="self-start text-[9px] font-bold px-1.5 py-[2px] rounded-md leading-none"
          style={{
            background: ha(accent, 0.1),
            color: accent,
            border: `1px solid ${ha(accent, 0.22)}`,
          }}
        >
          {item.subtitle}
        </span>
      )}

      {/* Min / Max */}
      {hasRange && (
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex items-center gap-0.5 text-[10px] tabular-nums">
            <span className="font-bold" style={{ color: ha(accent, 0.5) }}>↓</span>
            <span className="font-semibold text-navy-400">{fmt(item.min)}</span>
          </span>
          <span className="flex items-center gap-0.5 text-[10px] tabular-nums">
            <span className="font-bold" style={{ color: ha(accent, 0.5) }}>↑</span>
            <span className="font-semibold text-navy-400">{fmt(item.max)}</span>
          </span>
        </div>
      )}
    </div>
  )
}

export default function StatCard({ title, value, unit, icon: Icon, color = 'teal', subtitle, min, max, items }) {
  const t = THEMES[color] ?? THEMES.teal
  const accent = t.hex

  const cols = Array.isArray(items) && items.length > 0
    ? items
    : [{ label: null, value, unit, subtitle, min, max }]

  const single = cols.length === 1

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-px"
      style={{
        background: 'linear-gradient(150deg, #f8fafc, #fff 58%, #f0f4ff)',
        border: `1px solid ${ha(accent, 0.2)}`,
        boxShadow: `0 1px 3px rgba(0,0,0,0.05), 0 4px 14px ${ha(accent, 0.07)}`,
      }}
    >
      {/* Accent bar */}
      <div
        className={`h-[3px] bg-gradient-to-r ${t.grad}`}
        style={{ boxShadow: `0 0 8px 2px ${ha(accent, 0.5)}` }}
      />

      {/* Header with colour wash */}
      <div
        className="px-3.5 pt-3 pb-2.5 flex items-center gap-2.5"
        style={{ background: `linear-gradient(to bottom, ${ha(accent, 0.055)}, transparent)` }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${ha(accent, 0.2)}, ${ha(accent, 0.07)})`,
            border: `1px solid ${ha(accent, 0.28)}`,
            boxShadow: `0 2px 8px ${ha(accent, 0.22)}, 0 0 0 3px ${ha(accent, 0.06)}`,
          }}
        >
          <Icon size={15} style={{ color: accent, filter: `drop-shadow(0 0 4px ${ha(accent, 0.5)})` }} />
        </div>
        <h3 className="text-[11.5px] font-extrabold uppercase tracking-widest text-navy-600 leading-none">
          {title}
        </h3>
      </div>

      {/* Metrics */}
      <div className="px-3.5 pb-3.5">
        {single ? (
          <MetricColumn item={cols[0]} accent={accent} single />
        ) : (
          <div className="flex">
            {cols.map((item, i) => (
              <div
                key={i}
                className={`flex-1 ${i > 0 ? 'pl-3' : 'pr-3'}`}
                style={i > 0 ? { borderLeft: `1px solid ${ha(accent, 0.14)}` } : undefined}
              >
                <MetricColumn item={item} accent={accent} single={false} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
