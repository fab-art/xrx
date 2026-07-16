'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSessionStore } from '@/store/session-store';
import {
  listSessions, exportSessionJSON, parseSessionJSON, getSession,
} from '@/lib/rssb/sessionApi';
import { saveSession } from '@/lib/rssb/sessionApi';
import type { SessionMeta } from '@/lib/rssb/types';
import {
  History, Trash2, Download, Upload, RotateCcw, FileSpreadsheet,
  CheckCircle2, ShieldAlert, GitCompareArrows, Plus, Search, Loader2,
  Pencil, Check, X, Copy, Clock, BarChart3, ArrowUpDown, Merge,
  Archive, FolderOpen,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { renameSession } from '@/lib/rssb/sessionApi';
import { ConfirmDialog } from './ConfirmDialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type SortOption = 'updated' | 'name-asc' | 'name-desc' | 'most-vouchers' | 'least-vouchers' | 'most-verified' | 'most-fraud';

function sortSessions(sessions: SessionMeta[], sort: SortOption): SessionMeta[] {
  const sorted = [...sessions];
  switch (sort) {
    case 'name-asc':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'most-vouchers':
      sorted.sort((a, b) => b.voucherCount - a.voucherCount);
      break;
    case 'least-vouchers':
      sorted.sort((a, b) => a.voucherCount - b.voucherCount);
      break;
    case 'most-verified':
      sorted.sort((a, b) => b.verifiedCount - a.verifiedCount);
      break;
    case 'most-fraud':
      sorted.sort((a, b) => b.fraudCount - a.fraudCount);
      break;
    case 'updated':
    default:
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      break;
  }
  return sorted;
}

function getHealthColor(s: SessionMeta): string {
  if (s.voucherCount === 0) return 'bg-muted';
  const pct = s.verifiedCount / s.voucherCount;
  if (pct > 0.8 || s.stage === 'counter') return 'bg-primary';
  if (pct >= 0.2 && pct <= 0.8) return 'bg-gold';
  if (pct < 0.2 && s.fraudCount > 0 && s.stage !== 'counter') return 'bg-danger';
  // Fallback: treat as gray if no specific condition met
  return 'bg-muted';
}

function getHealthBorderColor(s: SessionMeta): string {
  if (s.voucherCount === 0) return 'border-l-muted-foreground/40';
  const pct = s.verifiedCount / s.voucherCount;
  if (pct > 0.8 || s.stage === 'counter') return 'border-l-primary';
  if (pct >= 0.2 && pct <= 0.8) return 'border-l-gold';
  if (pct < 0.2 && s.fraudCount > 0 && s.stage !== 'counter') return 'border-l-danger';
  return 'border-l-muted-foreground/40';
}

function getHealthLabel(s: SessionMeta): string {
  if (s.voucherCount === 0) return 'Empty session';
  const pct = s.verifiedCount / s.voucherCount;
  if (pct > 0.8 || s.stage === 'counter') return 'Healthy — mostly verified or workflow complete';
  if (pct >= 0.2 && pct <= 0.8) return 'In progress — partially verified';
  if (pct < 0.2 && s.fraudCount > 0 && s.stage !== 'counter') return 'At risk — low verification, fraud detected';
  return 'In progress';
}

export function SessionsDashboard() {
  const { toast } = useToast();
  const refreshSessions = useSessionStore(s => s.refreshSessions);
  const sessionsList = useSessionStore(s => s.sessionsList);
  const loadSession = useSessionStore(s => s.loadSession);
  const removeSession = useSessionStore(s => s.removeSession);
  const startNewSession = useSessionStore(s => s.startNewSession);
  const setStage = useSessionStore(s => s.setStage);
  const loadingSession = useSessionStore(s => s.loadingSession);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('updated');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const filtered = useMemo(() => {
    const base = sessionsList.filter(s =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.fileName.toLowerCase().includes(search.toLowerCase()) ||
      s.pharmacyName.toLowerCase().includes(search.toLowerCase()),
    );
    return sortSessions(base, sort);
  }, [sessionsList, search, sort]);

  // Aggregate statistics across all sessions
  const aggregateStats = useMemo(() => {
    const totalSessions = sessionsList.length;
    const totalVouchers = sessionsList.reduce((sum, s) => sum + s.voucherCount, 0);
    const totalVerified = sessionsList.reduce((sum, s) => sum + s.verifiedCount, 0);
    const totalFraud = sessionsList.reduce((sum, s) => sum + s.fraudCount, 0);
    return { totalSessions, totalVouchers, totalVerified, totalFraud };
  }, [sessionsList]);

  const targetSession = deleteTarget
    ? sessionsList.find(s => s.id === deleteTarget) || null
    : null;

  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selectedIds.has(s.id));
  const someFilteredSelected = filtered.some(s => selectedIds.has(s.id)) && !allFilteredSelected;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      // Deselect all filtered
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (const s of filtered) {
          next.delete(s.id);
        }
        return next;
      });
    } else {
      // Select all filtered
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (const s of filtered) {
          next.add(s.id);
        }
        return next;
      });
    }
  }, [allFilteredSelected, filtered]);

  async function handleReload(id: string) {
    setBusy(id);
    try {
      await loadSession(id);
      toast({ title: 'Session loaded', description: 'You can now continue your work.' });
      setStage('summary');
    } catch (e) {
      toast({ title: 'Failed to load', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    setBusy(id);
    try {
      await removeSession(id);
      toast({ title: 'Session deleted', description: `"${name}" was removed and its memory cleared.` });
      setDeleteTarget(null);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (e) {
      toast({ title: 'Failed to delete', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function handleExport(id: string) {
    setBusy(id);
    try {
      const { meta, state } = await getSession(id);
      exportSessionJSON(meta, state);
      toast({ title: 'Session exported', description: `Downloaded "${meta.name}.json"` });
    } catch (e) {
      toast({ title: 'Failed to export', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { meta, state } = parseSessionJSON(text);
      const saved = await saveSession(null, meta?.name || file.name.replace(/\.json$/i, ''), state);
      await refreshSessions();
      toast({ title: 'Session imported', description: `"${saved.name}" is now available.` });
    } catch (e) {
      toast({ title: 'Invalid session file', description: (e as Error).message, variant: 'destructive' });
    } finally {
      e.target.value = '';
    }
  }

  function handleNew() {
    startNewSession('');
    setStage('upload');
  }

  function startRename(s: SessionMeta) {
    setEditingId(s.id);
    setEditName(s.name);
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    setBusy(id);
    try {
      await renameSession(id, name);
      await refreshSessions();
      toast({ title: 'Session renamed', description: `Renamed to "${name}"` });
      setEditingId(null);
    } catch (e) {
      toast({ title: 'Failed to rename', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDuplicate(s: SessionMeta) {
    setBusy(s.id);
    try {
      const { state } = await getSession(s.id);
      const saved = await saveSession(null, `${s.name} (copy)`, state);
      await refreshSessions();
      toast({ title: 'Session duplicated', description: `Created "${saved.name}"` });
    } catch (e) {
      toast({ title: 'Failed to duplicate', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function handleExportAll() {
    setBulkBusy(true);
    try {
      const allData = [];
      for (const s of sessionsList) {
        const { meta, state } = await getSession(s.id);
        allData.push({ meta, state, exportedAt: new Date().toISOString(), appVersion: '2.0' });
      }
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all-sessions-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'All sessions exported', description: `${sessionsList.length} session(s) downloaded.` });
    } catch (e) {
      toast({ title: 'Failed to export', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      let deleted = 0;
      for (const id of ids) {
        try {
          await removeSession(id);
          deleted++;
        } catch {
          // skip individual failures
        }
      }
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      toast({ title: 'Sessions deleted', description: `${deleted} session(s) removed.` });
    } catch (e) {
      toast({ title: 'Bulk delete failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkExport() {
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const s = sessionsList.find(x => x.id === id);
        if (s) {
          const { meta, state } = await getSession(id);
          exportSessionJSON(meta, state);
          // Small delay to prevent browser blocking multiple downloads
          await new Promise(r => setTimeout(r, 200));
        }
      }
      toast({ title: 'Sessions exported', description: `${ids.length} session(s) downloaded.` });
    } catch (e) {
      toast({ title: 'Bulk export failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkMerge() {
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const sessionsData: Array<{ meta: SessionMeta; state: ReturnType<typeof parseSessionJSON>['state'] }> = [];
      for (const id of ids) {
        const s = sessionsList.find(x => x.id === id);
        if (s) {
          const { meta, state } = await getSession(id);
          sessionsData.push({ meta, state });
        }
      }

      if (sessionsData.length === 0) {
        toast({ title: 'No sessions to merge', description: 'Select at least 2 sessions to merge.', variant: 'destructive' });
        setBulkBusy(false);
        return;
      }

      // Combine cards from all sessions
      const mergedCards = sessionsData.flatMap((d, idx) =>
        (d.state.cards || []).map(c => ({ ...c, id: c.id + idx * 100000 })),
      );
      const firstState = sessionsData[0].state;
      const mergedState = {
        ...firstState,
        cards: mergedCards,
        stage: 'summary' as const,
        fileName: sessionsData.map(d => d.meta.fileName).filter(Boolean).join(', '),
        auditLog: sessionsData.flatMap(d => d.state.auditLog || []),
      };

      const mergedName = `Merged (${sessionsData.length} sessions)`;
      const saved = await saveSession(null, mergedName, mergedState);
      await refreshSessions();
      setSelectedIds(new Set());
      toast({
        title: 'Sessions merged',
        description: `Created "${saved.name}" with ${mergedCards.length} vouchers from ${sessionsData.length} sessions.`,
      });
    } catch (e) {
      toast({ title: 'Merge failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBulkBusy(false);
    }
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="max-w-6xl mx-auto relative">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              Sessions
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Every pharmacy you work on is saved automatically as a session. Reload a session to continue,
              delete one to clear its memory, or export/import sessions to move work between machines.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm border border-border rounded-lg px-4 py-2.5 bg-card hover:bg-accent cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              Import
              <input type="file" accept=".json" onChange={handleImport} className="sr-only" />
            </label>
            <button
              onClick={handleExportAll}
              disabled={bulkBusy || sessionsList.length === 0}
              className="inline-flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 border border-border bg-card hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Archive className="w-4 h-4" />
              Export all
            </button>
            <button
              onClick={handleNew}
              className="group relative inline-flex items-center gap-2 text-sm rounded-lg px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors overflow-hidden"
            >
              <span className="absolute inset-0 rounded-lg border-2 border-primary/50 group-hover:border-primary-foreground/40 animate-pulse transition-colors pointer-events-none" />
              <Plus className="w-4 h-4 relative z-10" />
              <span className="relative z-10">New session</span>
            </button>
          </div>
        </div>
      </div>

      {/* Aggregate Statistics Banner */}
      <div className="flex flex-wrap gap-3 mb-4">
        <AggregateStat icon={<History className="w-4 h-4 text-primary" />} label="Total Sessions" value={aggregateStats.totalSessions} gradient="from-primary/5 to-primary/10" />
        <AggregateStat icon={<FileSpreadsheet className="w-4 h-4 text-primary" />} label="Total Vouchers" value={aggregateStats.totalVouchers} gradient="from-primary/5 to-primary/10" />
        <AggregateStat icon={<CheckCircle2 className="w-4 h-4 text-primary" />} label="Total Verified" value={aggregateStats.totalVerified} gradient="from-primary/5 to-primary/10" />
        <AggregateStat icon={<ShieldAlert className="w-4 h-4 text-danger" />} label="Total Fraud" value={aggregateStats.totalFraud} gradient="from-danger/5 to-danger/10" />
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-md min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search sessions by name, file, or pharmacy…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-card"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Sort by:</span>
          <Select value={sort} onValueChange={v => setSort(v as SortOption)}>
            <SelectTrigger className="w-[180px] text-xs h-9">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Last Updated</SelectItem>
              <SelectItem value="name-asc">Name A–Z</SelectItem>
              <SelectItem value="name-desc">Name Z–A</SelectItem>
              <SelectItem value="most-vouchers">Most Vouchers</SelectItem>
              <SelectItem value="least-vouchers">Least Vouchers</SelectItem>
              <SelectItem value="most-verified">Most Verified</SelectItem>
              <SelectItem value="most-fraud">Most Fraud</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Select:</span>
            <Checkbox
              checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all sessions"
            />
            <button
              onClick={toggleSelectAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {allFilteredSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        )}
        <span className="text-xs text-muted-foreground">{filtered.length} session(s)</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-20 text-center empty-state">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <FolderOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            {sessionsList.length === 0
              ? 'No saved sessions yet'
              : 'No sessions match your search'}
          </p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {sessionsList.length === 0
              ? 'Upload a pharmacy file to create your first session. Sessions are saved automatically as you work.'
              : 'Try adjusting your search terms or clearing the filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => {
            const isSelected = selectedIds.has(s.id);
            const healthColor = getHealthColor(s);
            const healthLabel = getHealthLabel(s);
            const verifiedPct = s.voucherCount > 0 ? Math.round((s.verifiedCount / s.voucherCount) * 100) : 0;
            return (
              <div
                key={s.id}
                className={`rounded-xl border-l-4 border bg-card p-4 flex flex-col gap-3 card-lift hover:shadow-md transition-colors duration-200 group/card ${isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'} ${getHealthBorderColor(s)}`}
              >
                <div className="flex items-start gap-2">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(s.id)}
                      aria-label={`Select ${s.name}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {editingId === s.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRename(s.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="flex-1 min-w-0 text-sm font-semibold border border-primary rounded-lg px-2 py-1 bg-card"
                            />
                            <button onClick={() => handleRename(s.id)} disabled={busy === s.id} className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-accent">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold truncate group-hover/card:text-primary transition-colors" title={s.name}>{s.name}</h3>
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthColor}`}
                              title={healthLabel}
                            />
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                          <FileSpreadsheet className="w-3 h-3" />
                          {s.fileName || '—'}
                        </p>
                      </div>
                      {editingId !== s.id && (
                        <span className="text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded uppercase tracking-wide">
                          {s.stage}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {s.pharmacyName && (
                  <p className="text-xs text-muted-foreground truncate ml-7" title={s.pharmacyName}>
                    {s.pharmacyName}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs ml-7">
                  <Stat icon={<FileSpreadsheet className="w-3 h-3" />} label="Vouchers" value={s.voucherCount} />
                  <Stat icon={<CheckCircle2 className="w-3 h-3 text-primary" />} label="Verified" value={s.verifiedCount} />
                  <Stat icon={<ShieldAlert className="w-3 h-3 text-danger" />} label="Fraud" value={s.fraudCount} />
                  <Stat icon={<GitCompareArrows className="w-3 h-3 text-gold" />} label="Matched" value={s.matchCount} />
                </div>

                {/* Session progress bar — verified / total ratio */}
                {s.voucherCount > 0 && (
                  <div className="ml-7">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary progress-animate transition-all duration-300"
                          style={{ width: `${verifiedPct}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                        {verifiedPct}% verified
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1.5">
                      <Clock className="w-3 h-3" />
                      Last worked on {relativeTime(s.updatedAt)}
                    </p>
                  </div>
                )}

                {s.voucherCount === 0 && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 ml-7">
                    <Clock className="w-3 h-3" />
                    {relativeTime(s.updatedAt)}
                  </p>
                )}

                <div className="flex items-center gap-1.5 pt-2 border-t border-border mt-1 ml-7">
                  <button
                    onClick={() => handleReload(s.id)}
                    disabled={busy === s.id || loadingSession}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Reload
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
                    {editingId !== s.id && (
                      <button
                        onClick={() => startRename(s)}
                        disabled={busy === s.id}
                        title="Rename session"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDuplicate(s)}
                      disabled={busy === s.id}
                      title="Duplicate session"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleExport(s.id)}
                      disabled={busy === s.id}
                      title="Export session as JSON"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(s.id)}
                      disabled={busy === s.id}
                      title="Delete session (clears memory)"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border text-danger hover:bg-danger-light hover:border-danger transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Single-session delete dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete session?"
        description={`This will permanently delete "${targetSession?.name}" and clear its memory. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            void handleDelete(deleteTarget, targetSession?.name || '');
          }
        }}
      />

      {/* Bulk delete dialog */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete selected sessions?"
        description={`This will permanently delete ${selectedCount} session(s) and clear their memory. This cannot be undone.`}
        confirmLabel="Delete all"
        variant="danger"
        onConfirm={() => void handleBulkDelete()}
      />

      {/* Floating bulk action bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card shadow-lg px-4 py-3 backdrop-blur-sm">
            <span className="text-sm font-medium tabular-nums mr-2">{selectedCount} selected</span>
            <button
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete ({selectedCount})
            </button>
            <button
              onClick={() => void handleBulkExport()}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border border-border bg-card hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export ({selectedCount})
            </button>
            {selectedCount >= 2 && (
              <button
                onClick={() => void handleBulkMerge()}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                <Merge className="w-3.5 h-3.5" />
                Merge ({selectedCount})
              </button>
            )}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-accent transition-colors ml-1"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2 py-1.5">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium ml-auto">{value.toLocaleString()}</span>
    </div>
  );
}

function AggregateStat({ icon, label, value, gradient }: { icon: React.ReactNode; label: string; value: number; gradient: string }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border border-border bg-gradient-to-br ${gradient} px-4 py-2.5 min-w-[140px]`}>
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground font-medium leading-tight">{label}</p>
        <p className="text-base font-bold tabular-nums leading-tight">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
