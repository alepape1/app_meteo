import aquantiaLogo from '../assets/aquantia_logo.png'

const SIZES = {
  sm: {
    logo: 'w-[42px]',
    text: 'text-lg',
    gap: 'gap-1.5',
  },
  md: {
    logo: 'w-[54px]',
    text: 'text-2xl',
    gap: 'gap-2',
  },
  lg: {
    logo: 'w-[72px]',
    text: 'text-4xl',
    gap: 'gap-2.5',
  },
}

export default function BrandLogo({
  size = 'md',
  dark = false,
  showText = true,
  className = '',
}) {
  const cfg = SIZES[size] || SIZES.md
  const textColor = dark ? 'text-white' : 'text-navy-900'

  return (
    <div className={`flex items-end ${cfg.gap} ${className}`}>
      <img
        src={aquantiaLogo}
        alt="AquantIAlab"
        className={`h-auto ${cfg.logo} shrink-0 object-contain`}
      />

      {showText && (
        <div className={`pb-0.5 font-bold leading-none tracking-tight ${cfg.text} ${textColor}`}>
          <span>Aquant</span>
          <span className="text-sky-400">IA</span>
          <span>lab</span>
        </div>
      )}
    </div>
  )
}
