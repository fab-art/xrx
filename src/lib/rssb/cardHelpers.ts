// Pure helper functions operating on cards + mapping.

import type { Card, FieldKey, Mapping } from './types';

function excelSerialToDate(n: number): Date | null {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

export function toDateValue(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    return (v > 1000 && v < 80000) ? excelSerialToDate(v) : null;
  }
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeKeyLoose(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findRowValue(card: Card, candidates: string[]): unknown {
  const keys = Object.keys(card.row || {});
  for (const k of keys) {
    const nk = normalizeKeyLoose(k);
    if (candidates.some(c => nk.includes(c))) return card.row[k];
  }
  return undefined;
}

export function mappedValue(card: Card, key: FieldKey, mapping: Mapping): unknown {
  const header = mapping[key];
  return header ? card.row[header] : '';
}

export function facilityOf(card: Card, mapping: Mapping): string {
  const override = (card.facilityOverride || '').trim();
  if (override) return override;
  return String(mappedValue(card, 'facility_name', mapping) || '').trim();
}

export function doctorOf(card: Card, mapping: Mapping): string {
  return String(mappedValue(card, 'doctor_name', mapping) || '').trim();
}

export function voucherOf(card: Card, mapping: Mapping): string {
  return String(mappedValue(card, 'voucher_no', mapping) || '').trim();
}

export function dateOf(card: Card, mapping: Mapping): Date | null {
  // Prefer the prescription/visit date; fall back to the dispensing date so
  // date-based charts and filters keep working when only one is mapped.
  const visit = toDateValue(mappedValue(card, 'visit_date', mapping));
  if (visit) return visit;
  return toDateValue(mappedValue(card, 'dispensing_date', mapping));
}

export function dispensingDateOf(card: Card, mapping: Mapping): Date | null {
  return toDateValue(mappedValue(card, 'dispensing_date', mapping));
}

export function originalAmount(card: Card, mapping: Mapping): number | null {
  const v = parseFloat(String(mappedValue(card, 'amount', mapping)));
  return isNaN(v) ? null : v;
}

export function approvedAmount(card: Card, mapping: Mapping): number | null {
  const orig = originalAmount(card, mapping);
  if (orig === null) return null;
  return Math.max(0, orig - (parseFloat(String(card.deduction)) || 0));
}

export function fraudBasisAmount(card: Card, mapping: Mapping): number {
  const coPay = parseFloat(String(mappedValue(card, 'insurance_copayment', mapping)));
  if (!isNaN(coPay) && coPay > 0) return Math.round(coPay * 100) / 100;
  const orig = originalAmount(card, mapping);
  if (orig === null) return 0;
  return Math.round(orig * 0.85 * 100) / 100;
}

export function needsFraudReview(card: Card, mapping: Mapping): boolean {
  return !!(card.classifications?.fraud && (!card.prescriptionDate || !facilityOf(card, mapping)));
}
