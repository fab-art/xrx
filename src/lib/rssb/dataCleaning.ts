// Data cleaning & normalization — ported from the original JS implementation.

import { normalizeId, normalizeSex } from './matching';
import type { Card, CleaningChange, FieldKey, Mapping } from './types';

export const FIELD_CLEAN_TYPES: Partial<Record<FieldKey, string>> = {
  voucher_no: 'text',
  visit_date: 'date',
  dispensing_date: 'date',
  patient_name: 'name',
  patient_type: 'text',
  gender: 'sex',
  is_newborn: 'text',
  rama_number: 'id',
  affiliate_name: 'name',
  doctor_name: 'name',
  practitioner_type: 'text',
  facility_name: 'name',
  amount: 'amount',
  patient_copayment: 'amount',
  insurance_copayment: 'amount',
  difference: 'amount',
  observation: 'text',
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function excelSerialToDate(n: number): Date {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms);
}

export interface NormalizeResult {
  value: string | number | null;
  changed: boolean;
  ambiguous?: boolean;
  unparsed?: boolean;
}

export function normalizeDateValue(raw: unknown): NormalizeResult {
  if (raw === null || raw === undefined || raw === '') return { value: '', changed: false };

  let d: Date | null = null;
  let ambiguous = false;

  if (raw instanceof Date) {
    d = raw;
  } else if (typeof raw === 'number' && raw > 1000 && raw < 80000) {
    d = excelSerialToDate(raw);
  } else {
    const s = String(raw).trim();
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) {
      d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    } else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += y < 50 ? 2000 : 1900;
      if (a > 12 && b <= 12) {
        d = new Date(Date.UTC(y, b - 1, a));
      } else if (b > 12 && a <= 12) {
        d = new Date(Date.UTC(y, a - 1, b));
      } else {
        d = new Date(Date.UTC(y, b - 1, a));
        ambiguous = true;
      }
    } else if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/))) {
      const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
      if (mon) d = new Date(Date.UTC(+m[3] < 100 ? +m[3] + 2000 : +m[3], mon - 1, +m[1]));
    } else if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/))) {
      const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (mon) d = new Date(Date.UTC(+m[3] < 100 ? +m[3] + 2000 : +m[3], mon - 1, +m[2]));
    } else {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }

  if (!d || isNaN(d.getTime())) {
    return { value: String(raw).trim(), changed: false, unparsed: true };
  }
  const iso = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return { value: iso, changed: String(raw).trim() !== iso, ambiguous };
}

export function dispensingDateHint(row: Record<string, unknown>, dispensingHeader: string | undefined): string {
  if (!dispensingHeader) return '';
  const result = normalizeDateValue(row[dispensingHeader]);
  return result.unparsed ? '' : (result.value as string);
}

export function normalizeAmountValue(raw: unknown): NormalizeResult {
  if (raw === null || raw === undefined || raw === '') return { value: null, changed: false };

  if (typeof raw === 'number') {
    const rounded = Math.round(raw * 100) / 100;
    return { value: rounded, changed: rounded !== raw };
  }

  const original = String(raw).trim();
  let s = original.replace(/[A-Za-z]/g, '').trim();
  s = s.replace(/[^\d.,-]/g, '');
  if (!s) return { value: null, changed: true, unparsed: true };

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(',');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  }

  const num = parseFloat(s);
  if (isNaN(num)) return { value: null, changed: true, unparsed: true };
  const rounded = Math.round(num * 100) / 100;
  return { value: rounded, changed: String(rounded) !== original };
}

