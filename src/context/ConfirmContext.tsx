import { AlertTriangle, Trash2 } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '../components/ui/Button'

export type ConfirmVariant = 'danger' | 'warning' | 'default'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

const variantConfig: Record<
  ConfirmVariant,
  { icon: typeof Trash2; iconBg: string; iconColor: string; button: 'danger' | 'primary' }
> = {
  danger: {
    icon: Trash2,
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-400',
    button: 'danger',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-300',
    button: 'primary',
  },
  default: {
    icon: AlertTriangle,
    iconBg: 'bg-wa-green/15',
    iconColor: 'text-wa-green',
    button: 'primary',
  },
}

function ConfirmModal({
  state,
  onClose,
}: {
  state: ConfirmState
  onClose: (result: boolean) => void
}) {
  const cfg = variantConfig[state.variant ?? 'danger']
  const Icon = cfg.icon

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={() => onClose(false)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="relative w-full max-w-md animate-[dialog-in_0.2s_ease-out] overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl shadow-black/50"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-wa-green/40 to-transparent" />
        <div className="p-6">
          <div className="flex gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${cfg.iconBg}`}
            >
              <Icon className={`h-6 w-6 ${cfg.iconColor}`} />
            </div>
            <div className="min-w-0 pt-0.5">
              <h2
                id="confirm-title"
                className="text-lg font-semibold tracking-tight text-text"
              >
                {state.title}
              </h2>
              <p
                id="confirm-message"
                className="mt-2 text-sm leading-relaxed text-muted"
              >
                {state.message}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => onClose(false)}>
              {state.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={cfg.button}
              onClick={() => onClose(true)}
            >
              {state.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve })
    })
  }, [])

  const close = useCallback((result: boolean) => {
    setState((prev) => {
      prev?.resolve(result)
      return null
    })
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state && <ConfirmModal state={state} onClose={close} />}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx.confirm
}
