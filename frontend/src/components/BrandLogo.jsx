const SIZES = {
  sm: {
    icon: 26,
    title: 'text-sm',
    subtitle: 'text-[10px]',
    gap: 'gap-2',
  },
  md: {
    icon: 34,
    title: 'text-base',
    subtitle: 'text-xs',
    gap: 'gap-2.5',
  },
  lg: {
    icon: 54,
    title: 'text-2xl',
    subtitle: 'text-sm',
    gap: 'gap-3',
  },
}

function DropletMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 88" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="dropFill" x1="10" y1="8" x2="60" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#77D6FF" />
          <stop offset="0.55" stopColor="#189AE2" />
          <stop offset="1" stopColor="#0B4FAF" />
        </linearGradient>
        <linearGradient id="dropStroke" x1="20" y1="6" x2="56" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DFF6FF" stopOpacity="0.95" />
          <stop offset="1" stopColor="#E8FBFF" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      <path
        d="M36 4C36 4 10 32 10 52c0 18.778 11.64 30 26 30s26-11.222 26-30C62 32 36 4 36 4Z"
        fill="url(#dropFill)"
      />
      <path
        d="M36 4C36 4 10 32 10 52c0 18.778 11.64 30 26 30s26-11.222 26-30C62 32 36 4 36 4Z"
        stroke="url(#dropStroke)"
        strokeWidth="2"
      />

      <path
        d="M24 19c-6 7-12 18-12 28 0 8 3.4 14.9 9.1 19.4"
        stroke="rgba(255,255,255,0.42)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <ellipse cx="28" cy="28" rx="9" ry="12" fill="rgba(255,255,255,0.22)" />
      <circle cx="49" cy="46" r="4.3" fill="rgba(255,255,255,0.95)" />

      <g stroke="rgba(255,255,255,0.78)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M35 16v14" />
        <path d="M42 21v10" />
        <path d="M28 24v8" />
        <path d="M35 31h9" />
        <path d="M28 32h7" />
        <path d="M31 39v8" />
        <path d="M39 35v7" />
        <path d="M31 47h11" />
      </g>
      <g fill="#EFFFFF">
        <circle cx="35" cy="16" r="1.7" />
        <circle cx="42" cy="21" r="1.7" />
        <circle cx="28" cy="24" r="1.7" />
        <circle cx="44" cy="31" r="1.7" />
        <circle cx="42" cy="47" r="1.7" />
      </g>
    </svg>
  )
}

export default function BrandLogo({
  size = 'md',
  stacked = false,
  dark = false,
  showSubtitle = true,
  showText = true,
  className = '',
}) {
  const cfg = SIZES[size] || SIZES.md
  const titleColor = dark ? 'text-white' : 'text-navy-900'
  const subColor = dark ? 'text-navy-300' : 'text-navy-400'

  return (
    <div className={`flex ${stacked ? 'flex-col' : 'items-center'} ${cfg.gap} ${className}`}>
      <div className="shrink-0">
        <DropletMark size={cfg.icon} />
      </div>

      {showText && (
        <div className={stacked ? 'text-center' : 'min-w-0'}>
          <div className={`font-bold leading-none tracking-tight ${cfg.title} ${titleColor}`}>
            <span>aquant</span>
            <span className="text-sky-500">IA</span>
            <span>lab</span>
          </div>
          {showSubtitle && (
            <p className={`mt-0.5 ${cfg.subtitle} ${subColor}`}>
              Estación meteorológica
            </p>
          )}
        </div>
      )}
    </div>
  )
}
