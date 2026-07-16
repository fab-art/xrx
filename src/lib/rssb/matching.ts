// Record-linkage engine for matching hospital beneficiary records against
// pharmacy voucher records. Ported from the original JS implementation.

import type { MatchCategory, MatchResult } from './types';

// ---------- Normalization ----------

export function normalizeId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().toUpperCase();
  if (!s) return null;
  s = s.replace(/^NR\.?\s*/, '');
  s = s.replace(/[\s.\-_/]/g, '');
  if (!s || s === 'NAN' || /^N+$/.test(s)) return null;
  const m = s.match(/^(\d+)([A-Z]?)$/);
  if (m) {
    let digits = m[1];
    const letter = m[2];
    digits = digits.replace(/^0+/, '') || '0';
    return digits + letter;
  }
  const cleaned = s.replace(/[^A-Z0-9]/g, '');
  return cleaned || null;
}

export function normalizeSex(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith('M')) return 'M';
  if (s.startsWith('F')) return 'F';
  return null;
}

export interface NormalizedName {
  tokens: string[];
  key: string;
  display: string;
}

export function normalizeName(raw: unknown): NormalizedName {
  if (raw === null || raw === undefined) return { tokens: [], key: '', display: '' };
  let s = String(raw).toUpperCase();
  s = s.replace(/[^A-Z ,]/g, ' ');
  const tokens = s.split(/[, ]+/).filter(Boolean);
  const sorted = [...tokens].sort();
  return { tokens, key: sorted.join(' '), display: tokens.join(' ') };
}

export function normalizeDob(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  const d = new Date(raw as string);
  if (!isNaN(d.getTime()) && String(raw).length >= 6) return d.toISOString().slice(0, 10);
  return null;
}

// ---------- String similarity ----------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const dp = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) dp[j] = j;
  for (let i = 1; i <= al; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= bl; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[bl];
}

export function tokenSortSimilarity(keyA: string, keyB: string): number {
  if (!keyA || !keyB) return 0;
  if (keyA === keyB) return 1;
  const dist = levenshtein(keyA, keyB);
  const maxLen = Math.max(keyA.length, keyB.length);
  return maxLen === 0 ? 0 : 1 - dist / maxLen;
}

// ---------- Frequency-adjusted name weighting ----------

interface HospitalRec {
  sourceFile: string;
  rawId: unknown;
  normId: string | null;
  name: NormalizedName;
  sex: string | null;
  dob: string | null;
  row: Record<string, unknown>;
}

export function buildTokenFrequency(hospitalRecords: HospitalRec[]): Record<string, number> {
  const freq: Record<string, number> = {};
  hospitalRecords.forEach(r => {
    r.name.tokens.forEach(t => {
      freq[t] = (freq[t] || 0) + 1;
    });
  });
  return freq;
}

