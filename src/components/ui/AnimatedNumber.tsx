import { useEffect, useRef, useState } from 'react'

/**
 * Anima a transição entre valores numéricos, formatando cada quadro com a
 * mesma função usada no valor final — evita "pular" para zero ao atualizar
 * um KPI que já estava com um número na tela.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 700,
}: {
  value: number
  format: (value: number) => string
  duration?: number
}) {
  const [display, setDisplay] = useState(value)
  const previous = useRef(value)

  useEffect(() => {
    const from = previous.current
    const to = value
    previous.current = value
    if (from === to) return

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    if (reduceMotion) {
      setDisplay(to)
      return
    }

    const start = performance.now()
    let frame: number

    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(from + (to - from) * eased)
      if (progress < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <>{format(display)}</>
}
