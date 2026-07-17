import { useEffect, useState, Suspense, lazy } from 'react';
import { useSessionStore } from '@/store/session-store';
import { useTheme } from '@/components/rssb/theme-provider';
import { Sidebar } from '@/components/rssb/Sidebar';
import { LandingView } from '@/components/rssb/LandingView';
import { UploadView } from '@/components/rssb/UploadView';
import { SessionsDashboard } from '@/components/rssb/SessionsDashboard';
import { SummaryView } from '@/components/rssb/SummaryView';
const MapView = lazy(() => import('@/components/rssb/MapView').then(m => ({ default: m.MapView })));
const CleanView = lazy(() => import('@/components/rssb/MapView').then(m => ({ default: m.CleanView })));
import { VerifyView } from '@/components/rssb/VerifyView';
const DashboardView = lazy(() => import('@/components/rssb/DashboardView').then(m => ({ default: m.DashboardView })));
const HospitalView = lazy(() => import('@/components/rssb/HospitalView').then(m => ({ default: m.HospitalView })));
const MatchReviewView = lazy(() => import('@/components/rssb/MatchReviewView').then(m => ({ default: m.MatchReviewView })));
const NetworkGraph = lazy(() => import('@/components/rssb/NetworkGraph').then(m => ({ default: m.NetworkGraph })));
const FraudReviewView = lazy(() => import('@/components/rssb/FraudReviewView').then(m => ({ default: m.FraudReviewView })));
const CounterVerificationView = lazy(() => import('@/components/rssb/CounterVerificationView').then(m => ({ default: m.CounterVerificationView })));
const AnalyticsView = lazy(() => import('@/components/rssb/AnalyticsView').then(m => ({ default: m.AnalyticsView })));
const AuditLogView = lazy(() => import('@/components/rssb/AuditLogView').then(m => ({ default: m.AuditLogView })));
const CompareView = lazy(() => import('@/components/rssb/CompareView').then(m => ({ default: m.CompareView })));
import { HelpButton } from '@/components/rssb/HelpButton';
import { CommandPalette } from '@/components/rssb/CommandPalette';
import { useCardHelpers } from '@/components/rssb/use-card-helpers';
import { RssbLogo } from '@/components/rssb/RssbLogo';
import { TABS } from '@/lib/rssb/config';
import { Moon, Sun, Menu, X, AlertTriangle, Loader2, NotepadText, Timer, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';

export default function App() {
  const stage = useSessionStore(s => s.stage);
  const cards = useSessionStore(s => s.cards);
  const setStage = useSessionStore(s => s.setStage);
  const lastSaved = useSessionStore(s => s.lastSaved);
  const isSaving = useSessionStore(s => s.isSaving);
  const saveError = useSessionStore(s => s.saveError);
  const loadingSession = useSessionStore(s => s.loadingSession);
  const isDirty = useSessionStore(s => s.isDirty);
  const sessionNotes = useSessionStore(s => s.sessionNotes);
  const helpers = useCardHelpers();
  const { theme, toggle } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [saveCountdown, setSaveCountdown] = useState(0);

  // Refresh sessions list on mount
  const refreshSessions = useSessionStore(s => s.refreshSessions);
  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  // Auto-save countdown timer — shows seconds until next auto-save
  useEffect(() => {
    if (!isDirty || isSaving) { setSaveCountdown(0); return; }
    setSaveCountdown(1.2); // SAVE_DEBOUNCE_MS / 1000
    const interval = window.setInterval(() => {
      setSaveCountdown(prev => {
        const next = Math.max(0, prev - 0.1);
        return Math.round(next * 10) / 10;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [isDirty, isSaving]);

  // 'compare' can be shown without an active working session (it fetches
  // its own data from the API). 'sessions' with no cards is handled by the
  // dedicated dashboard branch above.
  const showShell = stage !== 'upload' && stage !== 'landing' && (cards.length > 0 || stage === 'compare');

  // Summary stats for sticky bar
  const summary = cards.length ? (() => {
    const total = cards.length;
    const verified = cards.filter(c => c.status === 'verified').length;
    const pending = total - verified;
    const fraudFlagged = cards.filter(c => c.classifications?.fraud).length;
    const totalOriginal = cards.reduce((s, c) => s + (helpers.originalAmount(c) || 0), 0);
    const totalApproved = cards.reduce((s, c) => s + (helpers.approvedAmount(c) || 0), 0);
    return { total, verified, pending, fraudFlagged, totalOriginal, totalApproved };
  })() : null;

  // Render pre-shell stages
  if (stage === 'landing' || (stage === 'sessions' && cards.length === 0)) {
    if (stage === 'landing') return <LandingView />;
    return (
      <div className="min-h-screen flex flex-col">
        <header className="rama-header flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-4">
          <button onClick={() => setStage('landing')} className="flex items-center gap-3">
            <RssbLogo size={40} />
            <div className="text-left">
              <h1 className="text-lg font-semibold tracking-tight text-white">RSSB Counter Verification</h1>
              <p className="text-xs text-white/70">Sessions dashboard</p>
            </div>
          </button>
          <button onClick={toggle} className="text-sm border border-white/20 rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/20 shrink-0 inline-flex items-center gap-2 text-white transition-colors">
            {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'light' ? 'Light' : 'Dark'}
          </button>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <SessionsDashboard />
        </main>
        <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
          RSSB Counter Verification System
        </footer>
      </div>
    );
  }

  if (stage === 'upload') return <UploadView />;

  if (!showShell && stage !== 'sessions') {
    return <LandingView />;
  }

  return (
    <div className="lg:flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="lg:flex flex-1">
        <Sidebar />

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Mobile header */}
          <div className="lg:hidden rama-header flex items-center justify-between gap-2 px-4 py-3 sticky top-0 z-20">
            <button onClick={() => setStage('landing')} className="flex items-center gap-2 min-w-0">
              <RssbLogo size={28} />
              <span className="truncate text-sm font-semibold text-white">RSSB Verification</span>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={toggle} className="w-8 h-8 border border-white/20 rounded-lg bg-white/10 flex items-center justify-center text-white" aria-label="Toggle theme">
                {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button onClick={() => setMobileNavOpen(true)} className="w-8 h-8 border border-white/20 rounded-lg bg-white/10 flex items-center justify-center text-white" aria-label="Open menu">
                <Menu className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile nav drawer */}
          {mobileNavOpen && (
            <div className="lg:hidden fixed inset-0 z-50 flex">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
              <div className="relative bg-sidebar w-72 max-w-[80vw] h-full flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
                  <span className="font-medium text-sm">Navigation</span>
                  <button onClick={() => setMobileNavOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-sidebar-accent">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <nav className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto scrollbar-thin">
                  {TABS.map(([key, label]) => {
                    const active = stage === key;
                    return (
                      <button
                        key={key}
                        onClick={() => { setStage(key); setMobileNavOpen(false); }}
                        className={`text-sm text-left rounded-lg px-3 py-2 transition-colors ${
                          active ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-sidebar-accent'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </nav>
                <div className="p-3 border-t border-sidebar-border text-[11px] text-muted-foreground">
                  {isSaving ? 'Saving…' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : 'Not saved yet'}
                </div>
              </div>
            </div>
          )}

          {/* Save error banner */}
          {saveError && (
            <div role="alert" className="bg-danger-light text-danger-dark text-sm px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Auto-save failed: {saveError}. Your work is not being saved — export your progress.
              </span>
              <button onClick={() => useSessionStore.setState({ saveError: null })} className="text-xs underline shrink-0">Dismiss</button>
            </div>
          )}

          {/* Loading overlay */}
          {loadingSession && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground bg-primary/5">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading session…
            </div>
          )}

          {/* Sticky stats bar */}
          {summary && stage !== 'sessions' && (
            <div className="sticky top-0 lg:top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 sm:px-6 lg:px-8 py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  <StatCell label="Total" value={summary.total.toLocaleString()} />
                  <StatCell label="Verified" value={summary.verified.toLocaleString()} icon={<CheckCircle2 className="w-3 h-3" />} className="text-primary" />
                  <StatCell label="Pending" value={summary.pending.toLocaleString()} icon={<Clock className="w-3 h-3" />} className="text-warn-dark" />
                  <StatCell label="Fraud flagged" value={summary.fraudFlagged.toLocaleString()} icon={<ShieldAlert className="w-3 h-3" />} className="text-danger-dark" />
                  <StatCell label="Original total" value={`RWF ${summary.totalOriginal.toLocaleString()}`} />
                  <StatCell label="Approved total" value={`RWF ${summary.totalApproved.toLocaleString()}`} className="text-primary" />
                </div>
                {/* Mini verification progress ring */}
                <div className="hidden lg:flex items-center gap-2 shrink-0">
                  <div className="relative w-10 h-10">
                    <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                        className="text-primary transition-all duration-500"
                        strokeDasharray={`${Math.round((summary.verified / summary.total) * 97.4)} 97.4`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-primary tabular-nums">
                      {Math.round((summary.verified / summary.total) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main content */}
          <main id="main-content" tabIndex={-1} key={stage} className="px-4 sm:px-6 lg:px-8 py-6 flex-1 stage-enter">
            {stage === 'sessions' && <SessionsDashboard />}
            {stage === 'summary' && <SummaryView />}
            {stage === 'verify' && <VerifyView />}
            <Suspense fallback={
              <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            }>
              {stage === 'map' && <MapView />}
              {stage === 'clean' && <CleanView />}
              {stage === 'dashboard' && <DashboardView />}
              {stage === 'analytics' && <AnalyticsView />}
              {stage === 'hospital' && <HospitalView />}
              {stage === 'match' && <MatchReviewView />}
              {stage === 'network' && <NetworkGraph />}
              {stage === 'fraud' && <FraudReviewView />}
              {stage === 'counter' && <CounterVerificationView />}
              {stage === 'audit' && <AuditLogView />}
              {stage === 'compare' && <CompareView />}
            </Suspense>
          </main>

          <footer className="border-t border-border py-2.5 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 text-xs text-muted-foreground bg-card/50">
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-foreground/70">RSSB CVS</span>
              <span className="text-border">·</span>
              <span>Pharmacy claims verification</span>
              {sessionNotes && <NotepadText className="w-3.5 h-3.5 text-primary ml-1" title="Session has notes" />}
            </span>
            <span className="flex items-center gap-2">
              {isSaving ? (
                <span className="flex items-center gap-1.5 text-primary font-medium">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                </span>
              ) : isDirty ? (
                <span className="flex items-center gap-1.5 text-warn-dark">
                  <span className="w-2 h-2 rounded-full bg-warn badge-pulse" />
                  <span>Unsaved</span>
                  {saveCountdown > 0 && (
                    <span className="flex items-center gap-0.5 text-muted-foreground ml-0.5">
                      <Timer className="w-3 h-3" />
                      {saveCountdown.toFixed(1)}s
                    </span>
                  )}
                </span>
              ) : lastSaved ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span>Saved {lastSaved.toLocaleTimeString()}</span>
                </span>
              ) : null}
            </span>
          </footer>
        </div>
      </div>
      {/* Floating help button — renders on all stages within the shell */}
      <HelpButton />
      {/* Command palette — Ctrl+K / Cmd+K quick actions */}
      <CommandPalette />
    </div>
  );
}

function StatCell({ label, value, className = '', icon }: { label: string; value: string; className?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-1.5 flex items-center gap-2">
      {icon && <span className="shrink-0 opacity-60">{icon}</span>}
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
        <div className={`text-sm font-semibold tabular-nums leading-tight truncate ${className}`}>{value}</div>
      </div>
    </div>
  );
}
