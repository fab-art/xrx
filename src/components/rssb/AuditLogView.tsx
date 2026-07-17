import { useMemo, useState } from 'react';
import { useSessionStore } from '@/store/session-store';
import { useCardHelpers } from './use-card-helpers';
import { AUDIT_ACTION_LABELS } from '@/lib/rssb/config';
import type { AuditAction, AuditLogEntry } from '@/lib/rssb/types';
import {
  ScrollText, Search, Download, Trash2, Filter, ChevronDown, ChevronUp,
  CheckCircle2, ShieldAlert, FileText, GitCompareArrows, Sparkles, Eraser,
  AlertTriangle, Clock,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from './ConfirmDialog';

// Group audit actions into categories for the filter UI.
const ACTION_GROUPS: Array<{ label: string; actions: AuditAction[]; tone: string }> = [
  { label: 'Verification', actions: ['verify', 'unverify', 'bulk_verify', 'bulk_unverify'], tone: 'text-primary' },
  { label: 'Fraud & flags', actions: ['flag_fraud', 'unflag_fraud', 'flag_pharma', 'unflag_pharma', 'flag_rssb', 'unflag_rssb'], tone: 'text-danger-dark' },
  { label: 'Edits', actions: ['set_deduction', 'set_prescription_date', 'set_facility', 'set_comment', 'set_explanation'], tone: 'text-warn-dark' },
  { label: 'Matching', actions: ['override_match', 'set_match_note'], tone: 'text-gold-dark' },
  { label: 'Cleaning', actions: ['run_cleaning', 'undo_cleaning'], tone: 'text-foreground' },
];

const ALL_ACTIONS: AuditAction[] = ACTION_GROUPS.flatMap(g => g.actions);

function iconFor(action: AuditAction) {
  if (action === 'verify' || action === 'bulk_verify') return <CheckCircle2 className="w-3.5 h-3.5 text-primary" />;
  if (action === 'unverify' || action === 'bulk_unverify') return <Eraser className="w-3.5 h-3.5 text-muted-foreground" />;
  if (action.startsWith('flag_fraud') || action.startsWith('unflag_fraud')) return <ShieldAlert className="w-3.5 h-3.5 text-danger" />;
  if (action.startsWith('flag_') || action.startsWith('unflag_')) return <ShieldAlert className="w-3.5 h-3.5 text-warn-dark" />;
  if (action === 'override_match' || action === 'set_match_note') return <GitCompareArrows className="w-3.5 h-3.5 text-gold-dark" />;
  if (action === 'run_cleaning' || action === 'undo_cleaning') return <Sparkles className="w-3.5 h-3.5 text-primary" />;
  return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function AuditLogView() {
  const auditLog = useSessionStore(s => s.auditLog);
  const cards = useSessionStore(s => s.cards);
  const clearAuditLog = useSessionStore(s => s.clearAuditLog);
  const setStage = useSessionStore(s => s.setStage);
  const helpers = useCardHelpers();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [activeActions, setActiveActions] = useState<Set<AuditAction>>(new Set());
  const [sortDesc, setSortDesc] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Build a quick lookup of card id → voucher # + patient name for display.
  const cardMeta = useMemo(() => {
    const m = new Map<number, { voucher: string; patient: string }>();
    for (const c of cards) {
      m.set(c.id, {
        voucher: String(helpers.voucherOf(c) || `#${c.id + 1}`),
        patient: String(helpers.mappedValue(c, 'patient_name') || `Record ${c.id + 1}`),
      });
    }
    return m;
  }, [cards, helpers]);

  const filtered = useMemo(() => {
    let list = auditLog;
    if (activeActions.size > 0) {
      list = list.filter(e => activeActions.has(e.action));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => {
        const label = AUDIT_ACTION_LABELS[e.action].toLowerCase();
        const detail = (e.detail || '').toLowerCase();
        const meta = e.cardId !== undefined ? cardMeta.get(e.cardId) : undefined;
        const patient = meta?.patient.toLowerCase() || '';
        const voucher = meta?.voucher.toLowerCase() || '';
        return label.includes(q) || detail.includes(q) || patient.includes(q) || voucher.includes(q);
      });
    }
    const sorted = [...list].sort((a, b) => sortDesc ? b.ts - a.ts : a.ts - b.ts);
    return sorted;
  }, [auditLog, activeActions, search, sortDesc, cardMeta]);

  // Summary counts per group
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of ACTION_GROUPS) counts[g.label] = 0;
    for (const e of auditLog) {
      for (const g of ACTION_GROUPS) {
        if (g.actions.includes(e.action)) { counts[g.label]++; break; }
      }
    }
    return counts;
  }, [auditLog]);

  function toggleAction(a: AuditAction) {
    setActiveActions(prev => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  }

  function toggleGroup(label: string) {
    const group = ACTION_GROUPS.find(g => g.label === label)!;
    const allActive = group.actions.every(a => activeActions.has(a));
    setActiveActions(prev => {
      const next = new Set(prev);
      if (allActive) group.actions.forEach(a => next.delete(a));
      else group.actions.forEach(a => next.add(a));
      return next;
    });
  }

  function exportCSV() {
    if (filtered.length === 0) {
      toast({ title: 'Nothing to export', description: 'The audit log is empty or filtered to zero entries.', variant: 'destructive' });
      return;
    }
    const rows = [
      ['Timestamp', 'Date', 'Action', 'Label', 'Voucher #', 'Patient', 'Detail', 'Before', 'After'],
      ...filtered.map(e => {
        const meta = e.cardId !== undefined ? cardMeta.get(e.cardId) : undefined;
        return [
          new Date(e.ts).toISOString(),
          new Date(e.ts).toLocaleString(),
          e.action,
          AUDIT_ACTION_LABELS[e.action],
          meta?.voucher || (e.cardIds ? `${e.cardIds.length} vouchers` : ''),
          meta?.patient || '',
          (e.detail || '').replace(/"/g, '""'),
          (e.before || '').replace(/"/g, '""'),
          (e.after || '').replace(/"/g, '""'),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c)}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Audit log exported', description: `${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'} exported as CSV.` });
  }

  // Empty state
  if (auditLog.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            Audit Log
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Every verification action — marking vouchers verified, flagging fraud, applying deductions,
            overriding match categories — is recorded here with a timestamp for compliance and audit trails.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-card empty-state py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Clock className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-sm font-semibold text-foreground">No actions recorded yet</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Start verifying vouchers, flagging fraud, or applying deductions — each action will appear here automatically with a timestamp.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStage('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors btn-press"
          >
            <ScrollText className="w-3.5 h-3.5" />
            Verify a voucher
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" />
              Audit Log
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Every verification action is recorded here with a timestamp for compliance and audit trails.
              {auditLog.length} entr{auditLog.length === 1 ? 'y' : 'ies'} recorded.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-2 bg-card hover:bg-accent transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 text-sm border border-border text-danger hover:bg-danger-light hover:border-danger rounded-lg px-3 py-2 bg-card transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear log
            </button>
          </div>
        </div>

        {/* Summary by group */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
          {ACTION_GROUPS.map(g => (
            <button
              key={g.label}
              onClick={() => toggleGroup(g.label)}
              className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                g.actions.some(a => activeActions.has(a))
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/30 hover:bg-muted/60'
              }`}
            >
              <div className={`text-xs font-medium ${g.tone}`}>{g.label}</div>
              <div className="text-lg font-semibold tabular-nums">{groupCounts[g.label] || 0}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Filter + search row */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search by action, detail, voucher, or patient…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card"
          />
        </div>
        <button
          onClick={() => setSortDesc(d => !d)}
          className="inline-flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-2 bg-card hover:bg-accent transition-colors"
          title={sortDesc ? 'Newest first' : 'Oldest first'}
        >
          {sortDesc ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          {sortDesc ? 'Newest' : 'Oldest'}
        </button>
        {(activeActions.size > 0 || search) && (
          <button
            onClick={() => { setActiveActions(new Set()); setSearch(''); }}
            className="inline-flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-2 bg-card hover:bg-accent transition-colors"
          >
            <Filter className="w-4 h-4" />
            Clear filters
          </button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Showing {filtered.length} of {auditLog.length}
        </span>
      </div>

      {/* Action-type chips (collapsible) */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {ALL_ACTIONS.map(a => (
          <button
            key={a}
            onClick={() => toggleAction(a)}
            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
              activeActions.has(a)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            {AUDIT_ACTION_LABELS[a]}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card empty-state py-16">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Filter className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="text-center max-w-sm">
            <h3 className="text-sm font-semibold text-foreground">No entries match your filters</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Try clearing the action filters or search query to see more audit log entries.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setActiveActions(new Set()); setSearch(''); }}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors btn-press"
          >
            <Filter className="w-3.5 h-3.5" />
            Clear filters
          </button>
        </div>
      ) : (
        <ol className="relative border-l border-border ml-3 space-y-1">
          {filtered.slice(0, 200).map(e => {
            const meta = e.cardId !== undefined ? cardMeta.get(e.cardId) : undefined;
            const isExpanded = expanded === e.id;
            return (
              <li key={e.id} className="pl-4 py-2.5 relative">
                {/* Timeline dot */}
                <span className="absolute -left-[7px] top-3.5 w-3 h-3 rounded-full bg-card border-2 border-primary" />
                <button
                  onClick={() => setExpanded(isExpanded ? null : e.id)}
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="mt-0.5 shrink-0">{iconFor(e.action)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{AUDIT_ACTION_LABELS[e.action]}</span>
                          {meta && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                              #{meta.voucher}
                            </span>
                          )}
                          {e.cardIds && e.cardIds.length > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                              {e.cardIds.length} vouchers
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.detail}</p>
                        {meta && isExpanded && (
                          <p className="text-xs text-muted-foreground mt-1">Patient: {meta.patient}</p>
                        )}
                        {isExpanded && (e.before !== undefined || e.after !== undefined) && (
                          <div className="text-xs mt-1 flex items-center gap-2">
                            {e.before !== undefined && (
                              <span className="text-muted-foreground">Before: <span className="font-mono">{e.before || '∅'}</span></span>
                            )}
                            {e.before !== undefined && e.after !== undefined && <span className="text-muted-foreground">→</span>}
                            {e.after !== undefined && (
                              <span className="text-primary">After: <span className="font-mono">{e.after || '∅'}</span></span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {new Date(e.ts).toLocaleTimeString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{timeAgo(e.ts)}</div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
          {filtered.length > 200 && (
            <li className="pl-4 py-3 text-center text-xs text-muted-foreground">
              Showing first 200 of {filtered.length} entries. Export CSV to see all.
            </li>
          )}
        </ol>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear audit log?"
        description={`This will permanently delete all ${auditLog.length} audit log entries from this session. This cannot be undone. Consider exporting the log as CSV first.`}
        confirmLabel="Clear log"
        variant="danger"
        onConfirm={() => {
          clearAuditLog();
          setConfirmClear(false);
          toast({ title: 'Audit log cleared', description: 'All entries have been removed.' });
        }}
      />
    </div>
  );
}
