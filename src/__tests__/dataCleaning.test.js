import { describe, it, expect } from 'vitest'
import {
  normalizeDateValue, normalizeAmountValue, normalizeNameValue,
  normalizeSexValue, normalizeIdValue, cleanCards, revertCleaning, summarizeChanges
} from '../dataCleaning'

describe('normalizeDateValue', () => {
  it('converts an Excel serial date number to ISO format', () => {
    // 45292 = 2024-01-01 in Excel's serial date system
    expect(normalizeDateValue(45292).value).toBe('2024-01-01')
  })
  it('parses ISO-ish input unchanged in spirit', () => {
    expect(normalizeDateValue('2024-01-15').value).toBe('2024-01-15')
  })
  it('resolves dd/mm/yyyy unambiguously when day > 12', () => {
    expect(normalizeDateValue('25/03/2024').value).toBe('2024-03-25')
  })
  it('resolves mm/dd/yyyy unambiguously when the second number > 12', () => {
    expect(normalizeDateValue('03/25/2024').value).toBe('2024-03-25')
  })
  it('flags genuinely ambiguous dd/mm vs mm/dd dates instead of guessing silently', () => {
    const result = normalizeDateValue('03/04/2024')
    expect(result.ambiguous).toBe(true)
  })
  it('parses textual month names', () => {
    expect(normalizeDateValue('15 Jan 2024').value).toBe('2024-01-15')
  })
  it('marks unparseable garbage as unparsed rather than guessing', () => {
    const result = normalizeDateValue('not a date')
    expect(result.unparsed).toBe(true)
  })
  it('treats empty input as unchanged, not an error', () => {
    expect(normalizeDateValue('')).toEqual({ value: '', changed: false })
  })
})

describe('normalizeAmountValue', () => {
  it('strips currency words and thousands commas (US format)', () => {
    expect(normalizeAmountValue('RWF 12,000').value).toBe(12000)
  })
  it('handles EU-style thousands dot + decimal comma', () => {
    expect(normalizeAmountValue('1.234,56').value).toBe(1234.56)
  })
  it('treats a lone comma followed by 2 digits as a decimal separator', () => {
    expect(normalizeAmountValue('12,50').value).toBe(12.5)
  })
  it('treats a lone comma followed by exactly 3 digits as a thousands separator', () => {
    expect(normalizeAmountValue('12,000').value).toBe(12000)
  })
  it('rounds numeric input to 2 decimal places', () => {
    expect(normalizeAmountValue(10.005).value).toBeCloseTo(10.01, 2)
  })
  it('returns null for unparseable amounts rather than 0 or NaN', () => {
    const result = normalizeAmountValue('N/A')
    expect(result.value).toBeNull()
    expect(result.unparsed).toBe(true)
  })
})

describe('normalizeNameValue', () => {
  it('collapses extra whitespace and title-cases the name', () => {
    expect(normalizeNameValue('  jean   BAPTISTE  ').value).toBe('Jean Baptiste')
  })
  it('reports unchanged when already clean', () => {
    expect(normalizeNameValue('Jean Baptiste').changed).toBe(false)
  })
})

describe('normalizeSexValue', () => {
  it('maps MALE/FEMALE to single-letter codes', () => {
    expect(normalizeSexValue('MALE').value).toBe('M')
    expect(normalizeSexValue('Female').value).toBe('F')
  })
})

describe('normalizeIdValue', () => {
  it('strips the Nr prefix and leading zeros', () => {
    expect(normalizeIdValue('Nr 0015703').value).toBe('15703')
  })
})

describe('cleanCards / revertCleaning (integration)', () => {
  const mapping = { visit_date: 'Date', amount: 'Cost', patient_name: 'Name', rama_number: 'RAMA' }

  function card(id, row) {
    return { id, row }
  }

  it('normalizes every mapped field across all cards and records an audit trail', () => {
    const cards = [card(1, { Date: '25/03/2024', Cost: 'RWF 12,000', Name: '  alice mukamana ', RAMA: 'Nr 0015703' })]
    const { cleanedCards, changes } = cleanCards(cards, mapping)
    expect(cleanedCards[0].row.Date).toBe('2024-03-25')
    expect(cleanedCards[0].row.Cost).toBe(12000)
    expect(cleanedCards[0].row.Name).toBe('Alice Mukamana')
    expect(cleanedCards[0].row.RAMA).toBe('15703')
    expect(changes.length).toBe(4)
    expect(cleanedCards[0].cleaned).toBe(true)
  })

  it('preserves the original row on rawRow so cleaning is reversible', () => {
    const cards = [card(1, { Date: '25/03/2024', Cost: '12,000', Name: 'alice', RAMA: '0015703' })]
    const { cleanedCards } = cleanCards(cards, mapping)
    expect(cleanedCards[0].rawRow.Date).toBe('25/03/2024')
  })

  it('leaves a card untouched (no rawRow) when nothing needed cleaning', () => {
    const cards = [card(1, { Date: '2024-03-25', Cost: 12000, Name: 'Alice', RAMA: '15703' })]
    const { cleanedCards, changes } = cleanCards(cards, mapping)
    expect(cleanedCards[0].rawRow).toBeUndefined()
    expect(changes.length).toBe(0)
  })

  it('revertCleaning restores the original row and clears the cleaned flag', () => {
    const cards = [card(1, { Date: '25/03/2024', Cost: '12,000', Name: 'alice', RAMA: '0015703' })]
    const { cleanedCards } = cleanCards(cards, mapping)
    const reverted = revertCleaning(cleanedCards)
    expect(reverted[0].row.Date).toBe('25/03/2024')
    expect(reverted[0].cleaned).toBe(false)
  })
})

describe('summarizeChanges', () => {
  it('groups change counts by field with human-readable labels', () => {
    const fieldDefs = [{ key: 'visit_date', label: 'Prescription Date' }]
    const changes = [
      { field: 'visit_date', type: 'date', ambiguous: false },
      { field: 'visit_date', type: 'date', ambiguous: true }
    ]
    const summary = summarizeChanges(changes, fieldDefs)
    expect(summary.totalChanges).toBe(2)
    expect(summary.ambiguousCount).toBe(1)
    expect(summary.byField[0].label).toBe('Prescription Date')
    expect(summary.byField[0].changed).toBe(2)
  })
})
