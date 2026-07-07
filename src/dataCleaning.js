import { normalizeId, normalizeSex } from './matching'

// Which cleaning routine applies to each mapped field. This is the
// "schema" the cleaning layer works against — every mapped column gets
// routed through exactly one of these normalizers.
export const FIELD_CLEAN_TYPES = {
  voucher_no: 'text',
  visit_date: 'date',
  dispensing_date: 'date',
  patient_name: 'name',
  patient_type: 'text',
  gender: 'sex',
  is_newborn: 'text',
  rama_number: 'id',
  affiliate_name: 'name',
  doctor_name: 'name',
  practitioner_type: 'text',
  facility_name: 'name',
  amount: 'amount',
  patient_copayment: 'amount',
  insurance_copayment: 'amount',
  difference: 'amount',
  observation: 'text'
  // patient_age intentionally excluded: in the source files this column is
  // sometimes an age (integer) and sometimes a DOB (date) depending on the
  // facility, so auto-normalizing it risks silently corrupting one or the
  // other. It's left as free text for a human to check.
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

// Excel stores dates as a serial day count from 1899-12-30.
function excelSerialToDate(n) {
  const ms = Math.round((n - 25569) * 86400 * 1000)
  return new Date(ms)
}

// Rule-based date parser with explicit heuristics for the ambiguous
// day/month ordering case, rather than trusting JS's inconsistent native
// Date parsing. Returns ISO yyyy-mm-dd. `ambiguous: true` marks a
// dd/mm vs mm/dd guess made without a disambiguating clue (day or month > 12),
// so the UI can flag it for a human to double check.
export function normalizeDateValue(raw) {
  if (raw === null || raw === undefined || raw === '') return { value: '', changed: false }

  let d = null
  let ambiguous = false

  if (raw instanceof Date) {
    d = raw
  } else if (typeof raw === 'number' && raw > 1000 && raw < 80000) {
    d = excelSerialToDate(raw)
  } else {
    const s = String(raw).trim()
    let m
    if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) {
      d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    } else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
      let a = +m[1], b = +m[2], y = +m[3]
      if (y < 100) y += y < 50 ? 2000 : 1900
      if (a > 12 && b <= 12) {
        d = new Date(Date.UTC(y, b - 1, a)) // a can only be a day
      } else if (b > 12 && a <= 12) {
        d = new Date(Date.UTC(y, a - 1, b)) // b can only be a day -> a is month
      } else {
        // Both <= 12: genuinely ambiguous. Default to day-first, the
        // convention used in Rwanda and most of the source documents.
        d = new Date(Date.UTC(y, b - 1, a))
        ambiguous = true
      }
    } else if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/))) {
      const mon = MONTHS[m[2].slice(0, 3).toLowerCase()]
      if (mon) d = new Date(Date.UTC(+m[3] < 100 ? +m[3] + 2000 : +m[3], mon - 1, +m[1]))
    } else if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/))) {
      const mon = MONTHS[m[1].slice(0, 3).toLowerCase()]
      if (mon) d = new Date(Date.UTC(+m[3] < 100 ? +m[3] + 2000 : +m[3], mon - 1, +m[2]))
    } else {
      const parsed = new Date(s)
      if (!isNaN(parsed.getTime())) d = parsed
    }
  }

  if (!d || isNaN(d.getTime())) {
    return { value: String(raw).trim(), changed: false, unparsed: true }
  }
  const iso = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  return { value: iso, changed: String(raw).trim() !== iso, ambiguous }
}

// Suggests an initial value for a voucher's editable prescription-date field,
// using its dispensing date as a starting point (the two are usually the same
// day or very close). Runs on raw, not-yet-cleaned spreadsheet values, so it
// goes through the same parser as the Clean Data step rather than a naive
// `new Date(...)` — that keeps it safe against Excel serial-number dates and
// ambiguous dd/mm vs mm/dd text. Returns '' (rather than a garbage string)
// whenever the cell can't be confidently parsed as a date.
export function dispensingDateHint(row, dispensingHeader) {
  if (!dispensingHeader) return ''
  const result = normalizeDateValue(row[dispensingHeader])
  return result.unparsed ? '' : result.value
}

// Handles both US-style (1,234.56) and EU-style (1.234,56) thousands/decimal
// separators, plus currency symbols/codes (RWF, Frw, $, etc.), rather than
// assuming one fixed format.
export function normalizeAmountValue(raw) {
  if (raw === null || raw === undefined || raw === '') return { value: null, changed: false }

  if (typeof raw === 'number') {
    const rounded = Math.round(raw * 100) / 100
    return { value: rounded, changed: rounded !== raw }
  }

  const original = String(raw).trim()
  let s = original.replace(/[A-Za-z]/g, '').trim()
  s = s.replace(/[^\d.,-]/g, '')
  if (!s) return { value: null, changed: true, unparsed: true }

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.') // EU format: 1.234,56
    } else {
      s = s.replace(/,/g, '') // US format: 1,234.56
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(',')
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      s = s.replace(/,/g, '') // thousands separator: 12,000
    } else {
      s = s.replace(',', '.') // decimal comma: 12,5
    }
  }

  const num = parseFloat(s)
  if (isNaN(num)) return { value: null, changed: true, unparsed: true }
  const rounded = Math.round(num * 100) / 100
  return { value: rounded, changed: String(rounded) !== original }
}

