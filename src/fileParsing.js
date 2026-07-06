import * as XLSX from 'xlsx-js-style'

export function normalizeKey(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Greedy best-guess column mapping: for each field definition, pick the
// unused header whose normalized text contains the longest matching guess.
// Longest-guess-wins avoids e.g. "date" claiming a column that "prescriptiondate"
// should get.
export function autoMapHeaders(headers, fieldDefs) {
  const mapping = {}
  const usedHeaders = new Set()
  fieldDefs.forEach(f => {
    let best = ''
    let bestScore = 0
    headers.forEach(h => {
      if (usedHeaders.has(h)) return
      const nh = normalizeKey(h)
      f.guesses.forEach(g => {
        if (nh.includes(g) && g.length > bestScore) {
          bestScore = g.length
          best = h
        }
      })
    })
    mapping[f.key] = best
    if (best) usedHeaders.add(best)
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
