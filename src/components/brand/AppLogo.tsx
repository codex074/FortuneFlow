import { useId } from 'react'

type AppLogoProps = {
  className?: string
  title?: string
}

export function AppLogo({ className = '', title = 'FortuneFlow' }: AppLogoProps) {
  const bgId = useId()
  const flowId = useId()

  return (
    <svg
      className={`app-logo ${className}`.trim()}
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${title} logo`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={bgId} x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6D6AF2" />
          <stop offset="0.52" stopColor="#5856D6" />
          <stop offset="1" stopColor="#0D9488" />
        </linearGradient>
        <linearGradient id={flowId} x1="12" y1="33" x2="36" y2="15" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D1FAE5" />
          <stop offset="1" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="42" height="42" rx="13" fill={`url(#${bgId})`} />
      <path
        d="M13 31.5C17.2 31.5 18.6 25.8 22.4 25.8C25.2 25.8 26.1 29 29.1 29C33.1 29 34.7 21.4 38 17.5"
        fill="none"
        stroke={`url(#${flowId})`}
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M30.5 17.5H38V25"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="17" r="4.4" fill="#FEF3C7" />
      <circle cx="15" cy="17" r="2" fill="#D97706" />
    </svg>
  )
}
