import { describe, it, expect } from 'vitest'
import { autoMapHeaders, normalizeKey } from '../fileParsing'
import { FIELD_DEFS } from '../config'

describe('normalizeKey', () => {
  it('lowercases and strips non-alphanumeric characters', () => {
    expect(normalizeKey("Beneficiary's Name")).toBe('beneficiarysname')
    expect(normalizeKey('Total Cost 100%')).toBe('totalcost100')
  })
})

describe('autoMapHeaders', () => {
  it('maps a straightforward sheet with distinct columns for every field', () => {
    const headers = ["Beneficiary's Names", 'Prescription Date', 'Dispensing Date', 'Total Cost 100%']
    const mapping = autoMapHeaders(headers, FIELD_DEFS)
    expect(mapping.patient_name).toBe("Beneficiary's Names")
    expect(mapping.visit_date).toBe('Prescription Date')
    expect(mapping.dispensing_date).toBe('Dispensing Date')
    expect(mapping.amount).toBe('Total Cost 100%')
  })

  // Regression test: visit_date's guess list includes the generic 'date',
  // which — if fields were resolved in FIELD_DEFS order — would let
  // visit_date claim a "Dispensing Date" column before dispensing_date's
  // much more specific guess ('dispensingdate') got a chance, leaving
  // dispensing_date unmapped even though it's clearly the better match.
  it('gives a column to the field with the more specific match, not whichever field is processed first', () => {
    const headers = ["Beneficiary's Names", 'Dispensing Date', 'Total Cost 100%']
    const mapping = autoMapHeaders(headers, FIELD_DEFS)
    expect(mapping.dispensing_date).toBe('Dispensing Date')
    expect(mapping.visit_date).toBe('')
  })

  it('never assigns the same header to two different fields', () => {
    const headers = ['Date', 'Amount']
    const mapping = autoMapHeaders(headers, FIELD_DEFS)
    const assignedHeaders = Object.values(mapping).filter(Boolean)
    expect(new Set(assignedHeaders).size).toBe(assignedHeaders.length)
  })

  // Regression test: voucher_no's guess list includes very short tokens
  // ('no', 'n0') meant to catch a header that's literally just "No." — as a
  // loose substring match those would also fire on any unrelated column
  // whose name happens to contain those two letters, like "Notes".
  it('does not let a short guess token (e.g. "no") false-positive match against an unrelated column like "Notes"', () => {
    const headers = ['Notes']
    const mapping = autoMapHeaders(headers, FIELD_DEFS)
    expect(mapping.voucher_no).toBe('')
  })
  it('still maps a header that genuinely is just "No" via the short guess', () => {
    const headers = ['No']
    const mapping = autoMapHeaders(headers, FIELD_DEFS)
    expect(mapping.voucher_no).toBe('No')
  })

  it('leaves a field unmapped when no header matches any of its guesses', () => {
    const headers = ['Zzz Nothing Relevant Xyqv']
    const mapping = autoMapHeaders(headers, FIELD_DEFS)
    expect(Object.values(mapping).every(v => v === '')).toBe(true)
  })
})