export function normalizeNameValue(raw: unknown): NormalizeResult {
  if (raw === null || raw === undefined) return { value: '', changed: false };
  const original = String(raw);
  let s = original.trim().replace(/\s+/g, ' ');
  s = s.replace(/\b\p{L}+/gu, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return { value: s, changed: s !== original };
}

export function normalizeSexValue(raw: unknown): NormalizeResult {
  if (raw === null || raw === undefined || raw === '') return { value: '', changed: false };
  const trimmed = String(raw).trim();
  const norm = normalizeSex(raw);
  if (!norm) return { value: trimmed, changed: false, unparsed: true };
  return { value: norm, changed: norm !== trimmed };
}

export function normalizeIdValue(raw: unknown): NormalizeResult {
  if (raw === null || raw === undefined || raw === '') return { value: '', changed: false };
  const trimmed = String(raw).trim();
  const norm = normalizeId(raw);
  if (norm === null) return { value: trimmed, changed: false, unparsed: true };
  return { value: norm, changed: norm !== trimmed };
}

export function normalizeTextValue(raw: unknown): NormalizeResult {
  if (raw === null || raw === undefined) return { value: '', changed: false };
  const original = String(raw);
  const s = original.trim().replace(/\s+/g, ' ');
  return { value: s, changed: s !== original };
}

function normalizeByType(type: string, raw: unknown): NormalizeResult | null {
  switch (type) {
    case 'date': return normalizeDateValue(raw);
    case 'amount': return normalizeAmountValue(raw);
    case 'name': return normalizeNameValue(raw);
    case 'sex': return normalizeSexValue(raw);
    case 'id': return normalizeIdValue(raw);
    case 'text': return normalizeTextValue(raw);
    default: return null;
  }
}

export function cleanCards(cards: Card[], mapping: Mapping): { cleanedCards: Card[]; changes: CleaningChange[] } {
  const changes: CleaningChange[] = [];

  const cleanedCards = cards.map(card => {
    const rowCopy = { ...card.row };
    let touched = false;

    (Object.entries(mapping) as Array<[FieldKey, string]>).forEach(([fieldKey, header]) => {
      if (!header) return;
      const type = FIELD_CLEAN_TYPES[fieldKey];
      if (!type) return;
      const raw = rowCopy[header];
      const result = normalizeByType(type, raw);
      if (!result) return;
      if (result.changed) {
        changes.push({
          cardId: card.id,
          field: fieldKey,
          header,
          type,
          original: raw,
          cleaned: result.value,
          ambiguous: !!result.ambiguous,
        });
        rowCopy[header] = result.value;
        touched = true;
      } else if (result.unparsed && raw !== '' && raw !== null && raw !== undefined) {
        changes.push({
          cardId: card.id,
          field: fieldKey,
          header,
          type,
          original: raw,
          cleaned: result.value,
          unparsed: true,
        });
      }
    });

    if (!touched) return card;
    return { ...card, row: rowCopy, rawRow: card.rawRow || card.row, cleaned: true };
  });

  return { cleanedCards, changes };
}

export function revertCleaning(cards: Card[]): Card[] {
  return cards.map(c => (c.rawRow ? { ...c, row: c.rawRow, rawRow: null, cleaned: false } : c));
}

export interface CleaningSummary {
  totalChanges: number;
  ambiguousCount: number;
  unparsedCount: number;
  byField: Array<{
    field: string;
    label: string;
    type: string;
    changed: number;
    ambiguous: number;
    unparsed: number;
  }>;
}

export function summarizeChanges(
  changes: CleaningChange[],
  fieldDefs: Array<{ key: string; label: string }>,
): CleaningSummary {
  const labelByKey: Record<string, string> = Object.fromEntries(fieldDefs.map(f => [f.key, f.label]));
  const byField: Record<string, CleaningSummary['byField'][number]> = {};
  let ambiguousCount = 0;
  let unparsedCount = 0;

  changes.forEach(c => {
    if (!byField[c.field]) {
      byField[c.field] = { field: c.field, label: labelByKey[c.field] || c.field, type: c.type, changed: 0, ambiguous: 0, unparsed: 0 };
    }
    if (c.unparsed) {
      byField[c.field].unparsed += 1;
      unparsedCount += 1;
    } else {
      byField[c.field].changed += 1;
      if (c.ambiguous) {
        byField[c.field].ambiguous += 1;
        ambiguousCount += 1;
      }
    }
  });

  return {
    totalChanges: changes.filter(c => !c.unparsed).length,
    ambiguousCount,
    unparsedCount,
    byField: Object.values(byField).sort((a, b) => (b.changed + b.unparsed) - (a.changed + a.unparsed)),
  };
}
