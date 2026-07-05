import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'

export function normalizeLabel(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim().toUpperCase().replace(/\s+/g, ' ')
}

function nodeId(type, label) {
  return `${type}:${label}`
}

export const EDGE_KINDS = [
  ['doctor-patient', 'Doctor ↔ Patient'],
  ['patient-facility', 'Patient ↔ Facility'],
  ['doctor-facility', 'Doctor ↔ Facility']
]

export const NODE_TYPES = [
  ['doctor', 'Doctor'],
  ['patient', 'Patient'],
  ['facility', 'Facility']
]

// Builds the full relationship graph from voucher rows: nodes are doctors,
// patients, and facilities; edges connect any two entities that co-occur on
// the same voucher, weighted by how often that pairing recurs and how much
// cost flowed through it. categoryOf(cardId) optionally tags each voucher's
// contribution with its match-review category so fraud-heavy relationships
// can be visually surfaced.
export function buildGraph(cards, mapping, categoryOf) {
  const nodes = new Map()
  const edges = new Map()

  function ensureNode(type, rawLabel) {
    const label = normalizeLabel(rawLabel)
    if (!label) return null
    const id = nodeId(type, label)
    if (!nodes.has(id)) {
      nodes.set(id, {
        id, type, label: String(rawLabel).trim() || label,
        voucherCount: 0, totalCost: 0, fraudCount: 0, voucherIds: []
      })
    }
    return nodes.get(id)
  }

  function ensureEdge(a, b, kind) {
    if (!a || !b || a.id === b.id) return null
    const key = a.id < b.id ? `${a.id}|${b.id}|${kind}` : `${b.id}|${a.id}|${kind}`
    if (!edges.has(key)) {
      edges.set(key, {
        id: key, source: a.id, target: b.id, kind,
        weight: 0, totalCost: 0, fraudCount: 0, voucherIds: []
      })
    }
    return edges.get(key)
  }

  cards.forEach(c => {
    const patientRaw = mapping.patient_name ? c.row[mapping.patient_name] : ''
    const doctorRaw = mapping.doctor_name ? c.row[mapping.doctor_name] : ''
    const facilityRaw = mapping.facility_name ? c.row[mapping.facility_name] : ''
    const amount = parseFloat(mapping.amount ? c.row[mapping.amount] : NaN)
    const cost = isNaN(amount) ? 0 : amount
    const category = categoryOf ? categoryOf(c.id) : null
    const isFraudish = category === 'fraud_risk' || category === 'orphan'

    const patientNode = ensureNode('patient', patientRaw)
    const doctorNode = ensureNode('doctor', doctorRaw)
    const facilityNode = ensureNode('facility', facilityRaw)
    ;[patientNode, doctorNode, facilityNode].forEach(n => {
      if (!n) return
      n.voucherCount += 1
      n.totalCost += cost
      if (isFraudish) n.fraudCount += 1
      n.voucherIds.push(c.id)
    })

    const pairs = [
      [patientNode, doctorNode, 'doctor-patient'],
      [patientNode, facilityNode, 'patient-facility'],
      [doctorNode, facilityNode, 'doctor-facility']
    ]
    pairs.forEach(([a, b, kind]) => {
      const e = ensureEdge(a, b, kind)
      if (!e) return
      e.weight += 1
      e.totalCost += cost
      if (isFraudish) e.fraudCount += 1
      e.voucherIds.push(c.id)
    })
  })

  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) }
}

// Applies user-selected filters: which node types to show, which relationship
// kinds to show, minimum voucher count / cost thresholds (useful for isolating
// high-volume or high-value relationships), and a search term. Searching
// keeps the matched node(s) plus their direct neighbors for context.
export function filterGraph(graph, { types, kinds, minVoucherCount, minTotalCost, search }) {
  let nodes = graph.nodes.filter(n => types.includes(n.type))
  if (minVoucherCount > 1) nodes = nodes.filter(n => n.voucherCount >= minVoucherCount)
  if (minTotalCost > 0) nodes = nodes.filter(n => n.totalCost >= minTotalCost)

  if (search && search.trim()) {
    const q = search.trim().toLowerCase()
    const matchedIds = new Set(nodes.filter(n => n.label.toLowerCase().includes(q)).map(n => n.id))
    const contextIds = new Set(matchedIds)
    graph.edges.forEach(e => {
      if (matchedIds.has(e.source)) contextIds.add(e.target)
      if (matchedIds.has(e.target)) contextIds.add(e.source)
    })
    nodes = graph.nodes.filter(n => contextIds.has(n.id) && types.includes(n.type))
  }

  const nodeIds = new Set(nodes.map(n => n.id))
  const edges = graph.edges.filter(e => kinds.includes(e.kind) && nodeIds.has(e.source) && nodeIds.has(e.target))
  return { nodes, edges }
}

// Runs a fixed-iteration force simulation synchronously (no continuous
// animation loop) and returns nodes/edges with x/y positions attached, plus
// edge.source/target resolved to node object references.
export function layoutGraph(nodes, edges, width, height) {
  const nodeCopies = nodes.map(n => ({ ...n }))
  const edgeCopies = edges.map(e => ({ ...e }))
  if (!nodeCopies.length) return { nodes: nodeCopies, edges: edgeCopies }

  const sim = forceSimulation(nodeCopies)
    .force('link', forceLink(edgeCopies).id(d => d.id).distance(e => 55 + Math.min(160, e.weight * 8)).strength(0.25))
    .force('charge', forceManyBody().strength(-150))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collide', forceCollide(d => 9 + Math.sqrt(d.voucherCount || 1) * 3))
    .stop()

  for (let i = 0; i < 250; i++) sim.tick()
  return { nodes: nodeCopies, edges: edgeCopies }
}
