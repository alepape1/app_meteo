const THEMES = {
  // Aquantia corporate palette
  teal:   { gradient: 'from-brand-500 to-brand-300',          soft: 'bg-brand-50',   text: 'text-brand-500',   border: 'border-brand-100' },
  navy:   { gradient: 'from-navy-900 to-navy-500',            soft: 'bg-navy-50',    text: 'text-navy-900',    border: 'border-navy-100' },
  amber:  { gradient: 'from-[#BA7517] to-[#e8a042]',          soft: 'bg-[#FAEEDA]',  text: 'text-[#BA7517]',   border: 'border-[#FAC775]' },
  orange: { gradient: 'from-[#c4730a] to-[#f0a844]',          soft: 'bg-[#fff3e0]',  text: 'text-[#c4730a]',   border: 'border-[#ffd89b]' },
  purple: { gradient: 'from-[#534AB7] to-[#7b73d4]',          soft: 'bg-[#EEEDFE]',  text: 'text-[#534AB7]',   border: 'border-[#c5c2ef]' },
  green:  { gradient: 'from-emerald-500 to-teal-400',         soft: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
  // Legacy aliases
  red:    { gradient: 'from-[#BA7517] to-[#e8a042]',          soft: 'bg-[#FAEEDA]',  text: 'text-[#BA7517]',   border: 'border-[#FAC775]' },
  blue:   { gradient: 'from-brand-500 to-brand-300',          soft: 'bg-brand-50',   text: 'text-brand-500',   border: 'border-brand-100' },
  cyan:   { gradient: 'from-brand-500 to-brand-300',          soft: 'bg-brand-50',   text: 'text-brand-500',   border: 'border-brand-100' },
}

export default function StatCard({ title, value, unit, icon: Icon, color = 'teal', subtitle, min, max }) {
  const t = THEMES[color] ?? THEMES.teal
  const display = value != null ? Number(value).toFixed(1) : '—'

  return (
    <div className={`bg-white rounded-2xl border ${t.border} shadow-sm overflow-hidden`}>
      {/* Gradient top bar */}
      <div className={`h-1 bg-gradient-to-r ${t.gradient}`} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-semibold text-navy-300 uppercase tracking-widest leading-none">{title}</p>
          <div className={`${t.soft} ${t.text} p-1.5 rounded-lg`}>
            <Icon size={15} />
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-navy-900 leading-none tracking-tight">
              {display}
            </p>
            <p className="text-sm font-medium text-navy-300 mt-1">{unit}</p>
          </div>
          {subtitle && (
            <span className={`text-xs font-bold ${t.text} ${t.soft} px-2 py-1 rounded-lg`}>
              {subtitle}
            </span>
          )}
        </div>

        {min != null && max != null && (
          <div className="mt-3 pt-3 border-t border-navy-50 flex justify-between text-xs text-navy-300">
            <span>Min <strong className="text-navy-500">{Number(min).toFixed(1)}</strong></span>
            <span>Max <strong className="text-navy-500">{Number(max).toFixed(1)}</strong></span>
          </div>
        )}
      </div>
    </div>
  )
}
