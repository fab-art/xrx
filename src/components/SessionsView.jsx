import { useRef } from 'react'

export default function SessionsView({
  sessions, loading, activeSessionId,
  onReload, onDelete, onExport, onImportFile, onSaveCurrent, canSaveCurrent
}) {
  const importInputRef = useRef(null)

  return (
    <div>
      <p className="text-sm text-ink-muted mb-4 max-w-3xl">
        Every pharmacy's work can be saved here as its own session — mapping, cleaning, verification
        progress, hospital matches, and everything else on screen. Save the current work, then reload
        any saved session to pick up exactly where you left off, export one to a file to archive or hand
        off, or delete old ones to free up space on this device.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button
          onClick={onSaveCurrent}
          disabled={!canSaveCurrent}
          className="text-sm rounded-lg px-3.5 py-2 bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save current work as a session
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={e => {
            const file = e.target.files[0]
            if (file) onImportFile(file)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => importInputRef.current?.click()}
          className="text-sm rounded-lg px-3.5 py-2 border border-border bg-surface-1 hover:bg-surface-2 transition-colors"
        >
          Import a session file
        </button>
        {!canSaveCurrent && (
          <span className="text-xs text-ink-muted">Load a file first to be able to save it as a session.</span>
        )}
      </div>

      {loading && <p className="text-sm text-ink-muted">Loading saved sessions…</p>}

      {!loading && sessions.length === 0 && (
        <div className="rounded-card border border-dashed border-border bg-surface-1 p-6 text-sm text-ink-muted text-center">
          No saved sessions yet. Once you save your current work, it'll show up here.
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-sm bg-surface-1">
            <thead>
              <tr className="text-xs text-ink-muted text-left">
                <th className="px-3 py-2 font-medium">Session</th>
                <th className="px-3 py-2 font-medium">Source file</th>
                <th className="px-3 py-2 font-medium">Saved</th>
                <th className="px-3 py-2 font-medium">Vouchers</th>
                <th className="px-3 py-2 font-medium">Progress</th>
                <th className="px-3 py-2 font-medium">Fraud flagged</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className={`border-t border-border align-top ${activeSessionId === s.id ? 'bg-brand-light/30' : ''}`}>
                  <td className="px-3 py-2 font-medium">
                    {s.name}
                    {activeSessionId === s.id && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-brand-light text-brand-dark">current</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{s.fileName || '—'}</td>
                  <td className="px-3 py-2 text-ink-muted">{s.savedAt ? new Date(s.savedAt).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2">{s.stats?.total ?? '—'}</td>
                  <td className="px-3 py-2">
                    {typeof s.stats?.progressPct === 'number' ? (
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                          <div className="h-full bg-brand" style={{ width: `${s.stats.progressPct}%` }} />
                        </div>
                        <span className="text-xs text-ink-muted shrink-0">{s.stats.progressPct}%</span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {s.stats?.fraudFlagged > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger-dark">{s.stats.fraudFlagged}</span>
                    ) : (s.stats?.fraudFlagged ?? 0)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => onReload(s.id)} className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-surface-2">
                        Reload
                      </button>
                      <button onClick={() => onExport(s.id)} className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-surface-2">
                        Export
                      </button>
                      <button
                        onClick={() => onDelete(s.id, s.name)}
                        className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-danger-light hover:text-danger-dark hover:border-danger"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
