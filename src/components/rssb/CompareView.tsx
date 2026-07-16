'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  GitCompare, ArrowLeftRight, ArrowUp, ArrowDown, Minus, Loader2,
  Download, FileSpreadsheet, FilePlus2, ShieldAlert, CheckCircle2,
  AlertCircle, RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSessionStore } from '@/store/session-store';
import { listSessions, getSession } from '@/lib/rssb/sessionApi';
import type { Card, Mapping, SessionMeta, SessionState } from '@/lib/rssb/types';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/* ------------------------------------------------------------------ */
/*  Inline mapping-bound helpers                                       */
/*  (Independent of useCardHelpers so we can compare any session's     */
/*  cards without disturbing the live working session.)                */
/* ------------------------------------------------------------------ */

function voucherOfFromMapping(card: Card, mapping: Mapping): string {
  const h = mapping.voucher_no;
  if (!h) return String(card.id + 1);
  return String(card.row[h] ?? '').trim();
}

function patientNameFromMapping(card: Card, mapping: Mapping): string {
  const h = mapping.patient_name;
  if (!h) return '';
  return String(card.row[h] ?? '').trim();
}

function amountFromMapping(card: Card, mapping: Mapping): number {
  const h = mapping.amount;
  if (!h) return 0;
  const v = parseFloat(String(card.row[h] ?? ''));
  return isNaN(v) ? 0 : v;
}