// Trims, collapses internal whitespace, and title-cases names for
// consistent display/export — purely cosmetic normalization; the separate
// matching engine (matching.js) does its own case/order-insensitive
// comparison for actual record linkage, so this doesn't affect match quality.
export function normalizeNameValue(raw) {
  if (raw === null || raw === undefined) return { value: '', changed: false }
  const original = String(raw)
  let s = original.trim().replace(/\s+/g, ' ')
  s = s.replace(/\b\p{L}+/gu, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  return { value: s, changed: s !== original }
}

export function normalizeSexValue(raw) {
  if (raw === null || raw === undefined || raw === '') return { value: '', changed: false }
  const trimmed = String(raw).trim()
  const norm = normalizeSex(raw)
  if (!norm) return { value: trimmed, changed: false, unparsed: true }
  return { value: norm, changed: norm !== trimmed }
}

export function normalizeIdValue(raw) {
  if (raw === null || raw === undefined || raw === '') return { value: '', changed: false }
  const trimmed = String(raw).trim()
  const norm = normalizeId(raw)
  if (norm === null) return { value: trimmed, changed: false, unparsed: true }
  return { value: norm, changed: norm !== trimmed }
}

export function normalizeTextValue(raw) {
  if (raw === null || raw === undefined) return { value: '', changed: false }
  const original = String(raw)
  const s = original.trim().replace(/\s+/g, ' ')
  return { value: s, changed: s !== original }
}

function normalizeByType(type, raw) {
  switch (type) {
    case 'date': return normalizeDateValue(raw)
    case 'amount': return normalizeAmountValue(raw)
    case 'name': return normalizeNameValue(raw)
    case 'sex': return normalizeSexValue(raw)
    case 'id': return normalizeIdValue(raw)
    case 'text': return normalizeTextValue(raw)
    default: return null
  }
}

// Runs every mapped column through its normalizer. Returns the cleaned
// cards (original values preserved on card.rawRow the first time cleaning
// runs, so it's always reversible) plus a flat audit trail of every value
// that actually changed, for the review screen.
export function cleanCards(cards, mapping) {
  const changes = []

  const cleanedCards = cards.map(card => {
    const rowCopy = { ...card.row }
    let touched = false

    Object.entries(mapping).forEach(([fieldKey, header]) => {
      if (!header) return
      const type = FIELD_CLEAN_TYPES[fieldKey]
      if (!type) return
      const raw = rowCopy[header]
      const result = normalizeByType(type, raw)
      if (!result) return
      if (result.changed) {
        changes.push({
          cardId: card.id,
          field: fieldKey,
          header,
          type,
          original: raw,
          cleaned: result.value,
          ambiguous: !!result.ambiguous
        })
        rowCopy[header] = result.value
        touched = true
      } else if (result.unparsed && raw !== '' && raw !== null && raw !== undefined) {
        changes.push({
          cardId: card.id,
          field: fieldKey,
          header,
          type,
          original: raw,
          cleaned: result.value,
          unparsed: true
        })
      }
    })

    if (!touched) return card
    return { ...card, row: rowCopy, rawRow: card.rawRow || card.row, cleaned: true }
  })

  return { cleanedCards, changes }
}

export function revertCleaning(cards) {
  return cards.map(c => (c.rawRow ? { ...c, row: c.rawRow, rawRow: null, cleaned: false } : c))
}

export function summarizeChanges(changes, fieldDefs) {
  const labelByKey = Object.fromEntries(fieldDefs.map(f => [f.key, f.label]))
  const byField = {}
  let ambiguousCount = 0
  let unparsedCount = 0

  changes.forEach(c => {
    if (!byField[c.field]) {
      byField[c.field] = { field: c.field, label: labelByKey[c.field] || c.field, type: c.type, changed: 0, ambiguous: 0, unparsed: 0 }
    }
    if (c.unparsed) {
      byField[c.field].unparsed += 1
      unparsedCount += 1
    } else {
      byField[c.field].changed += 1
      if (c.ambiguous) {
        byField[c.field].ambiguous += 1
        ambiguousCount += 1
      }
    }
  })

  return {
    totalChanges: changes.filter(c => !c.unparsed).length,
    ambiguousCount,
    unparsedCount,
    byField: Object.values(byField).sort((a, b) => (b.changed + b.unparsed) - (a.changed + a.unparsed))
  }
}
