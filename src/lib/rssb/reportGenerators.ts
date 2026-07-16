// Excel report generators. Client-side (uses xlsx-js-style).
// Counter verification report signatory order fixed to:
//   Names → Position → Date → Signature (per user request).

import * as XLSX from 'xlsx-js-style';
import { CATEGORY_LABELS } from './matching';
import { MATCH_CATEGORIES } from './config';
import {
  mappedValue, facilityOf, voucherOf, originalAmount, approvedAmount, needsFraudReview, findRowValue,
} from './cardHelpers';
import type { Card, CounterHeader, MatchCategory, MatchResult, Mapping } from './types';

interface CellStyle {
  font: { name: string; sz: number; bold?: boolean };
  alignment?: { horizontal: string };
  fill?: { fgColor: { rgb: string }; patternType: string };
}

export function draftSheetRows(cards: Card[], mapping: Mapping) {
  return cards.map(c => ({
    ...c.row,
    status: c.status,
    pharma_compliance: c.classifications?.pharma ? 'Yes' : 'No',
    rssb_compliance: c.classifications?.rssb ? 'Yes' : 'No',
    fraud_activity: c.classifications?.fraud ? 'Yes' : 'No',
    prescription_date: c.prescriptionDate,
    facility_override: c.facilityOverride,
    deduction: c.deduction || 0,
    original_amount: originalAmount(c, mapping),
    approved_amount: approvedAmount(c, mapping),
    comment: c.comment,
    explanation: c.explanation,
  }));
}

export function buildVerifiedWorkbook(cards: Card[], mapping: Mapping) {
  const exportRows = cards.map(c => ({
    ...c.row,
    verification_status: c.status,
    pharma_compliance: c.classifications?.pharma ? 'Yes' : 'No',
    rssb_compliance: c.classifications?.rssb ? 'Yes' : 'No',
    fraud_activity: c.classifications?.fraud ? 'Yes' : 'No',
    comment: c.comment,
    prescription_date: c.prescriptionDate,
    facility_override: c.facilityOverride,
    deduction: c.deduction || 0,
    approved_amount: approvedAmount(c, mapping),
  }));
  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Verified');
  return wb;
}

export interface FraudReportResult {
  workbook: XLSX.WorkBook;
  completeCount: number;
  incompleteCount: number;
}

