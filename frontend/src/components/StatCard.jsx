const THEMES = {
  red:    { gradient: 'from-red-500 to-orange-400',    soft: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-100' },
  blue:   { gradient: 'from-blue-500 to-cyan-400',     soft: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-100' },
  green:  { gradient: 'from-emerald-500 to-teal-400',  soft: 'bg-emerald-50',text: 'text-emerald-600',border: 'border-emerald-100' },
  cyan:   { gradient: 'from-cyan-500 to-sky-400',      soft: 'bg-cyan-50',   text: 'text-cyan-600',   border: 'border-cyan-100' },
  purple: { gradient: 'from-violet-500 to-purple-400', soft: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100' },
  orange: { gradient: 'from-orange-500 to-amber-400',  soft: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100' },
}

export default function StatCard({ title, value, unit, icon: Icon, color = 'blue', subtitle, min, max }) {
  const t = THEMES[color]
  const display = value != null ? Number(value).toFixed(1) : '—'

  return (
    <div className={`bg-white rounded-2xl border ${t.border} shadow-sm overflow-hidden`}>
      {/* Gradient top bar */}
      <div className={`h-1 bg-gradient-to-r ${t.gradient}`} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest leading-none">{title}</p>
          <div className={`${t.soft} ${t.text} p-1.5 rounded-lg`}>
            <Icon size={15} />
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-slate-800 leading-none tracking-tight">
              {display}
            </p>
            <p className="text-sm font-medium text-slate-400 mt-1">{unit}</p>
          </div>
          {subtitle && (
            <span className={`text-xs font-bold ${t.text} ${t.soft} px-2 py-1 rounded-lg`}>
              {subtitle}
            </span>
          )}
        </div>

        {min != null && max != null && (
          <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between text-xs text-slate-400">
            <span>Min <strong className="text-slate-600">{Number(min).toFixed(1)}</strong></span>
            <span>Max <strong className="text-slate-600">{Number(max).toFixed(1)}</strong></span>
          </div>
        )}
      </div>
    </div>
  )
}
