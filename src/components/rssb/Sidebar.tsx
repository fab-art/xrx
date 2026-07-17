import { useMemo, useState, useCallback, useRef } from 'react';
import { TABS } from '@/lib/rssb/config';
import { useSessionStore } from '@/store/session-store';
import { useTheme } from './theme-provider';
import type { Stage } from '@/lib/rssb/types';
import {
  Moon, Sun, FilePlus2, Save, History, LayoutDashboard, Map as MapIcon,
  Sparkles, CheckCircle2, Table2, Building2, GitCompareArrows,
  Share2, ShieldAlert, FileSpreadsheet, BarChart3, Loader2, ScrollText, Search, GitCompare, NotepadText, ChevronDown, type LucideIcon,
} from 'lucide-react';
import { ProgressRing } from './ProgressRing';
import { RssbLogo } from './RssbLogo';

const ICONS: Record<Stage, LucideIcon> = {
  sessions: History,
  summary: LayoutDashboard,
  map: MapIcon,
  clean: Sparkles,
  verify: CheckCircle2,
  dashboard: Table2,
  analytics: BarChart3,
  hospital: Building2,
  match: GitCompareArrows,
  network: Share2,
  fraud: ShieldAlert,
  counter: FileSpreadsheet,
  audit: ScrollText,
  compare: GitCompare,
  landing: History,
  upload: FilePlus2,
};

