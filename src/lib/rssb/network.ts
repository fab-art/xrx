// Network graph builder — ported from network.js. Uses d3-force.

import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import type { Card, MatchCategory, Mapping } from './types';
import { mappedValue } from './cardHelpers';

export type NodeType = 'doctor' | 'patient' | 'facility';
export type EdgeKind = 'doctor-patient' | 'patient-facility' | 'doctor-facility';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  voucherCount: number;
  totalCost: number;
  fraudCount: number;
  voucherIds: number[];
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  weight: number;
  totalCost: number;
  fraudCount: number;
  voucherIds: number[];
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildGraph(
  cards: Card[],
  mapping: Mapping,
  categoryOf: (cardId: number) => MatchCategory | null,
): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  function getNode(id: string, type: NodeType, label: string): GraphNode {
    if (!nodes.has(id)) {
      nodes.set(id, { id, type, label, voucherCount: 0, totalCost: 0, fraudCount: 0, voucherIds: [] });
    }
    return nodes.get(id)!;
  }

  function getEdge(a: string, b: string, kind: EdgeKind): GraphEdge {
    const key = [a, b].sort().join('|') + '|' + kind;
    if (!edges.has(key)) {
      edges.set(key, { source: a, target: b, kind, weight: 0, totalCost: 0, fraudCount: 0, voucherIds: [] });
    }
    return edges.get(key)!;
  }

  cards.forEach(c => {
    const doctor = String(mappedValue(c, 'doctor_name', mapping) || '').trim();
    const patient = String(mappedValue(c, 'patient_name', mapping) || '').trim();
    const facility = String(mappedValue(c, 'facility_name', mapping) || '').trim();
    const amount = parseFloat(String(mappedValue(c, 'amount', mapping))) || 0;
    const cat = categoryOf(c.id);
    const isFraud = cat === 'fraud_risk' || cat === 'orphan' || !!c.classifications?.fraud;

    const present: Array<[string, NodeType, string]> = [];
    if (doctor) present.push([`doctor:${doctor}`, 'doctor', doctor]);
    if (patient) present.push([`patient:${patient}`, 'patient', patient]);
    if (facility) present.push([`facility:${facility}`, 'facility', facility]);

    present.forEach(([id, type, label]) => {
      const n = getNode(id, type, label);
      n.voucherCount += 1;
      n.totalCost += amount;
      if (isFraud) n.fraudCount += 1;
      n.voucherIds.push(c.id);
    });

    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const [aId, aType] = present[i];
        const [bId, bType] = present[j];
        const kind: EdgeKind = `${aType}-${bType}` as EdgeKind;
        const e = getEdge(aId, bId, kind);
        e.weight += 1;
        e.totalCost += amount;
        if (isFraud) e.fraudCount += 1;
        e.voucherIds.push(c.id);
      }
    }
  });

  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) };
}

export interface GraphFilter {
  types?: NodeType[];
  kinds?: EdgeKind[];
  minVoucherCount?: number;
  minTotalCost?: number;
  search?: string;
}

export function filterGraph(graph: Graph, filter: GraphFilter): Graph {
  const { types, kinds, minVoucherCount, minTotalCost, search } = filter;
  let nodes = graph.nodes;
  if (types && types.length) nodes = nodes.filter(n => types.includes(n.type));
  if (minVoucherCount) nodes = nodes.filter(n => n.voucherCount >= minVoucherCount);
  if (minTotalCost) nodes = nodes.filter(n => n.totalCost >= minTotalCost);

  const nodeIds = new Set(nodes.map(n => n.id));
  let edges = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  if (kinds && kinds.length) edges = edges.filter(e => kinds.includes(e.kind));

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    const matched = nodes.filter(n => n.label.toLowerCase().includes(q));
    const keep = new Set<string>();
    matched.forEach(n => {
      keep.add(n.id);
      edges.forEach(e => {
        if (e.source === n.id) keep.add(e.target);
        if (e.target === n.id) keep.add(e.source);
      });
    });
    nodes = nodes.filter(n => keep.has(n.id));
    edges = edges.filter(e => keep.has(e.source) && keep.has(e.target));
  }

  return { nodes, edges };
}

export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): { nodes: GraphNode[]; edges: Array<{ source: GraphNode; target: GraphNode; kind: EdgeKind; weight: number; totalCost: number; fraudCount: number; voucherIds: number[] }> } {
  if (!nodes.length) return { nodes, edges: [] };

  const nodeMap = new Map(nodes.map(n => [n.id, { ...n }]));
  const simNodes = Array.from(nodeMap.values());
  // Keep a parallel array of metadata since d3-force mutates source/target
  const validEdges = edges.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target));
  const meta = validEdges.map(e => ({
    kind: e.kind,
    weight: e.weight,
    totalCost: e.totalCost,
    fraudCount: e.fraudCount,
    voucherIds: e.voucherIds,
  }));
  const simLinks = validEdges.map(e => ({ source: e.source, target: e.target }));

  const simulation = forceSimulation(simNodes as any)
    .force('charge', forceManyBody().strength(-120))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collide', forceCollide(20))
    .force('link', forceLink(simLinks as any).id((d: any) => d.id).distance(70).strength(0.2));

  simulation.stop();
  for (let i = 0; i < 250; i++) simulation.tick();

  // After simulation, simLinks[i].source/target are resolved to node objects.
  const outEdges = simLinks.map((l: any, i: number) => ({
    source: l.source as GraphNode,
    target: l.target as GraphNode,
    kind: meta[i].kind,
    weight: meta[i].weight,
    totalCost: meta[i].totalCost,
    fraudCount: meta[i].fraudCount,
    voucherIds: meta[i].voucherIds,
  }));

  return { nodes: simNodes as GraphNode[], edges: outEdges };
}
