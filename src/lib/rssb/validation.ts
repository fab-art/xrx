// Smart data validation for the RSSB Counter Verification System.
// Provides rule-based validation of vouchers with severity indicators.

import type { Card, Mapping, FieldKey } from './types';
import { mappedValue, facilityOf, voucherOf, originalAmount, dateOf } from './cardHelpers';

// ── Types ──

export type ValidationSeverity = 'critical' | 'warning' | 'info';

export interface ValidationIssue {
  cardId: number;
  ruleKey: string;
  severity: ValidationSeverity;
  message: string;
}

export interface ValidationRule {
  key: string;
  label: string;
  severity: ValidationSeverity;
  description: string;
  validate: (card: Card, mapping: Mapping, context: ValidationContext) => ValidationIssue | null;
}

export interface ValidationContext {
  allCards: Card[];
  amounts: number[];
  medianAmount: number;
  voucherNumbers: Map<string, number[]>; // lowercased voucher → card ids
}

export interface ValidationSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  issues: ValidationIssue[];
  issuesByCard: Map<number, ValidationIssue[]>;
}

// ── Validation Rules ──

function missingRequiredField(fieldKey: FieldKey, label: string): ValidationRule {
  return {
    key: `missing_${fieldKey}`,
    label: `Missing ${label}`,
    severity: 'critical',
    description: `The "${label}" field is required but empty.`,
    validate(card: Card, mapping: Mapping): ValidationIssue | null {
      const header = mapping[fieldKey];
      if (!header) return null; // field not mapped, skip
      const val = String(card.row[header] ?? '').trim();
      if (val === '' || val === 'undefined' || val === 'null') {
        return { cardId: card.id, ruleKey: `missing_${fieldKey}`, severity: 'critical', message: `Missing required field: ${label}` };
      }
      return null;
    },
  };
}

const rules: ValidationRule[] = [
  // ── Missing required fields (critical) ──
  missingRequiredField('patient_name', 'Patient Name'),
  missingRequiredField('amount', 'Amount'),
  {
    key: 'missing_voucher_date',
    label: 'Missing Date',
    severity: 'critical',
    description: 'No prescription or dispensing date is set.',
    validate(card: Card, mapping: Mapping): ValidationIssue | null {
      const d = dateOf(card, mapping);
      if (!d && !card.prescriptionDate) {
        return { cardId: card.id, ruleKey: 'missing_voucher_date', severity: 'critical', message: 'Missing prescription/dispensing date' };
      }
      return null;
    },
  },

  // ── Amount anomalies (warning) ──
  {
    key: 'amount_exceeds_threshold',
    label: 'Amount Exceeds 3x Median',
    severity: 'warning',
    description: 'The original amount is more than 3x the median of all vouchers.',
    validate(card: Card, mapping: Mapping, ctx: ValidationContext): ValidationIssue | null {
      if (ctx.medianAmount <= 0) return null;
      const amt = originalAmount(card, mapping);
      if (amt !== null && amt > ctx.medianAmount * 3) {
        return { cardId: card.id, ruleKey: 'amount_exceeds_threshold', severity: 'warning', message: `Amount ${amt.toLocaleString()} exceeds 3x median (${Math.round(ctx.medianAmount).toLocaleString()})` };
      }
      return null;
    },
  },

  // ── Duplicate voucher numbers (critical) ──
  {
    key: 'duplicate_voucher_number',
    label: 'Duplicate Voucher #',
    severity: 'critical',
    description: 'Another voucher has the same voucher number.',
    validate(card: Card, mapping: Mapping, ctx: ValidationContext): ValidationIssue | null {
      const vn = voucherOf(card, mapping).trim().toLowerCase();
      if (!vn) return null;
      const ids = ctx.voucherNumbers.get(vn);
      if (ids && ids.length > 1) {
        return { cardId: card.id, ruleKey: 'duplicate_voucher_number', severity: 'critical', message: `Duplicate voucher number: ${voucherOf(card, mapping)}` };
      }
      return null;
    },
  },

  // ── Date anomalies (warning) ──
  {
    key: 'future_date',
    label: 'Future Date',
    severity: 'warning',
    description: 'The prescription date is in the future.',
    validate(card: Card, mapping: Mapping): ValidationIssue | null {
      const d = dateOf(card, mapping);
      if (d && d.getTime() > Date.now() + 86_400_000) { // 1 day buffer
        return { cardId: card.id, ruleKey: 'future_date', severity: 'warning', message: 'Prescription date is in the future' };
      }
      if (card.prescriptionDate) {
        const pd = new Date(card.prescriptionDate);
        if (!isNaN(pd.getTime()) && pd.getTime() > Date.now() + 86_400_000) {
          return { cardId: card.id, ruleKey: 'future_date', severity: 'warning', message: 'Prescription date is in the future' };
        }
      }
      return null;
    },
  },
  {
    key: 'very_old_date',
    label: 'Very Old Date',
    severity: 'warning',
    description: 'The prescription date is more than 5 years ago.',
    validate(card: Card, mapping: Mapping): ValidationIssue | null {
      const fiveYearsAgo = Date.now() - 5 * 365.25 * 86_400_000;
      const d = dateOf(card, mapping);
      if (d && d.getTime() < fiveYearsAgo) {
        return { cardId: card.id, ruleKey: 'very_old_date', severity: 'warning', message: 'Prescription date is more than 5 years old' };
      }
      return null;
    },
  },

  // ── RAMA number format validation (info) ──
  {
    key: 'rama_non_numeric',
    label: 'RAMA Non-Numeric',
    severity: 'info',
    description: 'The RAMA / affiliation number should be numeric.',
    validate(card: Card, mapping: Mapping): ValidationIssue | null {
      const header = mapping.rama_number;
      if (!header) return null;
      const val = String(card.row[header] ?? '').trim();
      if (!val) return null;
      // Allow digits, spaces, dashes, slashes — but flag if contains letters
      if (/[a-zA-Z]/.test(val)) {
        return { cardId: card.id, ruleKey: 'rama_non_numeric', severity: 'info', message: `RAMA number contains non-numeric characters: ${val}` };
      }
      return null;
    },
  },

  // ── Missing facility name (warning) ──
  {
    key: 'missing_facility',
    label: 'Missing Facility',
    severity: 'warning',
    description: 'No health facility name is set for this voucher.',
    validate(card: Card, mapping: Mapping): ValidationIssue | null {
      const fac = facilityOf(card, mapping).trim();
      if (!fac) {
        return { cardId: card.id, ruleKey: 'missing_facility', severity: 'warning', message: 'Missing health facility name' };
      }
      return null;
    },
  },
];

