import { useState, useMemo, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

const STORAGE_KEY = 'verify-app-state-v1'

const FIELD_DEFS = [
  { key: 'patient_name', label: 'Patient name', guesses: ['patient', 'name', 'beneficiary'] },
  { key: 'amount', label: 'Amount', guesses: ['amount', 'total', 'cost', 'claim', 'value', 'price'] },
  { key: 'visit_date', label: 'Visit date', guesses: ['date', 'visit'] },
  { key: 'doctor_name', label: 'Doctor / prescriber', guesses: ['doctor', 'practitioner', 'prescriber'] },
  { key: 'facility_name', label: 'Facility', guesses: ['facility', 'pharmacy', 'hospital'] },
  { key: 'rama_number', label: 'RAMA / insurance number', guesses: ['rama', 'rssb', 'insurance'] }
]

function guessKey(headers, candidates) {
  return headers.find(h => candidates.some(c => h.toLowerCase().replace(/[\s_]/g, '').includes(c))) || ''
}

function toRows(workbook) {
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { defval: '' })
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors
  }
}

export default function App() {
  const persisted = useRef(loadState())
  const initial = persisted.current

  const [stage, setStage] = useState(initial?.stage || 'upload') // upload | map | verify | dashboard
  const [fileName, setFileName] = useState(initial?.fileName || '')
  const [headers, setHeaders] = useState(initial?.headers || [])
  const [mapping, setMapping] = useState(initial?.mapping || {})
  const [cards, setCards] = useState(initial?.cards || [])
  const [currentIndex, setCurrentIndex] = useState(initial?.currentIndex || 0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [advFilter, setAdvFilter] = useState('none') // none | repeated | over40000
  const [lastSaved, setLastSaved] = useState(null)

  useEffect(() => {
    saveState({ stage, fileName, headers, mapping, cards, currentIndex })
    setLastSaved(new Date())
  }, [stage, fileName, headers, mapping, cards, currentIndex])

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const json = toRows(wb)
      const hdrs = json.length ? Object.keys(json[0]) : []
      const guessedMapping = {}
      FIELD_DEFS.forEach(f => {
        guessedMapping[f.key] = guessKey(hdrs, f.guesses)
      })
      setHeaders(hdrs)
      setMapping(guessedMapping)
      setCards(
        json.map((row, i) => ({
          id: i,
          row,
          status: 'pending', // pending | verified | rejected
          comment: '',
          deduction: 0,
          prescriptionDate: '',
          facilityOverride: ''
        }))
      )
      setCurrentIndex(0)
      setStage('map')
    }
    reader.readAsArrayBuffer(file)
  }

  function updateMapping(fieldKey, header) {
    setMapping(m => ({ ...m, [fieldKey]: header }))
  }

  function getField(card, fieldKey) {
    const header = mapping[fieldKey]
    return header ? card.row[header] : ''
  }

  function originalAmount(card) {
    const v = parseFloat(getField(card, 'amount'))
    return isNaN(v) ? null : v
  }

  function approvedAmount(card) {
    const orig = originalAmount(card)
    if (orig === null) return null
    return Math.max(0, orig - (parseFloat(card.deduction) || 0))
  }

  function updateCard(id, patch) {
    setCards(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)))
  }

  // repeated patient detection
  const repeatedIds = useMemo(() => {
    const nameHeader = mapping.patient_name
    if (!nameHeader) return new Set()
    const counts = {}
    cards.forEach(c => {
      const n = String(c.row[nameHeader] || '').trim().toLowerCase()
      if (!n) return
      counts[n] = (counts[n] || 0) + 1
    })
    const ids = new Set()
    cards.forEach(c => {
      const n = String(c.row[nameHeader] || '').trim().toLowerCase()
      if (n && counts[n] > 1) ids.add(c.id)
    })
    return ids
  }, [cards, mapping.patient_name])

  const filteredCards = useMemo(() => {
    let list = cards
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter)
    if (advFilter === 'repeated') list = list.filter(c => repeatedIds.has(c.id))
    if (advFilter === 'over40000') list = list.filter(c => (originalAmount(c) || 0) > 40000)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        Object.values(c.row).some(v => String(v).toLowerCase().includes(q))
      )
    }
    return list
  }, [cards, statusFilter, advFilter, search, repeatedIds, mapping])

  const summary = useMemo(() => {
    const total = cards.length
    const verified = cards.filter(c => c.status === 'verified').length
    const rejected = cards.filter(c => c.status === 'rejected').length
    const pending = total - verified - rejected
    const totalOriginal = cards.reduce((s, c) => s + (originalAmount(c) || 0), 0)
    const totalApproved = cards.reduce((s, c) => s + (approvedAmount(c) || 0), 0)
    const progressPct = total ? Math.round(((verified + rejected) / total) * 100) : 0
    return { total, verified, rejected, pending, totalOriginal, totalApproved, progressPct }
  }, [cards, mapping])

  function exportResults() {
    const exportRows = cards.map(c => ({
      ...c.row,
      verification_status: c.status,
      comment: c.comment,
      prescription_date: c.prescriptionDate,
      facility_override: c.facilityOverride,
      deduction: c.deduction || 0,
      approved_amount: approvedAmount(c)
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Verified')
    XLSX.writeFile(wb, `verified_${fileName || 'export'}.xlsx`)
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY)
    setStage('upload')
    setFileName('')
    setHeaders([])
    setMapping({})
    setCards([])
    setCurrentIndex(0)
  }

  const currentCard = cards[currentIndex]

  function goTo(delta) {
    setCurrentIndex(i => Math.max(0, Math.min(cards.length - 1, i + delta)))
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Verify</h1>
          <p className="subtitle">Data preparation and verification dashboard</p>
        </div>
        {stage !== 'upload' && (
          <div className="header-actions">
            {lastSaved && <span className="saved-hint">Saved {lastSaved.toLocaleTimeString()}</span>}
            <button className="ghost" onClick={reset}>New file</button>
          </div>
        )}
      </header>

      {stage !== 'upload' && (
        <nav className="tabs">
          <button className={stage === 'map' ? 'tab active' : 'tab'} onClick={() => setStage('map')}>1. Map columns</button>
          <button className={stage === 'verify' ? 'tab active' : 'tab'} onClick={() => setStage('verify')}>2. Verify</button>
          <button className={stage === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setStage('dashboard')}>3. Dashboard</button>
        </nav>
      )}

      {stage === 'upload' && (
        <div className="upload-zone">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} id="file-upload" />
          <label htmlFor="file-upload" className="upload-label">
            <span className="upload-icon">+</span>
            <span>Upload Excel or CSV file</span>
            <span className="upload-hint">.xlsx, .xls or .csv</span>
          </label>
        </div>
      )}

      {stage === 'map' && (
        <div className="map-panel">
          <p className="section-hint">Map your file's columns to the fields below. Guesses are pre-filled — adjust any that look wrong.</p>
          <div className="map-grid">
            {FIELD_DEFS.map(f => (
              <div className="map-row" key={f.key}>
                <label>{f.label}</label>
                <select value={mapping[f.key] || ''} onChange={e => updateMapping(f.key, e.target.value)}>
                  <option value="">— not mapped —</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button onClick={() => setStage('verify')}>Continue to verification</button>
        </div>
      )}

      {stage === 'verify' && currentCard && (
        <div className="verify-panel">
          <div className="verify-progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${summary.progressPct}%` }} />
            </div>
            <span className="progress-text">{currentIndex + 1} of {cards.length} · {summary.progressPct}% reviewed</span>
          </div>

          <div className={`card verify-card status-${currentCard.status}`}>
            <div className="card-header">
              <span className="card-title">
                {mapping.patient_name ? currentCard.row[mapping.patient_name] : `Record ${currentCard.id + 1}`}
              </span>
              {repeatedIds.has(currentCard.id) && <span className="badge badge-warn">Repeated patient</span>}
            </div>

            <div className="card-fields">
              {headers.slice(0, 8).map(h => (
                <div className="field" key={h}>
                  <span className="field-label">{h}</span>
                  <span className="field-value">{String(currentCard.row[h])}</span>
                </div>
              ))}
            </div>

            <div className="extra-section">
              <div className="extra-row">
                <label>Prescription date</label>
                <input
                  type="date"
                  value={currentCard.prescriptionDate}
                  onChange={e => updateCard(currentCard.id, { prescriptionDate: e.target.value })}
                />
              </div>
              <div className="extra-row">
                <label>Health facility</label>
                <input
                  type="text"
                  placeholder={mapping.facility_name ? String(currentCard.row[mapping.facility_name] || '') : 'Enter facility name'}
                  value={currentCard.facilityOverride}
                  onChange={e => updateCard(currentCard.id, { facilityOverride: e.target.value })}
                />
              </div>
            </div>

            {mapping.amount && (
              <div className="amount-block">
                <div className="amount-row">
                  <span>Original amount</span>
                  <span>{originalAmount(currentCard)?.toLocaleString()}</span>
                </div>
                <div className="amount-row deduct-input">
                  <span>Deduct</span>
                  <input
                    type="number"
                    min="0"
                    value={currentCard.deduction || ''}
                    placeholder="0"
                    onChange={e => updateCard(currentCard.id, { deduction: e.target.value })}
                  />
                </div>
                <div className="amount-row final">
                  <span>Approved amount (auto)</span>
                  <span>{approvedAmount(currentCard)?.toLocaleString()}</span>
                </div>
              </div>
            )}

            <textarea
              className="comment-box"
              placeholder="Add comment..."
              value={currentCard.comment}
              onChange={e => updateCard(currentCard.id, { comment: e.target.value })}
            />

            <div className="card-buttons">
              <button
                className={currentCard.status === 'verified' ? 'verify-btn active' : 'verify-btn'}
                onClick={() => updateCard(currentCard.id, { status: 'verified' })}
              >
                Verify
              </button>
              <button
                className={currentCard.status === 'rejected' ? 'reject-btn active' : 'reject-btn'}
                onClick={() => updateCard(currentCard.id, { status: 'rejected' })}
              >
                Reject
              </button>
              {currentCard.status !== 'pending' && (
                <button className="ghost" onClick={() => updateCard(currentCard.id, { status: 'pending' })}>Reset</button>
              )}
            </div>
          </div>

          <div className="nav-buttons">
            <button onClick={() => goTo(-1)} disabled={currentIndex === 0}>Previous</button>
            <button onClick={() => goTo(1)} disabled={currentIndex === cards.length - 1}>Next</button>
          </div>
        </div>
      )}

      {stage === 'dashboard' && (
        <div className="dashboard-panel">
          <div className="summary-bar">
            <div className="summary-card">
              <span className="summary-label">Total vouchers</span>
              <span className="summary-value">{summary.total}</span>
            </div>
            <div className="summary-card verified">
              <span className="summary-label">Verified</span>
              <span className="summary-value">{summary.verified}</span>
            </div>
            <div className="summary-card rejected">
              <span className="summary-label">Rejected</span>
              <span className="summary-value">{summary.rejected}</span>
            </div>
            <div className="summary-card pending">
              <span className="summary-label">Pending</span>
              <span className="summary-value">{summary.pending}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Original total</span>
              <span className="summary-value">{summary.totalOriginal.toLocaleString()}</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Approved total</span>
              <span className="summary-value">{summary.totalApproved.toLocaleString()}</span>
            </div>
          </div>

          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${summary.progressPct}%` }} />
          </div>
          <p className="progress-text">{summary.progressPct}% of vouchers reviewed</p>

          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Search all fields..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="filters">
              {['all', 'pending', 'verified', 'rejected'].map(f => (
                <button key={f} className={statusFilter === f ? 'filter-btn active' : 'filter-btn'} onClick={() => setStatusFilter(f)}>{f}</button>
              ))}
            </div>
            <div className="filters">
              <button className={advFilter === 'none' ? 'filter-btn active' : 'filter-btn'} onClick={() => setAdvFilter('none')}>No filter</button>
              <button className={advFilter === 'repeated' ? 'filter-btn active' : 'filter-btn'} onClick={() => setAdvFilter('repeated')}>Repeated records</button>
              <button className={advFilter === 'over40000' ? 'filter-btn active' : 'filter-btn'} onClick={() => setAdvFilter('over40000')}>Over 40,000</button>
            </div>
            <button onClick={exportResults}>Export</button>
          </div>

          <div className="table-wrap">
            <table className="voucher-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Patient</th>
                  <th>Amount</th>
                  <th>Approved</th>
                  <th>Status</th>
                  <th>Flags</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map(c => (
                  <tr key={c.id}>
                    <td>{c.id + 1}</td>
                    <td>{mapping.patient_name ? c.row[mapping.patient_name] : '—'}</td>
                    <td>{originalAmount(c)?.toLocaleString() ?? '—'}</td>
                    <td>{approvedAmount(c)?.toLocaleString() ?? '—'}</td>
                    <td><span className={`status-pill status-${c.status}`}>{c.status}</span></td>
                    <td>
                      {repeatedIds.has(c.id) && <span className="badge badge-warn">Repeat</span>}
                      {(originalAmount(c) || 0) > 40000 && <span className="badge badge-danger">High value</span>}
                    </td>
                    <td>
                      <button className="ghost small" onClick={() => { setCurrentIndex(cards.findIndex(x => x.id === c.id)); setStage('verify') }}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
