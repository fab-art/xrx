export function toDateValue(v) {
  if (!v) return null
  if (v instanceof Date) return v
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function normalizeKeyLoose(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Fallback lookup for when a field wasn't explicitly mapped: scans the row's
// own column names for anything that loosely matches one of the candidates.
export function findRowValue(card, candidates) {
  const keys = Object.keys(card.row || {})
  for (const k of keys) {
    const nk = normalizeKeyLoose(k)
    if (candidates.some(c => nk.includes(c))) return card.row[k]
  }
  return undefined
}

export function mappedValue(card, key, mapping) {
  const header = mapping[key]
  return header ? card.row[header] : ''
}

export function facilityOf(card, mapping) {
  const override = (card.facilityOverride || '').trim()
  if (override) return override
  return String(mappedValue(card, 'facility_name', mapping) || '').trim()
}

export function doctorOf(card, mapping) {
  return String(mappedValue(card, 'doctor_name', mapping) || '').trim()
}

export function voucherOf(card, mapping) {
  return String(mappedValue(card, 'voucher_no', mapping) || '').trim()
}

export function dateOf(card, mapping) {
  return toDateValue(mappedValue(card, 'visit_date', mapping))
}

export function originalAmount(card, mapping) {
  const v = parseFloat(mappedValue(card, 'amount', mapping))
  return isNaN(v) ? null : v
}

export function approvedAmount(card, mapping) {
  const orig = originalAmount(card, mapping)
  if (orig === null) return null
  return Math.max(0, orig - (parseFloat(card.deduction) || 0))
}

// Deduction basis for confirmed-fraud / ghost-patient vouchers: the RSSB-payable
// portion is either the mapped insurance co-payment amount, or — if that field
// isn't mapped — 85% of the total cost. For a normal deduction only part of this
// basis might be withheld; for fraud-suspected vouchers the FULL basis is withheld,
// driving the approved amount to zero.
export function fraudBasisAmount(card, mapping) {
  const coPay = parseFloat(mappedValue(card, 'insurance_copayment', mapping))
  if (!isNaN(coPay) && coPay > 0) return Math.round(coPay * 100) / 100
  const orig = originalAmount(card, mapping)
  if (orig === null) return 0
  return Math.round(orig * 0.85 * 100) / 100
}

export function needsFraudReview(card, mapping) {
  return !!(card.classifications?.fraud && (!card.prescriptionDate || !facilityOf(card, mapping)))
}
