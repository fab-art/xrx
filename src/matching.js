// Record-linkage engine for matching hospital beneficiary records against
// pharmacy voucher records. Implements a lightweight, explainable version of
// Fellegi-Sunter probabilistic linkage: each field contributes independent
// weighted evidence, common names are down-weighted by frequency, and hard
// contradictions (sex/ID mismatch) can override a high score to force a
// fraud-risk classification.

// ---------- Normalization ----------

export function normalizeId(raw) {
  if (raw === null || raw === undefined) return null
  let s = String(raw).trim().toUpperCase()
  if (!s) return null
  s = s.replace(/^NR\.?\s*/, '') // strip "Nr " / "NR." prefix
  s = s.replace(/[\s.\-_/]/g, '') // strip whitespace, dots, dashes, slashes
  if (!s || s === 'NAN' || /^N+$/.test(s)) return null
  const m = s.match(/^(\d+)([A-Z]?)$/)
  if (m) {
    let [, digits, letter] = m
    digits = digits.replace(/^0+/, '') || '0'
    return digits + letter
  }
  // fallback: keep alnum only
  const cleaned = s.replace(/[^A-Z0-9]/g, '')
  return cleaned || null
}

export function normalizeSex(raw) {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().toUpperCase()
  if (!s) return null
  if (s.startsWith('M')) return 'M'
  if (s.startsWith('F')) return 'F'
  return null
}

export function normalizeName(raw) {
  if (raw === null || raw === undefined) return { tokens: [], key: '', display: '' }
  let s = String(raw).toUpperCase()
  s = s.replace(/[^A-Z ,]/g, ' ')
  const tokens = s.split(/[, ]+/).filter(Boolean)
  const sorted = [...tokens].sort()
  return { tokens, key: sorted.join(' '), display: tokens.join(' ') }
}

// Parses either a real date or an age-like value. Hospital files sometimes
// store DOB (e.g. 1965-01-01) in what's labelled an "age" column.
export function normalizeDob(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10)
  const d = new Date(raw)
  if (!isNaN(d.getTime()) && String(raw).length >= 6) return d.toISOString().slice(0, 10)
  return null
}

// ---------- String similarity ----------

