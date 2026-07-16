'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '@/store/session-store';
import { useCardHelpers } from './use-card-helpers';
import { CLASSIFICATION_DEFS } from '@/lib/rssb/config';
import { validateAllCards, worstSeverity } from '@/lib/rssb/validation';
import type { ValidationIssue, ValidationSeverity } from '@/lib/rssb/validation';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Keyboard,
  Search,
  SkipForward,
  Filter,
  X,
  ListChecks,
  ShieldAlert,
  ChevronDown,
  AlertCircle,
  Info,
} from 'lucide-react';

type StatusFilter = 'all' | 'pending' | 'verified' | 'fraud' | 'issues';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'fraud', label: 'Fraud-flagged' },
  { key: 'issues', label: 'Has issues' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function SeverityIcon({ severity, className = '' }: { severity: ValidationSeverity; className?: string }) {
  if (severity === 'critical') return <AlertCircle className={`w-3.5 h-3.5 text-danger ${className}`} />;
  if (severity === 'warning') return <AlertTriangle className={`w-3.5 h-3.5 text-amber-500 dark:text-amber-400 ${className}`} />;
  return <Info className={`w-3.5 h-3.5 text-blue-500 dark:text-blue-400 ${className}`} />;
}

function ValidationBadge({ count, severity }: { count: number; severity: ValidationSeverity | null }) {
  if (count === 0) return <CheckCircle2 className="w-3.5 h-3.5 text-primary" />;
  const colors: Record<string, string> = {
    critical: 'bg-danger text-white',
    warning: 'bg-amber-500 text-white dark:bg-amber-500 dark:text-white',
    info: 'bg-blue-500 text-white',
  };
  const cls = severity ? colors[severity] : colors.info;
  return (
    <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${cls}`}>
      {count}
    </span>
  );
}

export function VerifyView() {
  const cards = useSessionStore(s => s.cards);
  const headers = useSessionStore(s => s.headers);
  const mapping = useSessionStore(s => s.mapping);
  const currentIndex = useSessionStore(s => s.currentIndex);
  const setCurrentIndex = useSessionStore(s => s.setCurrentIndex);
  const updateCard = useSessionStore(s => s.updateCard);
  const setCards = useSessionStore(s => s.setCards);
  const helpers = useCardHelpers();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [validationPanelOpen, setValidationPanelOpen] = useState(false);

  const currentCard = cards[currentIndex];

  // Run validation on all cards
  const validationSummary = useMemo(
    () => validateAllCards(cards, mapping),
    [cards, mapping],
  );

  // Build filtered list (search AND status filter combined)
  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter(c => {
      if (statusFilter === 'pending' && c.status !== 'pending') return false;
      if (statusFilter === 'verified' && c.status !== 'verified') return false;
      if (statusFilter === 'fraud' && !c.classifications?.fraud) return false;
      if (statusFilter === 'issues' && !validationSummary.issuesByCard.has(c.id)) return false;
      if (q) {
        const name = String(helpers.mappedValue(c, 'patient_name') || '').toLowerCase();
        const voucher = String(helpers.voucherOf(c) || '').toLowerCase();
        const rama = String(helpers.mappedValue(c, 'rama_number') || '').toLowerCase();
        if (!name.includes(q) && !voucher.includes(q) && !rama.includes(q)) return false;
      }
      return true;
    });
  }, [cards, search, statusFilter, helpers, validationSummary.issuesByCard]);

  // Map card.id → index in cards array (avoids O(n) lookups in render)
  const idToIndex = useMemo(() => {
    const m = new Map<number, number>();
    cards.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [cards]);

  // Reset to page 0 when search / filter / page size changes
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, pageSize]);

  // Auto-jump: if the current card is not in the filtered set, jump to the
  // first filtered match (only when a filter is actually active).
  const filterActive = search.trim() !== '' || statusFilter !== 'all';
  useEffect(() => {
    if (!filterActive || filteredCards.length === 0 || !currentCard) return;
    const inFilter = filteredCards.some(c => c.id === currentCard.id);
    if (!inFilter) {
      const firstId = filteredCards[0].id;
      const idx = idToIndex.get(firstId);
      if (idx !== undefined && idx !== currentIndex) setCurrentIndex(idx);
    }
  }, [filteredCards, currentCard, idToIndex, currentIndex, setCurrentIndex, filterActive]);

  // Stats
  const verifiedCount = cards.filter(c => c.status === 'verified').length;
  const pendingCount = cards.filter(c => c.status === 'pending').length;
  const fraudCount = cards.filter(c => c.classifications?.fraud === true).length;
  const progressPct = cards.length ? Math.round((verifiedCount / cards.length) * 100) : 0;
  const hasPending = pendingCount > 0;

  // Pagination over the filtered list
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const startIdx = filteredCards.length === 0 ? 0 : safePage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filteredCards.length);
  const pageItems = filteredCards.slice(startIdx, endIdx);

  // Auto-switch page so the current card is visible
  useEffect(() => {
    if (!currentCard || filteredCards.length === 0) return;
    const posInFiltered = filteredCards.findIndex(c => c.id === currentCard.id);
    if (posInFiltered < 0) return;
    const neededPage = Math.floor(posInFiltered / pageSize);
    if (neededPage !== safePage) setPage(neededPage);
  }, [currentCard, filteredCards, pageSize, safePage]);

  // Position of the current card within the filtered list (for prev/next bounds)
  const filteredPos = currentCard ? filteredCards.findIndex(c => c.id === currentCard.id) : -1;
  const atStart = filteredCards.length === 0 || filteredPos === 0;
  const atEnd = filteredCards.length === 0 || filteredPos === filteredCards.length - 1;

  // Navigation within the FILTERED list
  function navigateFiltered(delta: number) {
    if (filteredCards.length === 0) return;
    let nextPos: number;
    if (filteredPos < 0) nextPos = 0;
    else nextPos = (filteredPos + delta + filteredCards.length) % filteredCards.length;
    const nextCard = filteredCards[nextPos];
    const idx = idToIndex.get(nextCard.id);
    if (idx !== undefined) setCurrentIndex(idx);
  }

  function nextPending() {
    if (!cards.length || !currentCard) return;
    const n = cards.length;
    for (let i = 1; i <= n; i++) {
      const idx = (currentIndex + i) % n;
      if (cards[idx].status === 'pending') {
        setCurrentIndex(idx);
        return;
      }
    }
    toast({ title: 'All vouchers verified!', description: 'No pending vouchers remaining.' });
  }

  function toggleVerified() {
    if (!currentCard) return;
    updateCard(currentCard.id, { status: currentCard.status === 'verified' ? 'pending' : 'verified' });
  }

  function toggleFraud() {
    if (!currentCard) return;
    updateCard(currentCard.id, {
      classifications: { ...currentCard.classifications, fraud: !currentCard.classifications.fraud },
    });
  }

  function bulkVerifyFiltered() {
    if (filteredCards.length === 0) return;
    const filteredIds = new Set(filteredCards.map(c => c.id));
    setCards(cards.map(c => (filteredIds.has(c.id) ? { ...c, status: 'verified' } : c)));
    toast({ title: 'Bulk verified', description: `${filteredIds.size} voucher(s) marked as verified.` });
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
  }

  // Keyboard shortcuts (ignore when typing in inputs; ? is handled by HelpButton)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowRight') { e.preventDefault(); navigateFiltered(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateFiltered(-1); }
      else if (k === 'v') { e.preventDefault(); toggleVerified(); }
      else if (k === 'f') { e.preventDefault(); toggleFraud(); }
      else if (k === 'n') { e.preventDefault(); nextPending(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!currentCard) {
    return <p className="text-sm text-muted-foreground">No voucher to display.</p>;
  }

  const patientName = String(helpers.mappedValue(currentCard, 'patient_name') || `Record ${currentCard.id + 1}`);
  const voucherNo = helpers.voucherOf(currentCard);
  const needsReview = helpers.needsFraudReview(currentCard);
  const originalAmt = helpers.originalAmount(currentCard);
  const approvedAmt = helpers.approvedAmount(currentCard);

  // Validation for current card
  const currentCardIssues = validationSummary.issuesByCard.get(currentCard.id) || [];
  const currentWorst = worstSeverity(currentCardIssues);

  // repeated patient detection
  const nameHeader = helpers.mapping.patient_name;
  const isRepeated = nameHeader ? cards.filter(c =>
    String(c.row[nameHeader] || '').trim().toLowerCase() === String(currentCard.row[nameHeader] || '').trim().toLowerCase() &&
    String(c.row[nameHeader] || '').trim() !== '',
  ).length > 1 : false;

  return (
    <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-6 lg:items-start">
      <div className="max-w-xl mx-auto lg:mx-0 lg:max-w-none">
        {/* Search + status filter row */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by patient, voucher #, or RAMA…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Search vouchers"
            />
          </div>
          <div
            className="inline-flex border border-border rounded-lg overflow-hidden text-xs bg-card self-start"
            role="group"
            aria-label="Filter by status"
          >
            {FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-2 transition-colors ${
                  statusFilter === f.key ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Validation Issues Panel — collapsible */}
        {validationSummary.total > 0 && (
          <div className="rounded-lg border border-border bg-card mb-3">
            <button
              type="button"
              onClick={() => setValidationPanelOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground"
            >
              <ShieldAlert className={`w-4 h-4 ${validationSummary.critical > 0 ? 'text-danger' : 'text-amber-500 dark:text-amber-400'}`} />
              <span>Validation Issues</span>
              <span className="text-xs text-muted-foreground ml-1">
                {validationSummary.total} issue{validationSummary.total === 1 ? '' : 's'} across {validationSummary.issuesByCard.size} voucher{validationSummary.issuesByCard.size === 1 ? '' : 's'}
              </span>
              {validationSummary.critical > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-bold px-1">
                  {validationSummary.critical}
                </span>
              )}
              {validationSummary.warning > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold px-1">
                  {validationSummary.warning}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 ml-auto text-muted-foreground transition-transform ${validationPanelOpen ? '' : '-rotate-90'}`} />
            </button>
            {validationPanelOpen && (
              <div className="border-t border-border px-3 py-2">
                {/* Summary counts */}
                <div className="flex items-center gap-4 mb-2 text-xs">
                  {validationSummary.critical > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-danger">
                      <AlertCircle className="w-3 h-3" />
                      {validationSummary.critical} critical
                    </span>
                  )}
                  {validationSummary.warning > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      {validationSummary.warning} warning{validationSummary.warning === 1 ? '' : 's'}
                    </span>
                  )}
                  {validationSummary.info > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                      <Info className="w-3 h-3" />
                      {validationSummary.info} info
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setStatusFilter('issues')}
                    className={`ml-auto text-xs underline ${statusFilter === 'issues' ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {statusFilter === 'issues' ? 'Showing issues only' : 'Filter to issues only'}
                  </button>
                </div>
                {/* Issue list — scrollable */}
                <ul className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                  {validationSummary.issues.slice(0, 50).map((issue, i) => (
                    <li key={`${issue.cardId}-${issue.ruleKey}-${i}`}>
                      <button
                        type="button"
                        onClick={() => {
                          const idx = idToIndex.get(issue.cardId);
                          if (idx !== undefined) setCurrentIndex(idx);
                        }}
                        className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-accent text-left transition-colors"
                      >
                        <SeverityIcon severity={issue.severity} />
                        <span className="text-muted-foreground shrink-0">#{issue.cardId + 1}</span>
                        <span className="truncate">{issue.message}</span>
                      </button>
                    </li>
                  ))}
                  {validationSummary.issues.length > 50 && (
                    <li className="text-xs text-muted-foreground px-2 py-1 text-center">
                      +{validationSummary.issues.length - 50} more issues
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Statistics summary card */}
        <div className="rounded-lg border border-border bg-card px-3 py-2 flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs mb-3">
          <div className="inline-flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{cards.length}</span>
          </div>
          <div className="inline-flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Verified</span>
            <span className="font-semibold tabular-nums">{verifiedCount}</span>
            <span className="text-muted-foreground tabular-nums">({progressPct}%)</span>
          </div>
          <div className="inline-flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Pending</span>
            <span className="font-semibold tabular-nums text-warn-dark">{pendingCount}</span>
          </div>
          <div className="inline-flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Fraud-flagged</span>
            <span className="font-semibold tabular-nums text-danger-dark">{fraudCount}</span>
          </div>
          {validationSummary.total > 0 && (
            <div className="inline-flex items-baseline gap-1.5">
              <span className="text-muted-foreground">Issues</span>
              <span className={`font-semibold tabular-nums ${validationSummary.critical > 0 ? 'text-danger-dark' : 'text-amber-600 dark:text-amber-400'}`}>{validationSummary.issuesByCard.size}</span>
            </div>
          )}
          <button
            type="button"
            onClick={bulkVerifyFiltered}
            disabled={filteredCards.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 text-xs border border-border rounded-md px-2 py-1 hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Mark every filtered voucher as verified"
          >
            <ListChecks className="w-3.5 h-3.5" />
            Verify all filtered (<span className="tabular-nums">{filteredCards.length}</span>)
          </button>
        </div>

        {/* Filter-active indicator */}
        {filterActive && (
          <div className="mb-3 inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full bg-muted">
            <Filter className="w-3 h-3 text-muted-foreground" />
            <span>Filter active — showing <span className="tabular-nums">{filteredCards.length}</span> of <span className="tabular-nums">{cards.length}</span></span>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-accent hover:text-danger"
              aria-label="Clear filters"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Progress bar */}
        <div className="mb-5">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
            <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} of {cards.length} · {progressPct}% verified
          </span>
        </div>

        <div className={`rounded-xl border bg-card p-5 flex flex-col gap-4 border-l-4 ${
          currentCard.status === 'verified' ? 'border-l-primary border-border' : 'border-l-border'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-medium text-[15px]">{patientName}</span>
            <div className="flex items-center gap-2">
              {voucherNo && <span className="text-xs px-2 py-0.5 rounded-full bg-muted">#{voucherNo}</span>}
              {isRepeated && <span className="text-xs px-2 py-0.5 rounded-full bg-warn-light text-warn-dark">Repeated patient</span>}
              {/* Validation indicator for current card */}
              {currentCardIssues.length > 0 ? (
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                  currentWorst === 'critical' ? 'bg-danger-light text-danger-dark' :
                  currentWorst === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                }`}>
                  <SeverityIcon severity={currentWorst!} />
                  {currentCardIssues.length} issue{currentCardIssues.length === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="w-3 h-3" />
                  Valid
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 py-3 border-y border-border">
            {headers.slice(0, 8).map(h => (
              <div key={h} className="overflow-hidden">
                <div className="text-[11px] text-muted-foreground">{h}</div>
                <div className="text-sm truncate" title={String(currentCard.row[h])}>{String(currentCard.row[h])}</div>
              </div>
            ))}
          </div>

          {/* Validation issues detail for current card */}
          {currentCardIssues.length > 0 && (
            <div className="flex flex-col gap-1.5 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Validation issues</span>
              <ul className="space-y-1">
                {currentCardIssues.map((issue, i) => (
                  <li key={`${issue.ruleKey}-${i}`} className="flex items-center gap-2 text-xs">
                    <SeverityIcon severity={issue.severity} />
                    <span className={
                      issue.severity === 'critical' ? 'text-danger-dark' :
                      issue.severity === 'warning' ? 'text-amber-700 dark:text-amber-400' :
                      'text-blue-700 dark:text-blue-400'
                    }>
                      {issue.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 py-2 border-b border-border">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Deduction classification (select all that apply)</span>
            <div className="flex flex-wrap gap-2">
              {CLASSIFICATION_DEFS.map(cl => (
                <label
                  key={cl.key}
                  className={`text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    currentCard.classifications?.[cl.key] ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-muted'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!currentCard.classifications?.[cl.key]}
                    onChange={() => updateCard(currentCard.id, {
                      classifications: { ...currentCard.classifications, [cl.key]: !currentCard.classifications[cl.key] },
                    })}
                    className="sr-only"
                  />
                  {cl.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 py-3 border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="prescription-date" className="text-sm text-muted-foreground shrink-0">Prescription date</label>
              <input
                id="prescription-date"
                type="date"
                value={currentCard.prescriptionDate}
                onChange={e => updateCard(currentCard.id, { prescriptionDate: e.target.value })}
                className={`flex-1 border rounded-lg px-2.5 py-1.5 text-sm bg-muted text-right ${
                  needsReview && !currentCard.prescriptionDate ? 'border-danger' : 'border-border'
                }`}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="facility-override" className="text-sm text-muted-foreground shrink-0">Health facility</label>
              <input
                id="facility-override"
                type="text"
                placeholder={String(helpers.mappedValue(currentCard, 'facility_name') || 'Enter facility name')}
                value={currentCard.facilityOverride}
                onChange={e => updateCard(currentCard.id, { facilityOverride: e.target.value })}
                className={`flex-1 border rounded-lg px-2.5 py-1.5 text-sm bg-muted text-right ${
                  needsReview && !helpers.facilityOf(currentCard) ? 'border-danger' : 'border-border'
                }`}
              />
            </div>
          </div>

          {currentCard.classifications?.fraud && (
            <div className={`rounded-lg border p-3 flex items-start gap-2 ${needsReview ? 'border-danger bg-danger-light' : 'border-primary bg-primary/10'}`}>
              {needsReview ? <AlertTriangle className="w-4 h-4 text-danger mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />}
              <div>
                <span className={`text-xs font-medium ${needsReview ? 'text-danger-dark' : 'text-primary'}`}>Fraud review</span>
                {needsReview ? (
                  <p className="text-xs text-danger-dark">Prescription date and health facility are mandatory before this voucher appears in the fraud report.</p>
                ) : (
                  <p className="text-xs text-primary">Review complete — ready for the fraud report.</p>
                )}
              </div>
            </div>
          )}

          {originalAmt !== null && (
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Original amount</span><span className="tabular-nums">{originalAmt.toLocaleString()}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Deduct</span>
                <input
                  type="number"
                  min="0"
                  value={currentCard.deduction || ''}
                  placeholder="0"
                  onChange={e => updateCard(currentCard.id, { deduction: e.target.value })}
                  className="w-24 border border-border rounded-lg px-2.5 py-1 text-sm bg-muted text-right"
                />
              </div>
              <div className="flex justify-between font-medium pt-1 border-t border-border"><span>Approved amount</span><span className="tabular-nums">{approvedAmt?.toLocaleString()}</span></div>
            </div>
          )}

          <textarea
            placeholder="Add comment…"
            value={currentCard.comment}
            onChange={e => updateCard(currentCard.id, { comment: e.target.value })}
            className="w-full min-h-[64px] border border-border rounded-lg px-3 py-2 text-sm bg-muted resize-y"
          />

          <button
            onClick={() => updateCard(currentCard.id, { status: currentCard.status === 'verified' ? 'pending' : 'verified' })}
            className={`text-sm rounded-lg px-3 py-2 border transition-colors inline-flex items-center justify-center gap-2 ${
              currentCard.status === 'verified' ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-muted hover:bg-accent'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            {currentCard.status === 'verified' ? 'Verified ✓ (click to undo)' : 'Mark as verified'}
          </button>
        </div>

        {/* Navigation row: Previous / Next pending / Next */}
        <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
          <button
            onClick={() => navigateFiltered(-1)}
            disabled={atStart}
            className="inline-flex items-center gap-1 text-sm border border-border rounded-lg px-5 py-2 bg-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={nextPending}
            disabled={!hasPending}
            className="inline-flex items-center gap-1.5 text-sm border border-border rounded-lg px-4 py-2 bg-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
            title="Jump to the next pending voucher (N)"
          >
            <SkipForward className="w-4 h-4" />
            Next pending
          </button>
          <button
            onClick={() => navigateFiltered(1)}
            disabled={atEnd}
            className="inline-flex items-center gap-1 text-sm border border-border rounded-lg px-5 py-2 bg-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <aside className="hidden lg:flex flex-col gap-4 sticky top-24">
        {/* Keyboard shortcuts */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-2">
            <Keyboard className="w-3.5 h-3.5" />
            Keyboard shortcuts
          </h2>
          <ul className="text-sm flex flex-col gap-1.5">
            <li className="flex justify-between"><span className="text-muted-foreground">Next / Previous</span><span className="font-mono text-xs">→ / ←</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Verify (toggle)</span><span className="font-mono text-xs">V</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Toggle fraud</span><span className="font-mono text-xs">F</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Next pending</span><span className="font-mono text-xs">N</span></li>
            <li className="flex justify-between"><span className="text-muted-foreground">Help</span><span className="font-mono text-xs">?</span></li>
          </ul>
        </div>

        {/* Voucher list with pagination */}
        <div className="rounded-xl border border-border bg-card p-4 max-h-[55vh] flex flex-col">
          <div className="flex items-center justify-between mb-2 gap-2">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">All vouchers</h2>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              Showing {startIdx + (filteredCards.length === 0 ? 0 : 1)}–{endIdx} of {filteredCards.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mb-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="inline-flex items-center justify-center w-7 h-7 border border-border rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-muted-foreground tabular-nums px-1">
              {safePage + 1}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="inline-flex items-center justify-center w-7 h-7 border border-border rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div className="ml-auto inline-flex items-center gap-1" aria-label="Page size">
              {PAGE_SIZE_OPTIONS.map(sz => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setPageSize(sz)}
                  className={`px-1.5 py-0.5 rounded border text-[11px] tabular-nums transition-colors ${
                    pageSize === sz ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          <ul className="flex flex-col gap-1 overflow-y-auto scrollbar-thin flex-1">
            {pageItems.map(c => {
              const idxInCards = idToIndex.get(c.id) ?? 0;
              const isCurrent = c.id === currentCard.id;
              const cardIssues = validationSummary.issuesByCard.get(c.id);
              const issueCount = cardIssues?.length || 0;
              const cardWorst = cardIssues ? worstSeverity(cardIssues) : null;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setCurrentIndex(idxInCards)}
                    className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg text-left transition-colors ${
                      isCurrent ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                    }`}
                  >
                    <span className="truncate">{idxInCards + 1}. {String(helpers.mappedValue(c, 'patient_name') || `Record ${c.id + 1}`)}</span>
                    <span className="flex items-center gap-1 ml-2 shrink-0">
                      <ValidationBadge count={issueCount} severity={cardWorst} />
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        c.status === 'verified' ? 'bg-primary' : 'bg-warn'
                      } ${isCurrent ? 'ring-1 ring-primary-foreground' : ''}`} />
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredCards.length === 0 && (
              <li className="text-xs text-muted-foreground px-2 py-4 text-center">No vouchers match the current filter.</li>
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}
