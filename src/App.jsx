import { useState, useMemo, useEffect, useRef, Fragment, lazy, Suspense } from 'react'
import * as XLSX from 'xlsx-js-style'
import {
  normalizeId,
  normalizeSex,
  normalizeName,
  normalizeDob,
  buildHospitalIndex,
  matchRecords,
  CATEGORY_LABELS
} from './matching'
const NetworkGraph = lazy(() => import('./NetworkGraph'))
import Sidebar from './components/Sidebar'
import SummaryView from './components/SummaryView'
import FraudReviewView from './components/FraudReviewView'
import CounterVerificationView from './components/CounterVerificationView'
import VoucherRowDetail from './components/VoucherRowDetail'
import { useDialog } from './components/Dialog'
import {
  STORAGE_KEY, THEME_KEY, SAVE_DEBOUNCE_MS,
  FIELD_DEFS, CLASSIFICATION_DEFS, HOSPITAL_FIELD_DEFS, MATCH_CATEGORIES, TABS,
  emptyClassifications
} from './config'
import { loadState, saveState, clearState } from './utils/storage'
import { autoMapHeaders, parseSpreadsheetFile } from './fileParsing'
import * as CH from './cardHelpers'
import { cleanCards, revertCleaning, summarizeChanges, dispensingDateHint } from './dataCleaning'
import {
  buildVerifiedWorkbook, buildFraudReportWorkbook,
  buildCounterReportWorkbook, buildMatchReportWorkbook
} from './reportGenerators'