function levenshtein(a, b) {
  if (a === b) return 0
  const al = a.length, bl = b.length
  if (al === 0) return bl
  if (bl === 0) return al
  const dp = new Array(bl + 1)
  for (let j = 0; j <= bl; j++) dp[j] = j
  for (let i = 1; i <= al; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= bl; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[bl]
}

// Token-sort ratio: 0..1, order-invariant string similarity (handles
// "SMITH, JOHN" vs "JOHN SMITH").
export function tokenSortSimilarity(keyA, keyB) {
  if (!keyA || !keyB) return 0
  if (keyA === keyB) return 1
  const dist = levenshtein(keyA, keyB)
  const maxLen = Math.max(keyA.length, keyB.length)
  return maxLen === 0 ? 0 : 1 - dist / maxLen
}

// ---------- Frequency-adjusted name weighting ----------
// Builds a lookup of how common each name token is across the hospital pool,
// so that a match on a rare surname counts as stronger evidence than a match
// on a surname shared by 200 other people (mirrors Fellegi-Sunter frequency
// adjustment, which flat fuzzy-matching scores ignore).
export function buildTokenFrequency(hospitalRecords) {
  const freq = {}
  hospitalRecords.forEach(r => {
    r.name.tokens.forEach(t => {
      freq[t] = (freq[t] || 0) + 1
    })
  })
  return freq
}

function rarityWeight(tokens, freq, totalRecords) {
  if (!tokens.length) return 0.5
  const scores = tokens.map(t => {
    const f = freq[t] || 1
    // rarer token -> weight closer to 1; very common token -> weight closer to 0.25
    return Math.max(0.25, 1 - Math.log(f + 1) / Math.log(totalRecords + 2))
  })
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

// ---------- Core scoring ----------

const WEIGHTS = {
  idExact: 6,
  idCloseTypo: 3, // edit distance 1 on digits, same length
  name: 4, // scaled by similarity * frequency weight
  sex: 1,
  sexConflict: -4,
  dob: 2.5,
  dobConflict: -3
}

export function buildHospitalIndex(hospitalRecords) {
  const byId = new Map()
  hospitalRecords.forEach(r => {
    if (!r.normId) return
    if (!byId.has(r.normId)) byId.set(r.normId, [])
    byId.get(r.normId).push(r)
  })
  const tokenFreq = buildTokenFrequency(hospitalRecords)
  return { byId, tokenFreq, total: hospitalRecords.length, records: hospitalRecords }
}

// Compares a pharmacy record against one hospital candidate and returns a
// scored, explainable evidence breakdown.
function scoreCandidate(pharm, hosp, tokenFreq, totalRecords) {
  const reasons = []
  let score = 0
  let hardConflict = false

  if (pharm.normId && hosp.normId) {
    if (pharm.normId === hosp.normId) {
      score += WEIGHTS.idExact
      reasons.push('ID exact match')
    } else if (
      pharm.normId.length === hosp.normId.length &&
      levenshtein(pharm.normId, hosp.normId) === 1
    ) {
      score += WEIGHTS.idCloseTypo
      reasons.push('ID differs by 1 character (likely typo)')
    }
  }

  const nameSim = tokenSortSimilarity(pharm.name.key, hosp.name.key)
  if (nameSim > 0.55) {
    const w = rarityWeight(hosp.name.tokens, tokenFreq, totalRecords)
    const contrib = WEIGHTS.name * nameSim * w
    score += contrib
    reasons.push(`Name similarity ${(nameSim * 100).toFixed(0)}% (rarity-weighted)`)
  }

  if (pharm.sex && hosp.sex) {
    if (pharm.sex === hosp.sex) {
      score += WEIGHTS.sex
    } else {
      score += WEIGHTS.sexConflict
      hardConflict = true
      reasons.push('Sex mismatch')
    }
  }

  if (pharm.dob && hosp.dob) {
    if (pharm.dob === hosp.dob) {
      score += WEIGHTS.dob
      reasons.push('DOB exact match')
    } else {
      score += WEIGHTS.dobConflict
      hardConflict = true
      reasons.push('DOB mismatch')
    }
  }

  return { score, reasons, hardConflict, nameSim }
}

const THRESH = {
  clean: 6,
  review: 3
}

// Matches every pharmacy record against the hospital index and classifies
// into clean / fraud_risk / review / orphan.
export function matchRecords(pharmRecords, hospitalIndex) {
  const { byId, tokenFreq, total, records } = hospitalIndex

  return pharmRecords.map(p => {
    const candidates = []

    if (p.normId && byId.has(p.normId)) {
      byId.get(p.normId).forEach(h => candidates.push(h))
    }
    // also scan for strong name matches even without ID hit, so ID typos
    // don't get silently bucketed as orphans
    if (p.name.key) {
      records.forEach(h => {
        if (candidates.includes(h)) return
        const quick = tokenSortSimilarity(p.name.key, h.name.key)
        if (quick > 0.55) candidates.push(h)
      })
    }

    let best = null
    candidates.forEach(h => {
      const result = scoreCandidate(p, h, tokenFreq, total)
      if (!best || result.score > best.score) {
        best = { hospital: h, ...result }
      }
    })

    let category = 'orphan'
    if (best) {
      if (best.hardConflict && (p.normId === best.hospital.normId)) {
        category = 'fraud_risk'
      } else if (best.score >= THRESH.clean) {
        category = 'clean'
      } else if (best.score >= THRESH.review) {
        category = 'review'
      } else {
        category = 'orphan'
      }
    }

    return {
      pharmacyId: p.id,
      category,
      score: best ? Number(best.score.toFixed(2)) : 0,
      reasons: best ? best.reasons : ['No corroborating ID or name found in hospital data'],
      matchedHospital: best
        ? {
            fileName: best.hospital.sourceFile,
            name: best.hospital.name.display,
            id: best.hospital.rawId,
            sex: best.hospital.sex,
            dob: best.hospital.dob,
            row: best.hospital.row
          }
        : null
    }
  })
}

export const CATEGORY_LABELS = {
  clean: 'Clean Match',
  fraud_risk: 'Mismatched Identity (Fraud Risk)',
  review: 'Needs Review',
  orphan: 'Orphan Record (Ghost Patient)'
}
