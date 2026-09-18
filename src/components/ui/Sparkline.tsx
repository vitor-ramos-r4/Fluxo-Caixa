import { cn } from '@/lib/cn'

/**
 * Traço de tendência minimalista — sem eixos, sem grade, sem tooltip.
 * É um complemento ao número (que já carrega o valor real), não a fonte
 * primária da informação.
 */
export function Sparkline({
  data,
  width = 100,
  height = 22,
  color = 'var(--color-ink-400)',
  strokeWidth = 1.75,
  className,
}: {
  data: number[]
  width?: number
  height?: number
  color?: string
  strokeWidth?: number
  className?: string
}) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = width / (data.length - 1)
  const pad = strokeWidth

  const points = data
    .map((point, index) => {
      const x = index * step
      const y = pad + (1 - (point - min) / span) * (height - pad * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
