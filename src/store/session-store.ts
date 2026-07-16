import { create } from 'zustand';
import type {
  AuditAction, AuditLogEntry, Card, CleaningChange, CounterHeader, HospitalFile, MatchCategory,
  MatchResult, Mapping, SessionMeta, Stage,
} from '@/lib/rssb/types';
import { emptyCounterHeader, SAVE_DEBOUNCE_MS } from '@/lib/rssb/config';
import {
  listSessions, getSession, saveSession, deleteSession, renameSession,
} from '@/lib/rssb/sessionApi';

interface SessionStore {
  // The active session's working state
  sessionId: string | null;
  sessionName: string;
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
  sessionNotes: string;

  // UI / meta
  lastSaved: Date | null;
  isSaving: boolean;
  isDirty: boolean;
  saveError: string | null;
  sessionsList: SessionMeta[];
  loadingSession: boolean;
  hydrated: boolean;

  // Actions
  setStage: (s: Stage) => void;
  setFileName: (s: string) => void;
  setHeaders: (h: string[]) => void;
  setMapping: (m: Mapping) => void;
  setCards: (c: Card[]) => void;
  updateCard: (id: number, patch: Partial<Card>) => void;
  setCurrentIndex: (i: number) => void;
  setCounterHeader: (h: CounterHeader | ((prev: CounterHeader) => CounterHeader)) => void;
  setAutoDetected: (n: number) => void;
  setHospitalFiles: (f: HospitalFile[]) => void;
  setMatchResults: (r: Record<number, MatchResult> | null) => void;
  setMatchOverrides: (o: Record<number, MatchCategory>) => void;
  setMatchNotes: (n: Record<number, string>) => void;
  setCleaningReport: (c: CleaningChange[] | null) => void;
  setSessionNotes: (notes: string) => void;
  setSessionName: (n: string) => void;
  appendAudit: (entry: Omit<AuditLogEntry, 'id' | 'ts'>) => void;
  clearAuditLog: () => void;

