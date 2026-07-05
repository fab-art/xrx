import { useState, useMemo, useEffect, useRef } from 'react'
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
import NetworkGraph from './NetworkGraph'

const STORAGE_KEY = 'verify-app-state-v3'
const THEME_KEY = 'verify-app-theme'
const APP_NAME = 'RSSB Counter Verification System'

const FIELD_DEFS = [
  { key: 'voucher_no', label: 'Paper Code / Voucher No', guesses: ['papercode', 'voucheridentification', 'voucher', 'claimno', 'code', 'n0', 'no'] },
  { key: 'visit_date', label: 'Prescription Date', guesses: ['prescriptiondate', 'date', 'visit'] },
  { key: 'dispensing_date', label: 'Dispensing Date', guesses: ['dispensingdate', 'dispatchdate'] },
  { key: 'patient_name', label: 'Patient Name', guesses: ['beneficiarysnames', 'beneficiaryname', 'patient', 'name', 'beneficiary'] },
  { key: 'patient_type', label: 'Patient Type', guesses: ['patienttype', 'affiliatesaffectation', 'affectation'] },
  { key: 'gender', label: 'Gender', guesses: ['gender', 'sex', 'beneficiaryssex'] },
  { key: 'is_newborn', label: 'Is Newborn', guesses: ['isnewborn', 'newborn'] },
  { key: 'patient_age', label: 'Beneficiary Age / DOB', guesses: ['beneficiarysage', 'age', 'dob'] },
  { key: 'rama_number', label: 'RAMA / Affiliation Number', guesses: ['ramanumber', 'rama', 'affiliationnumber', 'beneficiaryaffiliationnumber', 'affiliation'] },
  { key: 'affiliate_name', label: "Affiliate's Name", guesses: ['affiliatesnames', 'affiliatename'] },
  { key: 'doctor_name', label: 'Practitioner Name', guesses: ['practitionername', 'doctor', 'practitioner', 'prescriber', 'prescribersnames'] },
  { key: 'practitioner_type', label: 'Practitioner Type', guesses: ['practitionertype', 'om'] },
  { key: 'facility_name', label: 'Health Facility', guesses: ['healthfacility', 'facility', 'pharmacy', 'hospital'] },
  { key: 'amount', label: 'Total Cost', guesses: ['totalcost100', 'totalcost', 'amount', 'total', 'cost', 'claim', 'value', 'price'] },
  { key: 'patient_copayment', label: 'Patient Co-payment', guesses: ['patientcopayment', 'patientco'] },
  { key: 'insurance_copayment', label: 'Insurance / RSSB Co-payment', guesses: ['rssbcost85', 'rssbcost', 'insuranceco', 'insurancecopayment'] },
  { key: 'difference', label: 'Difference', guesses: ['difference'] },
  { key: 'observation', label: 'Observation', guesses: ['observation', 'comment', 'remark'] }
]

const CLASSIFICATION_DEFS = [
  { key: 'pharma', label: 'Pharmacological compliance' },
  { key: 'rssb', label: 'RSSB rules compliance' },
  { key: 'fraud', label: 'Fraud activity' }
]

const HOSPITAL_FIELD_DEFS = [
  { key: 'hosp_id', label: 'Beneficiary Affiliation Number', guesses: ['affiliationnumber', 'beneficiarysaffiliationnumber', 'ramanumber', 'rama', 'nationalid'] },
  { key: 'hosp_name', label: "Beneficiary's Name", guesses: ['beneficiarysnames', 'beneficiaryname', 'patientname', 'name'] },
  { key: 'hosp_sex', label: 'Sex / Gender', guesses: ['beneficiaryssex', 'sex', 'gender'] },
  { key: 'hosp_dob', label: 'Age / DOB', guesses: ['beneficiarysage', 'dob', 'age', 'dateofbirth'] },
  { key: 'hosp_date', label: 'Visit / Voucher Date', guesses: ['date', 'voucherdate', 'visitdate'] }
]

const MATCH_CATEGORIES = ['clean', 'review', 'fraud_risk', 'orphan']

