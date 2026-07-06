import { TABS } from '../config'

export default function Sidebar({ stage, setStage, lastSaved, theme, setTheme, onReset }) {
  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-border bg-surface-1 p-4 gap-1 sticky top-0 h-screen">
      <div className="flex items-center gap-2 mb-1">
        <img src="/logo.png" alt="RSSB" className="w-9 h-9 shrink-0" />
        <h1 className="text-sm font-semibold tracking-tight leading-tight">RSSB Counter<br />Verification System</h1>
      </div>
      <p className="text-xs text-ink-muted mb-4">Claims verification &amp; fraud review</p>
      <nav className="flex flex-col gap-1">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStage(key)}
            aria-current={stage === key ? 'page' : undefined}
            className={`text-sm text-left rounded-lg px-3 py-2 transition-colors ${
              stage === key ? 'bg-brand text-white font-medium' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        {lastSaved && <span className="text-xs text-ink-muted">Saved {lastSaved.toLocaleTimeString()}</span>}
        <button onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface-1 hover:bg-surface-2 flex items-center justify-between">
          <span>{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>
          <span>{theme === 'light' ? '☀️' : '🌙'}</span>
        </button>
        <button onClick={onReset} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface-1 hover:bg-surface-2">
          New file
        </button>
      </div>
    </aside>
  )
}