  // Session management
  refreshSessions: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  startNewSession: (fileName: string) => void;
  persist: () => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  renameCurrent: (name: string) => Promise<void>;
  resetWorkingState: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
// Guard against concurrent saves — if a save is in-flight, mark dirty and
// schedule another save after it completes instead of firing two POSTs at once.
let isPersisting = false;
let savePending = false;

function emptyState() {
  return {
    sessionId: null,
    sessionName: '',
    stage: 'landing' as Stage,
    fileName: '',
    headers: [],
    mapping: {},
    cards: [],
    currentIndex: 0,
    counterHeader: emptyCounterHeader(),
    autoDetected: 0,
    hospitalFiles: [],
    matchResults: null,
    matchOverrides: {},
    matchNotes: {},
    cleaningReport: null,
    auditLog: [] as AuditLogEntry[],
    sessionNotes: '',
  };
}

// Cap the audit log to prevent unbounded growth over long sessions.
const MAX_AUDIT_ENTRIES = 2000;

// Helper to compute an audit action + detail from a card patch.
function describeCardPatch(
  id: number,
  prev: Card | undefined,
  patch: Partial<Card>,
): Array<Omit<AuditLogEntry, 'id' | 'ts'>> {
  if (!prev) return [];
  const entries: Array<Omit<AuditLogEntry, 'id' | 'ts'>> = [];
  if (patch.status !== undefined && patch.status !== prev.status) {
    entries.push({
      action: patch.status === 'verified' ? 'verify' : 'unverify',
      cardId: id,
      detail: patch.status === 'verified' ? 'Voucher marked as verified' : 'Voucher set back to pending',
      before: prev.status, after: patch.status,
    });
  }
  if (patch.deduction !== undefined && String(patch.deduction) !== String(prev.deduction)) {
    entries.push({
      action: 'set_deduction', cardId: id,
      detail: `Deduction set to ${patch.deduction || 0}`,
      before: String(prev.deduction || 0), after: String(patch.deduction || 0),
    });
  }
  if (patch.prescriptionDate !== undefined && patch.prescriptionDate !== prev.prescriptionDate) {
    entries.push({
      action: 'set_prescription_date', cardId: id,
      detail: patch.prescriptionDate ? `Prescription date set to ${patch.prescriptionDate}` : 'Prescription date cleared',
      before: prev.prescriptionDate, after: patch.prescriptionDate,
    });
  }
  if (patch.facilityOverride !== undefined && patch.facilityOverride !== prev.facilityOverride) {
    entries.push({
      action: 'set_facility', cardId: id,
      detail: patch.facilityOverride ? `Facility set to ${patch.facilityOverride}` : 'Facility override cleared',
      before: prev.facilityOverride, after: patch.facilityOverride,
    });
  }
  if (patch.comment !== undefined && patch.comment !== prev.comment) {
    entries.push({
      action: 'set_comment', cardId: id,
      detail: patch.comment ? 'Comment added/updated' : 'Comment cleared',
      before: prev.comment, after: patch.comment,
    });
  }
  if (patch.explanation !== undefined && patch.explanation !== prev.explanation) {
    entries.push({
      action: 'set_explanation', cardId: id,
      detail: patch.explanation ? `Explanation set: "${patch.explanation.slice(0, 60)}"` : 'Explanation cleared',
      before: prev.explanation, after: patch.explanation,
    });
  }
  if (patch.classifications) {
    const pc = prev.classifications || { pharma: false, rssb: false, fraud: false };
    const nc = { ...pc, ...patch.classifications };
    if (nc.fraud !== pc.fraud) {
      entries.push({
        action: nc.fraud ? 'flag_fraud' : 'unflag_fraud', cardId: id,
        detail: nc.fraud ? 'Flagged as fraud activity' : 'Removed fraud flag',
        before: String(pc.fraud), after: String(nc.fraud),
      });
    }
    if (nc.pharma !== pc.pharma) {
      entries.push({
        action: nc.pharma ? 'flag_pharma' : 'unflag_pharma', cardId: id,
        detail: nc.pharma ? 'Flagged pharmacological compliance' : 'Removed pharmacological flag',
        before: String(pc.pharma), after: String(nc.pharma),
      });
    }
    if (nc.rssb !== pc.rssb) {
      entries.push({
        action: nc.rssb ? 'flag_rssb' : 'unflag_rssb', cardId: id,
        detail: nc.rssb ? 'Flagged RSSB rules compliance' : 'Removed RSSB flag',
        before: String(pc.rssb), after: String(nc.rssb),
      });
    }
  }
  return entries;
}

// Helper to detect bulk status changes in setCards (e.g. bulk verify).
function describeBulkCardChanges(
  prev: Card[],
  next: Card[],
): Array<Omit<AuditLogEntry, 'id' | 'ts'>> {
  const prevMap = new Map(prev.map(c => [c.id, c]));
  const entries: Array<Omit<AuditLogEntry, 'id' | 'ts'>> = [];
  // Detect status flips (verify / unverify) — group into bulk entries.
  const newlyVerified: number[] = [];
  const newlyPending: number[] = [];
  for (const nc of next) {
    const pc = prevMap.get(nc.id);
    if (!pc) continue;
    if (nc.status === 'verified' && pc.status !== 'verified') newlyVerified.push(nc.id);
    else if (nc.status === 'pending' && pc.status !== 'pending') newlyPending.push(nc.id);
  }
  if (newlyVerified.length > 0) {
    entries.push({
      action: 'bulk_verify', cardIds: newlyVerified,
      detail: `${newlyVerified.length} voucher(s) marked as verified in bulk`,
    });
  }
  if (newlyPending.length > 0) {
    entries.push({
      action: 'bulk_unverify', cardIds: newlyPending,
      detail: `${newlyPending.length} voucher(s) set to pending in bulk`,
    });
  }
  return entries;
}

// Append audit entries to the log with generated ids + timestamps.
// Trims the log to MAX_AUDIT_ENTRIES (keeps the most recent).
function appendEntries(
  log: AuditLogEntry[],
  newEntries: Array<Omit<AuditLogEntry, 'id' | 'ts'>>,
): AuditLogEntry[] {
  const now = Date.now();
  const stamped: AuditLogEntry[] = newEntries.map((e, i) => ({
    ...e,
    id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    ts: now + i, // ensure stable ordering even within the same save
  }));
  const combined = [...log, ...stamped];
  if (combined.length > MAX_AUDIT_ENTRIES) {
    return combined.slice(combined.length - MAX_AUDIT_ENTRIES);
  }
  return combined;
}

// Strip heavy data from the state before saving to keep the session payload
// small. Two sources of bloat:
//  1. `matchedHospital.row` — each match result includes a full copy of the
//     matched hospital row. With 141 vouchers this duplicates a lot of data
//     that's already in hospitalFiles. We keep the summary fields (fileName,
//     name, id, sex, dob) which are enough for display.
//  2. Hospital file `rows` — large hospital files (35K+ rows, 21MB+) make
//     every save take 5-8 seconds. We strip the rows and keep only metadata
//     (fileName, headers, mapping). Users re-upload hospital files if they
//     need to re-run matching. Match results are preserved independently.
function stripStateForSave(s: {
  matchResults: Record<number, MatchResult> | null;
  hospitalFiles: HospitalFile[];
}) {
  const matchResults: Record<number, MatchResult> | null = s.matchResults
    ? Object.fromEntries(
        Object.entries(s.matchResults).map(([key, val]) => [
          key,
          {
            ...val,
            matchedHospital: val.matchedHospital
              ? {
                  fileName: val.matchedHospital.fileName,
                  name: val.matchedHospital.name,
                  id: val.matchedHospital.id,
                  sex: val.matchedHospital.sex,
                  dob: val.matchedHospital.dob,
                  row: {}, // stripped — not needed for display
                }
              : null,
          },
        ]),
      )
    : null;

  const hospitalFiles: HospitalFile[] = s.hospitalFiles.map(f => ({
    ...f,
    rows: [], // stripped — re-upload to re-run matching. Metadata preserved.
  }));

  return { matchResults, hospitalFiles };
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  ...emptyState(),
  lastSaved: null,
  isSaving: false,
  isDirty: false,
  saveError: null,
  sessionsList: [],
  loadingSession: false,
  hydrated: false,

  setStage: (s) => { set({ stage: s, isDirty: true }); scheduleSave(get); },
  setFileName: (s) => { set({ fileName: s, isDirty: true }); scheduleSave(get); },
  setHeaders: (h) => { set({ headers: h, isDirty: true }); scheduleSave(get); },
  setMapping: (m) => { set({ mapping: m, isDirty: true }); scheduleSave(get); },
  setCards: (c) => {
    const prev = get().cards;
    // Detect bulk status changes (verify/unverify) and log them.
    const bulkEntries = describeBulkCardChanges(prev, c);
    set({ cards: c, isDirty: true });
    if (bulkEntries.length > 0) {
      set(state => ({ auditLog: appendEntries(state.auditLog, bulkEntries) }));
    }
    scheduleSave(get);
  },
  updateCard: (id, patch) => {
    const prev = get().cards.find(c => c.id === id);
    set(state => ({ cards: state.cards.map(c => (c.id === id ? { ...c, ...patch } : c)), isDirty: true }));
    // Compute audit entries for this patch (verify, deduction, fraud flag, etc.).
    const auditEntries = describeCardPatch(id, prev, patch);
    if (auditEntries.length > 0) {
      set(state => ({ auditLog: appendEntries(state.auditLog, auditEntries) }));
    }
    scheduleSave(get);
  },
  setCurrentIndex: (i) => { set({ currentIndex: i }); }, // don't auto-save cursor position — too noisy
  setCounterHeader: (h) => {
    set(state => ({ counterHeader: typeof h === 'function' ? h(state.counterHeader) : h, isDirty: true }));
    scheduleSave(get);
  },
  setAutoDetected: (n) => { set({ autoDetected: n, isDirty: true }); scheduleSave(get); },
  setHospitalFiles: (f) => { set({ hospitalFiles: f, isDirty: true }); scheduleSave(get); },
  setMatchResults: (r) => { set({ matchResults: r, isDirty: true }); scheduleSave(get); },
  setMatchOverrides: (o) => {
    const prev = get().matchOverrides;
    // Log each overridden voucher (keys are card ids as strings).
    const newEntries: Array<Omit<AuditLogEntry, 'id' | 'ts'>> = [];
    for (const [k, v] of Object.entries(o)) {
      const prevVal = prev[Number(k)];
      if (prevVal !== v) {
        newEntries.push({
          action: 'override_match', cardId: Number(k),
          detail: `Match category set to ${v}`,
          before: prevVal || 'auto', after: v,
        });
      }
    }
    set({ matchOverrides: o, isDirty: true });
    if (newEntries.length > 0) {
      set(state => ({ auditLog: appendEntries(state.auditLog, newEntries) }));
    }
    scheduleSave(get);
  },
  setMatchNotes: (n) => {
    const prev = get().matchNotes;
    const newEntries: Array<Omit<AuditLogEntry, 'id' | 'ts'>> = [];
    for (const [k, v] of Object.entries(n)) {
      const prevVal = prev[Number(k)];
      if (prevVal !== v && v.trim() !== '') {
        newEntries.push({
          action: 'set_match_note', cardId: Number(k),
          detail: `Reviewer note set: "${v.slice(0, 60)}"`,
          before: prevVal || '', after: v,
        });
      }
    }
    set({ matchNotes: n, isDirty: true });
    if (newEntries.length > 0) {
      set(state => ({ auditLog: appendEntries(state.auditLog, newEntries) }));
    }
    scheduleSave(get);
  },
  setCleaningReport: (c) => {
    const prev = get().cleaningReport;
    // Log when cleaning is first run (null → array) — not on every incremental update.
    const isFreshRun = !prev && c && c.length > 0;
    set({ cleaningReport: c, isDirty: true });
    if (isFreshRun) {
      const entry: Omit<AuditLogEntry, 'id' | 'ts'> = {
        action: 'run_cleaning',
        detail: `Data cleaning completed — ${c!.length} change(s) applied`,
      };
      set(state => ({ auditLog: appendEntries(state.auditLog, [entry]) }));
    }
    scheduleSave(get);
  },
  setSessionNotes: (notes) => { set({ sessionNotes: notes, isDirty: true }); scheduleSave(get); },
  setSessionName: (n) => { set({ sessionName: n, isDirty: true }); scheduleSave(get); },
  appendAudit: (entry) => {
    set(state => ({ auditLog: appendEntries(state.auditLog, [entry]) }));
    scheduleSave(get);
  },
  clearAuditLog: () => {
    set({ auditLog: [], isDirty: true });
    scheduleSave(get);
  },

  refreshSessions: async () => {
    try {
      const sessions = await listSessions();
      set({ sessionsList: sessions });
    } catch (e) {
      console.error('refreshSessions', e);
    }
  },

  loadSession: async (id) => {
    set({ loadingSession: true });
    try {
      const { meta, state } = await getSession(id);
      set({
        sessionId: meta.id,
        sessionName: meta.name,
        stage: (state.stage as Stage) || 'summary',
        fileName: state.fileName || meta.fileName,
        headers: state.headers || [],
        mapping: state.mapping || {},
        cards: state.cards || [],
        currentIndex: state.currentIndex ?? 0,
        counterHeader: state.counterHeader || emptyCounterHeader(),
        autoDetected: state.autoDetected ?? 0,
        hospitalFiles: state.hospitalFiles || [],
        matchResults: state.matchResults || null,
        matchOverrides: state.matchOverrides || {},
        matchNotes: state.matchNotes || {},
        cleaningReport: state.cleaningReport || null,
        auditLog: state.auditLog || [],
        sessionNotes: state.sessionNotes || '',
        loadingSession: false,
        hydrated: true,
        isDirty: false,
        lastSaved: new Date(meta.updatedAt),
      });
    } catch (e) {
      console.error('loadSession', e);
      set({ loadingSession: false });
    }
  },

  startNewSession: (fileName) => {
    set({
      ...emptyState(),
      sessionName: fileName,
      fileName,
      stage: 'summary',
      hydrated: true,
      isDirty: true,
    });
  },

  persist: async () => {
    const s = get();
    if (!s.hydrated) return;
    if (!s.cards.length && !s.fileName) return;
    // Guard against concurrent saves — if one is in-flight, mark pending and return.
    if (isPersisting) {
      savePending = true;
      return;
    }
    isPersisting = true;
    set({ isSaving: true, saveError: null });
    try {
      // Strip heavy data (hospital file rows, matched hospital row objects)
      // to keep the save payload small — can be 20MB+ otherwise, causing 5-8s saves.
      const { matchResults: strippedResults, hospitalFiles: strippedFiles } = stripStateForSave({
        matchResults: s.matchResults,
        hospitalFiles: s.hospitalFiles,
      });
      const state = {
        stage: s.stage,
        fileName: s.fileName,
        headers: s.headers,
        mapping: s.mapping,
        cards: s.cards,
        currentIndex: s.currentIndex,
        counterHeader: s.counterHeader,
        autoDetected: s.autoDetected,
        hospitalFiles: strippedFiles,
        matchResults: strippedResults,
        matchOverrides: s.matchOverrides,
        matchNotes: s.matchNotes,
        cleaningReport: s.cleaningReport,
        auditLog: s.auditLog,
        sessionNotes: s.sessionNotes,
      };
      const name = s.sessionName || s.fileName || 'Untitled session';
      const meta = await saveSession(s.sessionId, name, state);
      set({
        sessionId: meta.id,
        sessionName: meta.name,
        lastSaved: new Date(),
        isSaving: false,
        isDirty: false,
      });
      // Update the local sessionsList entry in-place instead of re-fetching all sessions.
      // This avoids an extra GET request on every save.
      const list = get().sessionsList;
      const idx = list.findIndex(x => x.id === meta.id);
      const updatedMeta: SessionMeta = {
        id: meta.id, name: meta.name, fileName: meta.fileName, pharmacyName: meta.pharmacyName,
        voucherCount: meta.voucherCount, verifiedCount: meta.verifiedCount, fraudCount: meta.fraudCount,
        matchCount: meta.matchCount, stage: meta.stage, createdAt: meta.createdAt, updatedAt: meta.updatedAt,
      };
      if (idx >= 0) {
        const newList = [...list];
        newList[idx] = updatedMeta;
        // Re-sort by updatedAt desc
        newList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        set({ sessionsList: newList });
      } else {
        // New session — add to list
        set({ sessionsList: [updatedMeta, ...list] });
      }
    } catch (e) {
      console.error('persist', e);
      set({ isSaving: false, saveError: (e as Error).message });
    } finally {
      isPersisting = false;
      // If another save was requested while we were busy, fire it now.
      if (savePending) {
        savePending = false;
        setTimeout(() => void get().persist(), 100);
      }
    }
  },

  removeSession: async (id) => {
    await deleteSession(id);
    if (get().sessionId === id) {
      set({ ...emptyState(), hydrated: true });
    }
    await get().refreshSessions();
  },

  renameCurrent: async (name) => {
    const s = get();
    if (!s.sessionId) {
      set({ sessionName: name });
      return;
    }
    try {
      await renameSession(s.sessionId, name);
      set({ sessionName: name });
      // Update local list
      const list = get().sessionsList;
      set({ sessionsList: list.map(x => x.id === s.sessionId ? { ...x, name } : x) });
    } catch (e) {
      console.error('renameCurrent', e);
    }
  },

  resetWorkingState: () => {
    set({ ...emptyState(), hydrated: true });
  },
}));

function scheduleSave(get: () => SessionStore) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void get().persist();
  }, SAVE_DEBOUNCE_MS);
}
