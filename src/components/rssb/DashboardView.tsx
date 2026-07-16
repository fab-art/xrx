import { useEffect, useMemo, useState, Fragment, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import { useSessionStore } from '@/store/session-store';
import { useCardHelpers } from './use-card-helpers';
import { AUDIT_ACTION_LABELS, CLASSIFICATION_DEFS } from '@/lib/rssb/config';
import { buildVerifiedWorkbook, buildFilteredWorkbook, buildFilteredCSV, buildTemplateWorkbook, TEMPLATE_COLUMNS, TEMPLATE_COLUMN_LABELS } from '@/lib/rssb/reportGenerators';
import type { ExportTemplateType, TemplateColumnKey } from '@/lib/rssb/reportGenerators';
import { VoucherRowDetail } from './VoucherRowDetail';
import { VoucherDetailDrawer } from './VoucherDetailDrawer';
import { useCountUp } from './use-count-up';
import type { AuditAction, AuditLogEntry, Card } from '@/lib/rssb/types';
import {
  Search, Download, ChevronRight, ChevronDown, Filter, X, FileDown, ArrowUp, ArrowDown,
  CheckSquare, Square, CheckCheck, FileText, Zap,
  FileSpreadsheet, CheckCircle2, Clock, ShieldAlert, Coins, TrendingDown,
  Activity, ArrowRight, Eraser, GitCompareArrows, Sparkles, Inbox,
  PanelRightOpen, AlertTriangle, FileSpreadsheet as FileSpreadsheetIcon,
  ClipboardCheck, Settings2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from './ConfirmDialog';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

// Relative-time formatter for the Recent Activity widget.
// Mirrors AuditLogView.tsx so the two views stay consistent.
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// Format timestamp to short time string (HH:MM)
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Chart colors matching SummaryView
const CHART_COLORS = ['#0f766e', '#c99a2e', '#b91c1c', '#0284c7', '#7c3aed', '#db2777', '#16a34a', '#ea580c'];

// Icon mapping for audit actions, matching AuditLogView's iconFor() pattern.
function activityIconFor(action: AuditAction) {
  if (action === 'verify' || action === 'bulk_verify') return <CheckCircle2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />;
  if (action === 'unverify' || action === 'bulk_unverify') return <Eraser className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />;
  if (action.startsWith('flag_fraud') || action.startsWith('unflag_fraud')) return <ShieldAlert className="w-3.5 h-3.5 text-danger" aria-hidden="true" />;
  if (action.startsWith('flag_') || action.startsWith('unflag_')) return <ShieldAlert className="w-3.5 h-3.5 text-warn-dark" aria-hidden="true" />;
  if (action === 'override_match' || action === 'set_match_note') return <GitCompareArrows className="w-3.5 h-3.5 text-gold-dark" aria-hidden="true" />;
  if (action === 'run_cleaning' || action === 'undo_cleaning') return <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden="true" />;
  return <FileText className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />;
}

type StatusFilter = 'all' | 'pending' | 'verified';
type AdvFilter = 'none' | 'repeated' | 'over40000';
type SortKey = 'none' | 'facility' | 'doctor' | 'voucher' | 'date' | 'amount';

export function DashboardView() {
  const cards = useSessionStore(s => s.cards);
  const headers = useSessionStore(s => s.headers);
  const mapping = useSessionStore(s => s.mapping);
  const fileName = useSessionStore(s => s.fileName);
  const updateCard = useSessionStore(s => s.updateCard);
  const setCurrentIndex = useSessionStore(s => s.setCurrentIndex);
  const setStage = useSessionStore(s => s.setStage);
  const auditLog = useSessionStore(s => s.auditLog);
  const helpers = useCardHelpers();
  const { toast } = useToast();

  // Re-render the Recent Activity widget every 30s so relative timestamps
  // (e.g. "12s ago") stay fresh without user interaction.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Read drill-down facility from Summary chart click
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const facility = sessionStorage.getItem('rssb_drilldown_facility');
      if (facility) {
        sessionStorage.removeItem('rssb_drilldown_facility');
        return facility;
      }
    } catch { /* ignore */ }
    return '';
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [advFilter, setAdvFilter] = useState<AdvFilter>('none');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('none');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [quickExportsOpen, setQuickExportsOpen] = useState(false);
  const [confirmUnverify, setConfirmUnverify] = useState(false);
  const [drawerCardId, setDrawerCardId] = useState<number | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [exportTemplatesOpen, setExportTemplatesOpen] = useState(false);

  const repeatedIds = useMemo(() => {
    const nameHeader = mapping.patient_name;
    if (!nameHeader) return new Set<number>();
    const counts: Record<string, number> = {};
    cards.forEach(c => {
      const n = String(c.row[nameHeader] || '').trim().toLowerCase();
      if (!n) return;
      counts[n] = (counts[n] || 0) + 1;
    });
    const ids = new Set<number>();
    cards.forEach(c => {
      const n = String(c.row[nameHeader] || '').trim().toLowerCase();
      if (n && counts[n] > 1) ids.add(c.id);
    });
    return ids;
  }, [cards, mapping.patient_name]);

  const filteredCards = useMemo(() => {
    let list = cards;
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (advFilter === 'repeated') list = list.filter(c => repeatedIds.has(c.id));
    if (advFilter === 'over40000') list = list.filter(c => (helpers.originalAmount(c) || 0) > 40000);
    if (classificationFilter !== 'all') list = list.filter(c => c.classifications?.[classificationFilter as keyof typeof c.classifications]);
    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter(c => { const d = helpers.dateOf(c); return d && d >= from; });
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter(c => { const d = helpers.dateOf(c); return d && d <= to; });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => Object.values(c.row).some(v => String(v).toLowerCase().includes(q)));
    }
    if (sortBy !== 'none' && advFilter !== 'repeated') {
      const dir = sortDir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        let av: string | number, bv: string | number;
        if (sortBy === 'facility') { av = helpers.facilityOf(a); bv = helpers.facilityOf(b); }
        else if (sortBy === 'doctor') { av = helpers.doctorOf(a); bv = helpers.doctorOf(b); }
        else if (sortBy === 'voucher') { av = helpers.voucherOf(a); bv = helpers.voucherOf(b); }
        else if (sortBy === 'date') { av = helpers.dateOf(a)?.getTime() || 0; bv = helpers.dateOf(b)?.getTime() || 0; }
        else { av = helpers.originalAmount(a) || 0; bv = helpers.originalAmount(b) || 0; }
        if (typeof av === 'string') return av.localeCompare(bv as string) * dir;
        return (av - (bv as number)) * dir;
      });
    }
    if (advFilter === 'repeated') {
      list = [...list].sort((a, b) => {
        const an = String(helpers.mappedValue(a, 'patient_name') || '').trim().toLowerCase();
        const bn = String(helpers.mappedValue(b, 'patient_name') || '').trim().toLowerCase();
        if (an !== bn) return an.localeCompare(bn);
        const ad = helpers.dateOf(a)?.getTime() || 0;
        const bd = helpers.dateOf(b)?.getTime() || 0;
        return ad - bd;
      });
    }
    return list;
  }, [cards, statusFilter, advFilter, classificationFilter, dateFrom, dateTo, sortBy, sortDir, search, repeatedIds, helpers]);

  const filteredTotalAmount = useMemo(
    () => filteredCards.reduce((s, c) => s + (helpers.originalAmount(c) || 0), 0),
    [filteredCards, helpers],
  );

  function toggleExpanded(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleClassification(id: number, key: 'pharma' | 'rssb' | 'fraud') {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    updateCard(id, { classifications: { ...card.classifications, [key]: !card.classifications[key] } });
  }

  function exportAll() {
    const wb = buildVerifiedWorkbook(cards, mapping);
    XLSX.writeFile(wb, `verified_${fileName || 'export'}.xlsx`);
    toast({ title: 'Exported', description: `Verified workbook with ${cards.length} vouchers.` });
  }

  // Export ONLY the currently filtered subset (feature #2 — e.g. only repeated records).
  function exportFiltered() {
    if (filteredCards.length === 0) {
      toast({ title: 'Nothing to export', description: 'No vouchers match the current filter.', variant: 'destructive' });
      return;
    }
    const label = exportLabel(advFilter, classificationFilter, statusFilter);
    const wb = buildFilteredWorkbook(filteredCards, mapping, label);
    XLSX.writeFile(wb, `${label.replace(/\s+/g, '_')}_${fileName || 'export'}.xlsx`);
    toast({ title: 'Filtered export', description: `${filteredCards.length} vouchers exported as "${label}".` });
  }

  // Export the filtered subset as CSV for quick use in other tools.
  function exportFilteredCSV() {
    if (filteredCards.length === 0) {
      toast({ title: 'Nothing to export', description: 'No vouchers match the current filter.', variant: 'destructive' });
      return;
    }
    const csv = buildFilteredCSV(filteredCards, mapping);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filtered_${fileName || 'export'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exported', description: `${filteredCards.length} vouchers exported as CSV.` });
  }

  // Quick export presets — compute a subset independently and export it as XLSX,
  // without mutating the main filter state.
  function quickExport(subset: Card[], label: string) {
    if (subset.length === 0) {
      toast({ title: 'Nothing to export', description: `No vouchers match "${label.replace(/_/g, ' ')}".`, variant: 'destructive' });
      return;
    }
    const wb = buildFilteredWorkbook(subset, mapping, label);
    XLSX.writeFile(wb, `${label}_${fileName || 'export'}.xlsx`);
    toast({ title: 'Quick export', description: `${subset.length} vouchers exported as "${label}".` });
  }

  function runQuickPreset(key: 'fraud_flagged' | 'pending' | 'verified' | 'high_value' | 'repeated_patients') {
    let subset: Card[];
    switch (key) {
      case 'fraud_flagged':
        subset = cards.filter(c => c.classifications?.fraud === true);
        break;
      case 'pending':
        subset = cards.filter(c => c.status === 'pending');
        break;
      case 'verified':
        subset = cards.filter(c => c.status === 'verified');
        break;
      case 'high_value':
        subset = cards.filter(c => (helpers.originalAmount(c) || 0) > 40000);
        break;
      case 'repeated_patients':
        subset = cards.filter(c => repeatedIds.has(c.id));
        break;
    }
    quickExport(subset, key);
  }

  const quickPresets: { key: 'fraud_flagged' | 'pending' | 'verified' | 'high_value' | 'repeated_patients'; label: string; count: number }[] = [
    { key: 'fraud_flagged', label: 'Fraud-flagged', count: cards.filter(c => c.classifications?.fraud === true).length },
    { key: 'pending', label: 'Pending', count: cards.filter(c => c.status === 'pending').length },
    { key: 'verified', label: 'Verified', count: cards.filter(c => c.status === 'verified').length },
    { key: 'high_value', label: 'High-value (>40k)', count: cards.filter(c => (helpers.originalAmount(c) || 0) > 40000).length },
    { key: 'repeated_patients', label: 'Repeated patients', count: repeatedIds.size },
  ];

  function toggleSelected(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filteredCards.map(c => c.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function bulkVerify() {
    if (selectedIds.size === 0) {
      toast({ title: 'No selection', description: 'Select vouchers first using the checkboxes.' });
      return;
    }
    selectedIds.forEach(id => updateCard(id, { status: 'verified' }));
    toast({ title: 'Bulk verified', description: `${selectedIds.size} voucher(s) marked as verified.` });
    clearSelection();
  }

  function bulkUnverify() {
    if (selectedIds.size === 0) {
      toast({ title: 'No selection', description: 'Select vouchers first using the checkboxes.' });
      return;
    }
    selectedIds.forEach(id => updateCard(id, { status: 'pending' }));
    toast({ title: 'Bulk unverified', description: `${selectedIds.size} voucher(s) set to pending.` });
    clearSelection();
  }

  function bulkFlagFraud() {
    if (selectedIds.size === 0) {
      toast({ title: 'No selection', description: 'Select vouchers first using the checkboxes.' });
      return;
    }
    selectedIds.forEach(id => {
      const card = cards.find(c => c.id === id);
      if (card) updateCard(id, { classifications: { ...card.classifications, fraud: true } });
    });
    toast({ title: 'Bulk flagged fraud', description: `${selectedIds.size} voucher(s) flagged as fraud.`, variant: 'destructive' });
    clearSelection();
  }

  // KPI metrics
  const kpiMetrics = useMemo(() => {
    const totalVouchers = cards.length;
    const verifiedCount = cards.filter(c => c.status === 'verified').length;
    const pendingCount = cards.filter(c => c.status === 'pending').length;
    const fraudFlaggedCount = cards.filter(c => c.classifications?.fraud === true).length;
    const totalOriginal = cards.reduce((sum, c) => sum + (helpers.originalAmount(c) || 0), 0);
    const totalDeductions = cards.reduce((sum, c) => sum + (parseFloat(String(c.deduction)) || 0), 0);
    const verifiedPct = totalVouchers > 0 ? Math.round((verifiedCount / totalVouchers) * 100) : 0;
    return { totalVouchers, verifiedCount, verifiedPct, pendingCount, fraudFlaggedCount, totalOriginal, totalDeductions };
  }, [cards, helpers]);

  // Deduction breakdown by category
  const deductionBreakdown = useMemo(() => {
    let pharmaAmount = 0; let pharmaCount = 0;
    let rssbAmount = 0; let rssbCount = 0;
    let fraudAmount = 0; let fraudCount = 0;
    cards.forEach(c => {
      const ded = parseFloat(String(c.deduction)) || 0;
      if (ded <= 0) return;
      if (c.classifications?.fraud) { fraudAmount += ded; fraudCount++; }
      else if (c.classifications?.rssb) { rssbAmount += ded; rssbCount++; }
      else if (c.classifications?.pharma) { pharmaAmount += ded; pharmaCount++; }
      // Uncategorized deductions are not shown in the breakdown
    });
    const totalDeductions = pharmaAmount + rssbAmount + fraudAmount;
    return { pharmaAmount, pharmaCount, rssbAmount, rssbCount, fraudAmount, fraudCount, totalDeductions };
  }, [cards]);

  // Verification donut chart data
  const verificationChartData = useMemo(() => [
    { name: 'Verified', value: kpiMetrics.verifiedCount },
    { name: 'Pending', value: kpiMetrics.pendingCount },
  ], [kpiMetrics.verifiedCount, kpiMetrics.pendingCount]);

  // Quick export deduction vouchers
  function exportDeductionVouchers() {
    const deducted = cards.filter(c => (parseFloat(String(c.deduction)) || 0) > 0);
    if (deducted.length === 0) {
      toast({ title: 'Nothing to export', description: 'No vouchers with deductions found.', variant: 'destructive' });
      return;
    }
    const wb = buildFilteredWorkbook(deducted, mapping, 'deductions');
    XLSX.writeFile(wb, `deductions_${fileName || 'export'}.xlsx`);
    toast({ title: 'Deductions exported', description: `${deducted.length} vouchers with deductions exported.` });
  }

  // Donut chart click handler — filter table to that status
  const onDonutClick = useCallback((_data: { name: string; value: number }, index: number) => {
    if (index === 0) setStatusFilter(prev => prev === 'verified' ? 'all' : 'verified');
    else if (index === 1) setStatusFilter(prev => prev === 'pending' ? 'all' : 'pending');
  }, []);

  // Smart Suggestions — deduction recommendations based on similar vouchers
  interface Suggestion {
    cardId: number;
    voucherNo: string;
    facility: string;
    suggestedDeduction: number;
    basedOnCount: number;
  }

  const smartSuggestions = useMemo<Suggestion[]>(() => {
    // Find vouchers that already have deductions
    const deductedCards = cards.filter(c => {
      const ded = parseFloat(String(c.deduction)) || 0;
      return ded > 0;
    });
    if (deductedCards.length === 0) return [];

    // Build lookup maps for similar voucher deduction amounts
    const byFacility: Record<string, number[]> = {};
    const byDoctor: Record<string, number[]> = {};
    const byPatientType: Record<string, number[]> = {};

    deductedCards.forEach(c => {
      const ded = parseFloat(String(c.deduction)) || 0;
      const fac = String(helpers.facilityOf(c) || '').trim().toLowerCase();
      const doc = String(helpers.doctorOf(c) || '').trim().toLowerCase();
      const pt = String(helpers.mappedValue(c, 'patient_type') || '').trim().toLowerCase();

      if (fac) { if (!byFacility[fac]) byFacility[fac] = []; byFacility[fac].push(ded); }
      if (doc) { if (!byDoctor[doc]) byDoctor[doc] = []; byDoctor[doc].push(ded); }
      if (pt) { if (!byPatientType[pt]) byPatientType[pt] = []; byPatientType[pt].push(ded); }
    });

    function median(arr: number[]): number {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    // For each unverified voucher with no deduction, find similar vouchers and suggest median deduction
    const suggestions: Suggestion[] = [];
    for (const c of cards) {
      const ded = parseFloat(String(c.deduction)) || 0;
      if (ded > 0) continue; // already has deduction

      const fac = String(helpers.facilityOf(c) || '').trim().toLowerCase();
      const doc = String(helpers.doctorOf(c) || '').trim().toLowerCase();
      const pt = String(helpers.mappedValue(c, 'patient_type') || '').trim().toLowerCase();

      // Collect similar deduction amounts
      const similarDeductions: number[] = [];
      let basedOnCount = 0;
      if (fac && byFacility[fac]) { similarDeductions.push(...byFacility[fac]); basedOnCount += byFacility[fac].length; }
      if (doc && byDoctor[doc]) { similarDeductions.push(...byDoctor[doc]); basedOnCount += byDoctor[doc].length; }
      if (pt && byPatientType[pt]) { similarDeductions.push(...byPatientType[pt]); basedOnCount += byPatientType[pt].length; }

      if (similarDeductions.length === 0) continue;

      const med = median(similarDeductions);
      if (med > 0) {
        suggestions.push({
          cardId: c.id,
          voucherNo: helpers.voucherOf(c) || `#${c.id + 1}`,
          facility: helpers.facilityOf(c) || 'Unknown',
          suggestedDeduction: Math.round(med),
          basedOnCount,
        });
      }
    }

    // Sort by suggested deduction amount (highest first) and limit to 10
    return suggestions.sort((a, b) => b.suggestedDeduction - a.suggestedDeduction).slice(0, 10);
  }, [cards, helpers]);

  function applySuggestion(cardId: number, amount: number) {
    updateCard(cardId, { deduction: amount });
    toast({ title: 'Deduction applied', description: `RWF ${amount.toLocaleString()} deduction applied to voucher.` });
  }

  function applyAllSuggestions() {
    if (smartSuggestions.length === 0) return;
    smartSuggestions.forEach(s => updateCard(s.cardId, { deduction: s.suggestedDeduction }));
    toast({ title: 'All suggestions applied', description: `${smartSuggestions.length} deduction(s) applied.` });
  }

  const hasActiveFilter = statusFilter !== 'all' || advFilter !== 'none' || classificationFilter !== 'all' || dateFrom || dateTo || search;

  function clearFilters() {
    setStatusFilter('all');
    setAdvFilter('none');
    setClassificationFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearch('');
  }

  return (
    <div>
      {/* KPI Summary Cards — values animate from 0 → target on mount and on change */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5 kpi-enter">
        <KpiCard
          icon={<FileSpreadsheet className="w-5 h-5" />}
          label="Total Vouchers"
          value={kpiMetrics.totalVouchers}
          accentColor="primary"
          tintClass="bg-primary/5"
          iconBgClass="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Verified"
          value={kpiMetrics.verifiedCount}
          suffix={` (${kpiMetrics.verifiedPct}%)`}
          accentColor="primary"
          tintClass="bg-primary/5"
          iconBgClass="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={<Clock className="w-5 h-5" />}
          label="Pending"
          value={kpiMetrics.pendingCount}
          accentColor="warn"
          tintClass="bg-warn-light/50"
          iconBgClass="bg-warn-light text-warn-dark"
        />
        <KpiCard
          icon={<ShieldAlert className="w-5 h-5" />}
          label="Fraud Flagged"
          value={kpiMetrics.fraudFlaggedCount}
          accentColor="danger"
          tintClass="bg-danger-light/50"
          iconBgClass="bg-danger-light text-danger-dark"
        />
        <KpiCard
          icon={<Coins className="w-5 h-5" />}
          label="Total Original"
          value={kpiMetrics.totalOriginal}
          accentColor="muted"
          tintClass="bg-muted/20"
          iconBgClass="bg-muted text-muted-foreground"
        />
        <KpiCard
          icon={<TrendingDown className="w-5 h-5" />}
          label="Total Deductions"
          value={kpiMetrics.totalDeductions}
          accentColor="gold"
          tintClass="bg-gold-light/50"
          iconBgClass="bg-gold-light text-gold-dark"
        />
      </div>

      {/* Section divider */}
      <div className="flex items-center gap-2 mb-4 mt-1 bg-muted/30 rounded-lg px-4 py-2">
        <span className="w-1 h-4 rounded-full bg-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Analytics Overview</h2>
        <div className="flex-1 h-px bg-border ml-2" />
      </div>

      {/* Verification Progress Donut + Deduction Summary — side by side on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Verification Progress Donut Chart */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm hidden sm:block hover:shadow-md transition-shadow">
          <h3 className="text-sm font-semibold mb-4">Verification Progress</h3>
          <div className="relative" role="img" aria-label="Verification progress donut chart showing verified versus pending vouchers" style={{ height: 200 }}>
            {kpiMetrics.totalVouchers > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={verificationChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={50}
                    onClick={onDonutClick}
                    cursor="pointer"
                    strokeWidth={2}
                    stroke="var(--card)"
                  >
                    <Cell fill={CHART_COLORS[0]} /> {/* Verified — primary teal */}
                    <Cell fill={CHART_COLORS[1]} /> {/* Pending — gold/warn */}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No data yet
              </div>
            )}
            {/* Center text overlay */}
            {kpiMetrics.totalVouchers > 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-3xl font-extrabold tabular-nums">{kpiMetrics.verifiedPct}%</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Verified</p>
                </div>
              </div>
            )}
          </div>
          {/* Color Legend */}
          <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'verified' ? 'all' : 'verified')}
              className={`flex items-center gap-2 text-xs transition-colors ${statusFilter === 'verified' ? 'font-semibold text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[0] }} />
              <span>●</span> Verified ({kpiMetrics.verifiedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'pending' ? 'all' : 'pending')}
              className={`flex items-center gap-2 text-xs transition-colors ${statusFilter === 'pending' ? 'font-semibold text-gold-dark' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[1] }} />
              <span>●</span> Pending ({kpiMetrics.pendingCount})
            </button>
          </div>
        </div>

        {/* Deduction Summary Breakdown Card */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Deduction Summary</h3>
            <button
              onClick={exportDeductionVouchers}
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 hover:border-primary/40 transition-colors"
              title="Export vouchers with deductions to Excel"
            >
              <FileDown className="w-3.5 h-3.5" />
              Quick export deductions
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Total Deductions</span>
              <span className="text-lg font-bold tabular-nums">{deductionBreakdown.totalDeductions.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            {/* Pharmacological */}
            <DeductionBar
              label="Pharmacological"
              amount={deductionBreakdown.pharmaAmount}
              count={deductionBreakdown.pharmaCount}
              pct={deductionBreakdown.totalDeductions > 0 ? (deductionBreakdown.pharmaAmount / deductionBreakdown.totalDeductions) * 100 : 0}
              colorClass="bg-primary"
            />
            {/* RSSB */}
            <DeductionBar
              label="RSSB"
              amount={deductionBreakdown.rssbAmount}
              count={deductionBreakdown.rssbCount}
              pct={deductionBreakdown.totalDeductions > 0 ? (deductionBreakdown.rssbAmount / deductionBreakdown.totalDeductions) * 100 : 0}
              colorClass="bg-warn"
            />
            {/* Fraud */}
            <DeductionBar
              label="Fraud"
              amount={deductionBreakdown.fraudAmount}
              count={deductionBreakdown.fraudCount}
              pct={deductionBreakdown.totalDeductions > 0 ? (deductionBreakdown.fraudAmount / deductionBreakdown.totalDeductions) * 100 : 0}
              colorClass="bg-danger"
            />
          </div>
        </div>
      </div>

      {/* Recent Activity — enhanced with timestamps, voucher IDs, colored dots */}
      <RecentActivityWidget
        entries={auditLog}
        helpers={helpers}
        onViewAll={() => setStage('audit')}
      />

      {/* Smart Suggestions — deduction recommendations */}
      {smartSuggestions.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-3 py-2 mb-4">
          <button
            type="button"
            onClick={() => setSuggestionsOpen(o => !o)}
            aria-expanded={suggestionsOpen}
            className="w-full flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Smart Suggestions</span>
            <span className="text-[11px] font-normal text-muted-foreground ml-1">
              {smartSuggestions.length} deduction recommendation{smartSuggestions.length === 1 ? '' : 's'}
            </span>
            <ChevronDown className={`w-4 h-4 ml-auto text-muted-foreground transition-transform ${suggestionsOpen ? '' : '-rotate-90'}`} />
          </button>
          {suggestionsOpen && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">
                  Based on similar vouchers (same facility, doctor, or patient type) with existing deductions.
                </p>
                <button
                  onClick={applyAllSuggestions}
                  className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Apply all
                </button>
              </div>
              <ul className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
                {smartSuggestions.map(s => (
                  <li key={s.cardId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">Voucher #{s.voucherNo}</span>
                      <span className="text-xs text-muted-foreground ml-2">({s.facility})</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        Suggested: <span className="font-medium text-foreground">RWF {s.suggestedDeduction.toLocaleString()}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        (based on {s.basedOnCount} similar)
                      </span>
                      <button
                        onClick={() => applySuggestion(s.cardId, s.suggestedDeduction)}
                        className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Section divider */}
      <div className="flex items-center gap-2 mb-4 bg-muted/30 rounded-lg px-4 py-2">
        <span className="w-1 h-4 rounded-full bg-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Voucher Table</h2>
        <div className="flex-1 h-px bg-border ml-2" />
      </div>

      {/* Filter & Search bar */}
      <div className="rounded-xl border border-border bg-card p-3 mb-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2.5">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filter & Search</span>
          {hasActiveFilter && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">
              {[statusFilter !== 'all', advFilter !== 'none', classificationFilter !== 'all', !!dateFrom, !!dateTo, !!search.trim()].filter(Boolean).length}
            </span>
          )}
          {hasActiveFilter && (
            <button onClick={clearFilters} className="ml-auto text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search vouchers by any field…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search vouchers"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:ring-1 focus:ring-primary/30"
          />
        </div>
        {/* Divider */}
        <span className="hidden sm:block w-px h-6 bg-border" aria-hidden="true" />
        <div className="flex gap-1" role="group" aria-label="Filter by status">
          {(['all', 'pending', 'verified'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} aria-pressed={statusFilter === f}
              className={`text-xs capitalize rounded-lg px-2.5 py-2 border transition-colors ${statusFilter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-accent'}`}>
              {f}
            </button>
          ))}
        </div>
        {/* Divider */}
        <span className="hidden sm:block w-px h-6 bg-border" aria-hidden="true" />
        <div className="flex gap-1" role="group" aria-label="Advanced filters">
          {([['none', 'No filter'], ['repeated', 'Repeated records'], ['over40000', 'Over 40,000']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setAdvFilter(key)} aria-pressed={advFilter === key}
              className={`text-xs rounded-lg px-2.5 py-2 border transition-colors ${advFilter === key ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-accent'}`}>
              {label}
            </button>
          ))}
        </div>
        <select value={classificationFilter} onChange={e => setClassificationFilter(e.target.value)} aria-label="Filter by deduction category"
          className="text-xs border border-border rounded-lg px-2.5 py-2 bg-card">
          <option value="all">All deduction categories</option>
          {CLASSIFICATION_DEFS.map(c => (<option key={c.key} value={c.key}>{c.label}</option>))}
        </select>
        {/* Divider */}
        <span className="hidden sm:block w-px h-6 bg-border" aria-hidden="true" />
        <div className="flex items-center gap-1">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="Date from" className="text-xs border border-border rounded-lg px-2 py-2 bg-card" />
          <span className="text-xs text-muted-foreground">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="Date to" className="text-xs border border-border rounded-lg px-2 py-2 bg-card" />
        </div>
        {/* Divider */}
        <span className="hidden sm:block w-px h-6 bg-border" aria-hidden="true" />
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} disabled={advFilter === 'repeated'} aria-label="Sort by"
          title={advFilter === 'repeated' ? 'Repeated records are always grouped by patient name' : undefined}
          className="text-xs border border-border rounded-lg px-2.5 py-2 bg-card disabled:opacity-40">
          <option value="none">{advFilter === 'repeated' ? 'Sort: grouped by name' : 'Sort: none'}</option>
          <option value="facility">Sort by facility</option>
          <option value="doctor">Sort by doctor</option>
          <option value="voucher">Sort by voucher no</option>
          <option value="date">Sort by date</option>
          <option value="amount">Sort by claim amount</option>
        </select>
        <button onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} disabled={sortBy === 'none' || advFilter === 'repeated'} aria-label="Toggle sort direction"
          className="text-xs border border-border rounded-lg px-2.5 py-2 bg-card hover:bg-accent disabled:opacity-40 inline-flex items-center gap-1">
          {sortDir === 'asc' ? <><ArrowUp className="w-3 h-3" /> Asc</> : <><ArrowDown className="w-3 h-3" /> Desc</>}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportFilteredCSV}
            disabled={filteredCards.length === 0}
            className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 border border-border bg-card hover:bg-accent transition-colors disabled:opacity-50"
            title="Export filtered data as CSV"
          >
            <FileText className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={exportFiltered}
            disabled={filteredCards.length === 0}
            className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 border border-border bg-card hover:bg-accent transition-colors disabled:opacity-50"
            title="Export only the vouchers matching the current filter"
          >
            <FileDown className="w-4 h-4" />
            Export filtered
          </button>
          <button
            onClick={exportAll}
            className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export all
          </button>
          <button
            onClick={() => setExportTemplatesOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
            title="Export using pre-configured templates"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Templates
          </button>
        </div>
        </div>
      </div>

      {/* Quick export presets — collapsible disclosure */}
      <div className="rounded-lg border border-border bg-card px-3 py-2 mb-4">
        <button
          type="button"
          onClick={() => setQuickExportsOpen(o => !o)}
          aria-expanded={quickExportsOpen}
          aria-controls="quick-export-presets"
          className="w-full flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Zap className="w-4 h-4 text-primary" />
          <span>Quick export presets</span>
          <ChevronDown className={`w-4 h-4 ml-auto text-muted-foreground transition-transform ${quickExportsOpen ? '' : '-rotate-90'}`} />
        </button>
        {quickExportsOpen && (
          <div id="quick-export-presets" className="mt-3 flex flex-wrap gap-2">
            {quickPresets.map(p => (
              <button
                key={p.key}
                onClick={() => runQuickPreset(p.key)}
                className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border border-border bg-background hover:bg-accent hover:border-primary/40 transition-colors"
                title={`Export ${p.count} voucher${p.count === 1 ? '' : 's'} matching this preset`}
              >
                <FileDown className="w-3.5 h-3.5 text-primary" />
                {p.label}
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {p.count}
                </span>
              </button>
            ))}
            <p className="w-full text-[11px] text-muted-foreground mt-1">
              Presets export a filtered subset as Excel without changing the main filter above.
            </p>
          </div>
        )}
      </div>

      {/* Inline selection count indicator (replaces old toolbar — the main actions are in the floating bar) */}

      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <span className="rounded-lg bg-primary/10 text-primary px-3 py-1.5 font-medium">
          {filteredCards.length} voucher{filteredCards.length === 1 ? '' : 's'} in this view
        </span>
        <span className="text-muted-foreground">Total amount: <span className="text-foreground font-medium">{filteredTotalAmount.toLocaleString()}</span></span>
        {hasActiveFilter && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filtered
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border max-h-[70vh] overflow-y-auto scrollbar-thin">
        <table className="w-full text-sm bg-card">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="text-xs text-muted-foreground text-left border-b border-border">
              <th className="px-2 py-2 w-8">
                <input
                  type="checkbox"
                  checked={filteredCards.length > 0 && selectedIds.size === filteredCards.length}
                  onChange={() => selectedIds.size === filteredCards.length ? clearSelection() : selectAllFiltered()}
                  aria-label="Select all"
                  className="accent-primary cursor-pointer"
                />
              </th>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Voucher No</th>
              <th className="px-3 py-2 font-medium">Patient</th>
              <th className="px-3 py-2 font-medium">Dispensed</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Approved</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Categories</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filteredCards.map(c => {
              const isOpen = expandedIds.has(c.id);
              const isSelected = selectedIds.has(c.id);
              const isDrawerSelected = drawerCardId === c.id;
              return (
                <Fragment key={c.id}>
                  <tr
                    onClick={() => setDrawerCardId(c.id)}
                    className={`border-t border-border cursor-pointer hover:bg-accent/50 transition-colors ${
                      isSelected ? 'bg-primary/5' : ''
                    } ${isDrawerSelected ? 'bg-primary/10' : ''}`}
                    style={isDrawerSelected ? { boxShadow: 'inset 4px 0 0 var(--primary)' } : undefined}
                  >
                    <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(c.id)}
                        aria-label={`Select voucher ${c.id + 1}`}
                        className="accent-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.id + 1}</td>
                    <td className="px-3 py-2 font-medium">{helpers.voucherOf(c) || '—'}</td>
                    <td className="px-3 py-2">{String(helpers.mappedValue(c, 'patient_name') || '—')}</td>
                    <td className="px-3 py-2">{helpers.dispensingDateOf(c)?.toLocaleDateString() ?? '—'}</td>
                    <td className="px-3 py-2">{helpers.originalAmount(c)?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2">{helpers.approvedAmount(c)?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 text-xs capitalize px-2 py-0.5 rounded-full ${c.status === 'verified' ? 'bg-primary/10 text-primary' : c.classifications?.fraud ? 'bg-danger-light text-danger-dark' : 'bg-warn-light text-warn-dark'}`}>
                        {c.status === 'verified' ? <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> : c.classifications?.fraud ? <ShieldAlert className="w-3.5 h-3.5 text-danger" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                        {c.status === 'verified' ? 'Verified' : c.classifications?.fraud ? 'Fraud' : c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 space-x-1">
                      {CLASSIFICATION_DEFS.filter(cl => c.classifications?.[cl.key]).map(cl => (
                        <span key={cl.key} className={`text-xs px-2 py-0.5 rounded-full ${cl.key === 'fraud' ? 'bg-danger-light text-danger-dark' : 'bg-muted border border-border'}`}>{cl.label}</span>
                      ))}
                      {helpers.needsFraudReview(c) && <span className="text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger-dark">Needs review</span>}
                      {repeatedIds.has(c.id) && <span className="text-xs px-2 py-0.5 rounded-full bg-warn-light text-warn-dark">Repeat</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); setDrawerCardId(c.id); }}
                          aria-label={`Open details for voucher ${helpers.voucherOf(c) || c.id + 1} in side drawer`}
                          title="Open detail drawer"
                          className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors focus-ring ${
                            isDrawerSelected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:bg-accent text-muted-foreground hover:text-primary'
                          }`}
                        >
                          <PanelRightOpen className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); toggleExpanded(c.id); }}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Collapse voucher details inline' : 'Expand voucher details inline'}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-accent text-muted-foreground transition-colors"
                        >
                          <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t border-border bg-background">
                      <td colSpan={10} className="px-4 py-4">
                        <VoucherRowDetail
                          card={c}
                          headers={headers}
                          onUpdateCard={updateCard}
                          onToggleClassification={toggleClassification}
                          onOpenFullView={() => { setCurrentIndex(cards.findIndex(x => x.id === c.id)); setStage('verify'); }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filteredCards.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-16">
                  <div className="empty-state">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                      <Inbox className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <div className="text-center max-w-sm">
                      <p className="text-sm font-semibold text-foreground">No vouchers match this filter</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {hasActiveFilter
                          ? 'Try adjusting or clearing the filters above to see more vouchers.'
                          : 'Upload a pharmacy claims file from the Sessions view to get started.'}
                      </p>
                    </div>
                    {hasActiveFilter && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors btn-press"
                      >
                        <X className="w-3.5 h-3.5" />
                        Clear filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmUnverify}
        onOpenChange={setConfirmUnverify}
        title="Unverify selected vouchers?"
        description={`This will set ${selectedIds.size} voucher(s) back to pending status. Their verified status will be cleared.`}
        confirmLabel="Unverify"
        variant="danger"
        onConfirm={() => { bulkUnverify(); setConfirmUnverify(false); }}
      />

      {/* Export Templates Dialog */}
      <ExportTemplatesDialog
        open={exportTemplatesOpen}
        onOpenChange={setExportTemplatesOpen}
        cards={filteredCards}
        mapping={mapping}
        fileName={fileName}
      />

      <VoucherDetailDrawer
        open={drawerCardId !== null}
        onOpenChange={o => { if (!o) setDrawerCardId(null); }}
        cards={filteredCards}
        currentId={drawerCardId}
        onNavigate={id => setDrawerCardId(id)}
        headers={headers}
      />

      {/* Floating Batch Action Toolbar — slides up from bottom when vouchers are selected */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out ${
          selectedIds.size > 0 ? 'translate-y-0' : 'translate-y-full'
        }`}
        aria-live="polite"
      >
        <div className="mx-auto max-w-3xl px-4 pb-4">
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-t-xl rounded-b-lg bg-card/90 backdrop-blur-lg border border-border shadow-lg shadow-black/10">
            <span className="text-sm font-semibold tabular-nums text-primary min-w-fit">
              {selectedIds.size} selected
            </span>
            <div className="w-px h-6 bg-border shrink-0" />
            <button
              onClick={bulkVerify}
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors btn-press"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark verified
            </button>
            <button
              onClick={bulkFlagFraud}
              className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-2 bg-danger text-danger-dark hover:bg-danger/90 transition-colors btn-press"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Flag fraud
            </button>
            <button
              onClick={selectAllFiltered}
              className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 border border-border bg-background hover:bg-accent transition-colors"
              title={`Select all ${filteredCards.length} filtered vouchers`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Select all filtered
            </button>
            <button
              onClick={clearSelection}
              className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              <X className="w-3.5 h-3.5" />
              Clear selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function exportLabel(advFilter: AdvFilter, classificationFilter: string, statusFilter: StatusFilter): string {
  const parts: string[] = [];
  if (statusFilter !== 'all') parts.push(statusFilter);
  if (advFilter === 'repeated') parts.push('repeated');
  else if (advFilter === 'over40000') parts.push('over_40000');
  if (classificationFilter !== 'all') parts.push(classificationFilter);
  return parts.length ? parts.join('_') : 'filtered';
}

/* ---------- KPI Card ---------- */

const accentBorderMap: Record<string, string> = {
  primary: 'border-l-primary',
  warn: 'border-l-warn',
  danger: 'border-l-danger',
  brand: 'border-l-muted-foreground',
  gold: 'border-l-gold',
  muted: 'border-l-muted-foreground',
};

// Gradient backgrounds for each accent category
const gradientBgMap: Record<string, string> = {
  primary: 'bg-gradient-to-br from-primary/5 to-transparent',
  warn: 'bg-gradient-to-br from-warn/5 to-transparent',
  danger: 'bg-gradient-to-br from-danger/5 to-transparent',
  brand: 'bg-gradient-to-br from-muted/10 to-transparent',
  gold: 'bg-gradient-to-br from-gold/5 to-transparent',
  muted: 'bg-gradient-to-br from-muted/10 to-transparent',
};

function KpiCard({
  icon,
  label,
  value,
  suffix,
  accentColor,
  tintClass,
  iconBgClass,
}: {
  icon: React.ReactNode;
  label: string;
  /** Numeric value to animate from 0 → target. */
  value: number;
  /** Optional text appended after the animated number (e.g. " (52%)"). */
  suffix?: string;
  accentColor: string;
  tintClass: string;
  iconBgClass: string;
}) {
  // Animate the numeric portion from 0 → target over ~800ms on mount.
  const animated = useCountUp(value);
  const display = `${Math.round(animated).toLocaleString()}${suffix ?? ''}`;
  return (
    <div
      className={`relative rounded-xl border border-border border-l-4 ${accentBorderMap[accentColor] || 'border-l-primary'} ${tintClass} ${gradientBgMap[accentColor] || ''} p-5 hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBgClass}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}<span className="sr-only"> {label === 'Fraud Flagged' ? 'fraud flagged vouchers' : label === 'Verified' ? 'verified vouchers' : label === 'Pending' ? 'pending vouchers' : ''}</span></p>
          <p className="text-xl font-bold tabular-nums tracking-tight truncate" aria-label={`${label}: ${Math.round(value).toLocaleString()}${suffix ?? ''}`}>
            {display}
          </p>
        </div>
      </div>
    </div>
  );
}

function DeductionBar({ label, amount, count, pct, colorClass }: {
  label: string;
  amount: number;
  count: number;
  pct: number;
  colorClass: string;
}) {
  const pctDisplay = pct > 0 ? `${pct.toFixed(1)}%` : '0%';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {count} voucher{count === 1 ? '' : 's'} · <span className="font-medium text-foreground">{pctDisplay}</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden relative">
        <div
          className={`h-full rounded-full ${colorClass} progress-animate`}
          style={{ width: `${Math.max(pct, 0)}%` }}
        />
        {pct > 10 && (
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-primary-foreground/80 pointer-events-none" style={{ width: `${Math.max(pct, 0)}%` }}>
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- Recent Activity Widget ---------- */

interface RecentActivityWidgetProps {
  entries: AuditLogEntry[];
  helpers: ReturnType<typeof useCardHelpers>;
  onViewAll: () => void;
}

// Colored dot indicator for audit actions
function activityDotFor(action: AuditAction): string {
  if (action === 'verify' || action === 'bulk_verify') return 'bg-primary';
  if (action.startsWith('flag_fraud') || action.startsWith('unflag_fraud')) return 'bg-danger';
  if (action === 'override_match' || action === 'set_match_note') return 'bg-gold';
  if (action === 'run_cleaning' || action === 'undo_cleaning') return 'bg-primary';
  return 'bg-muted-foreground';
}

function RecentActivityWidget({ entries, helpers, onViewAll }: RecentActivityWidgetProps) {
  // Take the 5 most recent entries (audit log is appended chronologically,
  // so slice from the end).
  const recent: AuditLogEntry[] = useMemo(() => {
    return [...entries].slice(-5).reverse();
  }, [entries]);

  // Subscribe to cards so the widget updates when card metadata (voucher #,
  // patient name) changes — uses a Map for O(1) lookup per entry.
  const cards = useSessionStore(s => s.cards);
  const cardMap = useMemo(() => {
    const m = new Map<number, Card>();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  const metaFor = (e: AuditLogEntry): { voucher: string | null } => {
    if (e.cardId === undefined) return { voucher: null };
    const card = cardMap.get(e.cardId);
    if (!card) return { voucher: null };
    return { voucher: helpers.voucherOf(card) || `#${card.id + 1}` };
  };

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 mb-5 shadow-sm"
      aria-label="Recent activity"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Recent activity</h3>
          {recent.length > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              · last {recent.length} action{recent.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {recent.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View all
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {recent.length === 0 ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No actions yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verify a voucher to get started — recent actions will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="relative max-h-48 overflow-y-auto scrollbar-thin">
          {/* Vertical timeline connector line */}
          <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" aria-hidden="true" />
          <ul
            className="space-y-1"
            aria-label="Recent audit log entries"
          >
          {recent.map((e, i) => {
            const meta = metaFor(e);
            return (
              <li
                key={e.id}
                className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/50 ${i % 2 === 0 ? 'bg-muted/20' : ''}`}
              >
                {/* Colored dot indicator with timeline ring */}
                <span className={`shrink-0 w-2.5 h-2.5 rounded-full border-2 border-card ${activityDotFor(e.action)} z-10`} aria-hidden="true" />
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="text-xs font-medium truncate">
                    {AUDIT_ACTION_LABELS[e.action]}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                    {meta.voucher && (
                      <span className="rounded bg-muted px-1 py-0.5 tabular-nums">{meta.voucher}</span>
                    )}
                    {e.cardIds && e.cardIds.length > 0 && (
                      <span className="rounded bg-muted px-1 py-0.5">{e.cardIds.length} vouchers</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums block">{timeAgo(e.ts)}</span>
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums block">{formatTime(e.ts)}</span>
                </div>
              </li>
            );
          })}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------- Export Templates Dialog ---------- */

interface ExportTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: Card[];
  mapping: Mapping;
  fileName: string;
}

function ExportTemplatesDialog({ open, onOpenChange, cards, mapping, fileName }: ExportTemplatesDialogProps) {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<ExportTemplateType | null>(null);
  const [customColumns, setCustomColumns] = useState<Set<TemplateColumnKey>>(new Set(TEMPLATE_COLUMNS));

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTemplate(null);
      setCustomColumns(new Set(TEMPLATE_COLUMNS));
    }
  }, [open]);

  const templates: { key: ExportTemplateType; name: string; description: string; icon: React.ReactNode }[] = [
    {
      key: 'rssb_standard',
      name: 'RSSB Standard Report',
      description: 'All vouchers with standard columns, styled headers, and totals row.',
      icon: <FileSpreadsheet className="w-5 h-5 text-primary" />,
    },
    {
      key: 'internal_audit',
      name: 'Internal Audit Report',
      description: 'Fraud-flagged and pending vouchers with audit columns and facility summary.',
      icon: <ClipboardCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
    },
    {
      key: 'custom',
      name: 'Custom Export',
      description: 'Pick which columns to include. Preview the first 5 rows before exporting.',
      icon: <Settings2 className="w-5 h-5 text-muted-foreground" />,
    },
  ];

  function toggleColumn(key: TemplateColumnKey) {
    setCustomColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllColumns() {
    setCustomColumns(new Set(TEMPLATE_COLUMNS));
  }

  function clearAllColumns() {
    setCustomColumns(new Set());
  }

  function handleExport() {
    if (!selectedTemplate) return;
    if (selectedTemplate === 'custom' && customColumns.size === 0) {
      toast({ title: 'No columns selected', description: 'Select at least one column to export.', variant: 'destructive' });
      return;
    }
    if (cards.length === 0) {
      toast({ title: 'Nothing to export', description: 'No vouchers available to export.', variant: 'destructive' });
      return;
    }

    const wb = buildTemplateWorkbook(cards, mapping, selectedTemplate, {
      selectedColumns: selectedTemplate === 'custom' ? [...customColumns] : undefined,
    });

    const templateName = templates.find(t => t.key === selectedTemplate)?.name || 'Export';
    XLSX.writeFile(wb, `${templateName.replace(/\s+/g, '_')}_${fileName || 'export'}.xlsx`);
    toast({ title: 'Template exported', description: `${cards.length} voucher(s) exported using "${templateName}".` });
    onOpenChange(false);
  }

  // Preview data for custom export
  const previewRows = useMemo(() => {
    if (selectedTemplate !== 'custom' || customColumns.size === 0) return [];
    const cols = [...customColumns];
    return cards.slice(0, 5).map(c => {
      const row: Record<string, unknown> = {};
      cols.forEach(k => { row[TEMPLATE_COLUMN_LABELS[k]] = getTemplateColumnValue(c, k, mapping); });
      return row;
    });
  }, [selectedTemplate, customColumns, cards, mapping]);

  // Column preview for RSSB Standard and Internal Audit
  const templateColumnsPreview = useMemo(() => {
    if (selectedTemplate === 'rssb_standard') {
      return ['Voucher #', 'Patient Name', 'RAMA #', 'Facility', 'Original Amount', 'Approved Amount', 'Deduction', 'Status', 'Prescription Date', 'Comment'];
    }
    if (selectedTemplate === 'internal_audit') {
      return ['Voucher #', 'Patient Name', 'RAMA #', 'Facility', 'Original Amount', 'Approved Amount', 'Deduction', 'Status', 'Fraud Activity', 'Prescription Date', 'Comment', '+ Facility Summary sheet'];
    }
    return [];
  }, [selectedTemplate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Export Templates
          </DialogTitle>
        </DialogHeader>

        {!selectedTemplate ? (
          /* Template selection grid */
          <div className="grid gap-3">
            {templates.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelectedTemplate(t.key)}
                className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 text-left hover:bg-accent/50 hover:border-primary/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  {t.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              </button>
            ))}
          </div>
        ) : selectedTemplate === 'custom' ? (
          /* Custom export — column picker + preview */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                ← Back to templates
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={selectAllColumns} className="text-xs text-primary hover:underline">Select all</button>
                <span className="text-xs text-muted-foreground">/</span>
                <button type="button" onClick={clearAllColumns} className="text-xs text-muted-foreground hover:text-foreground">Clear all</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto scrollbar-thin">
              {TEMPLATE_COLUMNS.map(key => (
                <label key={key} className="flex items-center gap-2 text-xs cursor-pointer rounded-lg border border-border px-2.5 py-2 hover:bg-accent/50 transition-colors">
                  <Checkbox
                    checked={customColumns.has(key)}
                    onCheckedChange={() => toggleColumn(key)}
                    className="shrink-0"
                  />
                  <span className="truncate">{TEMPLATE_COLUMN_LABELS[key]}</span>
                </label>
              ))}
            </div>
            {previewRows.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Preview (first 5 rows)</p>
                <div className="overflow-x-auto border border-border rounded-lg max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {[...customColumns].map(k => (
                          <th key={k} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{TEMPLATE_COLUMN_LABELS[k]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          {[...customColumns].map(k => (
                            <td key={k} className="px-2 py-1.5 truncate max-w-[120px]">{String(row[TEMPLATE_COLUMN_LABELS[k]] ?? '—')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* RSSB Standard / Internal Audit — description + column preview */
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedTemplate(null)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              ← Back to templates
            </button>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm font-medium mb-1">{templates.find(t => t.key === selectedTemplate)?.name}</p>
              <p className="text-xs text-muted-foreground">{templates.find(t => t.key === selectedTemplate)?.description}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Included columns</p>
              <div className="flex flex-wrap gap-1.5">
                {templateColumnsPreview.map(col => (
                  <span key={col} className="text-[11px] px-2 py-1 rounded-full bg-muted border border-border">{col}</span>
                ))}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {cards.length} voucher{cards.length === 1 ? '' : 's'} will be exported.
            </div>
          </div>
        )}

        <DialogFooter>
          {selectedTemplate && (
            <button
              onClick={handleExport}
              disabled={selectedTemplate === 'custom' && customColumns.size === 0}
              className="inline-flex items-center gap-2 text-sm rounded-lg px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Resolve a template column value for preview. */
function getTemplateColumnValue(card: Card, key: TemplateColumnKey, mapping: Mapping): unknown {
  switch (key) {
    case 'voucher_no': return card.row[mapping.voucher_no || ''] || '';
    case 'patient_name': return card.row[mapping.patient_name || ''] || '';
    case 'rama_number': return card.row[mapping.rama_number || ''] || '';
    case 'facility': return card.facilityOverride || card.row[mapping.facility_name || ''] || '';
    case 'original_amount': return card.row[mapping.amount || ''] || '';
    case 'approved_amount': return '';
    case 'deduction': return card.deduction || 0;
    case 'status': return card.status;
    case 'prescription_date': return card.prescriptionDate;
    case 'comment': return card.comment;
    case 'pharma_compliance': return card.classifications?.pharma ? 'Yes' : 'No';
    case 'rssb_compliance': return card.classifications?.rssb ? 'Yes' : 'No';
    case 'fraud_activity': return card.classifications?.fraud ? 'Yes' : 'No';
    case 'explanation': return card.explanation;
    case 'match_category': return '';
    case 'match_score': return '';
    case 'reviewer_note': return '';
    default: return '';
  }
}
