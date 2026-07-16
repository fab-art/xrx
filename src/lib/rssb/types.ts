// Core type definitions for the RSSB Counter Verification System.

export type Row = Record<string, unknown>;

export type Classifications = {
  pharma: boolean;
  rssb: boolean;
  fraud: boolean;
};

export type CardStatus = 'pending' | 'verified';

export interface Card {
  id: number;
  row: Row;
  rawRow?: Row | null;
  cleaned?: boolean;
  status: CardStatus;
  comment: string;
  deduction: number | string;
  prescriptionDate: string;
  facilityOverride: string;
  explanation: string;
  classifications: Classifications;
}

export type FieldKey =
  | 'voucher_no' | 'visit_date' | 'dispensing_date'
  | 'patient_name' | 'patient_type' | 'gender' | 'is_newborn'
  | 'patient_age' | 'rama_number' | 'affiliate_name'
  | 'doctor_name' | 'practitioner_type' | 'facility_name'
  | 'amount' | 'patient_copayment' | 'insurance_copayment'
  | 'difference' | 'observation';

export interface FieldDef {
  key: FieldKey;
  label: string;
  guesses: string[];
}

export type ClassificationKey = 'pharma' | 'rssb' | 'fraud';

export interface ClassificationDef {
  key: ClassificationKey;
  label: string;
}

export type HospFieldKey = 'hosp_id' | 'hosp_name' | 'hosp_sex' | 'hosp_dob' | 'hosp_date';

export interface HospFieldDef {
  key: HospFieldKey;
  label: string;
  guesses: string[];
}

export type Mapping = Partial<Record<FieldKey, string>>;
export type HospMapping = Partial<Record<HospFieldKey, string>>;

export interface HospitalFile {
  id: string;
  fileName: string;
  headers: string[];
  mapping: HospMapping;
  rows: Row[];
}

export type MatchCategory = 'clean' | 'review' | 'fraud_risk' | 'orphan';

export interface MatchedHospital {
  fileName: string;
  name: string;
  id: unknown;
  sex: string | null;
  dob: string | null;
  row: Row;
}

export interface MatchResult {
  pharmacyId: number;
  category: MatchCategory;
  score: number;
  reasons: string[];
  matchedHospital: MatchedHospital | null;
}

export interface CounterHeader {
  code: string;
  pharmacyName: string;
  period: string;
  tin: string;
  preparedBy: string;
  preparedByPosition: string;
  verifiedBy: string;
  verifiedByPosition: string;
  approvedBy: string;
  approvedByPosition: string;
}

export interface CleaningChange {
  cardId: number;
  field: FieldKey;
  header: string;
  type: string;
  original: unknown;
  cleaned: unknown;
  ambiguous?: boolean;
  unparsed?: boolean;
}

export type Stage =
  | 'landing' | 'upload' | 'sessions'
  | 'summary' | 'map' | 'clean' | 'verify'
  | 'dashboard' | 'analytics' | 'hospital' | 'match'
  | 'network' | 'fraud' | 'counter' | 'audit' | 'compare';

// Audit log entry — tracks every verification-related action for compliance.
export type AuditAction =
  | 'verify' | 'unverify'
  | 'flag_fraud' | 'unflag_fraud'
  | 'flag_pharma' | 'unflag_pharma'
  | 'flag_rssb' | 'unflag_rssb'
  | 'set_deduction' | 'set_prescription_date' | 'set_facility'
  | 'set_comment' | 'set_explanation'
  | 'bulk_verify' | 'bulk_unverify'
  | 'override_match' | 'set_match_note'
  | 'run_cleaning' | 'undo_cleaning';

export interface AuditLogEntry {
  id: string;          // unique id (timestamp + random)
  ts: number;          // epoch milliseconds
  action: AuditAction;
  cardId?: number;     // the affected voucher id (omitted for session-wide actions)
  cardIds?: number[];  // for bulk actions
  detail?: string;     // human-readable detail, e.g. "Deduction set to 5000"
  before?: string;     // previous value (stringified)
  after?: string;      // new value (stringified)
}

export interface SessionMeta {
  id: string;
  name: string;
  fileName: string;
  pharmacyName: string;
  voucherCount: number;
  verifiedCount: number;
  fraudCount: number;
  matchCount: number;
  stage: Stage;
  createdAt: string;
  updatedAt: string;
}

export interface SessionState {
  stage: Stage;
  fileName: string;
  headers: string[];
  mapping: Mapping;
  cards: Card[];
  currentIndex: number;
  counterHeader: CounterHeader;
  autoDetected: number;
  hospitalFiles: HospitalFile[];
  matchResults: Record<number, MatchResult> | null;
  matchOverrides: Record<number, MatchCategory>;
  matchNotes: Record<number, string>;
  cleaningReport: CleaningChange[] | null;
  auditLog: AuditLogEntry[];
}
