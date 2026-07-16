'use client';

import { useSessionStore } from '@/store/session-store';
import { FIELD_DEFS } from '@/lib/rssb/config';
import { cleanCards, summarizeChanges } from '@/lib/rssb/dataCleaning';
import { dispensingDateHint } from '@/lib/rssb/dataCleaning';
import { Sparkles, ArrowRight, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';

export function MapView() {
  const headers = useSessionStore(s => s.headers);
  const mapping = useSessionStore(s => s.mapping);
  const setMapping = useSessionStore(s => s.setMapping);
  const cards = useSessionStore(s => s.cards);
  const setCards = useSessionStore(s => s.setCards);
  const fileName = useSessionStore(s => s.fileName);
  const autoDetected = useSessionStore(s => s.autoDetected);
  const setAutoDetected = useSessionStore(s => s.setAutoDetected);
  const setCleaningReport = useSessionStore(s => s.setCleaningReport);
  const setStage = useSessionStore(s => s.setStage);

  function updateMapping(fieldKey: string, header: string) {
    setMapping({ ...mapping, [fieldKey]: header });
  }

  function backfillPrescriptionDateHints(cardsList: typeof cards, mappingToUse: typeof mapping) {
    const dispensingHeader = mappingToUse.dispensing_date;
    if (!dispensingHeader) return cardsList;
    return cardsList.map(c => {
      if (c.prescriptionDate) return c;
      const hint = dispensingDateHint(c.row, dispensingHeader);
      return hint ? { ...c, prescriptionDate: hint } : c;
    });
  }

  function runCleaning() {
    const { cleanedCards, changes } = cleanCards(cards, mapping);
    setCards(backfillPrescriptionDateHints(cleanedCards, mapping));
    setCleaningReport(changes);
    setStage('clean');
  }

  function skipCleaning() {
    setCards(backfillPrescriptionDateHints(cards, mapping));
    setStage('verify');
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 max-w-2xl">
      <div className={`rounded-lg px-3.5 py-2.5 mb-4 text-sm flex items-center justify-between gap-3 ${
        autoDetected > 0 ? 'bg-primary/10 text-primary' : 'bg-warn-light text-warn-dark'
      }`}>
        <span className="flex items-center gap-2">
          {autoDetected > 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {autoDetected > 0
            ? `Auto-detected ${autoDetected} of ${FIELD_DEFS.length} fields from "${fileName}".`
            : `Couldn't auto-detect any fields from "${fileName}" — please map manually below.`}
        </span>
        <span className="text-xs opacity-80 shrink-0">{headers.length} columns found</span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Confirm or adjust the mapping below — any guess that looks wrong can be changed.
      </p>
      <div className="flex flex-col gap-3 mb-6 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
        {FIELD_DEFS.map(f => {
          const mapped = !!mapping[f.key];
          return (
            <div key={f.key} className="flex items-center justify-between gap-4">
              <label htmlFor={`map-${f.key}`} className="text-sm min-w-[200px] flex items-center gap-2">
                {mapped && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                {f.label}
              </label>
              <select
                id={`map-${f.key}`}
                value={mapping[f.key] || ''}
                onChange={e => updateMapping(f.key, e.target.value)}
                className="flex-1 max-w-xs border border-border rounded-lg px-2.5 py-1.5 text-sm bg-muted"
              >
                <option value="">— not mapped —</option>
                {headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={runCleaning}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg px-4 py-2 hover:bg-primary/90 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Clean &amp; normalize data
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={skipCleaning}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Skip cleaning, go straight to verification
        </button>
      </div>
    </div>
  );
}

export function CleanView() {
  const cards = useSessionStore(s => s.cards);
  const mapping = useSessionStore(s => s.mapping);
  const cleaningReport = useSessionStore(s => s.cleaningReport);
  const setCards = useSessionStore(s => s.setCards);
  const setCleaningReport = useSessionStore(s => s.setCleaningReport);
  const setStage = useSessionStore(s => s.setStage);

  const summary = cleaningReport ? summarizeChanges(cleaningReport, FIELD_DEFS) : null;

  function undoCleaning() {
    setCards(cards.map(c => (c.rawRow ? { ...c, row: c.rawRow, rawRow: null, cleaned: false } : c)));
    setCleaningReport(null);
  }

  return (
    <div className="max-w-4xl">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-5">
        <h2 className="text-base font-medium mb-2 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Data cleaning &amp; normalization
        </h2>
        <p className="text-sm text-muted-foreground">
          Every mapped column was run through a type-specific normalizer: dates to a single
          <code className="mx-1 px-1 rounded bg-muted text-xs">YYYY-MM-DD</code>
          format, amounts to plain numbers, names to trimmed title case, sex to a single-letter code, and
          RAMA/affiliation numbers to the same stripped format used for hospital matching. Nothing is deleted —
          the original value for every cell that changed is kept and can be restored.
        </p>
      </div>

      {!cleaningReport && (
        <p className="text-sm text-muted-foreground">No cleaning has been run yet for this file.</p>
      )}

      {cleaningReport && summary && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl border border-border bg-card px-3.5 py-2.5">
              <div className="text-[11px] text-muted-foreground">Values normalized</div>
              <div className="text-lg font-medium">{summary.totalChanges}</div>
            </div>
            <div className={`rounded-xl border px-3.5 py-2.5 ${summary.ambiguousCount > 0 ? 'border-warn bg-warn-light text-warn-dark' : 'border-border bg-card'}`}>
              <div className="text-[11px] opacity-80">Ambiguous dates (best guess)</div>
              <div className="text-lg font-medium">{summary.ambiguousCount}</div>
            </div>
            <div className={`rounded-xl border px-3.5 py-2.5 ${summary.unparsedCount > 0 ? 'border-danger bg-danger-light text-danger-dark' : 'border-border bg-card'}`}>
              <div className="text-[11px] opacity-80">Couldn&apos;t parse (left as-is)</div>
              <div className="text-lg font-medium">{summary.unparsedCount}</div>
            </div>
          </div>

          {summary.byField.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 mb-5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">By field</h3>
              <div className="flex flex-col gap-2">
                {summary.byField.map(f => (
                  <div key={f.field} className="flex items-center justify-between text-sm">
                    <span>{f.label} <span className="text-muted-foreground">({f.type})</span></span>
                    <span className="text-muted-foreground">
                      {f.changed} normalized
                      {f.ambiguous > 0 && <span className="text-warn-dark"> · {f.ambiguous} ambiguous</span>}
                      {f.unparsed > 0 && <span className="text-danger-dark"> · {f.unparsed} unparsed</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cleaningReport.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden mb-5 max-h-96 overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm bg-card">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="text-xs text-muted-foreground text-left border-b border-border">
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Original</th>
                    <th className="px-3 py-2 font-medium">Normalized</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {cleaningReport.slice(0, 200).map((c, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">{FIELD_DEFS.find(f => f.key === c.field)?.label || c.field}</td>
                      <td className="px-3 py-2 text-muted-foreground">{String(c.original)}</td>
                      <td className="px-3 py-2">{c.unparsed ? <span className="text-danger-dark">left as-is</span> : String(c.cleaned)}</td>
                      <td className="px-3 py-2">
                        {c.ambiguous && <span className="text-xs px-1.5 py-0.5 rounded bg-warn-light text-warn-dark">best guess</span>}
                        {c.unparsed && <span className="text-xs px-1.5 py-0.5 rounded bg-danger-light text-danger-dark">unparsed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cleaningReport.length > 200 && (
                <div className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                  Showing the first 200 of {cleaningReport.length} changes.
                </div>
              )}
            </div>
          )}

          {cleaningReport.length === 0 && (
            <p className="text-sm text-muted-foreground mb-5">Every mapped value was already in a clean, consistent format — nothing needed changing.</p>
          )}
        </>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setStage('verify')}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg px-4 py-2 hover:bg-primary/90 transition-colors"
        >
          Looks good, continue to verification
          <ArrowRight className="w-4 h-4" />
        </button>
        {cleaningReport && cleaningReport.length > 0 && (
          <button
            onClick={undoCleaning}
            className="inline-flex items-center gap-2 text-sm border border-border rounded-lg px-3.5 py-2 hover:bg-accent transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Revert to original values
          </button>
        )}
        <button
          onClick={() => setStage('summary')}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Back to summary
        </button>
      </div>
    </div>
  );
}
