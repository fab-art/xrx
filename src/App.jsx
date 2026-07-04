import { useState, useMemo, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx-js-style'

const STORAGE_KEY = 'verify-app-state-v1'

const FIELD_DEFS = [
  { key: 'voucher_no', label: 'Voucher / paper code', guesses: ['papercode', 'voucher', 'claimno', 'code'] },
  { key: 'patient_name', label: 'Patient name', guesses: ['patient', 'name', 'beneficiary'] },
  { key: 'amount', label: 'Amount', guesses: ['amount', 'total', 'cost', 'claim', 'value', 'price'] },
  { key: 'visit_date', label: 'Visit / prescription date', guesses: ['prescriptiondate', 'date', 'visit'] },
  { key: 'doctor_name', label: 'Doctor / prescriber', guesses: ['doctor', 'practitioner', 'prescriber'] },
  { key: 'facility_name', label: 'Facility', guesses: ['facility', 'pharmacy', 'hospital'] },
  { key: 'rama_number', label: 'RAMA / insurance number', guesses: ['rama', 'rssb', 'insurance'] }
]

const CLASSIFICATIONS = [
  { key: 'unclassified', label: 'Not classified' },
  { key: 'pharma_compliance', label: 'Pharmacological compliance' },
  { key: 'rssb_compliance', label: 'RSSB rules compliance' },
  { key: 'fraud', label: 'Fraud activity' }
]

function toDateValue(v) {
  if (!v) return null
  if (v instanceof Date) return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function normalizeKey(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findRowValue(card, candidates) {
  const keys = Object.keys(card.row || {})
  for (const k of keys) {
    const nk = normalizeKey(k)
    if (candidates.some(c => nk.includes(c))) return card.row[k]
  }
  return undefined
}

// Mirrors the exact column layout of the Neza Anti Fraud Report source file
const ANTI_FRAUD_COLUMNS = [
  { header: '#', width: 5 },
  { header: 'Paper Code', width: 21.57 },
  { header: 'Prescription Date ', width: 19 },
  { header: 'Dispensing Date', width: 17.43 },
  { header: 'Patient Name', width: 16.86 },
  { header: 'RAMA Number', width: 14.57 },
  { header: 'Is Newborn', width: 14.29 },
  { header: 'Gender', width: 7.57 },
  { header: 'Patient Type', width: 21 },
  { header: 'Practitioner Name', width: 33.43 },
  { header: 'Practitioner Type', width: 10.43 },
  { header: 'Health Facility', width: 16.14 },
  { header: 'Total Cost', width: 25.29 },
  { header: 'Insurance  Co-payment', width: 20.71 },
  { header: 'Medicine Cost', width: 25.29 },
  { header: 'Amount deducted', width: 18.29 },
  { header: 'Observation', width: 50 }
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
  const [classificationFilter, setClassificationFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState('none') // none | facility | doctor | voucher | date | amount
  const [sortDir, setSortDir] = useState('asc')
  const [counterHeader, setCounterHeader] = useState(
    initial?.counterHeader || { code: '', pharmacyName: '', period: '', tin: '' }
  )
  const [lastSaved, setLastSaved] = useState(null)

  useEffect(() => {
    saveState({ stage, fileName, headers, mapping, cards, currentIndex, counterHeader })
    setLastSaved(new Date())
  }, [stage, fileName, headers, mapping, cards, currentIndex, counterHeader])

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
          facilityOverride: '',
          classification: 'unclassified',
          explanation: ''
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

  function facilityOf(card) {
    const override = (card.facilityOverride || '').trim()
    if (override) return override
    return mapping.facility_name ? String(card.row[mapping.facility_name] || '').trim() : ''
  }

  function doctorOf(card) {
    return mapping.doctor_name ? String(card.row[mapping.doctor_name] || '').trim() : ''
  }

  function voucherOf(card) {
    return mapping.voucher_no ? String(card.row[mapping.voucher_no] || '').trim() : ''
  }

  function dateOf(card) {
    return mapping.visit_date ? toDateValue(card.row[mapping.visit_date]) : null
  }

  function needsFraudReview(card) {
    return card.classification === 'fraud' && (!card.prescriptionDate || !facilityOf(card))
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
    if (classificationFilter !== 'all') list = list.filter(c => (c.classification || 'unclassified') === classificationFilter)
    if (dateFrom) {
      const from = new Date(dateFrom)
      list = list.filter(c => {
        const d = dateOf(c)
        return d && d >= from
      })
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      list = list.filter(c => {
        const d = dateOf(c)
        return d && d <= to
      })
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        Object.values(c.row).some(v => String(v).toLowerCase().includes(q))
      )
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
    return list
  }, [cards, statusFilter, advFilter, classificationFilter, dateFrom, dateTo, sortBy, sortDir, search, repeatedIds, mapping])

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
      deduction_classification: CLASSIFICATIONS.find(cl => cl.key === (c.classification || 'unclassified'))?.label,
      deduction: c.deduction || 0,
      approved_amount: approvedAmount(c)
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Verified')
    XLSX.writeFile(wb, `verified_${fileName || 'export'}.xlsx`)
  }

  function generateFraudReport() {
    const fraudCards = cards.filter(c => c.classification === 'fraud')
    if (fraudCards.length === 0) {
      alert('No vouchers are classified as fraud activity yet.')
      return
    }
    const incomplete = fraudCards.filter(needsFraudReview)
    if (incomplete.length > 0) {
      const proceed = confirm(
        `${incomplete.length} fraud voucher(s) are missing prescription date and/or health facility. ` +
        `They will be excluded from the report until completed in the Verify tab. Continue anyway?`
      )
      if (!proceed) return
    }
    const complete = fraudCards.filter(c => !needsFraudReview(c))

    const byFacility = {}
    complete.forEach(c => {
      const facility = facilityOf(c) || 'Unknown facility'
      if (!byFacility[facility]) byFacility[facility] = []
      byFacility[facility].push(c)
    })

    const boldCambria = { font: { name: 'Cambria', sz: 11, bold: true } }
    const timesRegular = { font: { name: 'Times New Roman', sz: 12 } }
    const timesHighlighted = { font: { name: 'Times New Roman', sz: 12 }, fill: { fgColor: { rgb: 'FFFFFF00' }, patternType: 'solid' } }
    const timesBold = { font: { name: 'Times New Roman', sz: 12, bold: true } }
    const facilityLabel = { font: { name: 'Times New Roman', sz: 12, bold: false } }

    const aoa = []
    const styleRows = [] // parallel array: 'facility' | 'header' | 'data' | 'total' | 'blank'
    let seq = 0
    const facilitySummary = []

    Object.keys(byFacility).sort().forEach(facility => {
      const group = byFacility[facility]
      aoa.push(['', facility])
      styleRows.push('facility')
      aoa.push(ANTI_FRAUD_COLUMNS.map(c => c.header))
      styleRows.push('header')

      let facilityTotal = 0
      group.forEach(c => {
        seq += 1
        const deducted = parseFloat(c.deduction) || 0
        facilityTotal += deducted
        const rowValues = [
          seq,
          findRowValue(c, ['papercode', 'voucher', 'code']) ?? voucherOf(c),
          c.prescriptionDate || findRowValue(c, ['prescriptiondate']) || '',
          findRowValue(c, ['dispensingdate', 'dispatchdate']) ?? '',
          mapping.patient_name ? c.row[mapping.patient_name] : (findRowValue(c, ['patientname', 'beneficiary']) ?? ''),
          mapping.rama_number ? c.row[mapping.rama_number] : (findRowValue(c, ['ramanumber']) ?? ''),
          findRowValue(c, ['isnewborn', 'newborn']) ?? '',
          findRowValue(c, ['gender', 'sex']) ?? '',
          findRowValue(c, ['patienttype']) ?? '',
          doctorOf(c) || findRowValue(c, ['practitionername']) || '',
          findRowValue(c, ['practitionertype']) ?? '',
          facility,
          findRowValue(c, ['totalcost']) ?? originalAmount(c) ?? '',
          findRowValue(c, ['insuranceco', 'copayment']) ?? '',
          findRowValue(c, ['medicinecost']) ?? '',
          deducted,
          c.comment || findRowValue(c, ['observation']) || 'Not Found'
        ]
        aoa.push(rowValues)
        styleRows.push('data')
      })

      const totalRow = new Array(ANTI_FRAUD_COLUMNS.length).fill('')
      totalRow[1] = 'TOTAL'
      totalRow[15] = facilityTotal
      aoa.push(totalRow)
      styleRows.push('total')

      aoa.push([])
      styleRows.push('blank')

      facilitySummary.push({ 'Health Facility': facility, 'Fraud Vouchers': group.length, 'Total Amount Deducted': facilityTotal })
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = ANTI_FRAUD_COLUMNS.map(c => ({ wch: c.width }))

    aoa.forEach((row, r) => {
      const kind = styleRows[r]
      row.forEach((_, ci) => {
        const addr = XLSX.utils.encode_cell({ r, c: ci })
        if (!ws[addr]) return
        if (kind === 'facility') ws[addr].s = facilityLabel
        else if (kind === 'header') ws[addr].s = boldCambria
        else if (kind === 'data') ws[addr].s = timesHighlighted
        else if (kind === 'total') ws[addr].s = timesBold
      })
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Anti Fraud Report')
    const summaryWs = XLSX.utils.json_to_sheet(facilitySummary)
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Facility Summary')
    XLSX.writeFile(wb, `fraud_report_${fileName || 'export'}.xlsx`)
  }

  function generateCounterReport() {
    const deducted = cards.filter(c => (parseFloat(c.deduction) || 0) > 0)
    if (deducted.length === 0) {
      alert('No vouchers currently have a deduction to include in the counter verification report.')
      return
    }

    const titleStyle = { font: { name: 'Arial', sz: 10, bold: true } }
    const centerTitleStyle = { font: { name: 'Arial', sz: 10, bold: true }, alignment: { horizontal: 'left' } }
    const tableHeaderStyle = { font: { name: 'Calibri', sz: 12, bold: true }, alignment: { horizontal: 'center' } }
    const dataStyle = { font: { name: 'Arial', sz: 11 }, alignment: { horizontal: 'left' } }

    const aoa = [
      [counterHeader.code ? `CODE/PHARMACY: ${counterHeader.code}` : 'CODE/PHARMACY:'],
      [counterHeader.pharmacyName || ''],
      ['', '', counterHeader.period ? `PERIOD: ${counterHeader.period}` : 'PERIOD:'],
      [counterHeader.tin ? `TIN: ${counterHeader.tin}` : 'TIN:'],
      [],
      ['', '', 'COUNTER VERIFICATION REPORT'],
      [],
      ['NO', 'N° BEN.', 'Difference', 'Explanation of deduction']
    ]
    const styleRows = ['title', 'title', 'title', 'title', 'blank', 'title', 'blank', 'header']

    deducted.forEach((c, i) => {
      aoa.push([
        i + 1,
        findRowValue(c, ['papercode', 'voucher', 'code']) ?? voucherOf(c) ?? (mapping.rama_number ? c.row[mapping.rama_number] : ''),
        -(parseFloat(c.deduction) || 0),
        c.explanation || c.comment || ''
      ])
      styleRows.push('data')
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 16 }, { wch: 21.88 }, { wch: 15.13 }, { wch: 25 }, { wch: 32.38 }]

    aoa.forEach((row, r) => {
      const kind = styleRows[r]
      row.forEach((_, ci) => {
        const addr = XLSX.utils.encode_cell({ r, c: ci })
        if (!ws[addr]) return
        if (kind === 'title') ws[addr].s = ci === 2 ? centerTitleStyle : titleStyle
        else if (kind === 'header') ws[addr].s = tableHeaderStyle
        else if (kind === 'data') ws[addr].s = dataStyle
      })
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Counter verification report')
    XLSX.writeFile(wb, `counter_verification_${fileName || 'export'}.xlsx`)
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <header className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-xl font-medium tracking-tight">Verify</h1>
          <p className="text-sm text-ink-muted mt-1">Data preparation and verification dashboard</p>
        </div>
        {stage !== 'upload' && (
          <div className="flex items-center gap-3">
            {lastSaved && (
              <span className="hidden sm:inline text-xs text-ink-muted">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={reset}
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface-1 hover:bg-surface-2 transition-colors"
            >
              New file
            </button>
          </div>
        )}
      </header>

      {stage !== 'upload' && (
        <nav className="flex gap-1 border-b border-border mb-6 mt-4 overflow-x-auto" aria-label="Workflow steps">
          {[
            ['map', '1. Map columns'],
            ['verify', '2. Verify'],
            ['dashboard', '3. Dashboard'],
            ['counter', '4. Counter verification']
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStage(key)}
              aria-current={stage === key ? 'page' : undefined}
              className={`text-sm px-1 pb-3 mr-5 border-b-2 whitespace-nowrap transition-colors ${
                stage === key
                  ? 'border-brand text-ink font-medium'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {stage === 'upload' && (
        <div className="mt-10 rounded-card border border-dashed border-border bg-surface-1 py-16 px-6 text-center">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} id="file-upload" className="sr-only" />
          <label htmlFor="file-upload" className="flex flex-col items-center gap-3 cursor-pointer">
            <span className="w-12 h-12 rounded-full bg-brand-light text-brand flex items-center justify-center text-2xl font-medium">
              +
            </span>
            <span className="text-sm font-medium">Upload Excel or CSV file</span>
            <span className="text-xs text-ink-muted">.xlsx, .xls or .csv</span>
          </label>
        </div>
      )}

      {stage === 'map' && (
        <div className="rounded-card border border-border bg-surface-1 p-5 sm:p-6 max-w-2xl">
          <p className="text-sm text-ink-muted mb-5">
            Map your file's columns to the fields below. Guesses are pre-filled — adjust any that look wrong.
          </p>
          <div className="flex flex-col gap-4 mb-6">
            {FIELD_DEFS.map(f => (
              <div key={f.key} className="flex items-center justify-between gap-4">
                <label htmlFor={`map-${f.key}`} className="text-sm min-w-[180px]">{f.label}</label>
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
          <button
            onClick={() => setStage('verify')}
            className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark transition-colors"
          >
            Continue to verification
          </button>
        </div>
      )}

      {stage === 'verify' && currentCard && (
        <div className="max-w-xl mx-auto">
          <div className="mb-5">
            <div className="h-1.5 rounded-full bg-border overflow-hidden mb-2">
              <div
                className="h-full bg-brand transition-all"
                style={{ width: `${summary.progressPct}%` }}
              />
            </div>
            <span className="text-xs text-ink-muted">
              {currentIndex + 1} of {cards.length} · {summary.progressPct}% reviewed
            </span>
          </div>

          <div
            className={`rounded-card border bg-surface-1 p-5 flex flex-col gap-4 border-l-4 ${
              currentCard.status === 'verified'
                ? 'border-l-brand border-border'
                : currentCard.status === 'rejected'
                ? 'border-l-danger border-border'
                : 'border-l-border border-border'
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-medium text-[15px]">
                {mapping.patient_name ? currentCard.row[mapping.patient_name] : `Record ${currentCard.id + 1}`}
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

            <div className="flex items-center justify-between gap-3 py-1">
              <label htmlFor="classification" className="text-sm text-ink-muted shrink-0">Deduction classification</label>
              <select
                id="classification"
                value={currentCard.classification || 'unclassified'}
                onChange={e => updateCard(currentCard.id, { classification: e.target.value })}
                className="flex-1 max-w-[220px] border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2"
              >
                {CLASSIFICATIONS.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
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
                  placeholder={mapping.facility_name ? String(currentCard.row[mapping.facility_name] || '') : 'Enter facility name'}
                  value={currentCard.facilityOverride}
                  onChange={e => updateCard(currentCard.id, { facilityOverride: e.target.value })}
                  className={`flex-1 border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2 text-right ${
                    needsFraudReview(currentCard) && !facilityOf(currentCard) ? 'border-danger' : 'border-border'
                  }`}
                />
              </div>
            </div>

            {currentCard.classification === 'fraud' && (
              <div className={`rounded-lg border p-3 flex flex-col gap-2 ${needsFraudReview(currentCard) ? 'border-danger bg-danger-light' : 'border-brand bg-brand-light'}`}>
                <span className={`text-xs font-medium ${needsFraudReview(currentCard) ? 'text-danger-dark' : 'text-brand-dark'}`}>
                  Fraud review
                </span>
                {needsFraudReview(currentCard) ? (
                  <p className="text-xs text-danger-dark">
                    Prescription date and health facility are mandatory for fraud-flagged vouchers before this record can be included in the fraud report.
                  </p>
                ) : (
                  <p className="text-xs text-brand-dark">
                    Review complete — this voucher is ready to appear in the fraud report.
                  </p>
                )}
              </div>
            )}

            {mapping.amount && (
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Original amount</span>
                  <span>{originalAmount(currentCard)?.toLocaleString()}</span>
                </div>
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
                <div className="flex justify-between font-medium pt-1 border-t border-border">
                  <span>Approved amount</span>
                  <span>{approvedAmount(currentCard)?.toLocaleString()}</span>
                </div>
              </div>
            )}

            <textarea
              placeholder="Add comment..."
              value={currentCard.comment}
              onChange={e => updateCard(currentCard.id, { comment: e.target.value })}
              className="w-full min-h-[64px] border border-border rounded-lg px-3 py-2 text-sm bg-surface-2 resize-y"
            />

            <div className="flex gap-2">
              <button
                onClick={() => updateCard(currentCard.id, { status: 'verified' })}
                className={`flex-1 text-sm rounded-lg px-3 py-2 border transition-colors ${
                  currentCard.status === 'verified'
                    ? 'bg-brand text-white border-brand'
                    : 'border-border bg-surface-2 hover:bg-surface-0'
                }`}
              >
                Verify
              </button>
              <button
                onClick={() => updateCard(currentCard.id, { status: 'rejected' })}
                className={`flex-1 text-sm rounded-lg px-3 py-2 border transition-colors ${
                  currentCard.status === 'rejected'
                    ? 'bg-danger text-white border-danger'
                    : 'border-border bg-surface-2 hover:bg-surface-0'
                }`}
              >
                Reject
              </button>
              {currentCard.status !== 'pending' && (
                <button
                  onClick={() => updateCard(currentCard.id, { status: 'pending' })}
                  className="text-sm rounded-lg px-3 py-2 border border-border bg-transparent hover:bg-surface-0"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between mt-4">
            <button
              onClick={() => goTo(-1)}
              disabled={currentIndex === 0}
              className="text-sm border border-border rounded-lg px-5 py-2 bg-surface-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
            >
              Previous
            </button>
            <button
              onClick={() => goTo(1)}
              disabled={currentIndex === cards.length - 1}
              className="text-sm border border-border rounded-lg px-5 py-2 bg-surface-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-2"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {stage === 'dashboard' && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            {[
              ['Total vouchers', summary.total, ''],
              ['Verified', summary.verified, 'text-brand'],
              ['Rejected', summary.rejected, 'text-danger'],
              ['Pending', summary.pending, 'text-warn'],
              ['Original total', summary.totalOriginal.toLocaleString(), ''],
              ['Approved total', summary.totalApproved.toLocaleString(), '']
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-card border border-border bg-surface-1 p-3.5">
                <div className="text-xs text-ink-muted">{label}</div>
                <div className={`text-xl font-medium mt-1 ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          <div className="h-1.5 rounded-full bg-border overflow-hidden mb-1.5">
            <div className="h-full bg-brand transition-all" style={{ width: `${summary.progressPct}%` }} />
          </div>
          <p className="text-xs text-ink-muted mb-5">{summary.progressPct}% of vouchers reviewed</p>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              placeholder="Search all fields..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search vouchers"
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-surface-1 min-w-[200px] flex-1 sm:flex-none"
            />
            <div className="flex gap-1" role="group" aria-label="Filter by status">
              {['all', 'pending', 'verified', 'rejected'].map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  aria-pressed={statusFilter === f}
                  className={`text-xs capitalize rounded-lg px-2.5 py-1.5 border transition-colors ${
                    statusFilter === f ? 'bg-ink text-surface-1 border-ink' : 'border-border bg-surface-1 hover:bg-surface-2'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-1" role="group" aria-label="Advanced filters">
              {[
                ['none', 'No filter'],
                ['repeated', 'Repeated records'],
                ['over40000', 'Over 40,000']
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAdvFilter(key)}
                  aria-pressed={advFilter === key}
                  className={`text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${
                    advFilter === key ? 'bg-ink text-surface-1 border-ink' : 'border-border bg-surface-1 hover:bg-surface-2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={classificationFilter}
              onChange={e => setClassificationFilter(e.target.value)}
              aria-label="Filter by deduction category"
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1"
            >
              <option value="all">All deduction categories</option>
              {CLASSIFICATIONS.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                aria-label="Date from"
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-surface-1"
              />
              <span className="text-xs text-ink-muted">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                aria-label="Date to"
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-surface-1"
              />
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              aria-label="Sort by"
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1"
            >
              <option value="none">Sort: none</option>
              <option value="facility">Sort by facility</option>
              <option value="doctor">Sort by doctor</option>
              <option value="voucher">Sort by voucher no</option>
              <option value="date">Sort by date</option>
              <option value="amount">Sort by claim amount</option>
            </select>
            <button
              onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
              disabled={sortBy === 'none'}
              aria-label="Toggle sort direction"
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1 hover:bg-surface-2 disabled:opacity-40"
            >
              {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
            <button
              onClick={generateFraudReport}
              className="text-sm rounded-lg px-3.5 py-1.5 bg-danger text-white hover:bg-danger-dark transition-colors"
            >
              Fraud report
            </button>
            <button
              onClick={exportResults}
              className="ml-auto text-sm rounded-lg px-3.5 py-1.5 bg-brand text-white hover:bg-brand-dark transition-colors"
            >
              Export
            </button>
          </div>

          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm bg-surface-1">
              <thead>
                <tr className="text-xs text-ink-muted text-left">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Voucher No</th>
                  <th className="px-3 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Approved</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map(c => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2">{c.id + 1}</td>
                    <td className="px-3 py-2">{voucherOf(c) || '—'}</td>
                    <td className="px-3 py-2">{mapping.patient_name ? c.row[mapping.patient_name] : '—'}</td>
                    <td className="px-3 py-2">{originalAmount(c)?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2">{approvedAmount(c)?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs capitalize px-2 py-0.5 rounded-full ${
                          c.status === 'verified'
                            ? 'bg-brand-light text-brand-dark'
                            : c.status === 'rejected'
                            ? 'bg-danger-light text-danger-dark'
                            : 'bg-warn-light text-warn-dark'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 space-x-1">
                      {repeatedIds.has(c.id) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-warn-light text-warn-dark">Repeat</span>
                      )}
                      {(originalAmount(c) || 0) > 40000 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger-dark">High value</span>
                      )}
                      {c.classification && c.classification !== 'unclassified' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 border border-border">
                          {CLASSIFICATIONS.find(cl => cl.key === c.classification)?.label}
                        </span>
                      )}
                      {needsFraudReview(c) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger-dark">Needs review</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => {
                          setCurrentIndex(cards.findIndex(x => x.id === c.id))
                          setStage('verify')
                        }}
                        className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-surface-2"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stage === 'counter' && (
        <div>
          <p className="text-sm text-ink-muted mb-4">
            Review every voucher that currently has a deduction, adjust the amount or explanation as a final check,
            then generate the counter verification report.
          </p>

          <div className="rounded-card border border-border bg-surface-1 p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-muted block mb-1">Code / Pharmacy</label>
              <input
                value={counterHeader.code}
                onChange={e => setCounterHeader(h => ({ ...h, code: e.target.value }))}
                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2"
                placeholder="e.g. 20331037"
              />
            </div>
            <div>
              <label className="text-xs text-ink-muted block mb-1">Pharmacy / facility name</label>
              <input
                value={counterHeader.pharmacyName}
                onChange={e => setCounterHeader(h => ({ ...h, pharmacyName: e.target.value }))}
                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2"
                placeholder="e.g. NYARUGENGE - PHARMACIE NEZA"
              />
            </div>
            <div>
              <label className="text-xs text-ink-muted block mb-1">Period</label>
              <input
                value={counterHeader.period}
                onChange={e => setCounterHeader(h => ({ ...h, period: e.target.value }))}
                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2"
                placeholder="e.g. DECEMBER 2024"
              />
            </div>
            <div>
              <label className="text-xs text-ink-muted block mb-1">TIN</label>
              <input
                value={counterHeader.tin}
                onChange={e => setCounterHeader(h => ({ ...h, tin: e.target.value }))}
                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2"
                placeholder="e.g. 102808467"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-card border border-border mb-4">
            <table className="w-full text-sm bg-surface-1">
              <thead>
                <tr className="text-xs text-ink-muted text-left">
                  <th className="px-3 py-2 font-medium">NO</th>
                  <th className="px-3 py-2 font-medium">N° BEN. / Voucher</th>
                  <th className="px-3 py-2 font-medium">Original amount</th>
                  <th className="px-3 py-2 font-medium">Deduction (adjustable)</th>
                  <th className="px-3 py-2 font-medium">Difference</th>
                  <th className="px-3 py-2 font-medium">Explanation of deduction</th>
                </tr>
              </thead>
              <tbody>
                {cards.filter(c => (parseFloat(c.deduction) || 0) > 0).map((c, i) => (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">{voucherOf(c) || (mapping.rama_number ? c.row[mapping.rama_number] : '—')}</td>
                    <td className="px-3 py-2">{originalAmount(c)?.toLocaleString() ?? '—'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={c.deduction || ''}
                        onChange={e => updateCard(c.id, { deduction: e.target.value })}
                        className="w-24 border border-border rounded-lg px-2 py-1 text-sm bg-surface-2 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-danger">-{(parseFloat(c.deduction) || 0).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={c.explanation}
                        placeholder={c.comment || 'e.g. Different reception signature'}
                        onChange={e => updateCard(c.id, { explanation: e.target.value })}
                        className="w-full min-w-[220px] border border-border rounded-lg px-2 py-1 text-sm bg-surface-2"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={generateCounterReport}
            className="text-sm rounded-lg px-4 py-2 bg-brand text-white hover:bg-brand-dark transition-colors"
          >
            Generate counter verification report
          </button>
        </div>
      )}
    </div>
  )
}