export function buildFraudReportWorkbook(
  cards: Card[],
  headers: string[],
  mapping: Mapping,
): FraudReportResult {
  const fraudCards = cards.filter(c => c.classifications?.fraud);
  const incomplete = fraudCards.filter(c => needsFraudReview(c, mapping));
  const complete = fraudCards.filter(c => !needsFraudReview(c, mapping));

  const byFacility: Record<string, Card[]> = {};
  complete.forEach(c => {
    const facility = facilityOf(c, mapping) || 'Unknown facility';
    if (!byFacility[facility]) byFacility[facility] = [];
    byFacility[facility].push(c);
  });

  const boldCambria: CellStyle = { font: { name: 'Cambria', sz: 11, bold: true } };
  const timesHighlighted: CellStyle = { font: { name: 'Times New Roman', sz: 12 }, fill: { fgColor: { rgb: 'FFFFFF00' }, patternType: 'solid' } };
  const timesBold: CellStyle = { font: { name: 'Times New Roman', sz: 12, bold: true } };
  const facilityLabel: CellStyle = { font: { name: 'Times New Roman', sz: 12, bold: false } };

  const sourceColumns = headers.length ? headers : (cards[0] ? Object.keys(cards[0].row) : []);
  const dynamicColumns = ['#', 'Voucher No', 'Prescription Date (Verified)', ...sourceColumns, 'Amount Deducted', 'Observation'];
  const voucherColIdx = 1;
  const deductedColIdx = dynamicColumns.length - 2;
  const observationColIdx = dynamicColumns.length - 1;

  const aoa: unknown[][] = [];
  const styleRows: string[] = [];
  let seq = 0;
  const facilitySummary: Array<Record<string, unknown>> = [];

  Object.keys(byFacility).sort().forEach(facility => {
    const group = byFacility[facility];
    aoa.push(['', facility]);
    styleRows.push('facility');
    aoa.push(dynamicColumns);
    styleRows.push('header');

    let facilityTotal = 0;
    group.forEach(c => {
      seq += 1;
      const deducted = parseFloat(String(c.deduction)) || 0;
      facilityTotal += deducted;
      const verifiedDate = c.prescriptionDate || mappedValue(c, 'visit_date', mapping) || '';
      const sourceValues = sourceColumns.map(h => c.row[h] ?? '');
      aoa.push([seq, voucherOf(c, mapping), verifiedDate, ...sourceValues, deducted, c.comment || findRowValue(c, ['observation']) || 'Not Found']);
      styleRows.push('data');
    });

    const totalRow = new Array(dynamicColumns.length).fill('');
    totalRow[2] = 'TOTAL';
    totalRow[deductedColIdx] = facilityTotal;
    aoa.push(totalRow);
    styleRows.push('total');
    aoa.push([]);
    styleRows.push('blank');

    facilitySummary.push({ 'Health Facility': facility, 'Fraud Vouchers': group.length, 'Total Amount Deducted': facilityTotal });
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = dynamicColumns.map((h, i) => ({
    wch: i === 0 ? 5 : i === voucherColIdx ? 16 : i === observationColIdx ? 40 : Math.min(Math.max(String(h).length + 4, 12), 30),
  }));
  aoa.forEach((row, r) => {
    const kind = styleRows[r];
    row.forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r, c: ci });
      if (!ws[addr]) return;
      if (kind === 'facility') ws[addr].s = facilityLabel;
      else if (kind === 'header') ws[addr].s = boldCambria;
      else if (kind === 'data') ws[addr].s = timesHighlighted;
      else if (kind === 'total') ws[addr].s = timesBold;
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Anti Fraud Report');
  const summaryWs = XLSX.utils.json_to_sheet(facilitySummary);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Facility Summary');
  const draftWs = XLSX.utils.json_to_sheet(draftSheetRows(cards, mapping));
  XLSX.utils.book_append_sheet(wb, draftWs, 'All Vouchers Draft');

  return { workbook: wb, completeCount: complete.length, incompleteCount: incomplete.length };
}

export interface CounterReportResult {
  workbook: XLSX.WorkBook;
  deductedCount: number;
}

export function buildCounterReportWorkbook(
  cards: Card[],
  mapping: Mapping,
  counterHeader: CounterHeader,
  filterFn?: (c: Card) => boolean,
): CounterReportResult {
  // Allow caller to pass a filter so separate reports can be generated per
  // category / facility / date range (user-requested feature #4).
  const pool = filterFn ? cards.filter(filterFn) : cards;
  const deducted = pool.filter(c => (parseFloat(String(c.deduction)) || 0) > 0);

  const titleStyle: CellStyle = { font: { name: 'Arial', sz: 10, bold: true } };
  const centerTitleStyle: CellStyle = { font: { name: 'Arial', sz: 10, bold: true }, alignment: { horizontal: 'left' } };
  const tableHeaderStyle: CellStyle = { font: { name: 'Calibri', sz: 12, bold: true }, alignment: { horizontal: 'center' } };
  const dataStyle: CellStyle = { font: { name: 'Arial', sz: 11 }, alignment: { horizontal: 'left' } };
  const totalStyle: CellStyle = { font: { name: 'Arial', sz: 11, bold: true } };
  const footerLabelStyle: CellStyle = { font: { name: 'Arial', sz: 10, bold: true } };

  const aoa: unknown[][] = [
    [counterHeader.code ? `CODE/PHARMACY: ${counterHeader.code}` : 'CODE/PHARMACY:'],
    [counterHeader.pharmacyName || ''],
    ['', '', counterHeader.period ? `PERIOD: ${counterHeader.period}` : 'PERIOD:'],
    [counterHeader.tin ? `TIN: ${counterHeader.tin}` : 'TIN:'],
    [],
    ['', '', 'COUNTER VERIFICATION REPORT'],
    [],
    // # column uses the voucher number from the file (voucherOf) — user request #4.
    ['#', 'N° BEN.', 'RAMA Number', 'Difference', 'Explanation of deduction'],
  ];
  const styleRows = ['title', 'title', 'title', 'title', 'blank', 'title', 'blank', 'header'];

  let totalDiff = 0;
  deducted.forEach((c, i) => {
    const diff = -(parseFloat(String(c.deduction)) || 0);
    totalDiff += diff;
    aoa.push([
      i + 1,
      voucherOf(c, mapping) || findRowValue(c, ['papercode', 'voucher', 'code']) || '',
      mappedValue(c, 'rama_number', mapping) || findRowValue(c, ['ramanumber']) || '',
      diff,
      c.explanation || c.comment || '',
    ]);
    styleRows.push('data');
  });

  aoa.push(['Total', '', '', totalDiff]);
  styleRows.push('total');
  aoa.push([]);
  styleRows.push('blank');

  // Signatory block — reordered to: Names → Position → Date → Signature (user request #4).
  aoa.push([
    `Names: ${counterHeader.preparedBy || ''}`, '',
    `Names: ${counterHeader.verifiedBy || ''}`, '',
    `Names: ${counterHeader.approvedBy || ''}`,
  ]);
  styleRows.push('footer');
  aoa.push([
    `Position: ${counterHeader.preparedByPosition || ''}`, '',
    `Position: ${counterHeader.verifiedByPosition || ''}`, '',
    `Position: ${counterHeader.approvedByPosition || ''}`,
  ]);
  styleRows.push('footer');
  aoa.push(['Date:', '', 'Date:', '', 'Date:']);
  styleRows.push('footer');
  aoa.push(['Signature:', '', 'Signature:', '', 'Signature:'])
  styleRows.push('footer');

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 16 }, { wch: 21.88 }, { wch: 16 }, { wch: 15.13 }, { wch: 32.38 }];
  aoa.forEach((row, r) => {
    const kind = styleRows[r];
    row.forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r, c: ci });
      if (!ws[addr]) return;
      if (kind === 'title') ws[addr].s = ci === 2 ? centerTitleStyle : titleStyle;
      else if (kind === 'header') ws[addr].s = tableHeaderStyle;
      else if (kind === 'data') ws[addr].s = dataStyle;
      else if (kind === 'total') ws[addr].s = totalStyle;
      else if (kind === 'footer') ws[addr].s = footerLabelStyle;
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Counter verification report');
  const draftWs = XLSX.utils.json_to_sheet(draftSheetRows(cards, mapping));
  XLSX.utils.book_append_sheet(wb, draftWs, 'All Vouchers Draft');
  return { workbook: wb, deductedCount: deducted.length };
}

