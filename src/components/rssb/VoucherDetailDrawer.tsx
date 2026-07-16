'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useSessionStore } from '@/store/session-store';
import { useCardHelpers } from './use-card-helpers';
import { CLASSIFICATION_DEFS } from '@/lib/rssb/config';
import type { Card, ClassificationKey } from '@/lib/rssb/types';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  ShieldAlert,
  ExternalLink,
  Loader2,
} from 'lucide-react';

interface VoucherDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cards: Card[];
  currentId: number | null;
  onNavigate: (id: number) => void;
  headers: string[];
}

/**
 * Slide-over drawer with full voucher details + inline editing.
 * Coexists with the inline expand panel — provides a more focused,
 * full-height editing experience with prev/next + keyboard shortcuts.
 */
export function VoucherDetailDrawer({
  open,
  onOpenChange,
  cards,
  currentId,
  onNavigate,
  headers,
}: VoucherDetailDrawerProps) {
  const updateCard = useSessionStore(s => s.updateCard);
  const setCurrentIndex = useSessionStore(s => s.setCurrentIndex);
  const setStage = useSessionStore(s => s.setStage);
  const storeCards = useSessionStore(s => s.cards);
  const isSaving = useSessionStore(s => s.isSaving);
  const helpers = useCardHelpers();

  const card = useMemo(
    () => (currentId === null ? null : cards.find(c => c.id === currentId) || null),
    [cards, currentId],
  );
  const currentIndex = useMemo(
    () => (card ? cards.findIndex(c => c.id === card.id) : -1),
    [cards, card],
  );
  const atStart = currentIndex <= 0;
  const atEnd = currentIndex < 0 || currentIndex >= cards.length - 1;
  const positionLabel =
    currentIndex >= 0 ? `${currentIndex + 1} of ${cards.length}` : '—';

  function goPrev() {
    if (atStart || currentIndex < 0) return;
    onNavigate(cards[currentIndex - 1].id);
  }
  function goNext() {
    if (atEnd || currentIndex < 0) return;
    onNavigate(cards[currentIndex + 1].id);
  }
  function toggleVerified() {
    if (!card) return;
    updateCard(card.id, {
      status: card.status === 'verified' ? 'pending' : 'verified',
    });
  }
  function toggleFraud() {
    if (!card) return;
    updateCard(card.id, {
      classifications: { ...card.classifications, fraud: !card.classifications.fraud },
    });
  }
  function toggleClassification(key: ClassificationKey) {
    if (!card) return;
    updateCard(card.id, {
      classifications: { ...card.classifications, [key]: !card.classifications[key] },
    });
  }
  function openVerifyView() {
    if (!card) return;
    const idx = storeCards.findIndex(c => c.id === card.id);
    if (idx >= 0) setCurrentIndex(idx);
    setStage('verify');
    onOpenChange(false);
  }

  // Keyboard shortcuts (only when the drawer is open).
  // Ignores key presses while typing in inputs — except Escape (handled natively
  // by Radix Dialog to close the sheet).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || '').toUpperCase();
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') return; // Radix closes the sheet
      if (inField) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (e.key === 'v' || e.key === 'V') { e.preventDefault(); toggleVerified(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFraud(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, currentIndex, cards, card]);

  const voucherNoLabel = card
    ? (helpers.voucherOf(card) || `#${card.id + 1}`)
    : '';
  const patientLabel = card
    ? String(helpers.mappedValue(card, 'patient_name') || `Record ${card.id + 1}`)
    : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[560px] p-0 flex flex-col gap-0"
      >
        {/* Header — always visible */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border space-y-1">
          <div className="flex items-start justify-between pr-10 gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-lg font-bold tracking-tight truncate">
                {card ? `Voucher ${voucherNoLabel}` : 'Voucher detail'}
              </SheetTitle>
              {card && (
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {patientLabel}
                </p>
              )}
            </div>
            {card && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                  card.status === 'verified'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-warn-light text-warn-dark'
                }`}
              >
                {card.status === 'verified' ? 'Verified' : 'Pending'}
              </span>
            )}
          </div>
          {isSaving && (
            <div
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Saving…</span>
            </div>
          )}
          <SheetDescription className="sr-only">
            Voucher detail panel with inline editing and prev/next navigation.
            Use arrow keys to navigate, V to toggle verified, F to toggle fraud,
            Escape to close.
          </SheetDescription>
        </SheetHeader>

        {!card ? (
          <div className="flex-1 empty-state">
            <p className="text-sm text-muted-foreground">No voucher selected.</p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-xs text-primary hover:underline"
            >
              Close drawer
            </button>
          </div>
        ) : (
          <>
            {/* Sticky quick actions + prev/next navigation */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
              <div className="px-5 py-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleVerified}
                  className={`inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border transition-colors focus-ring ${
                    card.status === 'pending'
                      ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                      : 'border-border bg-muted hover:bg-accent text-foreground'
                  }`}
                  aria-label={
                    card.status === 'verified'
                      ? 'Set voucher back to pending'
                      : 'Mark voucher as verified'
                  }
                  title="V — toggle verified"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {card.status === 'verified' ? 'Set pending' : 'Mark verified'}
                </button>
                <button
                  type="button"
                  onClick={toggleFraud}
                  className={`inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border transition-colors focus-ring ${
                    card.classifications?.fraud
                      ? 'bg-danger text-white border-danger hover:bg-danger/90'
                      : 'border-border bg-muted hover:bg-accent text-foreground'
                  }`}
                  aria-label={
                    card.classifications?.fraud
                      ? 'Remove fraud flag'
                      : 'Flag voucher as fraud'
                  }
                  title="F — toggle fraud"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {card.classifications?.fraud ? 'Fraud flagged' : 'Flag fraud'}
                </button>
                <button
                  type="button"
                  onClick={openVerifyView}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 border border-border bg-muted hover:bg-accent text-foreground transition-colors focus-ring"
                  aria-label="Open this voucher in the full verify view"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Full verify view
                </button>
              </div>

              <div className="px-5 py-2 flex items-center justify-between gap-2 bg-muted/40 border-t border-border">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={atStart}
                  className="inline-flex items-center gap-1 text-xs rounded-lg px-3 py-1.5 border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
                  aria-label="Previous voucher in filtered list"
                  title="← — previous voucher"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Position{' '}
                  <span className="font-medium text-foreground">{positionLabel}</span>
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={atEnd}
                  className="inline-flex items-center gap-1 text-xs rounded-lg px-3 py-1.5 border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
                  aria-label="Next voucher in filtered list"
                  title="→ — next voucher"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {/* Editable form section */}
              <section
                className="px-5 py-4 bg-muted/30 border-b border-border"
                aria-label="Edit voucher fields"
              >
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Edit fields
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-1">
                    <label
                      htmlFor="vd-deduction"
                      className="text-xs text-muted-foreground block mb-1"
                    >
                      Deduction
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none font-medium">
                        RWF
                      </span>
                      <input
                        id="vd-deduction"
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={card.deduction || ''}
                        placeholder="0"
                        onChange={e =>
                          updateCard(card.id, { deduction: e.target.value })
                        }
                        className="w-full border border-border rounded-lg pl-10 pr-3 py-1.5 text-sm bg-card focus-ring"
                      />
                    </div>
                  </div>
                  <div className="col-span-1">
                    <label
                      htmlFor="vd-rxdate"
                      className="text-xs text-muted-foreground block mb-1"
                    >
                      Prescription date
                    </label>
                    <input
                      id="vd-rxdate"
                      type="date"
                      value={card.prescriptionDate}
                      onChange={e =>
                        updateCard(card.id, { prescriptionDate: e.target.value })
                      }
                      className={`w-full border rounded-lg px-2.5 py-1.5 text-sm bg-card focus-ring ${
                        !card.prescriptionDate && helpers.needsFraudReview(card)
                          ? 'border-danger'
                          : 'border-border'
                      }`}
                    />
                  </div>
                  <div className="col-span-2">
                    <label
                      htmlFor="vd-facility"
                      className="text-xs text-muted-foreground block mb-1"
                    >
                      Facility override
                    </label>
                    <input
                      id="vd-facility"
                      type="text"
                      placeholder={String(
                        helpers.mappedValue(card, 'facility_name') ||
                          'Use file value',
                      )}
                      value={card.facilityOverride}
                      onChange={e =>
                        updateCard(card.id, { facilityOverride: e.target.value })
                      }
                      className={`w-full border rounded-lg px-2.5 py-1.5 text-sm bg-card focus-ring ${
                        !helpers.facilityOf(card) && helpers.needsFraudReview(card)
                          ? 'border-danger'
                          : 'border-border'
                      }`}
                    />
                  </div>
                  <div className="col-span-2">
                    <label
                      htmlFor="vd-comment"
                      className="text-xs text-muted-foreground block mb-1"
                    >
                      Comment
                    </label>
                    <DebouncedTextarea
                      key={`comment-${card.id}`}
                      id="vd-comment"
                      value={card.comment}
                      placeholder="Add a quick note…"
                      onChange={v => updateCard(card.id, { comment: v })}
                      minRows={2}
                    />
                  </div>
                  <div className="col-span-2">
                    <label
                      htmlFor="vd-explanation"
                      className="text-xs text-muted-foreground block mb-1"
                    >
                      Explanation{' '}
                      <span className="text-muted-foreground/70">
                        (counter verification report)
                      </span>
                    </label>
                    <DebouncedTextarea
                      key={`explanation-${card.id}`}
                      id="vd-explanation"
                      value={card.explanation}
                      placeholder="Why was this deduction made? Used in the counter verification report."
                      onChange={v => updateCard(card.id, { explanation: v })}
                      minRows={3}
                    />
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground block mb-1.5">
                      Classifications
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {CLASSIFICATION_DEFS.map(cl => {
                        const active = !!card.classifications?.[cl.key];
                        const isFraud = cl.key === 'fraud';
                        return (
                          <label
                            key={cl.key}
                            className={`text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                              active
                                ? isFraud
                                  ? 'bg-danger text-white border-danger'
                                  : 'bg-primary text-primary-foreground border-primary'
                                : 'border-border bg-card hover:bg-accent text-foreground'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleClassification(cl.key)}
                              className="sr-only"
                            />
                            {cl.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* Voucher info (read-only) */}
              <section
                className="px-5 py-4 border-b border-border"
                aria-label="Voucher info"
              >
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Voucher info
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <InfoItem
                    label="Voucher #"
                    value={helpers.voucherOf(card) || '—'}
                  />
                  <InfoItem
                    label="Dispensing date"
                    value={
                      helpers.dispensingDateOf(card)?.toLocaleDateString() ?? '—'
                    }
                  />
                  <InfoItem
                    label="Patient"
                    value={String(
                      helpers.mappedValue(card, 'patient_name') || '—',
                    )}
                  />
                  <InfoItem
                    label="RAMA / Affiliation"
                    value={String(
                      helpers.mappedValue(card, 'rama_number') || '—',
                    )}
                  />
                  <InfoItem
                    label="Doctor"
                    value={helpers.doctorOf(card) || '—'}
                  />
                  <InfoItem
                    label="Facility"
                    value={helpers.facilityOf(card) || '—'}
                  />
                  <InfoItem
                    label="Original amount"
                    value={(helpers.originalAmount(card) ?? 0).toLocaleString()}
                  />
                  <InfoItem
                    label="Approved amount"
                    value={(helpers.approvedAmount(card) ?? 0).toLocaleString()}
                  />
                </dl>
              </section>

              {/* Raw row data (collapsible) */}
              <RawRowData headers={headers} card={card} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---------- Sub-components ---------- */

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Textarea with a 300ms debounce. Saves on stop-typing, and flushes the
 * pending change on unmount (so navigating to another voucher or closing
 * the drawer doesn't lose the user's in-progress edit).
 */
function DebouncedTextarea({
  id,
  value,
  onChange,
  placeholder,
  minRows = 2,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  const [local, setLocal] = useState(value);
  const localRef = useRef(local);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  localRef.current = local;
  valueRef.current = value;
  onChangeRef.current = onChange;

  // Sync local state when the prop changes externally (e.g. after a save).
  useEffect(() => setLocal(value), [value]);

  // Debounce writes — fire onChange 300ms after the user stops typing.
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 300);
    return () => clearTimeout(t);
  }, [local, value, onChange]);

  // Flush pending change on unmount (preserves edits when navigating
  // between vouchers or closing the drawer mid-edit).
  useEffect(() => {
    return () => {
      if (localRef.current !== valueRef.current) {
        onChangeRef.current(localRef.current);
      }
    };
  }, []);

  return (
    <textarea
      id={id}
      value={local}
      onChange={e => setLocal(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card resize-y focus-ring"
    />
  );
}

function RawRowData({ headers, card }: { headers: string[]; card: Card }) {
  const [open, setOpen] = useState(false);
  const entries = useMemo(
    () => headers.map(h => ({ header: h, value: card.row[h] })),
    [headers, card],
  );
  return (
    <section className="px-5 py-4" aria-label="All columns from file">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span>All columns from file ({entries.length})</span>
      </button>
      {open && (
        <div className="mt-3 max-h-72 overflow-y-auto scrollbar-thin rounded-lg border border-border bg-muted/40">
          <table className="w-full text-xs">
            <tbody>
              {entries.map(({ header, value }) => (
                <tr
                  key={header}
                  className="border-b border-border last:border-b-0"
                >
                  <th className="text-left align-top px-2.5 py-1.5 font-medium text-muted-foreground w-2/5 break-words">
                    {header}
                  </th>
                  <td className="px-2.5 py-1.5 break-words">
                    {String(value ?? '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
