import { createContext, useCallback, useContext, useState } from 'react'

const DialogContext = createContext(null)

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null) // { type: 'alert' | 'confirm', message, resolve }

  const alertUser = useCallback(message => {
    return new Promise(resolve => setDialog({ type: 'alert', message, resolve }))
  }, [])

  const confirmUser = useCallback(message => {
    return new Promise(resolve => setDialog({ type: 'confirm', message, resolve }))
  }, [])

  function close(result) {
    if (dialog?.resolve) dialog.resolve(result)
    setDialog(null)
  }

  return (
    <DialogContext.Provider value={{ alertUser, confirmUser }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="alertdialog"
          aria-modal="true"
          onKeyDown={e => {
            if (e.key === 'Escape') close(false)
            if (e.key === 'Enter') close(true)
          }}
        >
          <div className="w-full max-w-sm rounded-card border border-border bg-surface-1 p-5 shadow-xl">
            <p className="text-sm leading-relaxed whitespace-pre-line mb-5">{dialog.message}</p>
            <div className="flex justify-end gap-2">
              {dialog.type === 'confirm' && (
                <button
                  autoFocus
                  onClick={() => close(false)}
                  className="text-sm rounded-lg px-3.5 py-1.5 border border-border hover:bg-surface-2"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => close(true)}
                className="text-sm rounded-lg px-3.5 py-1.5 bg-brand text-white hover:bg-brand-dark"
              >
                {dialog.type === 'confirm' ? 'Continue' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used within a DialogProvider')
  return ctx
}