function rarityWeight(tokens: string[], freq: Record<string, number>, totalRecords: number): number {
  if (!tokens.length) return 0.5;
  const scores = tokens.map(t => {
    const f = freq[t] || 1;
    return Math.max(0.25, 1 - Math.log(f + 1) / Math.log(totalRecords + 2));
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ---------- Core scoring ----------

const WEIGHTS = {
  idExact: 6,
  idCloseTypo: 3,
  name: 4,
  sex: 1,
  sexConflict: -4,
  dob: 2.5,
  dobConflict: -3,
};

export interface HospitalIndex {
  byId: Map<string, HospitalRec[]>;
  tokenFreq: Record<string, number>;
  total: number;
  records: HospitalRec[];
}

export function buildHospitalIndex(hospitalRecords: HospitalRec[]): HospitalIndex {
  const byId = new Map<string, HospitalRec[]>();
  hospitalRecords.forEach(r => {
    if (!r.normId) return;
    if (!byId.has(r.normId)) byId.set(r.normId, []);
    byId.get(r.normId)!.push(r);
  });
  const tokenFreq = buildTokenFrequency(hospitalRecords);
  return { byId, tokenFreq, total: hospitalRecords.length, records: hospitalRecords };
}

interface PharmRec {
  id: number;
  normId: string | null;
  name: NormalizedName;
  sex: string | null;
  dob: string | null;
}

interface ScoreResult {
  score: number;
  reasons: string[];
  hardConflict: boolean;
  nameSim: number;
  hospital: HospitalRec;
}

function scoreCandidate(pharm: PharmRec, hosp: HospitalRec, tokenFreq: Record<string, number>, totalRecords: number): ScoreResult {
  const reasons: string[] = [];
  let score = 0;
  let hardConflict = false;

  if (pharm.normId && hosp.normId) {
    if (pharm.normId === hosp.normId) {
      score += WEIGHTS.idExact;
      reasons.push('ID exact match');
    } else if (
      pharm.normId.length === hosp.normId.length &&
      levenshtein(pharm.normId, hosp.normId) === 1
    ) {
      score += WEIGHTS.idCloseTypo;
      reasons.push('ID differs by 1 character (likely typo)');
    }
  }

  const nameSim = tokenSortSimilarity(pharm.name.key, hosp.name.key);
  if (nameSim > 0.55) {
    const w = rarityWeight(hosp.name.tokens, tokenFreq, totalRecords);
    const contrib = WEIGHTS.name * nameSim * w;
    score += contrib;
    reasons.push(`Name similarity ${(nameSim * 100).toFixed(0)}% (rarity-weighted)`);
  }

  if (pharm.sex && hosp.sex) {
    if (pharm.sex === hosp.sex) {
      score += WEIGHTS.sex;
    } else {
      score += WEIGHTS.sexConflict;
      hardConflict = true;
      reasons.push('Sex mismatch');
    }
  }

  if (pharm.dob && hosp.dob) {
    if (pharm.dob === hosp.dob) {
      score += WEIGHTS.dob;
      reasons.push('DOB exact match');
    } else {
      score += WEIGHTS.dobConflict;
      hardConflict = true;
      reasons.push('DOB mismatch');
    }
  }

  return { score, reasons, hardConflict, nameSim, hospital: hosp };
}

const THRESH = { clean: 6, review: 3 };

export function matchRecords(pharmRecords: PharmRec[], hospitalIndex: HospitalIndex): MatchResult[] {
  const { byId, tokenFreq, total, records } = hospitalIndex;

  return pharmRecords.map(p => {
    const candidates: HospitalRec[] = [];

    if (p.normId && byId.has(p.normId)) {
      byId.get(p.normId)!.forEach(h => candidates.push(h));
    }
    if (p.name.key) {
      records.forEach(h => {
        if (candidates.includes(h)) return;
        const quick = tokenSortSimilarity(p.name.key, h.name.key);
        if (quick > 0.55) candidates.push(h);
      });
    }

    let best: ScoreResult | null = null;
    for (const h of candidates) {
      const result = scoreCandidate(p, h, tokenFreq, total);
      if (!best || result.score > best.score) {
        best = result;
      }
    }

    let category: MatchCategory = 'orphan';
    if (best) {
      if (best.hardConflict && p.normId === best.hospital.normId) {
        category = 'fraud_risk';
      } else if (best.score >= THRESH.clean) {
        category = 'clean';
      } else if (best.score >= THRESH.review) {
        category = 'review';
      } else {
        category = 'orphan';
      }
    }

    return {
      pharmacyId: p.id,
      category,
      score: best ? Number(best.score.toFixed(2)) : 0,
      reasons: best ? best.reasons : ['No corroborating ID or name found in hospital data'],
      matchedHospital: best
        ? {
            fileName: best.hospital.sourceFile,
            name: best.hospital.name.display,
            id: best.hospital.rawId,
            sex: best.hospital.sex,
            dob: best.hospital.dob,
            row: best.hospital.row,
          }
        : null,
    };
  });
}

// Category labels — "orphan" renamed to "Not Found" per user request.
export const CATEGORY_LABELS: Record<MatchCategory, string> = {
  clean: 'Clean Match',
  fraud_risk: 'Mismatched Identity (Fraud Risk)',
  review: 'Needs Review',
  orphan: 'Not Found',
};

export type { HospitalRec, PharmRec };