function deductionOf(card: Card): number {
  const v = parseFloat(String(card.deduction));
  return isNaN(v) ? 0 : v;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SessionBundle = { meta: SessionMeta; state: SessionState };

interface KpiRow {
  key: string;
  label: string;
  valueA: number;
  valueB: number;
  /** 'more' = more is better (green); 'less' = less is better (green when delta<0); 'neutral' = no judgement */
  polarity: 'more' | 'less' | 'neutral';
  /** whether to show a percentage alongside the raw value (verified) */
  showPct?: boolean;
  totalA?: number;
  totalB?: number;
}

interface CommonRow {
  voucher: string;
  patientA: string;
  patientB: string;
  statusA: string;
  statusB: string;
  deductionA: number;
  deductionB: number;
  amountA: number;
  amountB: number;
  changed: boolean;
}

interface OnlyRow {
  voucher: string;
  patient: string;
  status: string;
  deduction: number;
  amount: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CompareView() {
  const { toast } = useToast();
  const setStage = useSessionStore(s => s.setStage);

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [aId, setAId] = useState<string>('');
  const [bId, setBId] = useState<string>('');
  const [sessionA, setSessionA] = useState<SessionBundle | null>(null);
  const [sessionB, setSessionB] = useState<SessionBundle | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [exporting, setExporting] = useState(false);

  /* ----- Load the sessions list on mount ----- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      try {
        const list = await listSessions();
        if (cancelled) return;
        // Sort newest first for predictable default selection
        const sorted = [...list].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        setSessions(sorted);
        // Default to the two most-recently-updated sessions (different ids)
        if (sorted.length >= 2 && !aId && !bId) {
          setAId(sorted[0].id);
          setBId(sorted[1].id);
        } else if (sorted.length === 1 && !aId) {
          setAId(sorted[0].id);
        }
      } catch (e) {
        if (!cancelled) {
          toast({
            title: 'Failed to load sessions',
            description: (e as Error).message,
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ----- Load Session A whenever its id changes ----- */
  useEffect(() => {
    if (!aId) { setSessionA(null); return; }
    let cancelled = false;
    setLoadingA(true);
    getSession(aId)
      .then(bundle => { if (!cancelled) setSessionA(bundle); })
      .catch(e => {
        if (!cancelled) {
          setSessionA(null);
          toast({
            title: 'Failed to load Session A',
            description: (e as Error).message,
            variant: 'destructive',
          });
        }
      })
      .finally(() => { if (!cancelled) setLoadingA(false); });
    return () => { cancelled = true; };
  }, [aId, toast]);

  /* ----- Load Session B whenever its id changes ----- */
  useEffect(() => {
    if (!bId) { setSessionB(null); return; }
    let cancelled = false;
    setLoadingB(true);
    getSession(bId)
      .then(bundle => { if (!cancelled) setSessionB(bundle); })
      .catch(e => {
        if (!cancelled) {
          setSessionB(null);
          toast({
            title: 'Failed to load Session B',
            description: (e as Error).message,
            variant: 'destructive',
          });
        }
      })
      .finally(() => { if (!cancelled) setLoadingB(false); });
    return () => { cancelled = true; };
  }, [bId, toast]);

  /* ----- Build voucher maps (keyed by lowercased voucher_no) ----- */
  const diff = useMemo(() => {
    if (!sessionA || !sessionB) return null;

    const mapA = new Map<string, Card>();
    const mapB = new Map<string, Card>();

    sessionA.state.cards.forEach(c => {
      const k = voucherOfFromMapping(c, sessionA.state.mapping).toLowerCase().trim();
      if (k) mapA.set(k, c);
    });
    sessionB.state.cards.forEach(c => {
      const k = voucherOfFromMapping(c, sessionB.state.mapping).toLowerCase().trim();
      if (k) mapB.set(k, c);
    });

    const common: CommonRow[] = [];
    const onlyInA: OnlyRow[] = [];
    const onlyInB: OnlyRow[] = [];

    const mappingA = sessionA.state.mapping;
    const mappingB = sessionB.state.mapping;

    mapA.forEach((cardA, key) => {
      const cardB = mapB.get(key);
      if (cardB) {
        const statusA = cardA.status;
        const statusB = cardB.status;
        const deductionA = deductionOf(cardA);
        const deductionB = deductionOf(cardB);
        const amountA = amountFromMapping(cardA, mappingA);
        const amountB = amountFromMapping(cardB, mappingB);
        common.push({
          voucher: voucherOfFromMapping(cardA, mappingA) || key,
          patientA: patientNameFromMapping(cardA, mappingA),
          patientB: patientNameFromMapping(cardB, mappingB),
          statusA,
          statusB,
          deductionA,
          deductionB,
          amountA,
          amountB,
          changed:
            statusA !== statusB ||
            deductionA !== deductionB ||
            Math.abs(amountA - amountB) > 0.01,
        });
      } else {
        onlyInA.push({
          voucher: voucherOfFromMapping(cardA, mappingA) || key,
          patient: patientNameFromMapping(cardA, mappingA),
          status: cardA.status,
          deduction: deductionOf(cardA),
          amount: amountFromMapping(cardA, mappingA),
        });
      }
    });

    mapB.forEach((cardB, key) => {
      if (!mapA.has(key)) {
        onlyInB.push({
          voucher: voucherOfFromMapping(cardB, mappingB) || key,
          patient: patientNameFromMapping(cardB, mappingB),
          status: cardB.status,
          deduction: deductionOf(cardB),
          amount: amountFromMapping(cardB, mappingB),
        });
      }
    });

    // Sort common rows so changed ones appear first
    common.sort((x, y) => Number(y.changed) - Number(x.changed) || x.voucher.localeCompare(y.voucher));
    onlyInA.sort((x, y) => x.voucher.localeCompare(y.voucher));
    onlyInB.sort((x, y) => x.voucher.localeCompare(y.voucher));

    return { common, onlyInA, onlyInB };
  }, [sessionA, sessionB]);

  /* ----- KPI rows for side-by-side grid ----- */
  const kpis: KpiRow[] = useMemo(() => {
    if (!sessionA || !sessionB) return [];
    const cardsA = sessionA.state.cards;
    const cardsB = sessionB.state.cards;
    const totalA = cardsA.length;
    const totalB = cardsB.length;
    const verifiedA = cardsA.filter(c => c.status === 'verified').length;
    const verifiedB = cardsB.filter(c => c.status === 'verified').length;
    const pendingA = totalA - verifiedA;
    const pendingB = totalB - verifiedB;
    const fraudA = cardsA.filter(c => c.classifications?.fraud).length;
    const fraudB = cardsB.filter(c => c.classifications?.fraud).length;
    const matchedA = sessionA.meta.matchCount || verifiedA;
    const matchedB = sessionB.meta.matchCount || verifiedB;
    return [
      { key: 'total', label: 'Total vouchers', valueA: totalA, valueB: totalB, polarity: 'neutral' },
      {
        key: 'verified', label: 'Verified', valueA: verifiedA, valueB: verifiedB,
        polarity: 'more', showPct: true, totalA, totalB,
      },
      {
        key: 'pending', label: 'Pending', valueA: pendingA, valueB: pendingB,
        polarity: 'less',
      },
      {
        key: 'fraud', label: 'Fraud flagged', valueA: fraudA, valueB: fraudB,
        polarity: 'less',
      },
      {
        key: 'matched', label: 'Matched', valueA: matchedA, valueB: matchedB,
        polarity: 'more',
      },
    ];
  }, [sessionA, sessionB]);

  /* ----- Swap A and B ----- */
  function handleSwap() {
    setAId(bId);
    setBId(aId);
  }

  /* ----- Export diff report as Excel ----- */
  async function handleExport() {
    if (!diff || !sessionA || !sessionB) return;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const headerStyle: XLSX.CellObject['s'] = {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '0F766E' }, patternType: 'solid' },
        alignment: { horizontal: 'center' },
      };
      const dataStyle: XLSX.CellObject['s'] = {
        font: { name: 'Calibri', sz: 11 },
        alignment: { horizontal: 'left' },
      };
      const changedStyle: XLSX.CellObject['s'] = {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'B45309' } },
        fill: { fgColor: { rgb: 'FEF3C7' }, patternType: 'solid' },
        alignment: { horizontal: 'left' },
      };

      /* Common sheet */
      const commonCols = [
        'Voucher #', 'Patient (A)', 'Patient (B)',
        'Status A', 'Status B',
        'Deduction A', 'Deduction B',
        'Amount A', 'Amount B',
        'Changed',
      ];
      const commonAoa: (string | number)[][] = [commonCols];
      diff.common.forEach(r => {
        commonAoa.push([
          r.voucher,
          r.patientA,
          r.patientB,
          r.statusA,
          r.statusB,
          r.deductionA,
          r.deductionB,
          r.amountA,
          r.amountB,
          r.changed ? 'YES' : 'no',
        ]);
      });
      const commonWs = XLSX.utils.aoa_to_sheet(commonAoa);
      commonWs['!cols'] = [
        { wch: 14 }, { wch: 24 }, { wch: 24 },
        { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 },
        { wch: 10 },
      ];
      commonAoa.forEach((row, r) => {
        row.forEach((_, ci) => {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const cell = commonWs[addr];
          if (!cell) return;
          cell.s = r === 0 ? headerStyle : (ci === 9 && commonAoa[r][9] === 'YES') ? changedStyle : dataStyle;
        });
      });
      XLSX.utils.book_append_sheet(wb, commonWs, 'Common');

      /* Only-in-A sheet */
      const onlyCols = ['Voucher #', 'Patient', 'Status', 'Deduction', 'Amount'];
      const onlyAAoa: (string | number)[][] = [onlyCols];
      diff.onlyInA.forEach(r => {
        onlyAAoa.push([r.voucher, r.patient, r.status, r.deduction, r.amount]);
      });
      const onlyAWs = XLSX.utils.aoa_to_sheet(onlyAAoa);
      onlyAWs['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
      onlyAAoa.forEach((row, r) => {
        row.forEach((_, ci) => {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const cell = onlyAWs[addr];
          if (!cell) return;
          cell.s = r === 0 ? headerStyle : dataStyle;
        });
      });
      XLSX.utils.book_append_sheet(wb, onlyAWs, 'Only in A');

      /* Only-in-B sheet */
      const onlyBAoa: (string | number)[][] = [onlyCols];
      diff.onlyInB.forEach(r => {
        onlyBAoa.push([r.voucher, r.patient, r.status, r.deduction, r.amount]);
      });
      const onlyBWs = XLSX.utils.aoa_to_sheet(onlyBAoa);
      onlyBWs['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
      onlyBAoa.forEach((row, r) => {
        row.forEach((_, ci) => {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const cell = onlyBWs[addr];
          if (!cell) return;
          cell.s = r === 0 ? headerStyle : dataStyle;
        });
      });
      XLSX.utils.book_append_sheet(wb, onlyBWs, 'Only in B');

      const fileBase = `${sessionA.meta.name.replace(/[^a-z0-9_-]+/gi, '_')}_vs_${sessionB.meta.name.replace(/[^a-z0-9_-]+/gi, '_')}`;
      XLSX.writeFile(wb, `${fileBase}.xlsx`);
      toast({
        title: 'Comparison exported',
        description: `${diff.common.length} common · ${diff.onlyInA.length} only in A · ${diff.onlyInB.length} only in B.`,
      });
    } catch (e) {
      toast({
        title: 'Export failed',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  if (loadingList) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm">Loading sessions…</p>
      </div>
    );
  }

  if (sessions.length < 2) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center max-w-2xl mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-gold-light text-gold-dark flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold mb-1">Not enough sessions to compare</h2>
        <p className="text-sm text-muted-foreground mb-5 max-w-md">
          You need at least 2 saved sessions to compare. Upload another pharmacy file first.
        </p>
        <button
          onClick={() => setStage('upload')}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:opacity-90 transition-opacity"
        >
          <FilePlus2 className="w-4 h-4" />
          Upload pharmacy file
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <GitCompare className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">Compare Sessions</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Compare two saved sessions side-by-side to spot differences in voucher counts,
              verification status, and fraud flags.
            </p>
          </div>
        </div>
      </section>

      {/* Session pickers */}
      <section className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-3 items-stretch">
        {/* Session A picker */}
        <SessionPickerCard
          label="Session A"
          accent="text-primary"
          sessions={sessions}
          value={aId}
          onChange={setAId}
          disabledId={'' /* allow same id; user can swap if needed */}
          loading={loadingA}
          bundle={sessionA}
        />

        {/* Swap button */}
        <div className="flex md:flex-col items-center justify-center gap-2 md:px-1">
          <button
            type="button"
            onClick={handleSwap}
            aria-label="Swap Session A and Session B"
            title="Swap A and B"
            className="w-10 h-10 rounded-full border border-border bg-card hover:bg-accent hover:text-accent-foreground text-muted-foreground flex items-center justify-center transition-colors focus-ring"
          >
            <ArrowLeftRight className="w-4 h-4 md:rotate-90" />
          </button>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground hidden md:inline">
            Swap
          </span>
        </div>

        {/* Session B picker */}
        <SessionPickerCard
          label="Session B"
          accent="text-gold-dark"
          sessions={sessions}
          value={bId}
          onChange={setBId}
          disabledId={''}
          loading={loadingB}
          bundle={sessionB}
        />
      </section>

      {/* Loading banner when fetching session details */}
      {(loadingA || loadingB) && (
        <div className="rounded-lg border border-border bg-primary/5 text-primary text-sm px-4 py-2.5 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading session details…
        </div>
      )}

      {/* Comparison results */}
      {sessionA && sessionB && !loadingA && !loadingB && diff && (
        <>
          {/* Quick Stats Summary */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(() => {
              const cardsA = sessionA.state.cards;
              const cardsB = sessionB.state.cards;
              const totalDiff = cardsB.length - cardsA.length;
              const verA = cardsA.filter(c => c.status === 'verified').length;
              const verB = cardsB.filter(c => c.status === 'verified').length;
              const pctA = cardsA.length ? Math.round((verA / cardsA.length) * 100) : 0;
              const pctB = cardsB.length ? Math.round((verB / cardsB.length) * 100) : 0;
              const verDiff = pctB - pctA;
              const fraudA = cardsA.filter(c => c.classifications?.fraud).length;
              const fraudB = cardsB.filter(c => c.classifications?.fraud).length;
              const fraudDiff = fraudB - fraudA;
              const amtA = cardsA.reduce((s, c) => s + amountFromMapping(c, sessionA.state.mapping), 0);
              const amtB = cardsB.reduce((s, c) => s + amountFromMapping(c, sessionB.state.mapping), 0);
              const amtDiff = amtB - amtA;
              const stats = [
                { label: 'Total Difference', value: totalDiff, format: (v: number) => (v > 0 ? '+' : '') + v.toLocaleString(), icon: ArrowLeftRight, color: totalDiff === 0 ? 'text-muted-foreground' : 'text-primary' },
                { label: 'Verification % Diff', value: verDiff, format: (v: number) => (v > 0 ? '+' : '') + v + '%', icon: CheckCircle2, color: verDiff > 0 ? 'text-primary' : verDiff < 0 ? 'text-danger' : 'text-muted-foreground' },
                { label: 'Fraud Count Diff', value: fraudDiff, format: (v: number) => (v > 0 ? '+' : '') + v.toLocaleString(), icon: ShieldAlert, color: fraudDiff < 0 ? 'text-primary' : fraudDiff > 0 ? 'text-danger' : 'text-muted-foreground' },
                { label: 'Amount Difference', value: amtDiff, format: (v: number) => (v > 0 ? '+' : '') + 'RWF ' + Math.abs(v).toLocaleString(), icon: ArrowUp, color: amtDiff === 0 ? 'text-muted-foreground' : 'text-primary' },
              ];
              return stats.map(s => (
                <div key={s.label} className="rounded-xl border border-border bg-card p-3 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground font-medium truncate">{s.label}</p>
                    <p className={`text-sm font-bold tabular-nums ${s.color}`}>{s.format(s.value)}</p>
                  </div>
                </div>
              ));
            })()}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold">Side-by-side metrics</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Delta = Session B − Session A. Green = improvement, red = regression.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/3">Metric</TableHead>
                    <TableHead className="text-right">
                      Session A
                      <div className="text-[10px] font-normal text-muted-foreground truncate max-w-[180px]">
                        {sessionA.meta.name}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      Session B
                      <div className="text-[10px] font-normal text-muted-foreground truncate max-w-[180px]">
                        {sessionB.meta.name}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kpis.map(kpi => (
                    <KpiRowCell key={kpi.key} kpi={kpi} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Voucher diff table */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Voucher diff</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Matched by voucher number. {diff.common.length} common ·{' '}
                  {diff.onlyInA.length} only in A ·{' '}
                  {diff.onlyInB.length} only in B.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card hover:bg-accent text-sm font-medium px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export diff report (.xlsx)
              </button>
            </div>

            <Tabs defaultValue="common" className="w-full">
              <TabsList className="grid grid-cols-3 w-full max-w-md">
                <TabsTrigger value="common">
                  Common ({diff.common.length})
                </TabsTrigger>
                <TabsTrigger value="onlyA">
                  Only in A ({diff.onlyInA.length})
                </TabsTrigger>
                <TabsTrigger value="onlyB">
                  Only in B ({diff.onlyInB.length})
                </TabsTrigger>
              </TabsList>

              {/* Common vouchers tab */}
              <TabsContent value="common" className="mt-4">
                {diff.common.length === 0 ? (
                  <EmptyDiff message="No vouchers appear in both sessions." />
                ) : (
                  <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border border-border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead>Voucher #</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead className="text-center">Status A</TableHead>
                          <TableHead className="text-center">Status B</TableHead>
                          <TableHead className="text-right">Deduct A</TableHead>
                          <TableHead className="text-right">Deduct B</TableHead>
                          <TableHead className="text-center">Changed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {diff.common.slice(0, 500).map((r, idx) => (
                          <TableRow key={r.voucher} className={`${r.changed ? 'bg-gold-light/40' : ''} ${idx % 2 === 1 ? 'bg-muted/30' : ''} row-hover-highlight`}>
                            <TableCell className="font-mono text-xs w-28">{r.voucher}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={r.patientA || r.patientB}>
                              {r.patientA || r.patientB || '—'}
                            </TableCell>
                            <TableCell className="text-center">
                              <StatusPill status={r.statusA} />
                            </TableCell>
                            <TableCell className="text-center">
                              <StatusPill status={r.statusB} />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.deductionA > 0 ? r.deductionA.toLocaleString() : '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.deductionB > 0 ? r.deductionB.toLocaleString() : '—'}
                            </TableCell>
                            <TableCell className="text-center">
                              {r.changed ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gold-dark">
                                  <AlertCircle className="w-3 h-3" /> Changed
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {diff.common.length > 500 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing first 500 of {diff.common.length} common vouchers. Export the diff report to see all.
                  </p>
                )}
              </TabsContent>

              {/* Only in A tab */}
              <TabsContent value="onlyA" className="mt-4">
                {diff.onlyInA.length === 0 ? (
                  <EmptyDiff message="Every voucher in A also exists in B." />
                ) : (
                  <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border border-border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead>Voucher #</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-right">Deduction</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {diff.onlyInA.slice(0, 500).map((r, idx) => (
                          <TableRow key={r.voucher} className={`${idx % 2 === 1 ? 'bg-muted/30' : ''} row-hover-highlight`}>
                            <TableCell className="font-mono text-xs w-28">{r.voucher}</TableCell>
                            <TableCell className="max-w-[240px] truncate" title={r.patient}>{r.patient || '—'}</TableCell>
                            <TableCell className="text-center"><StatusPill status={r.status} /></TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.deduction > 0 ? r.deduction.toLocaleString() : '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.amount > 0 ? r.amount.toLocaleString() : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {diff.onlyInA.length > 500 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing first 500 of {diff.onlyInA.length} rows. Export the diff report to see all.
                  </p>
                )}
              </TabsContent>

              {/* Only in B tab */}
              <TabsContent value="onlyB" className="mt-4">
                {diff.onlyInB.length === 0 ? (
                  <EmptyDiff message="Every voucher in B also exists in A." />
                ) : (
                  <div className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg border border-border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead>Voucher #</TableHead>
                          <TableHead>Patient</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead className="text-right">Deduction</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {diff.onlyInB.slice(0, 500).map((r, idx) => (
                          <TableRow key={r.voucher} className={`${idx % 2 === 1 ? 'bg-muted/30' : ''} row-hover-highlight`}>
                            <TableCell className="font-mono text-xs w-28">{r.voucher}</TableCell>
                            <TableCell className="max-w-[240px] truncate" title={r.patient}>{r.patient || '—'}</TableCell>
                            <TableCell className="text-center"><StatusPill status={r.status} /></TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.deduction > 0 ? r.deduction.toLocaleString() : '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.amount > 0 ? r.amount.toLocaleString() : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {diff.onlyInB.length > 500 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing first 500 of {diff.onlyInB.length} rows. Export the diff report to see all.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </section>

          {/* Same-session hint */}
          {sessionA.meta.id === sessionB.meta.id && (
            <div className="rounded-lg border border-warn bg-warn-light text-warn-dark text-sm px-4 py-2.5 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>You picked the same session for both A and B. Pick two different sessions to see differences.</span>
            </div>
          )}
        </>
      )}

      {/* Initial prompt when at least one session is missing */}
      {(!sessionA || !sessionB) && !loadingA && !loadingB && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <FileSpreadsheet className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Pick a session in each column above to see the comparison.
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SessionPickerCard({
  label, accent, sessions, value, onChange, loading, bundle,
}: {
  label: string;
  accent: string;
  sessions: SessionMeta[];
  value: string;
  onChange: (id: string) => void;
  disabledId: string;
  loading: boolean;
  bundle: SessionBundle | null;
}) {
  const meta = bundle?.meta;
  const borderClass = label === 'Session A' ? 'border-l-4 border-l-primary' : 'border-l-4 border-l-gold';
  return (
    <div className={`rounded-xl border border-border bg-card p-4 flex flex-col gap-3 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${accent}`}>
            {label}
          </span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
        {meta && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {new Date(meta.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a session…" />
        </SelectTrigger>
        <SelectContent>
          {sessions.map(s => (
            <SelectItem key={s.id} value={s.id}>
              <span className="truncate">{s.name}</span>
              <span className="text-[11px] text-muted-foreground ml-2 tabular-nums">
                ({s.voucherCount} v.)
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {meta ? (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1.5 min-h-[88px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground truncate" title={meta.name}>{meta.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
            <span className="truncate" title={meta.fileName}>File: {meta.fileName || '—'}</span>
            <span className="truncate" title={meta.pharmacyName}>Pharmacy: {meta.pharmacyName || '—'}</span>
            <span>Vouchers: <span className="text-foreground tabular-nums">{meta.voucherCount}</span></span>
            <span>Verified: <span className="text-foreground tabular-nums">{meta.verifiedCount}</span></span>
            <span>Fraud: <span className="text-foreground tabular-nums">{meta.fraudCount}</span></span>
            <span>Updated: <span className="text-foreground tabular-nums">{new Date(meta.updatedAt).toLocaleDateString()}</span></span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground min-h-[88px] flex items-center justify-center text-center">
          {loading ? 'Loading…' : 'No session selected.'}
        </div>
      )}
    </div>
  );
}

function KpiRowCell({ kpi }: { kpi: KpiRow }) {
  const delta = kpi.valueB - kpi.valueA;
  const deltaAbs = Math.abs(delta);
  const improved =
    kpi.polarity === 'neutral' ? null :
    kpi.polarity === 'more' ? delta > 0 :
    delta < 0;
  const regressed =
    kpi.polarity === 'neutral' ? null :
    kpi.polarity === 'more' ? delta < 0 :
    delta > 0;
  const deltaColor =
    delta === 0 ? 'text-muted-foreground' :
    improved ? 'text-primary' :
    regressed ? 'text-danger-dark' :
    'text-muted-foreground';
  const deltaBg =
    delta === 0 ? '' :
    improved ? 'bg-primary/10' :
    regressed ? 'bg-danger-light' :
    '';

  function formatValue(v: number): string {
    if (kpi.showPct && kpi.totalA !== undefined && kpi.key === 'verified') {
      const pctA = kpi.totalA ? Math.round((v / kpi.totalA) * 100) : 0;
      return `${v.toLocaleString()} (${pctA}%)`;
    }
    if (kpi.showPct && kpi.totalB !== undefined && kpi.key === 'verified') {
      const pctB = kpi.totalB ? Math.round((v / kpi.totalB) * 100) : 0;
      return `${v.toLocaleString()} (${pctB}%)`;
    }
    return v.toLocaleString();
  }

  return (
    <TableRow className="gap-3">
      <TableCell className="py-2.5 font-medium">{kpi.label}</TableCell>
      <TableCell className="py-2.5 text-right tabular-nums">
        {kpi.key === 'verified' && kpi.totalA !== undefined
          ? `${kpi.valueA.toLocaleString()} (${kpi.totalA ? Math.round((kpi.valueA / kpi.totalA) * 100) : 0}%)`
          : formatValue(kpi.valueA)}
      </TableCell>
      <TableCell className="py-2.5 text-right tabular-nums">
        {kpi.key === 'verified' && kpi.totalB !== undefined
          ? `${kpi.valueB.toLocaleString()} (${kpi.totalB ? Math.round((kpi.valueB / kpi.totalB) * 100) : 0}%)`
          : formatValue(kpi.valueB)}
      </TableCell>
      <TableCell className="py-2.5 text-right">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ${deltaColor} ${deltaBg}`}
        >
          {delta === 0 ? (
            <><Minus className="w-3 h-3" />0</>
          ) : delta > 0 ? (
            <><ArrowUp className="w-3 h-3" />+{deltaAbs.toLocaleString()}</>
          ) : (
            <><ArrowDown className="w-3 h-3" />−{deltaAbs.toLocaleString()}</>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">
        <CheckCircle2 className="w-3 h-3" /> Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn-light text-warn-dark text-[11px] font-medium px-2 py-0.5">
      <RefreshCw className="w-3 h-3" /> Pending
    </span>
  );
}

function EmptyDiff({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
