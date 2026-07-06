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