export function Sidebar() {
  const stage = useSessionStore(s => s.stage);
  const setStage = useSessionStore(s => s.setStage);
  const lastSaved = useSessionStore(s => s.lastSaved);
  const isSaving = useSessionStore(s => s.isSaving);
  const sessionName = useSessionStore(s => s.sessionName);
  const cards = useSessionStore(s => s.cards);
  const mapping = useSessionStore(s => s.mapping);
  const cleaningReport = useSessionStore(s => s.cleaningReport);
  const matchResults = useSessionStore(s => s.matchResults);
  const hospitalFiles = useSessionStore(s => s.hospitalFiles);
  const sessionNotes = useSessionStore(s => s.sessionNotes);
  const setSessionNotes = useSessionStore(s => s.setSessionNotes);
  const { theme, toggle } = useTheme();

  // Session notes state
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(sessionNotes);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.slice(0, 2000);
    setNotesDraft(val);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      setSessionNotes(val);
    }, 400);
  }, [setSessionNotes]);

  // Workflow completion — 10 stages counted toward progress (analytics excluded).
  const progress = useMemo(() => {
    const total = 10;
    if (!cards.length) return { done: 0, total, pct: 0, complete: false };
    const hasClass = (c: { classifications?: { pharma?: boolean; rssb?: boolean; fraud?: boolean } | null }) =>
      !!(c.classifications && (c.classifications.pharma || c.classifications.rssb || c.classifications.fraud));
    const steps: Record<string, boolean> = {
      summary: true, // cards exist
      map: Object.values(mapping).filter(Boolean).length > 0,
      clean: !!(cleaningReport && cleaningReport.length > 0),
      verify: cards.some(c => c.status === 'verified'),
      dashboard: cards.some(c => Number(c.deduction) > 0) || cards.some(hasClass),
      hospital: hospitalFiles.length > 0,
      match: matchResults !== null,
      network: matchResults !== null,
      fraud: cards.some(c => !!c.classifications?.fraud),
      counter: cards.some(c => typeof c.explanation === 'string' && c.explanation.trim().length > 0),
    };
    const done = Object.values(steps).filter(Boolean).length;
    return { done, total, pct: Math.round((done / total) * 100), complete: done === total };
  }, [cards, mapping, cleaningReport, matchResults, hospitalFiles]);

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border bg-sidebar sticky top-0 h-screen max-h-screen overflow-y-auto scrollbar-thin">
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="transition-transform hover:scale-105">
            <RssbLogo size={38} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-tight leading-tight">RSSB Counter</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">Verification System</p>
          </div>
        </div>
        {sessionName && (
          <p className="text-[11px] text-muted-foreground mt-2 truncate" title={sessionName}>
            {sessionName} · {cards.length} vouchers
          </p>
        )}
      </div>

      <nav className="flex flex-col gap-0.5 p-3 flex-1">
        {/* Data Input group */}
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1 mt-1">
          Data Input
        </p>
        {TABS.filter(([key]) => ['sessions', 'summary', 'map', 'clean'].includes(key)).map(([key, label], idx) => {
          const Icon = ICONS[key] || History;
          const active = stage === key;
          const stageIdx = TABS.findIndex(([k]) => k === stage);
          const tabIdx = TABS.findIndex(([k]) => k === key);
          const completed = stageIdx > tabIdx && key !== 'sessions';
          return (
            <button
              key={key}
              onClick={() => setStage(key)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 text-sm text-left rounded-lg px-3 py-2 transition-all duration-150 group ${
                active
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <div className="relative shrink-0">
                <Icon className="w-4 h-4" />
                {completed && !active && (
                  <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-sidebar" />
                )}
              </div>
              <span className="truncate">{label}</span>
            </button>
          );
        })}

        {/* Review group */}
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1 mt-3">
          Review & Verify
        </p>
        {TABS.filter(([key]) => ['verify', 'dashboard', 'analytics'].includes(key)).map(([key, label]) => {
          const Icon = ICONS[key] || History;
          const active = stage === key;
          const stageIdx = TABS.findIndex(([k]) => k === stage);
          const tabIdx = TABS.findIndex(([k]) => k === key);
          const completed = stageIdx > tabIdx;
          return (
            <button
              key={key}
              onClick={() => setStage(key)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 text-sm text-left rounded-lg px-3 py-2 transition-all duration-150 group ${
                active
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <div className="relative shrink-0">
                <Icon className="w-4 h-4" />
                {completed && !active && (
                  <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-sidebar" />
                )}
              </div>
              <span className="truncate">{label}</span>
            </button>
          );
        })}

        {/* Cross-reference group */}
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1 mt-3">
          Cross-reference
        </p>
        {TABS.filter(([key]) => ['hospital', 'match', 'network'].includes(key)).map(([key, label]) => {
          const Icon = ICONS[key] || History;
          const active = stage === key;
          const stageIdx = TABS.findIndex(([k]) => k === stage);
          const tabIdx = TABS.findIndex(([k]) => k === key);
          const completed = stageIdx > tabIdx;
          return (
            <button
              key={key}
              onClick={() => setStage(key)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 text-sm text-left rounded-lg px-3 py-2 transition-all duration-150 group ${
                active
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <div className="relative shrink-0">
                <Icon className="w-4 h-4" />
                {completed && !active && (
                  <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-sidebar" />
                )}
              </div>
              <span className="truncate">{label}</span>
            </button>
          );
        })}

        {/* Reports group */}
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1 mt-3">
          Reports
        </p>
        {TABS.filter(([key]) => ['fraud', 'counter', 'audit', 'compare'].includes(key)).map(([key, label]) => {
          const Icon = ICONS[key] || History;
          const active = stage === key;
          const stageIdx = TABS.findIndex(([k]) => k === stage);
          const tabIdx = TABS.findIndex(([k]) => k === key);
          const completed = stageIdx > tabIdx;
          return (
            <button
              key={key}
              onClick={() => setStage(key)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 text-sm text-left rounded-lg px-3 py-2 transition-all duration-150 group ${
                active
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <div className="relative shrink-0">
                <Icon className="w-4 h-4" />
                {completed && !active && (
                  <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-sidebar" />
                )}
              </div>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Session Notes — collapsible */}
      <div className="px-3 pb-2">
        <div className="rounded-lg border border-border bg-card p-2.5">
          <button
            type="button"
            onClick={() => setNotesOpen(o => !o)}
            className="w-full flex items-center gap-2 text-[11px] font-medium text-muted-foreground"
          >
            <NotepadText className="w-3.5 h-3.5" />
            <span>Session Notes</span>
            {sessionNotes && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
            <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${notesOpen ? '' : '-rotate-90'}`} />
          </button>
          {notesOpen && (
            <div className="mt-2">
              <textarea
                value={notesDraft}
                onChange={handleNotesChange}
                placeholder="Add notes about this session…"
                rows={4}
                className="w-full bg-muted border border-border rounded-lg p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-right">
                {notesDraft.length} / 2,000
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="rounded-lg border border-border bg-card p-2.5">
          <div className="flex items-center gap-3">
            <ProgressRing
              value={progress.pct}
              max={100}
              size={56}
              strokeWidth={6}
              ariaLabel={`Workflow ${progress.pct}% complete — ${progress.done} of ${progress.total} steps`}
            >
              <div className="flex items-center justify-center">
                {progress.complete ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" aria-hidden="true" />
                ) : (
                  <span className="text-[11px] font-semibold text-foreground tabular-nums leading-none">
                    {progress.pct}%
                  </span>
                )}
              </div>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                {progress.complete ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                    <span>Workflow complete</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    <span>Workflow progress</span>
                  </>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                {progress.done} of {progress.total} steps
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-sidebar-border flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
          {isSaving ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-primary pulse-dot" />
              <span>Saving…</span>
            </>
          ) : lastSaved ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span>Saved {lastSaved.toLocaleTimeString()}</span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
              <span>Not saved yet</span>
            </>
          )}
        </div>
        <button
          onClick={toggle}
          className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-sidebar-accent transition-colors"
        >
          <span>{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>
          {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setStage('sessions')}
          className="flex items-center justify-center gap-2 text-sm border border-border rounded-lg px-3 py-1.5 bg-card hover:bg-primary/10 hover:text-primary transition-colors"
        >
          <FilePlus2 className="w-4 h-4" />
          Manage sessions
        </button>
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/60 px-1 pt-1 pb-0.5">
          <Search className="w-3 h-3" />
          <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl+K</kbd>
          <span>Command palette</span>
        </div>
      </div>
    </aside>
  );
}
