import * as XLSX from 'xlsx-js-style'
import { CATEGORY_LABELS } from './matching'
import { MATCH_CATEGORIES } from './config'
import {
  mappedValue, facilityOf, voucherOf, originalAmount, approvedAmount, needsFraudReview, findRowValue
} from './cardHelpers'

export function draftSheetRows(cards, mapping) {
  return cards.map(c => ({
    ...c.row,
    status: c.status,
    pharma_compliance: c.classifications?.pharma ? 'Yes' : 'No',
    rssb_compliance: c.classifications?.rssb ? 'Yes' : 'No',
    fraud_activity: c.classifications?.fraud ? 'Yes' : 'No',
    prescription_date: c.prescriptionDate,
    facility_override: c.facilityOverride,
    deduction: c.deduction || 0,
    original_amount: originalAmount(c, mapping),
    approved_amount: approvedAmount(c, mapping),
    comment: c.comment,
    explanation: c.explanation
  }))
}

export function buildVerifiedWorkbook({ cards, mapping }) {
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
    approved_amount: approvedAmount(c, mapping)
  }))
  const ws = XLSX.utils.json_to_sheet(exportRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Verified')
  return wb
}

// Returns { workbook, completeCount, incompleteCount }. Vouchers missing a
// prescription date or facility are excluded from the categorized sheet
// (needsFraudReview) but are still counted so the caller can warn the user.
export function buildFraudReportWorkbook({ cards, headers, mapping }) {
  const fraudCards = cards.filter(c => c.classifications?.fraud)
  const incomplete = fraudCards.filter(c => needsFraudReview(c, mapping))
  const complete = fraudCards.filter(c => !needsFraudReview(c, mapping))

  const byFacility = {}
  complete.forEach(c => {
    const facility = facilityOf(c, mapping) || 'Unknown facility'
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
      const verifiedDate = c.prescriptionDate || mappedValue(c, 'visit_date', mapping) || ''
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
  const draftWs = XLSX.utils.json_to_sheet(draftSheetRows(cards, mapping))
  XLSX.utils.book_append_sheet(wb, draftWs, 'All Vouchers Draft')

  return { workbook: wb, completeCount: complete.length, incompleteCount: incomplete.length }
}

export function buildCounterReportWorkbook({ cards, mapping, counterHeader }) {
  const deducted = cards.filter(c => (parseFloat(c.deduction) || 0) > 0)

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
      voucherOf(c, mapping) || findRowValue(c, ['papercode', 'voucher', 'code']) || '',
      mappedValue(c, 'rama_number', mapping) || findRowValue(c, ['ramanumber']) || '',
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
  const draftWs = XLSX.utils.json_to_sheet(draftSheetRows(cards, mapping))
  XLSX.utils.book_append_sheet(wb, draftWs, 'All Vouchers Draft')
  return { workbook: wb, deductedCount: deducted.length }
}

export function buildMatchReportWorkbook({ cards, matchResults, matchNotes, categoryOf }) {
  const wb = XLSX.utils.book_new()
  const headerStyle = { font: { name: 'Calibri', sz: 11, bold: true } }

  MATCH_CATEGORIES.forEach(cat => {
    const rows = cards
      .filter(c => categoryOf(c.id) === cat)
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
    Count: cards.filter(c => categoryOf(c.id) === cat).length
  }))
  const summaryWs = XLSX.utils.json_to_sheet(summaryRows)
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  return wb
}