export default function App() {
  const { alertUser, confirmUser } = useDialog()
  const saveTimer = useRef(null)
  const [hydrated, setHydrated] = useState(false)

  const [stage, setStage] = useState('landing')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState({})
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [advFilter, setAdvFilter] = useState('none')
  const [classificationFilter, setClassificationFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState('none')
  const [sortDir, setSortDir] = useState('asc')
  const [counterHeader, setCounterHeader] = useState({
    code: '', pharmacyName: '', period: '', tin: '',
    preparedBy: '', preparedByPosition: '',
    verifiedBy: '', verifiedByPosition: '',
    approvedBy: '', approvedByPosition: ''
  })
  const [hospitalFiles, setHospitalFiles] = useState([])
  const [matchResults, setMatchResults] = useState(null)
  const [matchOverrides, setMatchOverrides] = useState({})
  const [matchNotes, setMatchNotes] = useState({})
  const [matchCategoryFilter, setMatchCategoryFilter] = useState('all')
  const [matchSearch, setMatchSearch] = useState('')
  const [isMatching, setIsMatching] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [storageWarning, setStorageWarning] = useState(false)
  const [autoDetected, setAutoDetected] = useState(0)
  const [cleaningReport, setCleaningReport] = useState(null)
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'light' } catch { return 'light' }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  // One-time async hydration from IndexedDB on mount. Unlike the old
  // localStorage-backed version, this can't be read synchronously during
  // useState initialization — IndexedDB access is always async — so the app
  // briefly renders its default (empty) state before hydrating. The
  // debounced save effect below is guarded on `hydrated` so it can't fire
  // (and overwrite real saved data with these empty defaults) before this
  // completes.
  useEffect(() => {
    let cancelled = false
    loadState(STORAGE_KEY).then(saved => {
      if (cancelled) return
      if (saved) {
        if (saved.stage) setStage(saved.stage)
        if (saved.fileName) setFileName(saved.fileName)
        if (saved.headers) setHeaders(saved.headers)
        if (saved.mapping) setMapping(saved.mapping)
        if (saved.cards) setCards(saved.cards)
        if (typeof saved.currentIndex === 'number') setCurrentIndex(saved.currentIndex)
        if (saved.counterHeader) setCounterHeader(saved.counterHeader)
        if (saved.autoDetected) setAutoDetected(saved.autoDetected)
        if (saved.hospitalFiles) setHospitalFiles(saved.hospitalFiles)
        if (saved.matchResults) setMatchResults(saved.matchResults)
        if (saved.matchOverrides) setMatchOverrides(saved.matchOverrides)
        if (saved.matchNotes) setMatchNotes(saved.matchNotes)
      }
      setHydrated(true)
    })
    return () => { cancelled = true }
  }, [])

  // Debounced + failure-aware persistence. Previously this fired a full
  // JSON.stringify + localStorage.setItem of the entire app state (including
  // every hospital file's raw rows) on EVERY keystroke in any comment/search
  // field, and silently swallowed quota-exceeded errors — meaning a full
  // session's review work could be lost with no warning once the serialized
  // state passed the browser's ~5-10MB localStorage limit. Storage now runs
  // on IndexedDB (no practical size ceiling for this app's data), still
  // debounced, and still tells the user if a save actually fails.
  useEffect(() => {
    if (!hydrated) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveState(STORAGE_KEY, {
        stage, fileName, headers, mapping, cards, currentIndex, counterHeader, autoDetected,
        hospitalFiles, matchResults, matchOverrides, matchNotes
      }).then(result => {
        if (result.ok) {
          setStorageWarning(false)
          setLastSaved(new Date())
        } else {
          setStorageWarning(true)
        }
      })
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(saveTimer.current)
  }, [hydrated, stage, fileName, headers, mapping, cards, currentIndex, counterHeader, autoDetected,
      hospitalFiles, matchResults, matchOverrides, matchNotes])

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    try {
      const { headers: hdrs, rows: json } = await parseSpreadsheetFile(file)
      if (!json.length) {
        await alertUser(`"${file.name}" doesn't contain any data rows. Please check the file and try again.`)
        return
      }
      const guessedMapping = autoMapHeaders(hdrs, FIELD_DEFS)
      setAutoDetected(Object.values(guessedMapping).filter(Boolean).length)
      setHeaders(hdrs)
      setMapping(guessedMapping)
      const dispensingHeader = guessedMapping.dispensing_date
      setCards(
        json.map((row, i) => ({
          id: i,
          row,
          status: 'pending', // pending | verified
          comment: '',
          deduction: 0,
          // Pre-fill the prescription date with the dispensing date as a hint —
          // it's usually the same or very close, and this saves re-typing it by
          // hand; reviewers can still edit it if it's wrong.
          prescriptionDate: dispensingDateHint(row, dispensingHeader),
          facilityOverride: '',
          explanation: '',
          classifications: emptyClassifications()
        }))
      )
      setCurrentIndex(0)
      setStage('summary')
    } catch (err) {
      console.error(err)
      await alertUser(`Couldn't read "${file.name}". Please make sure it's a valid Excel or CSV file.`)
    }
  }

  function updateMapping(fieldKey, header) {
    setMapping(m => ({ ...m, [fieldKey]: header }))
  }

  async function handleHospitalFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const results = await Promise.allSettled(files.map(parseSpreadsheetFile))
    const failed = []
    results.forEach((res, i) => {
      if (res.status === 'rejected') {
        failed.push(files[i].name)
        return
      }
      const { headers: hdrs, rows: json, fileName: name } = res.value
      if (!json.length) {
        failed.push(`${name} (no data rows)`)
        return
      }
      const guessedMapping = autoMapHeaders(hdrs, HOSPITAL_FIELD_DEFS)
      setHospitalFiles(hf => [
        ...hf,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, fileName: name, headers: hdrs, mapping: guessedMapping, rows: json }
      ])
    })
    if (failed.length) {
      await alertUser(`Couldn't load: ${failed.join(', ')}. Please check these files and try again.`)
    }
    e.target.value = ''
  }

  function updateHospitalMapping(fileId, fieldKey, header) {
    setHospitalFiles(hf => hf.map(f => (f.id === fileId ? { ...f, mapping: { ...f.mapping, [fieldKey]: header } } : f)))
  }

  function removeHospitalFile(fileId) {
    setHospitalFiles(hf => hf.filter(f => f.id !== fileId))
    setMatchResults(null)
  }

  function runMatching() {
    if (!cards.length || !hospitalFiles.length) return
    setIsMatching(true)
    setTimeout(() => {
      const hospitalRecords = []
      hospitalFiles.forEach(f => {
        f.rows.forEach(row => {
          const rawId = f.mapping.hosp_id ? row[f.mapping.hosp_id] : ''
          const rawName = f.mapping.hosp_name ? row[f.mapping.hosp_name] : ''
          const rawSex = f.mapping.hosp_sex ? row[f.mapping.hosp_sex] : ''
          const rawDob = f.mapping.hosp_dob ? row[f.mapping.hosp_dob] : ''
          hospitalRecords.push({
            sourceFile: f.fileName,
            rawId,
            normId: normalizeId(rawId),
            name: normalizeName(rawName),
            sex: normalizeSex(rawSex),
            dob: normalizeDob(rawDob),
            row
          })
        })
      })

      const pharmRecords = cards.map(c => {
        const rawId = mapping.rama_number ? c.row[mapping.rama_number] : ''
        const rawName = mapping.patient_name ? c.row[mapping.patient_name] : ''
        const rawSex = mapping.gender ? c.row[mapping.gender] : ''
        const rawDob = mapping.patient_age ? c.row[mapping.patient_age] : ''
        return {
          id: c.id,
          normId: normalizeId(rawId),
          name: normalizeName(rawName),
          sex: normalizeSex(rawSex),
          dob: normalizeDob(rawDob)
        }
      })

      const index = buildHospitalIndex(hospitalRecords)
      const results = matchRecords(pharmRecords, index)
      const byId = {}
      results.forEach(r => { byId[r.pharmacyId] = r })
      setMatchResults(byId)
      setIsMatching(false)
      setStage('match')
    }, 30)
  }

  function matchCategoryOf(cardId) {
    if (matchOverrides[cardId]) return matchOverrides[cardId]
    return matchResults?.[cardId]?.category || null
  }

  function updateCard(id, patch) {
    setCards(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)))
  }

  function toggleExpanded(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleClassification(id, key) {
    setCards(cs =>
      cs.map(c =>
        c.id === id ? { ...c, classifications: { ...c.classifications, [key]: !c.classifications[key] } } : c
      )
    )
  }

  // Thin, mapping-bound wrappers around the pure functions in cardHelpers.js —
  // kept as local functions so the render code below (largely unchanged)
  // doesn't need `mapping` threaded through every call site, while the actual
  // logic lives in a module that's independently unit-tested.
  const mappedValue = (card, key) => CH.mappedValue(card, key, mapping)
  const facilityOf = card => CH.facilityOf(card, mapping)
  const doctorOf = card => CH.doctorOf(card, mapping)
  const voucherOf = card => CH.voucherOf(card, mapping)
  const dateOf = card => CH.dateOf(card, mapping)
  const dispensingDateOf = card => CH.dispensingDateOf(card, mapping)
  const originalAmount = card => CH.originalAmount(card, mapping)
  const approvedAmount = card => CH.approvedAmount(card, mapping)
  const fraudBasisAmount = card => CH.fraudBasisAmount(card, mapping)
  const needsFraudReview = card => CH.needsFraudReview(card, mapping)

  function runCleaning() {
    const { cleanedCards, changes } = cleanCards(cards, mapping)
    setCards(cleanedCards)
    setCleaningReport(changes)
    setStage('clean')
  }

  function undoCleaning() {
    setCards(cs => revertCleaning(cs))
    setCleaningReport(null)
  }

  function sendToFraudReview(card, categoryLabel) {
    updateCard(card.id, {
      classifications: { ...card.classifications, fraud: true },
      deduction: fraudBasisAmount(card),
      comment: card.comment || `Flagged via Match Review — ${categoryLabel}. Full amount withheld (fraud/ghost patient).`
    })
  }

  function undoSendToFraudReview(card) {
    updateCard(card.id, {
      classifications: { ...card.classifications, fraud: false },
      deduction: 0
    })
  }

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
    if (classificationFilter !== 'all') list = list.filter(c => c.classifications?.[classificationFilter])
    if (dateFrom) {
      const from = new Date(dateFrom)
      list = list.filter(c => { const d = dateOf(c); return d && d >= from })
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      list = list.filter(c => { const d = dateOf(c); return d && d <= to })
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c => Object.values(c.row).some(v => String(v).toLowerCase().includes(q)))
    }
    if (sortBy !== 'none') {
      const dir = sortDir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        let av, bv
        if (sortBy === 'facility') { av = facilityOf(a); bv = facilityOf(b) }
        else if (sortBy === 'doctor') { av = doctorOf(a); bv = doctorOf(b) }
        else if (sortBy === 'voucher') { av = voucherOf(a); bv = voucherOf(b) }
        else if (sortBy === 'date') { av = dateOf(a)?.getTime() || 0; bv = dateOf(b)?.getTime() || 0 }
        else if (sortBy === 'amount') { av = originalAmount(a) || 0; bv = originalAmount(b) || 0 }
        if (typeof av === 'string') return av.localeCompare(bv) * dir
        return (av - bv) * dir
      })
    }
    // When viewing repeated records, always group same-patient vouchers together
    // (by name, then chronologically) regardless of the chosen sort, so multiple
    // vouchers for one person are easy to find and compare side by side.
    if (advFilter === 'repeated') {
      list = [...list].sort((a, b) => {
        const an = String(mappedValue(a, 'patient_name') || '').trim().toLowerCase()
        const bn = String(mappedValue(b, 'patient_name') || '').trim().toLowerCase()
        if (an !== bn) return an.localeCompare(bn)
        const ad = dateOf(a)?.getTime() || 0
        const bd = dateOf(b)?.getTime() || 0
        return ad - bd
      })
    }
    return list
  }, [cards, statusFilter, advFilter, classificationFilter, dateFrom, dateTo, sortBy, sortDir, search, repeatedIds, mapping])

  const filteredTotalAmount = useMemo(
    () => filteredCards.reduce((s, c) => s + (originalAmount(c) || 0), 0),
    [filteredCards, mapping]
  )

  const summary = useMemo(() => {
    const total = cards.length
    const verified = cards.filter(c => c.status === 'verified').length
    const pending = total - verified
    const fraudFlagged = cards.filter(c => c.classifications?.fraud).length
    const totalOriginal = cards.reduce((s, c) => s + (originalAmount(c) || 0), 0)
    const totalApproved = cards.reduce((s, c) => s + (approvedAmount(c) || 0), 0)
    const progressPct = total ? Math.round((verified / total) * 100) : 0
    return { total, verified, pending, fraudFlagged, totalOriginal, totalApproved, progressPct }
  }, [cards, mapping])

  const matchSummary = useMemo(() => {
    if (!matchResults) return null
    const counts = { clean: 0, review: 0, fraud_risk: 0, orphan: 0 }
    cards.forEach(c => {
      const cat = matchCategoryOf(c.id)
      if (cat && counts[cat] !== undefined) counts[cat] += 1
    })
    return counts
  }, [matchResults, matchOverrides, cards])

  const filteredMatchList = useMemo(() => {
    if (!matchResults) return []
    let list = cards.map(c => ({ card: c, result: matchResults[c.id] })).filter(x => x.result)
    if (matchCategoryFilter !== 'all') {
      list = list.filter(x => matchCategoryOf(x.card.id) === matchCategoryFilter)
    }
    if (matchSearch.trim()) {
      const q = matchSearch.trim().toLowerCase()
      list = list.filter(x =>
        Object.values(x.card.row).some(v => String(v).toLowerCase().includes(q)) ||
        String(x.result.matchedHospital?.name || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [matchResults, matchOverrides, matchCategoryFilter, matchSearch, cards])

  function setMatchOverride(cardId, category) {
    setMatchOverrides(o => ({ ...o, [cardId]: category }))
  }

  function exportMatchResults() {
    if (!matchResults) return
    const wb = buildMatchReportWorkbook({ cards, matchResults, matchNotes, categoryOf: matchCategoryOf })
    XLSX.writeFile(wb, `hospital_match_${fileName || 'export'}.xlsx`)
  }

  function exportResults() {
    const wb = buildVerifiedWorkbook({ cards, mapping })
    XLSX.writeFile(wb, `verified_${fileName || 'export'}.xlsx`)
  }

  async function generateFraudReport() {
    const fraudCards = cards.filter(c => c.classifications?.fraud)
    if (fraudCards.length === 0) {
      await alertUser('No vouchers are classified as fraud activity yet.')
      return
    }
    const incompletePreview = fraudCards.filter(needsFraudReview)
    if (incompletePreview.length > 0) {
      const proceed = await confirmUser(
        `${incompletePreview.length} fraud voucher(s) are missing prescription date and/or health facility. ` +
        `They will be excluded from the report until completed in the Fraud review tab. Continue anyway?`
      )
      if (!proceed) return
    }
    const { workbook, completeCount } = buildFraudReportWorkbook({ cards, headers, mapping })
    if (completeCount === 0) {
      await alertUser('No fraud vouchers have both a prescription date and a health facility yet — nothing to include in the report.')
      return
    }
    XLSX.writeFile(workbook, `fraud_report_${fileName || 'export'}.xlsx`)
  }

  async function generateCounterReport() {
    const { workbook, deductedCount } = buildCounterReportWorkbook({ cards, mapping, counterHeader })
    if (deductedCount === 0) {
      await alertUser('No vouchers currently have a deduction to include in the counter verification report.')
      return
    }
    XLSX.writeFile(workbook, `counter_verification_${fileName || 'export'}.xlsx`)
  }

  function reset() {
    clearState(STORAGE_KEY)
    setStage('upload')
    setFileName('')
    setHeaders([])
    setMapping({})
    setCards([])
    setCurrentIndex(0)
    setAutoDetected(0)
  }

  const currentCard = cards[currentIndex]

  function goTo(delta) {
    setCurrentIndex(i => Math.max(0, Math.min(cards.length - 1, i + delta)))
  }

  useEffect(() => {
    if (stage !== 'verify' || !currentCard) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowRight') goTo(1)
      else if (e.key === 'ArrowLeft') goTo(-1)
      else if (e.key.toLowerCase() === 'v') updateCard(currentCard.id, { status: 'verified' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, currentCard, cards.length])

  const showShell = stage !== 'upload' && stage !== 'landing' && cards.length > 0

  return (
    <div className={showShell ? 'lg:flex min-h-screen' : ''}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {showShell && (
        <Sidebar stage={stage} setStage={setStage} lastSaved={lastSaved} theme={theme} setTheme={setTheme} onReset={reset} />
      )}

      <div className="flex-1 min-w-0">
        {stage === 'landing' && (
          <div className="min-h-screen flex flex-col">
            <div className="flex justify-end px-4 sm:px-6 lg:px-8 pt-5">
              <button onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface-1 hover:bg-surface-2 shrink-0">
                {theme === 'light' ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
              <div className="max-w-xl w-full text-center py-16">
                <img src="/logo.png" alt="RSSB" className="w-24 h-24 mx-auto mb-6" />
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">RSSB Counter Verification System</h1>
                <p className="text-sm sm:text-base text-ink-muted mb-10">
                  Prepare, verify, and audit pharmacy voucher claims — map columns, review vouchers, flag fraud,
                  and generate Anti Fraud and Counter Verification reports.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10 text-left">
                  {[
                    ['Map columns', 'Auto-detect fields from any RSSB export format.'],
                    ['Verify & flag', 'Review each voucher and flag fraud or compliance issues.'],
                    ['Export reports', 'Generate Anti Fraud and Counter Verification Excel reports.']
                  ].map(([title, desc]) => (
                    <div key={title} className="rounded-card border border-border bg-surface-1 p-4">
                      <div className="text-sm font-medium mb-1">{title}</div>
                      <div className="text-xs text-ink-muted">{desc}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setStage('upload')}
                  className="bg-brand text-white text-sm font-medium rounded-lg px-6 py-2.5 hover:bg-brand-dark transition-colors"
                >
                  Get started
                </button>
              </div>
            </div>
          </div>
        )}

        {!showShell && stage === 'upload' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <header className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="RSSB" className="w-11 h-11 shrink-0" />
                <div>
                  <h1 className="text-xl font-medium tracking-tight">RSSB Counter Verification System</h1>
                  <p className="text-sm text-ink-muted mt-0.5">Data preparation and verification dashboard</p>
                </div>
              </div>
              <button onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface-1 hover:bg-surface-2 shrink-0">
                {theme === 'light' ? '☀️ Light' : '🌙 Dark'}
              </button>
            </header>
            <div className="mt-10 rounded-card border border-dashed border-border bg-surface-1 py-16 px-6 text-center">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} id="file-upload" className="sr-only" />
              <label htmlFor="file-upload" className="flex flex-col items-center gap-3 cursor-pointer">
                <span className="w-12 h-12 rounded-full bg-brand-light text-brand flex items-center justify-center text-2xl font-medium">+</span>
                <span className="text-sm font-medium">Upload Excel or CSV file</span>
                <span className="text-xs text-ink-muted">.xlsx, .xls or .csv</span>
              </label>
            </div>
          </div>
        )}

        {showShell && (
          <>
            <div className="lg:hidden flex items-center justify-between gap-2 border-b border-border bg-surface-1 px-4 py-3 sticky top-0 z-20">
              <span className="font-medium flex items-center gap-2 min-w-0">
                <img src="/logo.png" alt="RSSB" className="w-6 h-6 shrink-0" />
                <span className="truncate">RSSB Counter Verification</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))} className="text-xs border border-border rounded-lg px-2 py-1 bg-surface-2" aria-label="Toggle theme">
                  {theme === 'light' ? '☀️' : '🌙'}
                </button>
                <select value={stage} onChange={e => setStage(e.target.value)} className="text-sm border border-border rounded-lg px-2 py-1 bg-surface-2">
                  {TABS.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {storageWarning && (
              <div role="alert" aria-live="assertive" className="bg-danger-light text-danger-dark text-sm px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
                <span>
                  Your work couldn't be auto-saved on this device. Export your progress now so you don't lose
                  it — auto-save will keep failing until this is resolved (try freeing up device storage or
                  using a different browser).
                </span>
                <button onClick={() => setStorageWarning(false)} className="text-xs underline shrink-0">Dismiss</button>
              </div>
            )}

            <div className="sticky top-0 lg:top-0 z-10 bg-surface-0/95 backdrop-blur border-b border-border px-4 sm:px-6 lg:px-8 py-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {[
                  ['Total', summary.total, ''],
                  ['Verified', summary.verified, 'text-brand'],
                  ['Pending', summary.pending, 'text-warn'],
                  ['Fraud flagged', summary.fraudFlagged, 'text-danger'],
                  ['Original total', summary.totalOriginal.toLocaleString(), ''],
                  ['Approved total', summary.totalApproved.toLocaleString(), '']
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-lg border border-border bg-surface-1 px-3 py-1.5">
                    <div className="text-[11px] text-ink-muted">{label}</div>
                    <div className={`text-base font-medium ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <main id="main-content" tabIndex={-1} className="px-4 sm:px-6 lg:px-8 py-6">
              {stage === 'summary' && (
                <SummaryView
                  cards={cards}
                  headers={headers}
                  mapping={mapping}
                  fileName={fileName}
                  mappedValue={mappedValue}
                  originalAmount={originalAmount}
                  dateOf={dateOf}
                  onContinue={() => setStage('map')}
                />
              )}

              {stage === 'map' && (
                <div className="rounded-card border border-border bg-surface-1 p-5 sm:p-6 max-w-2xl">
                  <div className={`rounded-lg px-3.5 py-2.5 mb-4 text-sm flex items-center justify-between gap-3 ${autoDetected > 0 ? 'bg-brand-light text-brand-dark' : 'bg-warn-light text-warn-dark'}`}>
                    <span>
                      {autoDetected > 0
                        ? `Auto-detected ${autoDetected} of ${FIELD_DEFS.length} fields from "${fileName}".`
                        : `Couldn't auto-detect any fields from "${fileName}" — please map manually below.`}
                    </span>
                    <span className="text-xs opacity-80 shrink-0">{headers.length} columns found</span>
                  </div>
                  <p className="text-sm text-ink-muted mb-5">
                    Confirm or adjust the mapping below — any guess that looks wrong can be changed.
                  </p>
                  <div className="flex flex-col gap-4 mb-6">
                    {FIELD_DEFS.map(f => (
                      <div key={f.key} className="flex items-center justify-between gap-4">
                        <label htmlFor={`map-${f.key}`} className="text-sm min-w-[200px]">{f.label}</label>
                        <select
                          id={`map-${f.key}`}
                          value={mapping[f.key] || ''}
                          onChange={e => updateMapping(f.key, e.target.value)}
                          className="flex-1 max-w-xs border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2"
                        >
                          <option value="">— not mapped —</option>
                          {headers.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={runCleaning}
                      className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark transition-colors"
                    >
                      Clean &amp; normalize data →
                    </button>
                    <button
                      onClick={() => setStage('verify')}
                      className="text-sm text-ink-muted underline"
                    >
                      Skip cleaning, go straight to verification
                    </button>
                  </div>
                </div>
              )}

              {stage === 'clean' && (
                <div className="max-w-3xl">
                  <div className="rounded-card border border-border bg-surface-1 p-5 sm:p-6 mb-5">
                    <h2 className="text-base font-medium mb-1">Data cleaning &amp; normalization</h2>
                    <p className="text-sm text-ink-muted">
                      Every mapped column was run through a type-specific normalizer: dates to a single
                      <code className="mx-1 px-1 rounded bg-surface-2 text-xs">YYYY-MM-DD</code>
                      format (handling Excel serial dates, dd/mm/yyyy vs mm/dd/yyyy, and textual months),
                      amounts to plain numbers (stripping currency symbols and reconciling US vs EU thousands/decimal
                      separators), names to trimmed title case, sex to a single-letter code, and RAMA/affiliation
                      numbers to the same stripped format used for hospital matching. Nothing is deleted — the
                      original value for every cell that changed is kept and can be restored below.
                    </p>
                  </div>

                  {!cleaningReport && (
                    <p className="text-sm text-ink-muted">No cleaning has been run yet for this file.</p>
                  )}

                  {cleaningReport && (() => {
                    const summary = summarizeChanges(cleaningReport, FIELD_DEFS)
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-3 mb-5">
                          <div className="rounded-card border border-border bg-surface-1 px-3.5 py-2.5">
                            <div className="text-[11px] text-ink-muted">Values normalized</div>
                            <div className="text-lg font-medium">{summary.totalChanges}</div>
                          </div>
                          <div className={`rounded-card border px-3.5 py-2.5 ${summary.ambiguousCount > 0 ? 'border-warn bg-warn-light text-warn-dark' : 'border-border bg-surface-1'}`}>
                            <div className="text-[11px] opacity-80">Ambiguous dates (best guess)</div>
                            <div className="text-lg font-medium">{summary.ambiguousCount}</div>
                          </div>
                          <div className={`rounded-card border px-3.5 py-2.5 ${summary.unparsedCount > 0 ? 'border-danger bg-danger-light text-danger-dark' : 'border-border bg-surface-1'}`}>
                            <div className="text-[11px] opacity-80">Couldn't parse (left as-is)</div>
                            <div className="text-lg font-medium">{summary.unparsedCount}</div>
                          </div>
                        </div>

                        {summary.byField.length > 0 && (
                          <div className="rounded-card border border-border bg-surface-1 p-4 mb-5">
                            <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-3">By field</h3>
                            <div className="flex flex-col gap-2">
                              {summary.byField.map(f => (
                                <div key={f.field} className="flex items-center justify-between text-sm">
                                  <span>{f.label} <span className="text-ink-muted">({f.type})</span></span>
                                  <span className="text-ink-muted">
                                    {f.changed} normalized
                                    {f.ambiguous > 0 && <span className="text-warn-dark"> · {f.ambiguous} ambiguous</span>}
                                    {f.unparsed > 0 && <span className="text-danger-dark"> · {f.unparsed} unparsed</span>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {cleaningReport.length > 0 && (
                          <div className="rounded-card border border-border overflow-hidden mb-5">
                            <table className="w-full text-sm bg-surface-1">
                              <thead>
                                <tr className="text-xs text-ink-muted text-left">
                                  <th className="px-3 py-2 font-medium">Field</th>
                                  <th className="px-3 py-2 font-medium">Original</th>
                                  <th className="px-3 py-2 font-medium">Normalized</th>
                                  <th className="px-3 py-2 font-medium"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {cleaningReport.slice(0, 100).map((c, i) => (
                                  <tr key={i} className="border-t border-border">
                                    <td className="px-3 py-2">{FIELD_DEFS.find(f => f.key === c.field)?.label || c.field}</td>
                                    <td className="px-3 py-2 text-ink-muted">{String(c.original)}</td>
                                    <td className="px-3 py-2">{c.unparsed ? <span className="text-danger-dark">left as-is</span> : String(c.cleaned)}</td>
                                    <td className="px-3 py-2">
                                      {c.ambiguous && <span className="text-xs px-1.5 py-0.5 rounded bg-warn-light text-warn-dark">best guess</span>}
                                      {c.unparsed && <span className="text-xs px-1.5 py-0.5 rounded bg-danger-light text-danger-dark">unparsed</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {cleaningReport.length > 100 && (
                              <div className="text-xs text-ink-muted px-3 py-2 border-t border-border">
                                Showing the first 100 of {cleaningReport.length} changes.
                              </div>
                            )}
                          </div>
                        )}

                        {cleaningReport.length === 0 && (
                          <p className="text-sm text-ink-muted mb-5">Every mapped value was already in a clean, consistent format — nothing needed changing.</p>
                        )}
                      </>
                    )
                  })()}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStage('verify')}
                      className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark transition-colors"
                    >
                      Looks good, continue to verification
                    </button>
                    {cleaningReport && cleaningReport.length > 0 && (
                      <button onClick={undoCleaning} className="text-sm border border-border rounded-lg px-3.5 py-2 hover:bg-surface-2">
                        Revert to original values
                      </button>
                    )}
                  </div>
                </div>
              )}

              {stage === 'verify' && currentCard && (
                <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-6 lg:items-start">
                  <div className="max-w-xl mx-auto lg:mx-0 lg:max-w-none">
                    <div className="mb-5">
                      <div className="h-1.5 rounded-full bg-border overflow-hidden mb-2">
                        <div className="h-full bg-brand transition-all" style={{ width: `${summary.progressPct}%` }} />
                      </div>
                      <span className="text-xs text-ink-muted">
                        {currentIndex + 1} of {cards.length} · {summary.progressPct}% verified
                      </span>
                    </div>

                    <div className={`rounded-card border bg-surface-1 p-5 flex flex-col gap-4 border-l-4 ${
                      currentCard.status === 'verified' ? 'border-l-brand border-border' : 'border-l-border border-border'
                    }`}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-medium text-[15px]">
                          {mappedValue(currentCard, 'patient_name') || `Record ${currentCard.id + 1}`}
                        </span>
                        {repeatedIds.has(currentCard.id) && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-warn-light text-warn-dark">Repeated patient</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 py-3 border-y border-border">
                        {headers.slice(0, 8).map(h => (
                          <div key={h} className="overflow-hidden">
                            <div className="text-[11px] text-ink-muted">{h}</div>
                            <div className="text-sm truncate">{String(currentCard.row[h])}</div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-col gap-2 py-2 border-b border-border">
                        <span className="text-xs text-ink-muted uppercase tracking-wide">Deduction classification (select all that apply)</span>
                        <div className="flex flex-wrap gap-2">
                          {CLASSIFICATION_DEFS.map(cl => (
                            <label
                              key={cl.key}
                              className={`text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                                currentCard.classifications?.[cl.key] ? 'bg-brand text-white border-brand' : 'border-border bg-surface-2'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={!!currentCard.classifications?.[cl.key]}
                                onChange={() => toggleClassification(currentCard.id, cl.key)}
                                className="sr-only"
                              />
                              {cl.label}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5 py-3 border-b border-border">
                        <div className="flex items-center justify-between gap-3">
                          <label htmlFor="prescription-date" className="text-sm text-ink-muted shrink-0">Prescription date</label>
                          <input
                            id="prescription-date"
                            type="date"
                            value={currentCard.prescriptionDate}
                            onChange={e => updateCard(currentCard.id, { prescriptionDate: e.target.value })}
                            className={`flex-1 border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2 text-right ${
                              needsFraudReview(currentCard) && !currentCard.prescriptionDate ? 'border-danger' : 'border-border'
                            }`}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <label htmlFor="facility-override" className="text-sm text-ink-muted shrink-0">Health facility</label>
                          <input
                            id="facility-override"
                            type="text"
                            placeholder={mappedValue(currentCard, 'facility_name') || 'Enter facility name'}
                            value={currentCard.facilityOverride}
                            onChange={e => updateCard(currentCard.id, { facilityOverride: e.target.value })}
                            className={`flex-1 border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2 text-right ${
                              needsFraudReview(currentCard) && !facilityOf(currentCard) ? 'border-danger' : 'border-border'
                            }`}
                          />
                        </div>
                      </div>

                      {currentCard.classifications?.fraud && (
                        <div className={`rounded-lg border p-3 flex flex-col gap-2 ${needsFraudReview(currentCard) ? 'border-danger bg-danger-light' : 'border-brand bg-brand-light'}`}>
                          <span className={`text-xs font-medium ${needsFraudReview(currentCard) ? 'text-danger-dark' : 'text-brand-dark'}`}>Fraud review</span>
                          {needsFraudReview(currentCard) ? (
                            <p className="text-xs text-danger-dark">Prescription date and health facility are mandatory before this voucher appears in the fraud report.</p>
                          ) : (
                            <p className="text-xs text-brand-dark">Review complete — ready for the fraud report.</p>
                          )}
                        </div>
                      )}

                      {mapping.amount && (
                        <div className="flex flex-col gap-1.5 text-sm">
                          <div className="flex justify-between"><span className="text-ink-muted">Original amount</span><span>{originalAmount(currentCard)?.toLocaleString()}</span></div>
                          <div className="flex justify-between items-center">
                            <span className="text-ink-muted">Deduct</span>
                            <input
                              type="number"
                              min="0"
                              value={currentCard.deduction || ''}
                              placeholder="0"
                              onChange={e => updateCard(currentCard.id, { deduction: e.target.value })}
                              className="w-24 border border-border rounded-lg px-2.5 py-1 text-sm bg-surface-2 text-right"
                            />
                          </div>
                          <div className="flex justify-between font-medium pt-1 border-t border-border"><span>Approved amount</span><span>{approvedAmount(currentCard)?.toLocaleString()}</span></div>
                        </div>
                      )}

                      <textarea
                        placeholder="Add comment..."
                        value={currentCard.comment}
                        onChange={e => updateCard(currentCard.id, { comment: e.target.value })}
                        className="w-full min-h-[64px] border border-border rounded-lg px-3 py-2 text-sm bg-surface-2 resize-y"
                      />

                      <button
                        onClick={() => updateCard(currentCard.id, { status: currentCard.status === 'verified' ? 'pending' : 'verified' })}
                        className={`text-sm rounded-lg px-3 py-2 border transition-colors ${
                          currentCard.status === 'verified' ? 'bg-brand text-white border-brand' : 'border-border bg-surface-2 hover:bg-surface-0'
                        }`}
                      >
                        {currentCard.status === 'verified' ? 'Verified ✓ (click to undo)' : 'Mark as verified'}
                      </button>
                    </div>

                    <div className="flex justify-between mt-4">
                      <button onClick={() => goTo(-1)} disabled={currentIndex === 0} className="text-sm border border-border rounded-lg px-5 py-2 bg-surface-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2">Previous</button>
                      <button onClick={() => goTo(1)} disabled={currentIndex === cards.length - 1} className="text-sm border border-border rounded-lg px-5 py-2 bg-surface-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2">Next</button>
                    </div>
                  </div>

                  <aside className="hidden lg:flex flex-col gap-4 sticky top-20">
                    <div className="rounded-card border border-border bg-surface-1 p-4">
                      <h2 className="text-xs font-medium text-ink-muted mb-2 uppercase tracking-wide">Keyboard shortcuts</h2>
                      <ul className="text-sm flex flex-col gap-1.5">
                        <li className="flex justify-between"><span className="text-ink-muted">Next / Previous</span><span>→ / ←</span></li>
                        <li className="flex justify-between"><span className="text-ink-muted">Verify</span><span>V</span></li>
                      </ul>
                    </div>
                    <div className="rounded-card border border-border bg-surface-1 p-4 max-h-[55vh] overflow-y-auto">
                      <h2 className="text-xs font-medium text-ink-muted mb-2 uppercase tracking-wide">All vouchers</h2>
                      <ul className="flex flex-col gap-1">
                        {cards.map((c, i) => (
                          <li key={c.id}>
                            <button
                              onClick={() => setCurrentIndex(i)}
                              className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg text-left transition-colors ${i === currentIndex ? 'bg-brand text-white' : 'hover:bg-surface-2'}`}
                            >
                              <span className="truncate">{i + 1}. {mappedValue(c, 'patient_name') || `Record ${c.id + 1}`}</span>
                              <span className={`ml-2 w-1.5 h-1.5 rounded-full shrink-0 ${c.status === 'verified' ? 'bg-brand' : 'bg-warn'} ${i === currentIndex ? 'ring-1 ring-white' : ''}`} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </aside>
                </div>
              )}

              {stage === 'dashboard' && (
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <input
                      placeholder="Search all fields..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      aria-label="Search vouchers"
                      className="border border-border rounded-lg px-3 py-1.5 text-sm bg-surface-1 min-w-[200px] flex-1 sm:flex-none"
                    />
                    <div className="flex gap-1" role="group" aria-label="Filter by status">
                      {['all', 'pending', 'verified'].map(f => (
                        <button key={f} onClick={() => setStatusFilter(f)} aria-pressed={statusFilter === f}
                          className={`text-xs capitalize rounded-lg px-2.5 py-1.5 border transition-colors ${statusFilter === f ? 'bg-ink text-surface-1 border-ink' : 'border-border bg-surface-1 hover:bg-surface-2'}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1" role="group" aria-label="Advanced filters">
                      {[['none', 'No filter'], ['repeated', 'Repeated records'], ['over40000', 'Over 40,000']].map(([key, label]) => (
                        <button key={key} onClick={() => setAdvFilter(key)} aria-pressed={advFilter === key}
                          className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${advFilter === key ? 'bg-ink text-surface-1 border-ink' : 'border-border bg-surface-1 hover:bg-surface-2'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <select value={classificationFilter} onChange={e => setClassificationFilter(e.target.value)} aria-label="Filter by deduction category"
                      className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1">
                      <option value="all">All deduction categories</option>
                      {CLASSIFICATION_DEFS.map(c => (<option key={c.key} value={c.key}>{c.label}</option>))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} aria-label="Date from" className="text-xs border border-border rounded-lg px-2 py-1.5 bg-surface-1" />
                      <span className="text-xs text-ink-muted">to</span>
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} aria-label="Date to" className="text-xs border border-border rounded-lg px-2 py-1.5 bg-surface-1" />
                    </div>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} disabled={advFilter === 'repeated'} aria-label="Sort by"
                      title={advFilter === 'repeated' ? 'Repeated records are always grouped by patient name' : undefined}
                      className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1 disabled:opacity-40">
                      <option value="none">{advFilter === 'repeated' ? 'Sort: grouped by name' : 'Sort: none'}</option>
                      <option value="facility">Sort by facility</option>
                      <option value="doctor">Sort by doctor</option>
                      <option value="voucher">Sort by voucher no</option>
                      <option value="date">Sort by date</option>
                      <option value="amount">Sort by claim amount</option>
                    </select>
                    <button onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} disabled={sortBy === 'none' || advFilter === 'repeated'} aria-label="Toggle sort direction"
                      className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1 hover:bg-surface-2 disabled:opacity-40">
                      {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                    </button>
                    <button onClick={exportResults} className="ml-auto text-sm rounded-lg px-3.5 py-1.5 bg-brand text-white hover:bg-brand-dark transition-colors">Export</button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
                    <span className="rounded-lg bg-brand-light text-brand-dark px-3 py-1.5 font-medium">
                      {filteredCards.length} voucher{filteredCards.length === 1 ? '' : 's'} in this view
                    </span>
                    <span className="text-ink-muted">Total amount: <span className="text-ink font-medium">{filteredTotalAmount.toLocaleString()}</span></span>
                  </div>

                  <div className="overflow-x-auto rounded-card border border-border">
                    <table className="w-full text-sm bg-surface-1">
                      <thead>
                        <tr className="text-xs text-ink-muted text-left">
                          <th className="px-3 py-2 font-medium">#</th>
                          <th className="px-3 py-2 font-medium">Voucher No</th>
                          <th className="px-3 py-2 font-medium">Patient</th>
                          <th className="px-3 py-2 font-medium">Dispensed</th>
                          <th className="px-3 py-2 font-medium">Amount</th>
                          <th className="px-3 py-2 font-medium">Approved</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Categories</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCards.map(c => {
                          const isOpen = expandedIds.has(c.id)
                          return (
                            <Fragment key={c.id}>
                              <tr
                                onClick={() => toggleExpanded(c.id)}
                                aria-expanded={isOpen}
                                className="border-t border-border cursor-pointer hover:bg-surface-2/60 transition-colors"
                              >
                                <td className="px-3 py-2">{c.id + 1}</td>
                                <td className="px-3 py-2">{voucherOf(c) || '—'}</td>
                                <td className="px-3 py-2">{mappedValue(c, 'patient_name') || '—'}</td>
                                <td className="px-3 py-2">{dispensingDateOf(c)?.toLocaleDateString() ?? '—'}</td>
                                <td className="px-3 py-2">{originalAmount(c)?.toLocaleString() ?? '—'}</td>
                                <td className="px-3 py-2">{approvedAmount(c)?.toLocaleString() ?? '—'}</td>
                                <td className="px-3 py-2">
                                  <span className={`text-xs capitalize px-2 py-0.5 rounded-full ${c.status === 'verified' ? 'bg-brand-light text-brand-dark' : 'bg-warn-light text-warn-dark'}`}>{c.status}</span>
                                </td>
                                <td className="px-3 py-2 space-x-1">
                                  {CLASSIFICATION_DEFS.filter(cl => c.classifications?.[cl.key]).map(cl => (
                                    <span key={cl.key} className={`text-xs px-2 py-0.5 rounded-full ${cl.key === 'fraud' ? 'bg-danger-light text-danger-dark' : 'bg-surface-2 border border-border'}`}>{cl.label}</span>
                                  ))}
                                  {needsFraudReview(c) && <span className="text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger-dark">Needs review</span>}
                                  {repeatedIds.has(c.id) && <span className="text-xs px-2 py-0.5 rounded-full bg-warn-light text-warn-dark">Repeat</span>}
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    onClick={e => { e.stopPropagation(); toggleExpanded(c.id) }}
                                    aria-expanded={isOpen}
                                    aria-label={isOpen ? 'Collapse voucher details' : 'Expand voucher details'}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-surface-2 text-ink-muted"
                                  >
                                    <span className={`inline-block transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                                  </button>
                                </td>
                              </tr>
                              {isOpen && (
                                <tr className="border-t border-border bg-surface-0">
                                  <td colSpan={9} className="px-4 py-4">
                                    <VoucherRowDetail
                                      card={c}
                                      headers={headers}
                                      mapping={mapping}
                                      updateCard={updateCard}
                                      toggleClassification={toggleClassification}
                                      needsFraudReview={needsFraudReview}
                                      facilityOf={facilityOf}
                                      mappedValue={mappedValue}
                                      originalAmount={originalAmount}
                                      approvedAmount={approvedAmount}
                                      onOpenFullView={() => { setCurrentIndex(cards.findIndex(x => x.id === c.id)); setStage('verify') }}
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {stage === 'hospital' && (
                <div>
                  <div className="rounded-card border border-border bg-surface-1 p-5 sm:p-6 mb-5">
                    <h2 className="text-base font-medium mb-1">Upload hospital files</h2>
                    <p className="text-sm text-ink-muted mb-4">
                      Upload one or more hospital beneficiary files (e.g. CHUK, La Médicale). Each file is
                      auto-mapped and normalized independently, then matched against the pharmacy vouchers
                      already loaded ({cards.length} vouchers from "{fileName}").
                    </p>
                    <input type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleHospitalFiles} id="hosp-upload" className="sr-only" />
                    <label htmlFor="hosp-upload" className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium border border-dashed border-border rounded-lg px-4 py-2.5 bg-surface-2 hover:bg-surface-0">
                      <span className="w-6 h-6 rounded-full bg-brand-light text-brand flex items-center justify-center text-sm">+</span>
                      Add hospital file(s)
                    </label>
                  </div>

                  {hospitalFiles.length === 0 && (
                    <p className="text-sm text-ink-muted">No hospital files uploaded yet.</p>
                  )}

                  {hospitalFiles.map(f => (
                    <div key={f.id} className="rounded-card border border-border bg-surface-1 p-5 mb-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <div className="text-sm font-medium">{f.fileName}</div>
                          <div className="text-xs text-ink-muted">{f.rows.length} records · {f.headers.length} columns</div>
                        </div>
                        <button onClick={() => removeHospitalFile(f.id)} className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-danger-light hover:text-danger-dark hover:border-danger">
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
                              className="flex-1 max-w-xs border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2"
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
                    <div className="rounded-card border border-border bg-surface-1 p-5">
                      <h2 className="text-sm font-medium mb-2">Run matching</h2>
                      <p className="text-xs text-ink-muted mb-4">
                        Normalizes beneficiary IDs (strips "Nr" prefixes, leading zeros, whitespace), names
                        (order-invariant, punctuation-stripped), and sex codes, then scores every pharmacy
                        voucher against all hospital records using weighted evidence — exact ID, near-ID typo,
                        rarity-weighted name similarity, sex agreement, and DOB agreement — with sex/DOB
                        contradictions forcing a fraud-risk flag regardless of score. Results land in four
                        buckets: Clean Match, Needs Review, Fraud Risk, and Orphan.
                      </p>
                      <button
                        onClick={runMatching}
                        disabled={isMatching}
                        className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark transition-colors disabled:opacity-50"
                      >
                        {isMatching ? 'Matching…' : `Run matching against ${cards.length} vouchers`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {stage === 'match' && (
                <div>
                  {!matchResults && (
                    <div className="rounded-card border border-border bg-surface-1 p-6 text-sm text-ink-muted">
                      No match results yet. Go to <button onClick={() => setStage('hospital')} className="text-brand underline">Hospital Data</button> to upload hospital files and run matching.
                    </div>
                  )}

                  {matchResults && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                        {[
                          ['clean', 'bg-brand-light text-brand-dark'],
                          ['review', 'bg-warn-light text-warn-dark'],
                          ['fraud_risk', 'bg-danger-light text-danger-dark'],
                          ['orphan', 'bg-surface-2 text-ink-muted']
                        ].map(([cat, cls]) => (
                          <button
                            key={cat}
                            onClick={() => setMatchCategoryFilter(matchCategoryFilter === cat ? 'all' : cat)}
                            className={`rounded-card p-3.5 text-left border transition-colors ${cls} ${matchCategoryFilter === cat ? 'border-ink' : 'border-transparent'}`}
                          >
                            <div className="text-xs font-medium opacity-80">{CATEGORY_LABELS[cat]}</div>
                            <div className="text-xl font-semibold mt-1">{matchSummary?.[cat] ?? 0}</div>
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <input
                          placeholder="Search matched records..."
                          value={matchSearch}
                          onChange={e => setMatchSearch(e.target.value)}
                          className="border border-border rounded-lg px-3 py-1.5 text-sm bg-surface-1 min-w-[200px] flex-1 sm:flex-none"
                        />
                        <select value={matchCategoryFilter} onChange={e => setMatchCategoryFilter(e.target.value)} className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1">
                          <option value="all">All categories</option>
                          {MATCH_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                        </select>
                        <button
                          onClick={async () => {
                            const targets = cards.filter(c => ['fraud_risk', 'orphan'].includes(matchCategoryOf(c.id)) && !c.classifications?.fraud)
                            if (!targets.length) { await alertUser('No unflagged Fraud Risk or Orphan records to send.'); return }
                            const proceed = await confirmUser(`Send ${targets.length} Fraud Risk / Orphan voucher(s) to Fraud Review? Their full RSSB-payable amount will be withheld (approved amount set to 0).`)
                            if (!proceed) return
                            targets.forEach(c => sendToFraudReview(c, CATEGORY_LABELS[matchCategoryOf(c.id)]))
                          }}
                          className="ml-auto text-sm rounded-lg px-3.5 py-1.5 bg-danger text-white hover:bg-danger-dark transition-colors"
                        >
                          Send Fraud Risk + Orphan to Fraud Review
                        </button>
                        <button onClick={exportMatchResults} className="text-sm rounded-lg px-3.5 py-1.5 bg-brand text-white hover:bg-brand-dark transition-colors">
                          Export match report
                        </button>
                      </div>

                      <p className="text-xs text-ink-muted mb-4 max-w-3xl">
                        Reminder: a normal deduction is calculated against 85% of total cost, or the mapped
                        insurance co-payment amount if present. For vouchers sent here as Fraud Risk or Orphan,
                        that entire basis is withheld — the approved/RSSB-payable amount becomes 0. You can
                        still edit the deduction manually in the Fraud review tab.
                      </p>

                      <div className="overflow-x-auto rounded-card border border-border">
                        <table className="w-full text-sm bg-surface-1">
                          <thead>
                            <tr className="text-xs text-ink-muted text-left">
                              <th className="px-3 py-2 font-medium">Pharmacy patient</th>
                              <th className="px-3 py-2 font-medium">Pharmacy ID</th>
                              <th className="px-3 py-2 font-medium">Matched hospital record</th>
                              <th className="px-3 py-2 font-medium">Score</th>
                              <th className="px-3 py-2 font-medium">Evidence</th>
                              <th className="px-3 py-2 font-medium">Category</th>
                              <th className="px-3 py-2 font-medium">Reviewer note</th>
                              <th className="px-3 py-2 font-medium">Fraud review</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredMatchList.map(({ card, result }) => {
                              const cat = matchCategoryOf(card.id)
                              const catCls = {
                                clean: 'bg-brand-light text-brand-dark',
                                review: 'bg-warn-light text-warn-dark',
                                fraud_risk: 'bg-danger-light text-danger-dark',
                                orphan: 'bg-surface-2 text-ink-muted'
                              }[cat]
                              return (
                                <tr key={card.id} className="border-t border-border align-top">
                                  <td className="px-3 py-2">{mappedValue(card, 'patient_name') || `Record ${card.id + 1}`}</td>
                                  <td className="px-3 py-2">{mappedValue(card, 'rama_number') || '—'}</td>
                                  <td className="px-3 py-2">
                                    {result.matchedHospital ? (
                                      <div>
                                        <div>{result.matchedHospital.name}</div>
                                        <div className="text-xs text-ink-muted">{result.matchedHospital.fileName} · ID {result.matchedHospital.id || '—'}</div>
                                      </div>
                                    ) : '—'}
                                  </td>
                                  <td className="px-3 py-2">{result.score}</td>
                                  <td className="px-3 py-2 text-xs text-ink-muted max-w-[220px]">{result.reasons.join('; ')}</td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={cat}
                                      onChange={e => setMatchOverride(card.id, e.target.value)}
                                      className={`text-xs rounded-lg px-2 py-1 border-0 ${catCls}`}
                                    >
                                      {MATCH_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      value={matchNotes[card.id] || ''}
                                      onChange={e => setMatchNotes(n => ({ ...n, [card.id]: e.target.value }))}
                                      placeholder="Analyst note..."
                                      className="min-w-[160px] border border-border rounded-lg px-2 py-1 text-xs bg-surface-2"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    {card.classifications?.fraud ? (
                                      <div className="flex flex-col gap-1 items-start">
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger-dark">Sent ✓ (deducted {(parseFloat(card.deduction) || 0).toLocaleString()})</span>
                                        <button onClick={() => undoSendToFraudReview(card)} className="text-xs text-ink-muted underline">Undo</button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => sendToFraudReview(card, CATEGORY_LABELS[cat])}
                                        className="text-xs border border-danger text-danger-dark rounded-lg px-2 py-1 hover:bg-danger-light"
                                      >
                                        Send to Fraud Review
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                            {filteredMatchList.length === 0 && (
                              <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-muted text-sm">No records match this filter.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {stage === 'network' && (
                <div>
                  <p className="text-sm text-ink-muted mb-4 max-w-3xl">
                    Explore relationships between doctors, patients, and facilities built from every voucher.
                    Node size scales with voucher volume; edge thickness scales with how often that pair recurs
                    together. If a hospital match has been run, relationships where over 40% of shared vouchers
                    are Fraud Risk or Orphan are outlined in red — useful for spotting doctor-patient pairs or
                    facility patterns worth a closer look. Drag to pan, scroll to zoom, click any node for detail.
                  </p>
                  <Suspense fallback={<div className="rounded-card border border-border bg-surface-1 p-8 text-sm text-ink-muted text-center">Loading network analysis…</div>}>
                    <NetworkGraph cards={cards} mapping={mapping} matchResults={matchResults} matchOverrides={matchOverrides} />
                  </Suspense>
                </div>
              )}

              {stage === 'fraud' && (
                <FraudReviewView
                  cards={cards}
                  updateCard={updateCard}
                  needsFraudReview={needsFraudReview}
                  voucherOf={voucherOf}
                  mappedValue={mappedValue}
                  originalAmount={originalAmount}
                  facilityOf={facilityOf}
                  generateFraudReport={generateFraudReport}
                />
              )}

              {stage === 'counter' && (
                <CounterVerificationView
                  cards={cards}
                  updateCard={updateCard}
                  counterHeader={counterHeader}
                  setCounterHeader={setCounterHeader}
                  voucherOf={voucherOf}
                  mappedValue={mappedValue}
                  originalAmount={originalAmount}
                  generateCounterReport={generateCounterReport}
                />
              )}
            </main>
          </>
        )}
      </div>
    </div>
  )
}
