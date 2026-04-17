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

function formatMetricValue(value) {
  return value != null ? Number(value).toFixed(1) : '—'
}

export default function StatCard({ title, value, unit, icon: Icon, color = 'teal', subtitle, min, max, items }) {
  const t = THEMES[color] ?? THEMES.teal
  const groupedItems = Array.isArray(items) && items.length > 0
    ? items
    : [{ label: title, value, unit, subtitle, min, max }]

  return (
    <div className={`bg-white rounded-2xl border ${t.border} shadow-sm overflow-hidden`}>
      <div className={`h-1 bg-gradient-to-r ${t.gradient}`} />

      <div className="p-4 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className={`${t.soft} ${t.text} p-1 rounded-lg flex items-center justify-center`} style={{ boxShadow: '0 1px 4px 0 rgba(0,0,0,0.03)' }}>
            <Icon size={13} />
          </div>
          <h3 className="text-[13px] font-bold text-navy-700 uppercase tracking-wider leading-none">{title}</h3>
        </div>

        <div className="space-y-2.5">
          {groupedItems.map((item, index) => {
            const hasRange = item.min != null && item.max != null

            return (
              <div
                key={`${title}-${item.label ?? index}`}
                className={index > 0 ? 'pt-2.5 border-t border-navy-50' : ''}
              >
                {groupedItems.length > 1 && (
                  <p className="text-[11px] font-semibold text-navy-300 uppercase tracking-wide mb-1.5">
                    {item.label}
                  </p>
                )}

                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`${groupedItems.length > 1 ? 'text-xl' : 'text-2xl'} font-extrabold text-navy-900 leading-none tracking-tight`}> 
                      {formatMetricValue(item.value)}
                    </p>
                    <p className="text-xs font-medium text-navy-300 mt-0.5">{item.unit}</p>
                  </div>

                  {item.subtitle && (
                    <span className={`text-xs font-bold ${t.text} ${t.soft} px-2 py-1 rounded-lg`}>
                      {item.subtitle}
                    </span>
                  )}
                </div>

                {hasRange && (
                  <div className="mt-2 flex justify-between text-xs text-navy-300">
                    <span>Min <strong className="text-navy-500">{Number(item.min).toFixed(1)}</strong></span>
                    <span>Max <strong className="text-navy-500">{Number(item.max).toFixed(1)}</strong></span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
