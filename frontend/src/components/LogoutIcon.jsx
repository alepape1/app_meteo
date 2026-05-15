export default function LogoutIcon({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M10 4H7.8C6.81 4 6 4.81 6 5.8v12.4c0 .99.81 1.8 1.8 1.8H10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 8l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 12h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="3.5"
        width="7"
        height="17"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.35"
      />
    </svg>
  )
}
