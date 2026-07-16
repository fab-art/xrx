import { SESSIONS_INDEX_KEY, SESSION_STORAGE_PREFIX } from '../config'

const DB_NAME = 'verify-app-db'
const STORE = 'kv'
const DB_VERSION = 1

let dbPromise = null

function openDB() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is not available in this browser'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function idbGet(key) {
  return openDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(key)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => reject(req.error)
      })
  )
}

function idbSet(key, value) {
  return openDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

function idbDelete(key) {
  return openDB().then(
    db =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

function readLegacyLocalStorage(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// One-time migration path: earlier versions of this app stored everything in
// localStorage, which caps out around 5-10MB — easy to exceed once hospital
// files and match results are loaded alongside pharmacy vouchers. IndexedDB
// has no such practical ceiling for this app's data sizes. On first load
// under the new storage, we pull any existing localStorage payload in and
// then stop touching localStorage for this key.
export async function loadState(key) {
  try {
    const fromIdb = await idbGet(key)
    if (fromIdb !== null) return fromIdb
    const legacy = readLegacyLocalStorage(key)
    if (legacy !== null) {
      await idbSet(key, legacy).catch(() => {})
      try { localStorage.removeItem(key) } catch { /* ignore */ }
      return legacy
    }
    return null
  } catch (err) {
    console.warn('IndexedDB unavailable, falling back to localStorage for this session.', err)
    return readLegacyLocalStorage(key)
  }
}

// Returns { ok: true } on success or { ok: false, error } on failure, so
// callers can surface a real warning instead of silently losing work.
export async function saveState(key, state) {
  try {
    await idbSet(key, state)
    return { ok: true }
  } catch (err) {
    console.error('Failed to save state to IndexedDB:', err)
    try {
      localStorage.setItem(key, JSON.stringify(state))
      return { ok: true }
    } catch (fallbackErr) {
      return { ok: false, error: fallbackErr }
    }
  }
}

export async function clearState(key) {
  try {
    await idbDelete(key)
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Multi-session storage
//
// The single STORAGE_KEY above holds the "live" working state that auto-saves
// as the user works (so a refresh never loses progress). Sessions are a
// separate, explicit save: a named snapshot of that same shape of state,
// stored under its own key, that shows up in the Sessions dashboard so a
// reviewer can keep several pharmacies' work side by side, reload whichever
// one they want to continue, export it, or delete it to free up space.
//
// The index (an array of lightweight metadata objects, no `state` payload) is
// kept separate from the actual per-session state blobs so listing sessions
// for the dashboard never has to load every session's full voucher data.

export async function listSessions() {
  const idx = await loadState(SESSIONS_INDEX_KEY)
  return Array.isArray(idx) ? idx : []
}

async function saveSessionsIndex(list) {
  return saveState(SESSIONS_INDEX_KEY, list)
}

// meta: { id, name, fileName, savedAt, stats }. Returns { ok, error? }.
export async function saveSession(meta, state) {
  const key = SESSION_STORAGE_PREFIX + meta.id
  const res = await saveState(key, state)
  if (!res.ok) return res
  const list = await listSessions()
  const entry = { ...meta, storageKey: key }
  const idx = list.findIndex(s => s.id === meta.id)
  if (idx >= 0) list[idx] = entry
  else list.push(entry)
  await saveSessionsIndex(list)
  return { ok: true }
}

// Returns { entry, state } or null if the session no longer exists.
export async function loadSession(id) {
  const list = await listSessions()
  const entry = list.find(s => s.id === id)
  if (!entry) return null
  const state = await loadState(entry.storageKey)
  return { entry, state }
}

export async function deleteSession(id) {
  const list = await listSessions()
  const entry = list.find(s => s.id === id)
  if (entry) await clearState(entry.storageKey)
  await saveSessionsIndex(list.filter(s => s.id !== id))
}

// Imports a session previously produced by exporting one to a .json file
// (see App.jsx's exportSession). Assigns a fresh id so importing the same
// file twice creates two independent sessions rather than colliding.
export async function importSession(meta, state) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const res = await saveSession({ ...meta, id }, state)
  return res.ok ? id : null
}
