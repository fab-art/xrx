// Client-side session persistence.
//
// All sessions are stored locally in the browser's IndexedDB — there is no
// server or database involved. This means: sessions never leave the
// device, the app works fully offline once loaded, and it can be deployed
// as a static app (e.g. to Vercel) with zero backend/database setup.

import type { Card, SessionMeta, SessionState } from '@/lib/rssb/types';
import { idbDelete, idbGet, idbGetAll, idbPut, type StoredSessionRecord } from '@/lib/rssb/indexeddb';

function deriveMeta(state: SessionState) {
  const cards: Card[] = state.cards || [];
  return {
    voucherCount: cards.length,
    verifiedCount: cards.filter((c) => c.status === 'verified').length,
    fraudCount: cards.filter((c) => c.classifications?.fraud).length,
    matchCount: state.matchResults ? Object.keys(state.matchResults).length : 0,
    pharmacyName: state.counterHeader?.pharmacyName || '',
    stage: state.stage || 'summary',
  };
}

function toMeta(record: StoredSessionRecord): SessionMeta {
  const { state: _omit, ...meta } = record;
  return meta as SessionMeta;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function listSessions(): Promise<SessionMeta[]> {
  const records = await idbGetAll();
  return records
    .map(toMeta)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getSession(id: string): Promise<{ meta: SessionMeta; state: SessionState }> {
  const record = await idbGet(id);
  if (!record) throw new Error('Failed to load session');
  let state: SessionState;
  try {
    state = JSON.parse(record.state) as SessionState;
  } catch {
    state = {} as SessionState;
  }
  return { meta: toMeta(record), state };
}

export async function saveSession(
  id: string | null,
  name: string,
  state: SessionState,
): Promise<SessionMeta> {
  const now = new Date().toISOString();
  const meta = deriveMeta(state);
  const fileName = state.fileName || '';

  let record: StoredSessionRecord;
  if (id) {
    const existing = await idbGet(id);
    record = {
      id,
      name,
      fileName,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      state: JSON.stringify(state),
      ...meta,
    };
  } else {
    record = {
      id: newId(),
      name,
      fileName,
      createdAt: now,
      updatedAt: now,
      state: JSON.stringify(state),
      ...meta,
    };
  }

  await idbPut(record);
  return toMeta(record);
}

export async function renameSession(id: string, name: string): Promise<SessionMeta> {
  const existing = await idbGet(id);
  if (!existing) throw new Error('Failed to rename session');
  const updated: StoredSessionRecord = { ...existing, name, updatedAt: new Date().toISOString() };
  await idbPut(updated);
  return toMeta(updated);
}

export async function deleteSession(id: string): Promise<void> {
  await idbDelete(id);
}

// Export a session as a downloadable JSON file (client-side blob download).
export function exportSessionJSON(meta: SessionMeta, state: SessionState) {
  const payload = { meta, state, exportedAt: new Date().toISOString(), appVersion: '2.0' };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${meta.name.replace(/[^a-z0-9_-]+/gi, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Parse an imported session JSON file into { meta, state }.
export function parseSessionJSON(text: string): { meta?: SessionMeta; state: SessionState } {
  const parsed = JSON.parse(text);
  if (!parsed.state) throw new Error('Invalid session file: missing state');
  return { meta: parsed.meta, state: parsed.state as SessionState };
}
