// Minimal promise-based IndexedDB wrapper used to persist verification
// sessions entirely in the browser (no server, no database service).
// This replaces the previous Prisma/SQLite-backed API routes so the app
// can run as a static/client-only deployment (e.g. on Vercel) and on a
// local machine with zero backend at all — everything lives in the
// browser's own IndexedDB storage for the current origin.

const DB_NAME = 'rssb-cvs';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

function isBrowser() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error('IndexedDB is only available in the browser'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

export interface StoredSessionRecord {
  id: string;
  name: string;
  fileName: string;
  pharmacyName: string;
  voucherCount: number;
  verifiedCount: number;
  fraudCount: number;
  matchCount: number;
  stage: string;
  state: string; // JSON-stringified SessionState
  createdAt: string;
  updatedAt: string;
}

export async function idbGetAll(): Promise<StoredSessionRecord[]> {
  return withStore('readonly', (store) => store.getAll());
}

export async function idbGet(id: string): Promise<StoredSessionRecord | undefined> {
  return withStore('readonly', (store) => store.get(id));
}

export async function idbPut(record: StoredSessionRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record));
}

export async function idbDelete(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}
