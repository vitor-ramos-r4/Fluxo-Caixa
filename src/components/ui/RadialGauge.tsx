import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

type GaugeTone = 'brand' | 'negative' | 'caution' | 'info' | 'neutral'

const TONE_COLOR: Record<GaugeTone, string> = {
  brand: 'var(--color-brand-500)',
  negative: 'var(--color-negative)',
  caution: 'var(--color-caution)',
  info: 'var(--color-info)',
  neutral: 'var(--color-ink-400)',
}

/**
 * Anel de progresso — para métricas percentuais isoladas (margem, meta
 * atingida). Sem glow, sem gradiente: só o traço na cor semântica do dado.
 *
 * `value` controla o preenchimento do anel (0–`max`); `valueLabel` é o texto
 * central e pode mostrar algo diferente do percentual bruto (ex.: negativo).
 */
export function RadialGauge({
  value,
  max = 100,
  size = 64,
  strokeWidth = 6,
  tone = 'brand',
  valueLabel,
  label,
  className,
}: {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  tone?: GaugeTone
  valueLabel?: string
  label?: string
  className?: string
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const offset = circumference * (1 - (mounted ? ratio : 0))
  const color = TONE_COLOR[tone]
  const fontSize = Math.max(10, Math.round(size * 0.26))

  return (
    <div className={cn('inline-flex flex-col items-center gap-1.5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-ink-200)"
            strokeWidth={strokeWidth}
          />
          <circle
            className="gauge-ring"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-semibold tabular tracking-tight"
            style={{ color, fontSize }}
          >
            {valueLabel ?? `${Math.round(value)}%`}
          </span>
        </div>
      </div>
      {label && (
        <p className="max-w-[10ch] text-center text-[11px] leading-3.5 text-ink-500">
          {label}
        </p>
      )}
    </div>
  )
}
