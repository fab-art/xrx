import { describe, it, expect } from 'vitest'
import { buildGraph, filterGraph } from '../network'

const mapping = {
  patient_name: 'Patient',
  doctor_name: 'Doctor',
  facility_name: 'Facility',
  amount: 'Amount'
}

function card(id, patient, doctor, facility, amount) {
  return { id, row: { Patient: patient, Doctor: doctor, Facility: facility, Amount: amount } }
}

describe('buildGraph', () => {
  it('creates one node per distinct doctor/patient/facility', () => {
    const cards = [
      card(1, 'Alice', 'Dr Smith', 'Neza Pharmacy', 1000),
      card(2, 'Bob', 'Dr Smith', 'Neza Pharmacy', 2000)
    ]
    const { nodes } = buildGraph(cards, mapping)
    const byType = nodes.reduce((acc, n) => ({ ...acc, [n.type]: (acc[n.type] || 0) + 1 }), {})
    expect(byType.patient).toBe(2)
    expect(byType.doctor).toBe(1)
    expect(byType.facility).toBe(1)
  })

  it('aggregates voucher count and total cost onto a shared doctor-patient edge', () => {
    const cards = [
      card(1, 'Alice', 'Dr Smith', 'Neza Pharmacy', 1000),
      card(2, 'Alice', 'Dr Smith', 'Neza Pharmacy', 500)
    ]
    const { edges } = buildGraph(cards, mapping)
    const docPatient = edges.find(e => e.kind === 'doctor-patient')
    expect(docPatient.weight).toBe(2)
    expect(docPatient.totalCost).toBe(1500)
  })

  it('tags nodes and edges as fraud-related when categoryOf marks the voucher fraud_risk or orphan', () => {
    const cards = [
      card(1, 'Alice', 'Dr Smith', 'Neza Pharmacy', 1000),
      card(2, 'Alice', 'Dr Smith', 'Neza Pharmacy', 1000)
    ]
    const categoryOf = id => (id === 1 ? 'fraud_risk' : 'clean')
    const { nodes } = buildGraph(cards, mapping, categoryOf)
    const patientNode = nodes.find(n => n.type === 'patient')
    expect(patientNode.fraudCount).toBe(1)
    expect(patientNode.voucherCount).toBe(2)
  })

  it('does not create a self-loop when a value is missing (empty facility)', () => {
    const cards = [card(1, 'Alice', 'Dr Smith', '', 1000)]
    const { nodes, edges } = buildGraph(cards, mapping)
    expect(nodes.some(n => n.type === 'facility')).toBe(false)
    expect(edges.some(e => e.kind === 'patient-facility')).toBe(false)
  })
})

describe('filterGraph', () => {
  const cards = [
    card(1, 'Alice', 'Dr Smith', 'Neza Pharmacy', 1000),
    card(2, 'Bob', 'Dr Jones', 'Kigali Clinic', 2000)
  ]
  const graph = buildGraph(cards, mapping)

  it('restricts nodes to the selected types', () => {
    const result = filterGraph(graph, { types: ['doctor'], kinds: ['doctor-patient', 'patient-facility', 'doctor-facility'], minVoucherCount: 1, minTotalCost: 0, search: '' })
    expect(result.nodes.every(n => n.type === 'doctor')).toBe(true)
  })

  it('search keeps the matched node plus its direct neighbors', () => {
    const result = filterGraph(graph, { types: ['doctor', 'patient', 'facility'], kinds: ['doctor-patient', 'patient-facility', 'doctor-facility'], minVoucherCount: 1, minTotalCost: 0, search: 'Alice' })
    const labels = result.nodes.map(n => n.label)
    expect(labels).toContain('Alice')
    expect(labels).toContain('Dr Smith')
    expect(labels).not.toContain('Bob')
  })

  it('minTotalCost filters out low-value nodes', () => {
    const result = filterGraph(graph, { types: ['patient'], kinds: ['doctor-patient', 'patient-facility', 'doctor-facility'], minVoucherCount: 1, minTotalCost: 1500, search: '' })
    expect(result.nodes.map(n => n.label)).toEqual(['Bob'])
  })
})