// ── Public API ──

/** Build the validation context from a list of cards and mapping. */
export function buildContext(allCards: Card[], mapping: Mapping): ValidationContext {
  const amounts: number[] = [];
  const voucherNumbers = new Map<string, number[]>();

  for (const c of allCards) {
    const amt = originalAmount(c, mapping);
    if (amt !== null && amt > 0) amounts.push(amt);

    const vn = voucherOf(c, mapping).trim().toLowerCase();
    if (vn) {
      const arr = voucherNumbers.get(vn) || [];
      arr.push(c.id);
      voucherNumbers.set(vn, arr);
    }
  }

  // Compute median amount
  const sorted = [...amounts].sort((a, b) => a - b);
  const medianAmount = sorted.length === 0 ? 0 :
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  return { allCards, amounts, medianAmount, voucherNumbers };
}

/** Validate a single card and return its issues. */
export function validateCard(card: Card, mapping: Mapping, ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rule of rules) {
    const issue = rule.validate(card, mapping, ctx);
    if (issue) issues.push(issue);
  }
  return issues;
}

/** Validate all cards and return a summary. */
export function validateAllCards(cards: Card[], mapping: Mapping): ValidationSummary {
  const ctx = buildContext(cards, mapping);
  const issues: ValidationIssue[] = [];
  const issuesByCard = new Map<number, ValidationIssue[]>();

  for (const card of cards) {
    const cardIssues = validateCard(card, mapping, ctx);
    if (cardIssues.length > 0) {
      issues.push(...cardIssues);
      issuesByCard.set(card.id, cardIssues);
    }
  }

  return {
    total: issues.length,
    critical: issues.filter(i => i.severity === 'critical').length,
    warning: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
    issues,
    issuesByCard,
  };
}

/** Get the worst severity for a card from its issues. */
export function worstSeverity(issues: ValidationIssue[]): ValidationSeverity | null {
  if (issues.length === 0) return null;
  if (issues.some(i => i.severity === 'critical')) return 'critical';
  if (issues.some(i => i.severity === 'warning')) return 'warning';
  return 'info';
}

/** Get all defined validation rules (for UI display). */
export function getValidationRules(): ValidationRule[] {
  return rules;
}