export function buildMatchReportWorkbook(
  cards: Card[],
  matchResults: Record<number, MatchResult> | null,
  matchNotes: Record<number, string>,
  categoryOf: (cardId: number) => MatchCategory | null,
) {
  const wb = XLSX.utils.book_new();
  const headerStyle: CellStyle = { font: { name: 'Calibri', sz: 11, bold: true } };

  MATCH_CATEGORIES.forEach(cat => {
    const rows = cards
      .filter(c => categoryOf(c.id) === cat)
      .map(c => {
        const r = matchResults?.[c.id];
        return {
          ...c.row,
          match_category: CATEGORY_LABELS[cat],
          match_score: r?.score ?? 0,
          match_reasons: r?.reasons.join('; ') ?? '',
          matched_hospital_file: r?.matchedHospital?.fileName ?? '',
          matched_hospital_name: r?.matchedHospital?.name ?? '',
          matched_hospital_id: r?.matchedHospital?.id ?? '',
          reviewer_note: matchNotes[c.id] || '',
        };
      });
    const sheetName = CATEGORY_LABELS[cat].slice(0, 31);
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: 'No records in this category' }]);
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) ws[addr].s = headerStyle;
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const summaryRows = MATCH_CATEGORIES.map(cat => ({
    Category: CATEGORY_LABELS[cat],
    Count: cards.filter(c => categoryOf(c.id) === cat).length,
  }));
  const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  return wb;
}

// Build a workbook from an arbitrary filtered subset of cards — used by the
// Dashboard "export filtered" feature (e.g. export only repeated records).
export function buildFilteredWorkbook(
  cards: Card[],
  mapping: Mapping,
  label: string,
) {
  const exportRows = cards.map(c => ({
    ...c.row,
    voucher_no: voucherOf(c, mapping),
    patient_name: mappedValue(c, 'patient_name', mapping),
    facility: facilityOf(c, mapping),
    amount: originalAmount(c, mapping),
    approved_amount: approvedAmount(c, mapping),
    deduction: c.deduction || 0,
    status: c.status,
    prescription_date: c.prescriptionDate,
    comment: c.comment,
  }));
  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31) || 'Filtered');
  return wb;
}

// Export cards as CSV (comma-separated values). Useful for quick imports into
// other tools without the overhead of an Excel workbook.
export function buildFilteredCSV(cards: Card[], mapping: Mapping): string {
  const exportRows = cards.map(c => ({
    voucher_no: voucherOf(c, mapping),
    patient_name: mappedValue(c, 'patient_name', mapping),
    facility: facilityOf(c, mapping),
    amount: originalAmount(c, mapping),
    approved_amount: approvedAmount(c, mapping),
    deduction: c.deduction || 0,
    status: c.status,
    prescription_date: c.prescriptionDate,
    comment: c.comment,
  }));
  const ws = XLSX.utils.json_to_sheet(exportRows);
  return XLSX.utils.sheet_to_csv(ws);
}