const TABS = [
  ['map', 'Map columns'],
  ['verify', 'Verify'],
  ['dashboard', 'Dashboard'],
  ['hospital', 'Hospital Data'],
  ['match', 'Match Review'],
  ['network', 'Network Analysis'],
  ['fraud', 'Fraud review'],
  ['counter', 'Counter verification']
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

function emptyClassifications() {
  return { pharma: false, rssb: false, fraud: false }
}

export default function App() {
  const persisted = useRef(loadState())
  const initial = persisted.current

  const [stage, setStage] = useState(initial?.stage || 'landing')
  const [fileName, setFileName] = useState(initial?.fileName || '')
  const [headers, setHeaders] = useState(initial?.headers || [])
  const [mapping, setMapping] = useState(initial?.mapping || {})
  const [cards, setCards] = useState(initial?.cards || [])
  const [currentIndex, setCurrentIndex] = useState(initial?.currentIndex || 0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [advFilter, setAdvFilter] = useState('none')
  const [classificationFilter, setClassificationFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState('none')
  const [sortDir, setSortDir] = useState('asc')
  const [counterHeader, setCounterHeader] = useState(
    initial?.counterHeader || {
      code: '', pharmacyName: '', period: '', tin: '',
      preparedBy: '', preparedByPosition: '',
      verifiedBy: '', verifiedByPosition: '',
      approvedBy: '', approvedByPosition: ''
    }
  )
  const [hospitalFiles, setHospitalFiles] = useState(initial?.hospitalFiles || [])
  const [matchResults, setMatchResults] = useState(initial?.matchResults || null)
  const [matchOverrides, setMatchOverrides] = useState(initial?.matchOverrides || {})
  const [matchNotes, setMatchNotes] = useState(initial?.matchNotes || {})
  const [matchCategoryFilter, setMatchCategoryFilter] = useState('all')
  const [matchSearch, setMatchSearch] = useState('')
  const [isMatching, setIsMatching] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [autoDetected, setAutoDetected] = useState(initial?.autoDetected || 0)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'light' } catch { return 'light' }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  useEffect(() => {
    saveState({
      stage, fileName, headers, mapping, cards, currentIndex, counterHeader, autoDetected,
      hospitalFiles, matchResults, matchOverrides, matchNotes
    })
    setLastSaved(new Date())
  }, [stage, fileName, headers, mapping, cards, currentIndex, counterHeader, autoDetected,
      hospitalFiles, matchResults, matchOverrides, matchNotes])

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      const json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
      const hdrs = json.length ? Object.keys(json[0]) : []
      const guessedMapping = {}
      const usedHeaders = new Set()
      FIELD_DEFS.forEach(f => {
        let best = ''
        let bestScore = 0
        hdrs.forEach(h => {
          if (usedHeaders.has(h)) return
          const nh = normalizeKey(h)
          f.guesses.forEach(g => {
            if (nh.includes(g) && g.length > bestScore) {
              bestScore = g.length
              best = h
            }
          })
        })
        guessedMapping[f.key] = best
        if (best) usedHeaders.add(best)
      })
      setAutoDetected(Object.values(guessedMapping).filter(Boolean).length)
      setHeaders(hdrs)
      setMapping(guessedMapping)
      setCards(
        json.map((row, i) => ({
          id: i,
          row,
          status: 'pending', // pending | verified
          comment: '',
          deduction: 0,
          prescriptionDate: '',
          facilityOverride: '',
          explanation: '',
          classifications: emptyClassifications()
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

  function handleHospitalFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = evt => {
        const wb = XLSX.read(evt.target.result, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        const json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
        const hdrs = json.length ? Object.keys(json[0]) : []
        const guessedMapping = {}
        const usedHeaders = new Set()
        HOSPITAL_FIELD_DEFS.forEach(f => {
          let best = ''
          let bestScore = 0
          hdrs.forEach(h => {
            if (usedHeaders.has(h)) return
            const nh = normalizeKey(h)
            f.guesses.forEach(g => {
              if (nh.includes(g) && g.length > bestScore) {
                bestScore = g.length
                best = h
              }
            })
          })
          guessedMapping[f.key] = best
          if (best) usedHeaders.add(best)
        })
        setHospitalFiles(hf => [
          ...hf,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, fileName: file.name, headers: hdrs, mapping: guessedMapping, rows: json }
        ])
      }
      reader.readAsArrayBuffer(file)
    })
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

  function toggleClassification(id, key) {
    setCards(cs =>
      cs.map(c =>
        c.id === id ? { ...c, classifications: { ...c.classifications, [key]: !c.classifications[key] } } : c
      )
    )
  }

  function mappedValue(card, key) {
    const header = mapping[key]
    return header ? card.row[header] : ''
  }

  function facilityOf(card) {
    const override = (card.facilityOverride || '').trim()
    if (override) return override
    return String(mappedValue(card, 'facility_name') || '').trim()
  }

  function doctorOf(card) {
    return String(mappedValue(card, 'doctor_name') || '').trim()
  }

  function voucherOf(card) {
    return String(mappedValue(card, 'voucher_no') || '').trim()
  }

  function dateOf(card) {
    return toDateValue(mappedValue(card, 'visit_date'))
  }

  function originalAmount(card) {
    const v = parseFloat(mappedValue(card, 'amount'))
    return isNaN(v) ? null : v
  }

  function approvedAmount(card) {
    const orig = originalAmount(card)
    if (orig === null) return null
    return Math.max(0, orig - (parseFloat(card.deduction) || 0))
  }

  // Deduction basis for confirmed-fraud / ghost-patient vouchers: the RSSB-payable
  // portion is either the mapped insurance co-payment amount, or — if that field
  // isn't mapped — 85% of the total cost. For a normal deduction only part of this
  // basis might be withheld; for fraud-suspected vouchers the FULL basis is withheld,
  // driving the approved amount to zero.
  function fraudBasisAmount(card) {
    const coPay = parseFloat(mappedValue(card, 'insurance_copayment'))
    if (!isNaN(coPay) && coPay > 0) return Math.round(coPay * 100) / 100
    const orig = originalAmount(card)
    if (orig === null) return 0
    return Math.round(orig * 0.85 * 100) / 100
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

  function needsFraudReview(card) {
    return card.classifications?.fraud && (!card.prescriptionDate || !facilityOf(card))
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
    const wb = XLSX.utils.book_new()
    const headerStyle = { font: { name: 'Calibri', sz: 11, bold: true } }

    MATCH_CATEGORIES.forEach(cat => {
      const rows = cards
        .filter(c => matchCategoryOf(c.id) === cat)
        .map(c => {
          const r = matchResults[c.id]
          return {
            ...c.row,
            match_category: CATEGORY_LABELS[cat],
            match_score: r.score,
            match_reasons: r.reasons.join('; '),
            matched_hospital_file: r.matchedHospital?.fileName || '',
            matched_hospital_name: r.matchedHospital?.name || '',
            matched_hospital_id: r.matchedHospital?.id || '',
            reviewer_note: matchNotes[c.id] || ''
          }
        })
      const sheetName = CATEGORY_LABELS[cat].slice(0, 31)
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: 'No records in this category' }])
      if (ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref'])
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r: 0, c })
          if (ws[addr]) ws[addr].s = headerStyle
        }
      }
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    })

    const summaryRows = MATCH_CATEGORIES.map(cat => ({
      Category: CATEGORY_LABELS[cat],
      Count: cards.filter(c => matchCategoryOf(c.id) === cat).length
    }))
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    XLSX.writeFile(wb, `hospital_match_${fileName || 'export'}.xlsx`)
  }

  function exportResults() {
    const exportRows = cards.map(c => ({
      ...c.row,
      verification_status: c.status,
      pharma_compliance: c.classifications?.pharma ? 'Yes' : 'No',
      rssb_compliance: c.classifications?.rssb ? 'Yes' : 'No',
      fraud_activity: c.classifications?.fraud ? 'Yes' : 'No',
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

  function draftSheetRows() {
    return cards.map(c => ({
      ...c.row,
      status: c.status,
      pharma_compliance: c.classifications?.pharma ? 'Yes' : 'No',
      rssb_compliance: c.classifications?.rssb ? 'Yes' : 'No',
      fraud_activity: c.classifications?.fraud ? 'Yes' : 'No',
      prescription_date: c.prescriptionDate,
      facility_override: c.facilityOverride,
      deduction: c.deduction || 0,
      original_amount: originalAmount(c),
      approved_amount: approvedAmount(c),
      comment: c.comment,
      explanation: c.explanation
    }))
  }

  function generateFraudReport() {
    const fraudCards = cards.filter(c => c.classifications?.fraud)
    if (fraudCards.length === 0) {
      alert('No vouchers are classified as fraud activity yet.')
      return
    }
    const incomplete = fraudCards.filter(needsFraudReview)
    if (incomplete.length > 0) {
      const proceed = confirm(
        `${incomplete.length} fraud voucher(s) are missing prescription date and/or health facility. ` +
        `They will be excluded from the report until completed in the Fraud review tab. Continue anyway?`
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
    const timesHighlighted = { font: { name: 'Times New Roman', sz: 12 }, fill: { fgColor: { rgb: 'FFFFFF00' }, patternType: 'solid' } }
    const timesBold = { font: { name: 'Times New Roman', sz: 12, bold: true } }
    const facilityLabel = { font: { name: 'Times New Roman', sz: 12, bold: false } }

    // Flexible column set: mirrors whatever columns actually exist in the uploaded file,
    // plus the deduction/observation columns this app adds during review.
    const sourceColumns = headers.length ? headers : (cards[0] ? Object.keys(cards[0].row) : [])
    const dynamicColumns = ['#', 'Prescription Date (Verified)', ...sourceColumns, 'Amount Deducted', 'Observation']
    const deductedColIdx = dynamicColumns.length - 2
    const observationColIdx = dynamicColumns.length - 1

    const aoa = []
    const styleRows = []
    let seq = 0
    const facilitySummary = []

    Object.keys(byFacility).sort().forEach(facility => {
      const group = byFacility[facility]
      aoa.push(['', facility])
      styleRows.push('facility')
      aoa.push(dynamicColumns)
      styleRows.push('header')

      let facilityTotal = 0
      group.forEach(c => {
        seq += 1
        const deducted = parseFloat(c.deduction) || 0
        facilityTotal += deducted
        const verifiedDate = c.prescriptionDate || mappedValue(c, 'visit_date') || ''
        const sourceValues = sourceColumns.map(h => c.row[h] ?? '')
        aoa.push([seq, verifiedDate, ...sourceValues, deducted, c.comment || findRowValue(c, ['observation']) || 'Not Found'])
        styleRows.push('data')
      })

      const totalRow = new Array(dynamicColumns.length).fill('')
      totalRow[2] = 'TOTAL'
      totalRow[deductedColIdx] = facilityTotal
      aoa.push(totalRow)
      styleRows.push('total')
      aoa.push([])
      styleRows.push('blank')

      facilitySummary.push({ 'Health Facility': facility, 'Fraud Vouchers': group.length, 'Total Amount Deducted': facilityTotal })
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = dynamicColumns.map((h, i) => ({
      wch: i === 0 ? 5 : i === observationColIdx ? 40 : Math.min(Math.max(String(h).length + 4, 12), 30)
    }))
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
    const draftWs = XLSX.utils.json_to_sheet(draftSheetRows())
    XLSX.utils.book_append_sheet(wb, draftWs, 'All Vouchers Draft')
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
    const totalStyle = { font: { name: 'Arial', sz: 11, bold: true } }
    const footerLabelStyle = { font: { name: 'Arial', sz: 10, bold: true } }

    const aoa = [
      [counterHeader.code ? `CODE/PHARMACY: ${counterHeader.code}` : 'CODE/PHARMACY:'],
      [counterHeader.pharmacyName || ''],
      ['', '', counterHeader.period ? `PERIOD: ${counterHeader.period}` : 'PERIOD:'],
      [counterHeader.tin ? `TIN: ${counterHeader.tin}` : 'TIN:'],
      [],
      ['', '', 'COUNTER VERIFICATION REPORT'],
      [],
      ['NO', 'N° BEN.', 'RAMA Number', 'Difference', 'Explanation of deduction']
    ]
    const styleRows = ['title', 'title', 'title', 'title', 'blank', 'title', 'blank', 'header']

    let totalDiff = 0
    deducted.forEach((c, i) => {
      const diff = -(parseFloat(c.deduction) || 0)
      totalDiff += diff
      aoa.push([
        i + 1,
        voucherOf(c) || findRowValue(c, ['papercode', 'voucher', 'code']) || '',
        mappedValue(c, 'rama_number') || findRowValue(c, ['ramanumber']) || '',
        diff,
        c.explanation || c.comment || ''
      ])
      styleRows.push('data')
    })

    aoa.push(['Total', '', '', totalDiff])
    styleRows.push('total')
    aoa.push([])
    styleRows.push('blank')
    aoa.push(['Prepared by:', '', 'Verified by', '', 'Approved By'])
    styleRows.push('footer')
    aoa.push([`Position: ${counterHeader.preparedByPosition || ''}`, '', `Position: ${counterHeader.verifiedByPosition || ''}`, '', `Position: ${counterHeader.approvedByPosition || ''}`])
    styleRows.push('footer')
    aoa.push(['Date:', '', 'Date:', '', 'Date:'])
    styleRows.push('footer')
    aoa.push(['Signature:', '', 'Signature:', '', 'Signature:'])
    styleRows.push('footer')
    aoa.push([`Names: ${counterHeader.preparedBy || ''}`, '', `Names: ${counterHeader.verifiedBy || ''}`, '', `Names: ${counterHeader.approvedBy || ''}`])
    styleRows.push('footer')

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 16 }, { wch: 21.88 }, { wch: 16 }, { wch: 15.13 }, { wch: 32.38 }]
    aoa.forEach((row, r) => {
      const kind = styleRows[r]
      row.forEach((_, ci) => {
        const addr = XLSX.utils.encode_cell({ r, c: ci })
        if (!ws[addr]) return
        if (kind === 'title') ws[addr].s = ci === 2 ? centerTitleStyle : titleStyle
        else if (kind === 'header') ws[addr].s = tableHeaderStyle
        else if (kind === 'data') ws[addr].s = dataStyle
        else if (kind === 'total') ws[addr].s = totalStyle
        else if (kind === 'footer') ws[addr].s = footerLabelStyle
      })
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Counter verification report')
    const draftWs = XLSX.utils.json_to_sheet(draftSheetRows())
    XLSX.utils.book_append_sheet(wb, draftWs, 'All Vouchers Draft')
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
      {showShell && (
        <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-border bg-surface-1 p-4 gap-1 sticky top-0 h-screen">
          <div className="flex items-center gap-2 mb-1">
            <img src="/logo.png" alt="RSSB" className="w-9 h-9 shrink-0" />
            <h1 className="text-sm font-semibold tracking-tight leading-tight">RSSB Counter<br/>Verification System</h1>
          </div>
          <p className="text-xs text-ink-muted mb-4">Claims verification &amp; fraud review</p>
          <nav className="flex flex-col gap-1">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStage(key)}
                aria-current={stage === key ? 'page' : undefined}
                className={`text-sm text-left rounded-lg px-3 py-2 transition-colors ${
                  stage === key ? 'bg-brand text-white font-medium' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2">
            {lastSaved && <span className="text-xs text-ink-muted">Saved {lastSaved.toLocaleTimeString()}</span>}
            <button onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface-1 hover:bg-surface-2 flex items-center justify-between">
              <span>{theme === 'light' ? 'Light mode' : 'Dark mode'}</span>
              <span>{theme === 'light' ? '☀️' : '🌙'}</span>
            </button>
            <button onClick={reset} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-surface-1 hover:bg-surface-2">
              New file
            </button>
          </div>
        </aside>
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

            <main className="px-4 sm:px-6 lg:px-8 py-6">
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
                  <button
                    onClick={() => setStage('verify')}
                    className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark transition-colors"
                  >
                    Continue to verification
                  </button>
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
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort by" className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1">
                      <option value="none">Sort: none</option>
                      <option value="facility">Sort by facility</option>
                      <option value="doctor">Sort by doctor</option>
                      <option value="voucher">Sort by voucher no</option>
                      <option value="date">Sort by date</option>
                      <option value="amount">Sort by claim amount</option>
                    </select>
                    <button onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} disabled={sortBy === 'none'} aria-label="Toggle sort direction"
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
                          <th className="px-3 py-2 font-medium">Amount</th>
                          <th className="px-3 py-2 font-medium">Approved</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Categories</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCards.map(c => (
                          <tr key={c.id} className="border-t border-border">
                            <td className="px-3 py-2">{c.id + 1}</td>
                            <td className="px-3 py-2">{voucherOf(c) || '—'}</td>
                            <td className="px-3 py-2">{mappedValue(c, 'patient_name') || '—'}</td>
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
                              <button onClick={() => { setCurrentIndex(cards.findIndex(x => x.id === c.id)); setStage('verify') }} className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-surface-2">Open</button>
                            </td>
                          </tr>
                        ))}
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
                          onClick={() => {
                            const targets = cards.filter(c => ['fraud_risk', 'orphan'].includes(matchCategoryOf(c.id)) && !c.classifications?.fraud)
                            if (!targets.length) { alert('No unflagged Fraud Risk or Orphan records to send.'); return }
                            if (!confirm(`Send ${targets.length} Fraud Risk / Orphan voucher(s) to Fraud Review? Their full RSSB-payable amount will be withheld (approved amount set to 0).`)) return
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
                  <NetworkGraph cards={cards} mapping={mapping} matchResults={matchResults} matchOverrides={matchOverrides} />
                </div>
              )}

              {stage === 'fraud' && (
                <div>
                  <p className="text-sm text-ink-muted mb-2">
                    All vouchers flagged as fraud activity. Adjust deduction, comment, prescription date, and facility here before generating the report.
                  </p>
                  <p className="text-xs text-ink-muted mb-4 bg-surface-2 border border-border rounded-lg px-3 py-2 max-w-3xl">
                    Reminder: a deduction is normally calculated against 85% of the total cost, or the mapped
                    insurance co-payment amount when available. Vouchers sent here as confirmed Fraud Risk or
                    Ghost Patient have that entire basis withheld — the approved amount becomes 0. Adjust the
                    deduction field manually if only a partial amount should be withheld instead.
                  </p>
                  <div className="overflow-x-auto rounded-card border border-border mb-4">
                    <table className="w-full text-sm bg-surface-1">
                      <thead>
                        <tr className="text-xs text-ink-muted text-left">
                          <th className="px-3 py-2 font-medium">Voucher</th>
                          <th className="px-3 py-2 font-medium">Patient</th>
                          <th className="px-3 py-2 font-medium">Amount</th>
                          <th className="px-3 py-2 font-medium">Deduction</th>
                          <th className="px-3 py-2 font-medium">Prescription date</th>
                          <th className="px-3 py-2 font-medium">Health facility</th>
                          <th className="px-3 py-2 font-medium">Comment</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cards.filter(c => c.classifications?.fraud).map(c => (
                          <tr key={c.id} className={`border-t border-border align-top ${needsFraudReview(c) ? 'bg-danger-light/40' : ''}`}>
                            <td className="px-3 py-2">{voucherOf(c) || '—'}</td>
                            <td className="px-3 py-2">{mappedValue(c, 'patient_name') || '—'}</td>
                            <td className="px-3 py-2">{originalAmount(c)?.toLocaleString() ?? '—'}</td>
                            <td className="px-3 py-2">
                              <input type="number" min="0" value={c.deduction || ''} onChange={e => updateCard(c.id, { deduction: e.target.value })}
                                className="w-24 border border-border rounded-lg px-2 py-1 text-sm bg-surface-2 text-right" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="date" value={c.prescriptionDate} onChange={e => updateCard(c.id, { prescriptionDate: e.target.value })}
                                className={`border rounded-lg px-2 py-1 text-sm bg-surface-2 ${!c.prescriptionDate ? 'border-danger' : 'border-border'}`} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={c.facilityOverride} placeholder={mappedValue(c, 'facility_name') || 'Facility'} onChange={e => updateCard(c.id, { facilityOverride: e.target.value })}
                                className={`min-w-[150px] border rounded-lg px-2 py-1 text-sm bg-surface-2 ${!facilityOf(c) ? 'border-danger' : 'border-border'}`} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="text" value={c.comment} onChange={e => updateCard(c.id, { comment: e.target.value })}
                                className="min-w-[180px] border border-border rounded-lg px-2 py-1 text-sm bg-surface-2" />
                            </td>
                            <td className="px-3 py-2">
                              {needsFraudReview(c) ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger-dark">Needs review</span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-light text-brand-dark">Ready</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {cards.filter(c => c.classifications?.fraud).length === 0 && (
                          <tr><td colSpan={8} className="px-3 py-6 text-center text-ink-muted text-sm">No vouchers flagged as fraud activity yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={generateFraudReport} className="text-sm rounded-lg px-4 py-2 bg-danger text-white hover:bg-danger-dark transition-colors">
                    Generate Anti Fraud Report
                  </button>
                </div>
              )}

              {stage === 'counter' && (
                <div>
                  <p className="text-sm text-ink-muted mb-4">
                    Review every voucher that currently has a deduction, adjust the amount or explanation as a final check, then generate the counter verification report.
                  </p>

                  <div className="rounded-card border border-border bg-surface-1 p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      ['code', 'Code / Pharmacy', 'e.g. 20331037'],
                      ['pharmacyName', 'Pharmacy / facility name', 'e.g. NYARUGENGE - PHARMACIE NEZA'],
                      ['period', 'Period', 'e.g. DECEMBER 2024'],
                      ['tin', 'TIN', 'e.g. 102808467']
                    ].map(([key, label, placeholder]) => (
                      <div key={key}>
                        <label className="text-xs text-ink-muted block mb-1">{label}</label>
                        <input value={counterHeader[key]} onChange={e => setCounterHeader(h => ({ ...h, [key]: e.target.value }))}
                          className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2" placeholder={placeholder} />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-card border border-border bg-surface-1 p-4 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      ['preparedBy', 'preparedByPosition', 'Prepared by'],
                      ['verifiedBy', 'verifiedByPosition', 'Verified by'],
                      ['approvedBy', 'approvedByPosition', 'Approved by']
                    ].map(([key, posKey, label]) => (
                      <div key={key} className="flex flex-col gap-2">
                        <div>
                          <label className="text-xs text-ink-muted block mb-1">{label}</label>
                          <input value={counterHeader[key]} onChange={e => setCounterHeader(h => ({ ...h, [key]: e.target.value }))}
                            className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2" placeholder="Full name" />
                        </div>
                        <div>
                          <label className="text-xs text-ink-muted block mb-1">Position / title</label>
                          <input value={counterHeader[posKey]} onChange={e => setCounterHeader(h => ({ ...h, [posKey]: e.target.value }))}
                            className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2" placeholder="e.g. Pharmacist in Charge" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-card border border-border mb-4">
                    <table className="w-full text-sm bg-surface-1">
                      <thead>
                        <tr className="text-xs text-ink-muted text-left">
                          <th className="px-3 py-2 font-medium">NO</th>
                          <th className="px-3 py-2 font-medium">N° BEN. / Voucher</th>
                          <th className="px-3 py-2 font-medium">RAMA Number</th>
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
                            <td className="px-3 py-2">{voucherOf(c) || '—'}</td>
                            <td className="px-3 py-2">{mappedValue(c, 'rama_number') || '—'}</td>
                            <td className="px-3 py-2">{originalAmount(c)?.toLocaleString() ?? '—'}</td>
                            <td className="px-3 py-2">
                              <input type="number" min="0" value={c.deduction || ''} onChange={e => updateCard(c.id, { deduction: e.target.value })}
                                className="w-24 border border-border rounded-lg px-2 py-1 text-sm bg-surface-2 text-right" />
                            </td>
                            <td className="px-3 py-2 text-danger">-{(parseFloat(c.deduction) || 0).toLocaleString()}</td>
                            <td className="px-3 py-2">
                              <input type="text" value={c.explanation} placeholder={c.comment || 'e.g. Different reception signature'} onChange={e => updateCard(c.id, { explanation: e.target.value })}
                                className="w-full min-w-[220px] border border-border rounded-lg px-2 py-1 text-sm bg-surface-2" />
                            </td>
                          </tr>
                        ))}
                        {cards.filter(c => (parseFloat(c.deduction) || 0) > 0).length === 0 && (
                          <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-muted text-sm">No vouchers currently have a deduction.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <button onClick={generateCounterReport} className="text-sm rounded-lg px-4 py-2 bg-brand text-white hover:bg-brand-dark transition-colors">
                    Generate counter verification report
                  </button>
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  )
}
