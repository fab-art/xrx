import { describe, it, expect } from 'vitest'
import {
  normalizeId, normalizeSex, normalizeName, normalizeDob,
  tokenSortSimilarity, buildHospitalIndex, matchRecords
} from '../matching'

describe('normalizeId', () => {
  it('strips the "Nr " prefix used by CHUK exports', () => {
    expect(normalizeId('Nr 015948230')).toBe('15948230')
  })
  it('strips leading zeros so different-length IDs still compare equal', () => {
    expect(normalizeId('0015703')).toBe(normalizeId('15703'))
  })
  it('preserves and uppercases a trailing checksum letter', () => {
    expect(normalizeId('19517103m')).toBe('19517103M')
  })
  it('treats a bare "Nr" with no digits as missing, not a real ID', () => {
    expect(normalizeId('Nr')).toBeNull()
  })
  it('treats "Nr ." as missing', () => {
    expect(normalizeId('Nr .')).toBeNull()
  })
  it('returns null for empty/nullish input', () => {
    expect(normalizeId('')).toBeNull()
    expect(normalizeId(null)).toBeNull()
    expect(normalizeId(undefined)).toBeNull()
  })
})

describe('normalizeSex', () => {
  it('maps MALE/FEMALE (pharmacy format) to M/F (hospital format)', () => {
    expect(normalizeSex('MALE')).toBe('M')
    expect(normalizeSex('FEMALE')).toBe('F')
  })
  it('passes through single-letter codes', () => {
    expect(normalizeSex('M')).toBe('M')
    expect(normalizeSex('f')).toBe('F')
  })
  it('returns null for unrecognized values', () => {
    expect(normalizeSex('unknown')).toBeNull()
    expect(normalizeSex('')).toBeNull()
  })
})

describe('normalizeName', () => {
  it('makes "LASTNAME, First Middle" and "First Middle LASTNAME" compare equal', () => {
    const a = normalizeName('UWIZEYE, Elise')
    const b = normalizeName('Elise Uwizeye')
    expect(a.key).toBe(b.key)
  })
  it('is case-insensitive', () => {
    expect(normalizeName('john smith').key).toBe(normalizeName('JOHN SMITH').key)
  })
})

describe('tokenSortSimilarity', () => {
  it('gives 1.0 for identical normalized keys', () => {
    const k = normalizeName('Ange Umutoni').key
    expect(tokenSortSimilarity(k, k)).toBe(1)
  })
  it('gives a high score for a single-letter spelling variant', () => {
    const a = normalizeName('Elise Uwizeye').key
    const b = normalizeName('Elyse Uwizeye').key
    expect(tokenSortSimilarity(a, b)).toBeGreaterThan(0.85)
  })
  it('does not blindly give a high score to two different people sharing a common surname pattern', () => {
    // Real false-positive found in the RSSB data during matching design.
    const a = normalizeName('Musabyimana Theogene').key
    const b = normalizeName('Dusabimana Eugene').key
    const score = tokenSortSimilarity(a, b)
    expect(score).toBeLessThan(0.9)
  })
})

describe('buildHospitalIndex + matchRecords (end-to-end)', () => {
  function hospitalRow(overrides = {}) {
    return {
      sourceFile: 'CHUK.xlsx',
      rawId: 'Nr 015948230',
      normId: normalizeId('Nr 015948230'),
      name: normalizeName('UWIZEYE, Elise'),
      sex: normalizeSex('F'),
      dob: normalizeDob('1990-01-01'),
      row: {},
      ...overrides
    }
  }

  it('classifies an exact ID + name + sex match as clean', () => {
    const index = buildHospitalIndex([hospitalRow()])
    const results = matchRecords(
      [{ id: 1, normId: normalizeId('015948230'), name: normalizeName('Elise Uwizeye'), sex: normalizeSex('FEMALE'), dob: normalizeDob('1990-01-01') }],
      index
    )
    expect(results[0].category).toBe('clean')
  })

  it('flags a same-ID-but-conflicting-sex pair as fraud_risk, not clean', () => {
    const index = buildHospitalIndex([hospitalRow({ sex: 'F' })])
    const results = matchRecords(
      [{ id: 1, normId: normalizeId('015948230'), name: normalizeName('Elise Uwizeye'), sex: normalizeSex('MALE'), dob: null }],
      index
    )
    expect(results[0].category).toBe('fraud_risk')
  })

  it('classifies a record with no plausible hospital match as orphan', () => {
    const index = buildHospitalIndex([hospitalRow()])
    const results = matchRecords(
      [{ id: 1, normId: normalizeId('999999999'), name: normalizeName('Someone Completely Different'), sex: 'M', dob: null }],
      index
    )
    expect(results[0].category).toBe('orphan')
  })

  it('recovers a true match via name similarity even when the ID was mistyped', () => {
    const index = buildHospitalIndex([hospitalRow({ normId: '15948230' })])
    const results = matchRecords(
      // ID differs completely (transcription error) but name+sex+dob all agree
      [{ id: 1, normId: '99999999', name: normalizeName('Elise Uwizeye'), sex: normalizeSex('FEMALE'), dob: normalizeDob('1990-01-01') }],
      index
    )
    expect(['clean', 'review']).toContain(results[0].category)
    expect(results[0].matchedHospital).not.toBeNull()
  })
})
