import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const DialogContext = createContext(null)
let dialogIdCounter = 0

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null) // { type: 'alert' | 'confirm' | 'prompt', message, resolve }
  const [promptValue, setPromptValue] = useState('')
  const confirmRef = useRef(null)
  const cancelRef = useRef(null)
  const inputRef = useRef(null)
  const previouslyFocused = useRef(null)
  const descriptionId = useRef(`dialog-desc-${++dialogIdCounter}`)

  const alertUser = useCallback(message => {
    return new Promise(resolve => setDialog({ type: 'alert', message, resolve }))
  }, [])

  const confirmUser = useCallback(message => {
    return new Promise(resolve => setDialog({ type: 'confirm', message, resolve }))
  }, [])

  // Resolves with the entered string, or null if cancelled/dismissed.
  const promptUser = useCallback((message, defaultValue = '') => {
    setPromptValue(defaultValue)
    return new Promise(resolve => setDialog({ type: 'prompt', message, resolve }))
  }, [])

  function close(result) {
    if (dialog?.resolve) dialog.resolve(dialog.type === 'prompt' ? (result ? promptValue : null) : result)
    setDialog(null)
    previouslyFocused.current?.focus?.()
  }

  useEffect(() => {
    if (!dialog) return
    previouslyFocused.current = document.activeElement
    // Confirm dialogs default focus to Cancel (the safer, non-destructive choice).
    const target = dialog.type === 'prompt' ? inputRef.current : dialog.type === 'confirm' ? cancelRef.current : confirmRef.current
    target?.focus()
  }, [dialog])

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      close(false)
      return
    }
    // Minimal focus trap: at most two focusable elements (Cancel/Continue),
    // so Tab and Shift+Tab both just toggle between them — there's no
    // meaningful "direction" to preserve with only two stops.
    if (e.key === 'Tab') {
      const focusables = [cancelRef.current, confirmRef.current].filter(Boolean)
      if (focusables.length < 2) return
      e.preventDefault()
      const other = document.activeElement === focusables[0] ? focusables[1] : focusables[0]
      other?.focus()
    }
  }

  return (
    <DialogContext.Provider value={{ alertUser, confirmUser, promptUser }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="alertdialog"
          aria-modal="true"
          aria-describedby={descriptionId.current}
          onKeyDown={handleKeyDown}
        >
          <div className="w-full max-w-sm rounded-card border border-border bg-surface-1 p-5 shadow-xl">
            <p id={descriptionId.current} className="text-sm leading-relaxed whitespace-pre-line mb-3">{dialog.message}</p>
            {dialog.type === 'prompt' && (
              <input
                ref={inputRef}
                type="text"
                value={promptValue}
                onChange={e => setPromptValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') close(true) }}
                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2 mb-5"
              />
            )}
            {dialog.type !== 'prompt' && <div className="mb-2" />}
            <div className="flex justify-end gap-2">
              {dialog.type !== 'alert' && (
                <button
                  ref={cancelRef}
                  onClick={() => close(false)}
                  className="text-sm rounded-lg px-3.5 py-1.5 border border-border hover:bg-surface-2"
                >
                  Cancel
                </button>
              )}
              <button
                ref={confirmRef}
                onClick={() => close(true)}
                className="text-sm rounded-lg px-3.5 py-1.5 bg-brand text-white hover:bg-brand-dark"
              >
                {dialog.type === 'alert' ? 'OK' : 'Continue'}
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
