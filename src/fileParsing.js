import * as XLSX from 'xlsx-js-style'

export function normalizeKey(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Whether a guess token counts as matching a normalized header. Longer
// guesses (4+ chars) are specific enough to use loose substring matching
// (e.g. 'dispensingdate' inside 'dispensingdatecolumn'). Very short guesses
// like 'no' or 'om' exist to catch a header that's literally just "No" or
// "N0" — but as a substring match they'd also fire on "Notes", "Comments",
// or any other unrelated word that happens to contain those two letters, so
// they're required to match the header exactly instead.
function guessMatches(normalizedHeader, guess) {
  return guess.length <= 3 ? normalizedHeader === guess : normalizedHeader.includes(guess)
}

// Best-guess column mapping. Every (field, header) pair that matches gets a
// score (the length of the longest matching guess), and pairs are assigned
// strongest-match-first across the WHOLE sheet — not by walking fields in
// FIELD_DEFS order and letting each grab its best header as it goes. That
// field-order approach has a real failure mode: visit_date's guess list
// includes the generic 'date', so if it's processed before dispensing_date,
// it can claim a "Dispensing Date" column for itself before dispensing_date
// (whose guesses are far more specific, e.g. 'dispensingdate') ever gets a
// turn — common in files that have only a dispensing-date column and no
// separate prescription-date column. Scoring globally means the more
// specific match always wins the header, regardless of field order.
export function autoMapHeaders(headers, fieldDefs) {
  const candidates = []
  fieldDefs.forEach(f => {
    headers.forEach(h => {
      const nh = normalizeKey(h)
      let bestGuessLen = 0
      f.guesses.forEach(g => {
        if (guessMatches(nh, g) && g.length > bestGuessLen) bestGuessLen = g.length
      })
      if (bestGuessLen > 0) candidates.push({ field: f.key, header: h, score: bestGuessLen })
    })
  })
  candidates.sort((a, b) => b.score - a.score)

  const mapping = {}
  fieldDefs.forEach(f => { mapping[f.key] = '' })
  const usedHeaders = new Set()
  const usedFields = new Set()
  candidates.forEach(({ field, header, score }) => {
    if (usedFields.has(field) || usedHeaders.has(header)) return
    mapping[field] = header
    usedFields.add(field)
    usedHeaders.add(header)
  })
  return mapping
}

// Reads the first sheet of an uploaded .xlsx/.xls/.csv file into JSON rows.
// Rejects (rather than silently producing an empty/garbled result) on
// unreadable files so callers can show a real error to the user.
export function parseSpreadsheetFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error(`Could not read "${file.name}"`))
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        if (!sheetName) throw new Error(`"${file.name}" has no sheets.`)
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
        const headers = rows.length ? Object.keys(rows[0]) : []
        resolve({ headers, rows, sheetName, fileName: file.name })
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
