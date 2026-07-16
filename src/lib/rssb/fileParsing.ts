// Spreadsheet parsing + header auto-mapping. Client-side (uses FileReader).

import * as XLSX from 'xlsx-js-style';
import type { FieldDef, HospFieldDef, Mapping, HospMapping } from './types';

export function normalizeKey(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function guessMatches(normalizedHeader: string, guess: string): boolean {
  return guess.length <= 3 ? normalizedHeader === guess : normalizedHeader.includes(guess);
}

export function autoMapHeaders<T extends FieldDef | HospFieldDef>(
  headers: string[],
  fieldDefs: T[],
): T extends FieldDef ? Mapping : HospMapping {
  const candidates: Array<{ field: string; header: string; score: number }> = [];
  fieldDefs.forEach(f => {
    headers.forEach(h => {
      const nh = normalizeKey(h);
      let bestGuessLen = 0;
      f.guesses.forEach(g => {
        if (guessMatches(nh, g) && g.length > bestGuessLen) bestGuessLen = g.length;
      });
      if (bestGuessLen > 0) candidates.push({ field: f.key, header: h, score: bestGuessLen });
    });
  });
  candidates.sort((a, b) => b.score - a.score);

  const mapping: Record<string, string> = {};
  fieldDefs.forEach(f => { mapping[f.key] = ''; });
  const usedHeaders = new Set<string>();
  const usedFields = new Set<string>();
  candidates.forEach(({ field, header }) => {
    if (usedFields.has(field) || usedHeaders.has(header)) return;
    mapping[field] = header;
    usedFields.add(field);
    usedHeaders.add(header);
  });
  return mapping as T extends FieldDef ? Mapping : HospMapping;
}

export interface ParsedFile {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string;
  fileName: string;
}

export function parseSpreadsheetFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error(`Could not read "${file.name}"`));
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) throw new Error(`"${file.name}" has no sheets.`);
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' });
        const headers = rows.length ? Object.keys(rows[0]) : [];
        resolve({ headers, rows, sheetName, fileName: file.name });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
