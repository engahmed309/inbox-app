import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = { success: CheckCircle2, error: XCircle, info: Info }
const STYLES = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-surface-2 text-fg border border-surface-3',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const toast = {
    success: (msg, duration) => showToast(msg, 'success', duration),
    error: (msg, duration) => showToast(msg, 'error', duration),
    info: (msg, duration) => showToast(msg, 'info', duration),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 inset-x-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(t => {
          const Icon = ICONS[t.type] || Info
          return (
            <div key={t.id}
              className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl text-sm max-w-sm w-full sm:w-auto ${STYLES[t.type] || STYLES.info}`}>
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="flex-shrink-0 opacity-70 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
