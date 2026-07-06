import { describe, it, expect } from 'vitest'
import {
  mappedValue, facilityOf, voucherOf, originalAmount, approvedAmount,
  fraudBasisAmount, needsFraudReview
} from '../cardHelpers'

const mapping = {
  patient_name: 'Beneficiary Name',
  facility_name: 'Facility',
  voucher_no: 'Voucher',
  amount: 'Total Cost',
  insurance_copayment: 'RSSB Co-payment'
}

function makeCard(row, overrides = {}) {
  return {
    id: 1,
    row,
    status: 'pending',
    comment: '',
    deduction: 0,
    prescriptionDate: '',
    facilityOverride: '',
    explanation: '',
    classifications: { pharma: false, rssb: false, fraud: false },
    ...overrides
  }
}

describe('mappedValue', () => {
  it('reads the column the user mapped, not a hardcoded header name', () => {
    const card = makeCard({ 'Total Cost': 12000 })
    expect(mappedValue(card, 'amount', mapping)).toBe(12000)
  })
  it('returns empty string when the field was never mapped', () => {
    const card = makeCard({})
    expect(mappedValue(card, 'amount', {})).toBe('')
  })
})

describe('facilityOf', () => {
  it('prefers a manual override over the mapped column', () => {
    const card = makeCard({ Facility: 'Original Pharmacy' }, { facilityOverride: 'Corrected Pharmacy' })
    expect(facilityOf(card, mapping)).toBe('Corrected Pharmacy')
  })
  it('falls back to the mapped column when no override is set', () => {
    const card = makeCard({ Facility: 'Neza Pharmacy' })
    expect(facilityOf(card, mapping)).toBe('Neza Pharmacy')
  })
})

describe('originalAmount / approvedAmount', () => {
  it('parses the mapped total cost as a number', () => {
    const card = makeCard({ 'Total Cost': '15000' })
    expect(originalAmount(card, mapping)).toBe(15000)
  })
  it('returns null (not 0 or NaN) when the amount is unparseable, so callers can distinguish "unknown" from "zero"', () => {
    const card = makeCard({ 'Total Cost': '' })
    expect(originalAmount(card, mapping)).toBeNull()
  })
  it('subtracts the deduction from the original amount', () => {
    const card = makeCard({ 'Total Cost': 10000 }, { deduction: 4000 })
    expect(approvedAmount(card, mapping)).toBe(6000)
  })
  it('never returns a negative approved amount even if deduction exceeds cost', () => {
    const card = makeCard({ 'Total Cost': 1000 }, { deduction: 5000 })
    expect(approvedAmount(card, mapping)).toBe(0)
  })
})

describe('fraudBasisAmount — the rule: 85% of total cost, or insurance co-payment if mapped', () => {
  it('uses the mapped insurance co-payment amount when present', () => {
    const card = makeCard({ 'Total Cost': 10000, 'RSSB Co-payment': 8500 })
    expect(fraudBasisAmount(card, mapping)).toBe(8500)
  })
  it('falls back to 85% of total cost when co-payment is not mapped or not a positive number', () => {
    const card = makeCard({ 'Total Cost': 10000, 'RSSB Co-payment': '' })
    expect(fraudBasisAmount(card, mapping)).toBe(8500)
  })
  it('returns 0 when total cost itself is unparseable', () => {
    const card = makeCard({ 'Total Cost': '', 'RSSB Co-payment': '' })
    expect(fraudBasisAmount(card, mapping)).toBe(0)
  })
})

describe('needsFraudReview', () => {
  it('is false for a non-fraud-flagged voucher regardless of missing fields', () => {
    const card = makeCard({}, { classifications: { fraud: false } })
    expect(needsFraudReview(card, mapping)).toBe(false)
  })
  it('is true for a fraud-flagged voucher missing a prescription date', () => {
    const card = makeCard({ Facility: 'Neza' }, { classifications: { fraud: true }, prescriptionDate: '' })
    expect(needsFraudReview(card, mapping)).toBe(true)
  })
  it('is false once both prescription date and facility are present', () => {
    const card = makeCard({ Facility: 'Neza' }, { classifications: { fraud: true }, prescriptionDate: '2024-12-01' })
    expect(needsFraudReview(card, mapping)).toBe(false)
  })
})

describe('voucherOf', () => {
  it('trims and stringifies the mapped voucher number', () => {
    const card = makeCard({ Voucher: '  ABC123  ' })
    expect(voucherOf(card, mapping)).toBe('ABC123')
  })
})