// ── Template-based exports ──

export type ExportTemplateType = 'rssb_standard' | 'internal_audit' | 'custom';

/** All available column keys for the custom export template. */
export const TEMPLATE_COLUMNS = [
  'voucher_no',
  'patient_name',
  'rama_number',
  'facility',
  'original_amount',
  'approved_amount',
  'deduction',
  'status',
  'prescription_date',
  'comment',
  'pharma_compliance',
  'rssb_compliance',
  'fraud_activity',
  'explanation',
  'match_category',
  'match_score',
  'reviewer_note',
] as const;

export type TemplateColumnKey = typeof TEMPLATE_COLUMNS[number];

export const TEMPLATE_COLUMN_LABELS: Record<TemplateColumnKey, string> = {
  voucher_no: 'Voucher #',
  patient_name: 'Patient Name',
  rama_number: 'RAMA #',
  facility: 'Facility',
  original_amount: 'Original Amount',
  approved_amount: 'Approved Amount',
  deduction: 'Deduction',
  status: 'Status',
  prescription_date: 'Prescription Date',
  comment: 'Comment',
  pharma_compliance: 'Pharma Compliance',
  rssb_compliance: 'RSSB Compliance',
  fraud_activity: 'Fraud Activity',
  explanation: 'Explanation',
  match_category: 'Match Category',
  match_score: 'Match Score',
  reviewer_note: 'Reviewer Notes',
};

interface TemplateColumnResolver {
  (c: Card, mapping: Mapping): unknown;
}

const TEMPLATE_COLUMN_RESOLVERS: Record<TemplateColumnKey, TemplateColumnResolver> = {
  voucher_no: (c, m) => voucherOf(c, m),
  patient_name: (c, m) => mappedValue(c, 'patient_name', m),
  rama_number: (c, m) => mappedValue(c, 'rama_number', m),
  facility: (c, m) => facilityOf(c, m),
  original_amount: (c, m) => originalAmount(c, m),
  approved_amount: (c, m) => approvedAmount(c, m),
  deduction: c => c.deduction || 0,
  status: c => c.status,
  prescription_date: c => c.prescriptionDate,
  comment: c => c.comment,
  pharma_compliance: c => c.classifications?.pharma ? 'Yes' : 'No',
  rssb_compliance: c => c.classifications?.rssb ? 'Yes' : 'No',
  fraud_activity: c => c.classifications?.fraud ? 'Yes' : 'No',
  explanation: c => c.explanation,
  match_category: () => '', // filled externally if matchResults are available
  match_score: () => '',
  reviewer_note: () => '',
};

