'use client';

import { useState } from 'react';
import { useSessionStore } from '@/store/session-store';
import { autoMapHeaders, parseSpreadsheetFile } from '@/lib/rssb/fileParsing';
import { HOSPITAL_FIELD_DEFS } from '@/lib/rssb/config';
import {
  normalizeId, normalizeSex, normalizeName, normalizeDob, buildHospitalIndex, matchRecords,
} from '@/lib/rssb/matching';
import { Building2, Plus, Trash2, Loader2, GitCompareArrows, ArrowRight, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { HospitalFile } from '@/lib/rssb/types';

export function HospitalView() {
  const cards = useSessionStore(s => s.cards);
  const mapping = useSessionStore(s => s.mapping);
  const hospitalFiles = useSessionStore(s => s.hospitalFiles);
  const setHospitalFiles = useSessionStore(s => s.setHospitalFiles);
  const setMatchResults = useSessionStore(s => s.setMatchResults);
  const setStage = useSessionStore(s => s.setStage);
  const fileName = useSessionStore(s => s.fileName);
  const { toast } = useToast();
  const [isMatching, setIsMatching] = useState(false);

  async function handleHospitalFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const results = await Promise.allSettled(files.map(parseSpreadsheetFile));
    const failed: string[] = [];
    const newFiles: HospitalFile[] = [];
    results.forEach((res, i) => {
      if (res.status === 'rejected') {
        failed.push(files[i].name);
        return;
      }
      const { headers: hdrs, rows: json, fileName: name } = res.value;
      if (!json.length) {
        failed.push(`${name} (no data rows)`);
        return;
      }
      const guessedMapping = autoMapHeaders(hdrs, HOSPITAL_FIELD_DEFS);
      newFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: name,
        headers: hdrs,
        mapping: guessedMapping,
        rows: json,
      });
    });
    if (newFiles.length) setHospitalFiles([...hospitalFiles, ...newFiles]);
    if (failed.length) {
      toast({ title: 'Some files failed', description: `Couldn't load: ${failed.join(', ')}`, variant: 'destructive' });
    }
    e.target.value = '';
  }

  function updateHospitalMapping(fileId: string, fieldKey: string, header: string) {
    setHospitalFiles(hospitalFiles.map(f => (f.id === fileId ? { ...f, mapping: { ...f.mapping, [fieldKey]: header } } : f)));
  }

  function removeHospitalFile(fileId: string) {
    setHospitalFiles(hospitalFiles.filter(f => f.id !== fileId));
    setMatchResults(null);
  }

  function runMatching() {
    if (!cards.length || !hospitalFiles.length) return;
    setIsMatching(true);
    setTimeout(() => {
      const hospitalRecords: Array<{
        sourceFile: string; rawId: unknown; normId: string | null;
        name: ReturnType<typeof normalizeName>; sex: string | null; dob: string | null; row: Record<string, unknown>;
      }> = [];
      hospitalFiles.forEach(f => {
        f.rows.forEach(row => {
          const rawId = f.mapping.hosp_id ? row[f.mapping.hosp_id] : '';
          const rawName = f.mapping.hosp_name ? row[f.mapping.hosp_name] : '';
          const rawSex = f.mapping.hosp_sex ? row[f.mapping.hosp_sex] : '';
          const rawDob = f.mapping.hosp_dob ? row[f.mapping.hosp_dob] : '';
          hospitalRecords.push({
            sourceFile: f.fileName,
            rawId,
            normId: normalizeId(rawId),
            name: normalizeName(rawName),
            sex: normalizeSex(rawSex),
            dob: normalizeDob(rawDob),
            row,
          });
        });
      });

      const pharmRecords = cards.map(c => {
        const rawId = mapping.rama_number ? c.row[mapping.rama_number] : '';
        const rawName = mapping.patient_name ? c.row[mapping.patient_name] : '';
        const rawSex = mapping.gender ? c.row[mapping.gender] : '';
        const rawDob = mapping.patient_age ? c.row[mapping.patient_age] : '';
        return {
          id: c.id,
          normId: normalizeId(rawId),
          name: normalizeName(rawName),
          sex: normalizeSex(rawSex),
          dob: normalizeDob(rawDob),
        };
      });

      const index = buildHospitalIndex(hospitalRecords);
      const results = matchRecords(pharmRecords, index);
      const byId: Record<number, typeof results[number]> = {};
      results.forEach(r => { byId[r.pharmacyId] = r; });
      setMatchResults(byId);
      setIsMatching(false);
      setStage('match');
    }, 30);
  }

  return (
    <div>
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-5">
        <h2 className="text-base font-medium mb-1 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Upload hospital files
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Upload one or more hospital beneficiary files (e.g. CHUK, La Médicale). Each file is
          auto-mapped and normalized independently, then matched against the pharmacy vouchers
          already loaded ({cards.length} vouchers from &quot;{fileName}&quot;).
        </p>
        <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium border border-dashed border-border rounded-lg px-4 py-2.5 bg-muted hover:bg-accent transition-colors">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm">
            <Plus className="w-4 h-4" />
          </span>
          Add hospital file(s)
          <input type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleHospitalFiles} className="sr-only" />
        </label>
      </div>

      {hospitalFiles.length === 0 && (
        <p className="text-sm text-muted-foreground">No hospital files uploaded yet.</p>
      )}

      {/* Notice when hospital files were stripped during save (rows empty but metadata exists) */}
      {hospitalFiles.some(f => f.rows.length === 0) && (
        <div className="rounded-lg border border-warn bg-warn-light text-warn-dark text-sm px-4 py-3 mb-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Hospital file data not loaded</p>
            <p className="text-xs mt-1">
              Hospital file rows are not saved with the session to keep it lightweight.
              Previous match results are preserved. Re-upload the hospital files above to re-run matching or explore the network graph.
            </p>
          </div>
        </div>
      )}

      {hospitalFiles.map(f => (
        <div key={f.id} className={`rounded-xl border bg-card p-5 mb-4 ${f.rows.length === 0 ? 'border-warn/40' : 'border-border'}`}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                {f.fileName}
                {f.rows.length === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-warn-light text-warn-dark uppercase tracking-wide">needs re-upload</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {f.rows.length > 0 ? `${f.rows.length} records` : 'Rows not loaded'} · {f.headers.length} columns
              </div>
            </div>
            <button
              onClick={() => removeHospitalFile(f.id)}
              className="inline-flex items-center gap-1 text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-danger-light hover:text-danger-dark hover:border-danger transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {HOSPITAL_FIELD_DEFS.map(hf => (
              <div key={hf.key} className="flex items-center justify-between gap-4">
                <label className="text-sm min-w-[220px]">{hf.label}</label>
                <select
                  value={f.mapping[hf.key] || ''}
                  onChange={e => updateHospitalMapping(f.id, hf.key, e.target.value)}
                  className="flex-1 max-w-xs border border-border rounded-lg px-2.5 py-1.5 text-sm bg-muted"
                >
                  <option value="">— not mapped —</option>
                  {f.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}

      {hospitalFiles.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium mb-2 flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-primary" />
            Run matching
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Normalizes beneficiary IDs (strips &quot;Nr&quot; prefixes, leading zeros, whitespace), names
            (order-invariant, punctuation-stripped), and sex codes, then scores every pharmacy
            voucher against all hospital records using weighted evidence. Results land in four
            buckets: Clean Match, Needs Review, Fraud Risk, and Not Found.
          </p>
          <button
            onClick={runMatching}
            disabled={isMatching || hospitalFiles.every(f => f.rows.length === 0)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isMatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompareArrows className="w-4 h-4" />}
            {isMatching ? 'Matching…' : `Run matching against ${cards.length} vouchers`}
            {!isMatching && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
