const COLORS = {
  red:    { bg: 'bg-red-50',    icon: 'bg-red-100',   text: 'text-red-600',   border: 'border-red-200' },
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100',  text: 'text-blue-600',  border: 'border-blue-200' },
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
  cyan:   { bg: 'bg-cyan-50',   icon: 'bg-cyan-100',  text: 'text-cyan-600',  border: 'border-cyan-200' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100',text: 'text-purple-600',border: 'border-purple-200' },
}

export default function StatCard({ title, value, unit, icon: Icon, color = 'blue', subtitle }) {
  const c = COLORS[color]
  const display = value != null ? Number(value).toFixed(1) : '—'

  return (
    <div className={`bg-white rounded-2xl border ${c.border} p-5 flex items-center gap-4 shadow-sm`}>
      <div className={`${c.icon} ${c.text} p-3 rounded-xl`}>
        <Icon size={24} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider truncate">{title}</p>
        <p className="text-2xl font-bold text-slate-800 leading-tight">
          {display}
          <span className="text-sm font-medium text-slate-400 ml-1">{unit}</span>
        </p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}