/** Build a workbook from a named export template. */
export function buildTemplateWorkbook(
  cards: Card[],
  mapping: Mapping,
  template: ExportTemplateType,
  options?: {
    /** For 'custom' template: which columns to include */
    selectedColumns?: TemplateColumnKey[];
    /** Optional match results for audit report columns */
    matchResults?: Record<number, MatchResult> | null;
    matchNotes?: Record<number, string>;
    categoryOf?: (cardId: number) => MatchCategory | null;
  },
): XLSX.WorkBook {
  const headerStyle: CellStyle = { font: { name: 'Calibri', sz: 11, bold: true } };
  const totalStyle: CellStyle = { font: { name: 'Calibri', sz: 11, bold: true } };
  const wb = XLSX.utils.book_new();

  if (template === 'rssb_standard') {
    // RSSB Standard Report — all vouchers with standard columns
    const columns: TemplateColumnKey[] = [
      'voucher_no', 'patient_name', 'rama_number', 'facility',
      'original_amount', 'approved_amount', 'deduction', 'status',
      'prescription_date', 'comment',
    ];
    const labels = columns.map(k => TEMPLATE_COLUMN_LABELS[k]);
    const rows = cards.map(c => {
      const row: Record<string, unknown> = {};
      columns.forEach(k => { row[TEMPLATE_COLUMN_LABELS[k]] = TEMPLATE_COLUMN_RESOLVERS[k](c, mapping); });
      return row;
    });

    // Compute totals
    const totalOriginal = cards.reduce((s, c) => s + (originalAmount(c, mapping) || 0), 0);
    const totalApproved = cards.reduce((s, c) => s + (approvedAmount(c, mapping) || 0), 0);
    const totalDeduction = cards.reduce((s, c) => s + (parseFloat(String(c.deduction)) || 0), 0);

    // Build with AOA for styled totals row
    const aoa: unknown[][] = [labels];
    cards.forEach(c => {
      aoa.push(columns.map(k => TEMPLATE_COLUMN_RESOLVERS[k](c, mapping)));
    });
    // Totals row
    const totalRow = new Array(columns.length).fill('');
    const origIdx = columns.indexOf('original_amount');
    const appIdx = columns.indexOf('approved_amount');
    const dedIdx = columns.indexOf('deduction');
    if (origIdx >= 0) totalRow[origIdx] = totalOriginal;
    if (appIdx >= 0) totalRow[appIdx] = totalApproved;
    if (dedIdx >= 0) totalRow[dedIdx] = totalDeduction;
    aoa.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Style header row
    labels.forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
      if (ws[addr]) ws[addr].s = headerStyle;
    });
    // Style totals row
    const totalRowIdx = aoa.length - 1;
    labels.forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c: ci });
      if (ws[addr]) ws[addr].s = totalStyle;
    });

    XLSX.utils.book_append_sheet(wb, ws, 'RSSB Standard Report');

  } else if (template === 'internal_audit') {
    // Internal Audit Report — fraud-flagged and pending vouchers only
    const auditCards = cards.filter(c => c.classifications?.fraud || c.status === 'pending');
    const columns: TemplateColumnKey[] = [
      'voucher_no', 'patient_name', 'rama_number', 'facility',
      'original_amount', 'approved_amount', 'deduction', 'status',
      'fraud_activity', 'prescription_date', 'comment',
    ];

    // Main sheet
    const labels = columns.map(k => TEMPLATE_COLUMN_LABELS[k]);
    const aoa: unknown[][] = [labels];

    // Add match-related columns if matchResults available
    const hasMatch = !!options?.matchResults;
    if (hasMatch) {
      labels.push('Match Category', 'Match Score', 'Reviewer Notes');
    }

    auditCards.forEach(c => {
      const row = columns.map(k => TEMPLATE_COLUMN_RESOLVERS[k](c, mapping));
      if (hasMatch) {
        const cat = options!.categoryOf?.(c.id);
        const mr = options!.matchResults?.[c.id];
        const note = options!.matchNotes?.[c.id] || '';
        row.push(cat || '', mr?.score ?? '', note);
      }
      aoa.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Style header
    aoa[0].forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
      if (ws[addr]) ws[addr].s = headerStyle;
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Report');

    // Summary by facility
    const byFacility: Record<string, { count: number; totalDeduction: number }> = {};
    auditCards.forEach(c => {
      const fac = facilityOf(c, mapping) || 'Unknown';
      if (!byFacility[fac]) byFacility[fac] = { count: 0, totalDeduction: 0 };
      byFacility[fac].count += 1;
      byFacility[fac].totalDeduction += parseFloat(String(c.deduction)) || 0;
    });
    const summaryRows = Object.entries(byFacility).sort(([a], [b]) => a.localeCompare(b)).map(([facility, data]) => ({
      'Health Facility': facility,
      'Voucher Count': data.count,
      'Total Deduction': data.totalDeduction,
    }));
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    if (summaryWs['!ref']) {
      const range = XLSX.utils.decode_range(summaryWs['!ref']);
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (summaryWs[addr]) summaryWs[addr].s = headerStyle;
      }
    }
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Facility Summary');

  } else if (template === 'custom') {
    // Custom Export — user picks columns
    const selectedColumns = options?.selectedColumns || [...TEMPLATE_COLUMNS];
    if (selectedColumns.length === 0) {
      const ws = XLSX.utils.json_to_sheet([{ info: 'No columns selected' }]);
      XLSX.utils.book_append_sheet(wb, ws, 'Custom Export');
      return wb;
    }

    const labels = selectedColumns.map(k => TEMPLATE_COLUMN_LABELS[k]);
    const rows = cards.map(c => {
      const row: Record<string, unknown> = {};
      selectedColumns.forEach(k => { row[TEMPLATE_COLUMN_LABELS[k]] = TEMPLATE_COLUMN_RESOLVERS[k](c, mapping); });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) ws[addr].s = headerStyle;
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Custom Export');
  }

  return wb;
}

