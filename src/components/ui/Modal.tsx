import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

/**
 * Diálogo modal acessível.
 *
 * Usa `<dialog>` nativo quando disponível para herdar foco preso, tecla Esc e
 * o backdrop do próprio navegador — menos código e mais correto que
 * reimplementar isso à mão.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-ink-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'relative z-10 my-auto w-full bg-white rounded-xl shadow-pop',
          'animate-rise',
          SIZES[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-ink-200">
          <div className="min-w-0">
            <h2
              id="modal-title"
              className="text-base font-semibold text-ink-900 leading-6"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fechar"
            className="-mt-1 -mr-1 shrink-0"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-ink-200 bg-ink-50 rounded-b-xl">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
