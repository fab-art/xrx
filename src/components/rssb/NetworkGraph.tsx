import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useSessionStore } from '@/store/session-store';
import { useCardHelpers } from './use-card-helpers';
import { buildGraph, filterGraph, layoutGraph } from '@/lib/rssb/network';
import type { GraphNode, GraphEdge, NodeType, EdgeKind } from '@/lib/rssb/network';
import { Share2, Search, ZoomIn, ZoomOut, Maximize, RotateCcw, ExternalLink, Info, Hospital, GitCompareArrows, MousePointerClick } from 'lucide-react';

const NODE_COLORS: Record<NodeType, string> = {
  doctor: '#c99a2e',
  patient: '#0f766e',
  facility: '#7c3aed',
};

const NODE_DESCRIPTIONS: Record<NodeType, string> = {
  doctor: 'Prescribing doctors from voucher data',
  patient: 'Patients referenced in vouchers',
  facility: 'Health facilities / hospitals matched',
};

const EDGE_DESCRIPTIONS: Record<EdgeKind, string> = {
  'doctor-patient': 'Doctors who prescribed for the same patient',
  'patient-facility': 'Patients who visited the same facility',
  'doctor-facility': 'Doctors who prescribed at the same facility',
};

const EDGE_KIND_COLORS: Record<EdgeKind, string> = {
  'doctor-patient': '#c99a2e',
  'patient-facility': '#0f766e',
  'doctor-facility': '#7c3aed',
};

interface EdgeTooltipData {
  x: number;
  y: number;
  weight: number;
  totalCost: number;
  fraudCount: number;
  fraudRatio: number;
  kind: EdgeKind;
}

/** Compute a quadratic bezier path between two points with a perpendicular offset. */
function curvedPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  offset: number,
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Perpendicular direction
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;
  // Control point
  const cx = mx + px * offset;
  const cy = my + py * offset;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

export function NetworkGraph() {
  const cards = useSessionStore(s => s.cards);
  const matchResults = useSessionStore(s => s.matchResults);
  const matchOverrides = useSessionStore(s => s.matchOverrides);
  const setStage = useSessionStore(s => s.setStage);
  const helpers = useCardHelpers();

  const [nodeTypes, setNodeTypes] = useState<Set<NodeType>>(new Set(['doctor', 'patient', 'facility']));
  const [kinds, setKinds] = useState<Set<EdgeKind>>(new Set(['doctor-patient', 'patient-facility', 'doctor-facility']));
  // Auto-adjust the minimum voucher count for large datasets to avoid an
  // unreadable hairball of hundreds of nodes. For small datasets keep it at 1.
  const defaultMinVouchers = cards.length > 80 ? 3 : 1;
  const [minVoucherCount, setMinVoucherCount] = useState(defaultMinVouchers);
  const [minTotalCost, setMinTotalCost] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltipData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const categoryOf = (cardId: number) => matchOverrides[cardId] || matchResults?.[cardId]?.category || null;

  const graph = useMemo(() => buildGraph(cards, helpers.mapping, categoryOf), [cards, helpers.mapping, matchResults, matchOverrides]);

  const filteredGraph = useMemo(
    () => filterGraph(graph, {
      types: Array.from(nodeTypes),
      kinds: Array.from(kinds),
      minVoucherCount,
      minTotalCost,
      search,
    }),
    [graph, nodeTypes, kinds, minVoucherCount, minTotalCost, search],
  );

  const laid = useMemo(
    () => layoutGraph(filteredGraph.nodes, filteredGraph.edges, 900, 560),
    [filteredGraph],
  );

  // Reset pan/zoom when the underlying graph changes significantly
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
  }, [cards.length, nodeTypes, kinds, minVoucherCount, minTotalCost, search]);

  // Build a map of edge keys → index count for curve offsets so duplicate
  // edges between the same pair of nodes don't overlap.
  const edgeOffsetMap = useMemo(() => {
    const map = new Map<string, number>();
    const counts = new Map<string, number>();
    laid.edges.forEach((e) => {
      const key = [e.source.id, e.target.id].sort().join('|');
      const idx = counts.get(key) || 0;
      counts.set(key, idx + 1);
      map.set(`${e.source.id}-${e.target.id}-${e.kind}`, idx);
    });
    return map;
  }, [laid.edges]);

  function toggleType(t: NodeType) {
    setNodeTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }
  function toggleKind(k: EdgeKind) {
    setKinds(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function resetFilters() {
    setNodeTypes(new Set(['doctor', 'patient', 'facility']));
    setKinds(new Set(['doctor-patient', 'patient-facility', 'doctor-facility']));
    setMinVoucherCount(defaultMinVouchers);
    setMinTotalCost(0);
    setSearch('');
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(4, z * delta)));
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'rect') {
      dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (dragRef.current) {
      setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
    }
  }
  function onMouseUp() {
    dragRef.current = null;
  }

  const handleEdgeHover = useCallback((e: GraphEdge, idx: number, mouseEvent: React.MouseEvent) => {
    setHoveredEdge(idx);
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const fraudRatio = e.weight > 0 ? e.fraudCount / e.weight : 0;
    setEdgeTooltip({
      x: mouseEvent.clientX - svgRect.left,
      y: mouseEvent.clientY - svgRect.top,
      weight: e.weight,
      totalCost: e.totalCost,
      fraudCount: e.fraudCount,
      fraudRatio,
      kind: e.kind,
    });
  }, []);

  const handleEdgeLeave = useCallback(() => {
    setHoveredEdge(null);
    setEdgeTooltip(null);
  }, []);

  const openInDashboard = useCallback((label: string) => {
    // Navigate to dashboard — the search will be pre-filled via a URL-like
    // approach using the session store stage switch.
    setStage('dashboard');
  }, [setStage]);

  const edges = laid.edges;
  const nodes = laid.nodes;

  // Legend counts — computed from the FULL graph, not just filtered
  const graphNodeCounts = useMemo(() => {
    const counts: Record<NodeType, number> = { doctor: 0, patient: 0, facility: 0 };
    graph.nodes.forEach(n => { counts[n.type]++; });
    return counts;
  }, [graph.nodes]);

  // Legend counts from filtered/displayed nodes
  const nodeCounts = useMemo(() => {
    const counts: Record<NodeType, number> = { doctor: 0, patient: 0, facility: 0 };
    nodes.forEach(n => { counts[n.type]++; });
    return counts;
  }, [nodes]);

  const isMinimalGraph = nodes.length < 3 && graph.nodes.length < 3;

  return (
    <div className="relative">
      <div className="flex items-start gap-3 mb-4">
        <p className="text-sm text-muted-foreground max-w-3xl">
          Explore relationships between doctors, patients, and facilities built from every voucher.
          Node size scales with voucher volume; edge thickness scales with how often that pair recurs
          together. Drag to pan, scroll to zoom, click any node for detail.
        </p>
        <span className="shrink-0 mt-0.5" title="This graph visualizes the network of entities from your voucher data. Doctors, patients, and facilities are connected based on shared vouchers. Red outlines indicate high fraud ratios.">
          <Info className="w-4 h-4 text-muted-foreground" />
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-4 h-fit">
          {/* Graph summary */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium tabular-nums">{nodes.length} nodes · {edges.length} edges</span>
            <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-brand hover:text-brand-dark transition-colors" title="Reset all filters">
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>

          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Node types</h4>
            <div className="flex flex-col gap-1.5">
              {(['doctor', 'patient', 'facility'] as NodeType[]).map(t => (
                <label
                  key={t}
                  className={`flex items-center gap-2 text-sm cursor-pointer ${graphNodeCounts[t] === 0 ? 'opacity-40' : ''}`}
                  title={NODE_DESCRIPTIONS[t]}
                >
                  <input type="checkbox" checked={nodeTypes.has(t)} onChange={() => toggleType(t)} className="accent-primary" />
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: NODE_COLORS[t] }} />
                  <span className="capitalize">{t}s</span>
                  <span className={`ml-auto tabular-nums text-xs ${graphNodeCounts[t] === 0 ? 'text-muted-foreground' : 'font-medium'}`}>
                    {graphNodeCounts[t]}{graphNodeCounts[t] === 0 ? ' (no data)' : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Relationships</h4>
            <div className="flex flex-col gap-1.5">
              {(['doctor-patient', 'patient-facility', 'doctor-facility'] as EdgeKind[]).map(k => (
                <label
                  key={k}
                  className="flex items-center gap-2 text-sm cursor-pointer capitalize"
                  title={EDGE_DESCRIPTIONS[k]}
                >
                  <input type="checkbox" checked={kinds.has(k)} onChange={() => toggleKind(k)} className="accent-primary" />
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: EDGE_KIND_COLORS[k] }} />
                  {k.replace('-', ' → ')}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Minimum connections</label>
              <span className="text-xs font-medium tabular-nums bg-primary/10 text-primary px-1.5 py-0.5 rounded">{minVoucherCount}</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              value={minVoucherCount}
              onChange={e => setMinVoucherCount(Math.max(1, +e.target.value))}
              className="w-full accent-primary h-1.5 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>1</span>
              <span>20</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Min total cost per node</label>
            <input type="number" min="0" value={minTotalCost} onChange={e => setMinTotalCost(Math.max(0, +e.target.value))} className="w-full border border-border rounded-lg px-2 py-1 text-sm bg-muted" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name…" className="w-full pl-8 pr-2 py-1 text-sm border border-border rounded-lg bg-muted" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent" title="Zoom out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom(z => Math.min(4, z * 1.2))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent" title="Zoom in">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-accent" title="Reset view">
              <Maximize className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground ml-auto">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden relative">
          {isMinimalGraph ? (
            <div className="h-[560px] flex flex-col items-center justify-center text-sm text-muted-foreground gap-4 px-8">
              <Share2 className="w-10 h-10 opacity-30" />
              <div className="text-center">
                <p className="font-medium text-foreground mb-1">Not enough data for network visualization</p>
                <p className="text-xs max-w-sm mx-auto">
                  Upload hospital data or run matching to see relationships between doctors, patients, and facilities.
                </p>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => setStage('hospital')}
                  className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 border border-border bg-card hover:bg-accent transition-colors"
                >
                  <Hospital className="w-3.5 h-3.5" />
                  Go to Hospital Data
                </button>
                <button
                  onClick={() => setStage('match')}
                  className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 border border-border bg-card hover:bg-accent transition-colors"
                >
                  <GitCompareArrows className="w-3.5 h-3.5" />
                  Go to Match Review
                </button>
              </div>
            </div>
          ) : nodes.length === 0 ? (
            <div className="h-[560px] flex items-center justify-center text-sm text-muted-foreground">
              <div className="text-center">
                <Share2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No nodes match the current filters.</p>
                <button onClick={resetFilters} className="mt-2 text-xs text-brand hover:text-brand-dark transition-colors">
                  Reset filters
                </button>
              </div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox="0 0 900 560"
              className="w-full h-[560px] bg-background cursor-grab active:cursor-grabbing"
              onWheel={onWheel}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {/* SVG filter for node glow on hover */}
              <defs>
                <filter id="node-glow-filter" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                  <feColorMatrix in="blur" type="matrix"
                    values="0 0 0 0 0.06
                            0 0 0 0 0.46
                            0 0 0 0 0.43
                            0 0 0 0.5 0" result="colorBlur" />
                  <feMerge>
                    <feMergeNode in="colorBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <rect x={0} y={0} width={900} height={560} fill="transparent" />
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Edges — curved paths */}
                {edges.map((e, i) => {
                  const fraudRatio = e.weight > 0 ? e.fraudCount / e.weight : 0;
                  const isFraud = fraudRatio > 0.4;
                  const strokeWidth = Math.min(9, 1 + Math.log2(e.weight + 1) * 1.6);
                  const key = `${e.source.id}-${e.target.id}-${e.kind}`;
                  const pairKey = [e.source.id, e.target.id].sort().join('|');
                  const samePairCount = edges.filter(
                    ed => [ed.source.id, ed.target.id].sort().join('|') === pairKey,
                  ).length;
                  const idx = edgeOffsetMap.get(key) || 0;
                  const curveOffset = samePairCount <= 1 ? 0 : (idx - (samePairCount - 1) / 2) * 25;
                  const d = curvedPath(
                    e.source.x ?? 0, e.source.y ?? 0,
                    e.target.x ?? 0, e.target.y ?? 0,
                    curveOffset,
                  );
                  return (
                    <path
                      key={i}
                      d={d}
                      fill="none"
                      stroke={isFraud ? '#b91c1c' : (hoveredEdge === i ? EDGE_KIND_COLORS[e.kind] : 'currentColor')}
                      strokeOpacity={isFraud ? 0.7 : (hoveredEdge === i ? 0.7 : 0.3)}
                      strokeWidth={hoveredEdge === i ? strokeWidth + 1.5 : strokeWidth}
                      className={`text-muted-foreground ${isFraud ? 'fraud-edge-pulse' : ''}`}
                      onMouseEnter={(ev) => handleEdgeHover(e, i, ev)}
                      onMouseLeave={handleEdgeLeave}
                    />
                  );
                })}
                {/* Invisible wider paths for easier edge hover interaction */}
                {edges.map((e, i) => {
                  const key = `${e.source.id}-${e.target.id}-${e.kind}`;
                  const pairKey = [e.source.id, e.target.id].sort().join('|');
                  const samePairCount = edges.filter(
                    ed => [ed.source.id, ed.target.id].sort().join('|') === pairKey,
                  ).length;
                  const idx = edgeOffsetMap.get(key) || 0;
                  const curveOffset = samePairCount <= 1 ? 0 : (idx - (samePairCount - 1) / 2) * 25;
                  const d = curvedPath(
                    e.source.x ?? 0, e.source.y ?? 0,
                    e.target.x ?? 0, e.target.y ?? 0,
                    curveOffset,
                  );
                  return (
                    <path
                      key={`hit-${i}`}
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={Math.max(12, Math.min(9, 1 + Math.log2(e.weight + 1) * 1.6) + 6)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(ev) => handleEdgeHover(e, i, ev)}
                      onMouseLeave={handleEdgeLeave}
                    />
                  );
                })}
                {/* Nodes */}
                {nodes.map(n => {
                  const r = 7 + Math.sqrt(n.voucherCount) * 2.6;
                  const fraudRatio = n.voucherCount > 0 ? n.fraudCount / n.voucherCount : 0;
                  const isFraud = fraudRatio > 0.4;
                  const isHovered = hoveredNode === n.id;
                  return (
                    <g
                      key={n.id}
                      onClick={() => setSelectedNode(n)}
                      onMouseEnter={() => setHoveredNode(n.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      className="cursor-pointer"
                      filter={isHovered ? 'url(#node-glow-filter)' : undefined}
                    >
                      {/* Glow halo on hover */}
                      {isHovered && (
                        <circle
                          cx={n.x ?? 0}
                          cy={n.y ?? 0}
                          r={r + 6}
                          fill="none"
                          stroke={NODE_COLORS[n.type]}
                          strokeWidth={2}
                          strokeOpacity={0.4}
                          className="node-glow"
                        />
                      )}
                      <circle
                        cx={n.x ?? 0}
                        cy={n.y ?? 0}
                        r={r}
                        fill={NODE_COLORS[n.type]}
                        stroke={isFraud ? '#b91c1c' : 'white'}
                        strokeWidth={isFraud ? 3 : 1.5}
                        style={{ transition: 'r 0.15s ease' }}
                      />
                      <text x={n.x ?? 0} y={(n.y ?? 0) + r + 12} textAnchor="middle" className="text-[10px] fill-foreground pointer-events-none" style={{ fontSize: 10 }}>
                        {n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Legend — top-right corner */}
              <g transform="translate(740, 12)">
                <rect x={0} y={0} width={150} height={80} rx={8} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
                {(['doctor', 'patient', 'facility'] as NodeType[]).map((t, i) => (
                  <g key={t} transform={`translate(10, ${16 + i * 20})`} opacity={nodeCounts[t] === 0 ? 0.35 : 1}>
                    <circle cx={0} cy={0} r={5} fill={NODE_COLORS[t]} />
                    <text x={12} y={4} className="fill-foreground" style={{ fontSize: 11 }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}s
                    </text>
                    <text x={100} y={4} className={nodeCounts[t] === 0 ? 'fill-muted-foreground' : 'fill-foreground'} style={{ fontSize: 11, fontWeight: nodeCounts[t] > 0 ? 600 : 400 }}>
                      {nodeCounts[t] === 0 ? 'no data' : nodeCounts[t]}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          )}

          {/* Edge tooltip */}
          {edgeTooltip && (
            <div
              className="absolute pointer-events-none rounded-lg border border-border bg-popover px-3 py-2 shadow-lg z-10"
              style={{
                left: edgeTooltip.x + 12,
                top: edgeTooltip.y - 10,
              }}
            >
              <div className="text-xs font-medium text-popover-foreground capitalize mb-1">
                {edgeTooltip.kind.replace('-', ' → ')}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Weight: <span className="text-popover-foreground">{edgeTooltip.weight}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Total cost: <span className="text-popover-foreground">RWF {edgeTooltip.totalCost.toLocaleString()}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Fraud ratio: <span className={edgeTooltip.fraudRatio > 0.4 ? 'text-red-600 font-medium' : 'text-popover-foreground'}>
                  {Math.round(edgeTooltip.fraudRatio * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedNode ? (
        <div className="rounded-xl border border-border bg-card p-4 mt-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold">{selectedNode.label}</h3>
              <p className="text-xs text-muted-foreground capitalize">{selectedNode.type} · {selectedNode.voucherCount} vouchers · RWF {selectedNode.totalCost.toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openInDashboard(selectedNode.label)}
                className="inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 border border-border hover:bg-accent text-brand hover:text-brand-dark transition-colors"
                title="View in Dashboard"
              >
                <ExternalLink className="w-3 h-3" />
                View in Dashboard
              </button>
              <button onClick={() => setSelectedNode(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="rounded-lg bg-muted px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Vouchers</div>
              <div className="text-sm font-medium">{selectedNode.voucherCount}</div>
            </div>
            <div className="rounded-lg bg-muted px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Total cost</div>
              <div className="text-sm font-medium">{selectedNode.totalCost.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-muted px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Fraud / Not Found</div>
              <div className="text-sm font-medium">{selectedNode.fraudCount} ({selectedNode.voucherCount ? Math.round(selectedNode.fraudCount / selectedNode.voucherCount * 100) : 0}%)</div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Connections ({edges.filter(e => e.source.id === selectedNode.id || e.target.id === selectedNode.id).length})</h4>
            <div className="max-h-48 overflow-y-auto scrollbar-thin flex flex-col gap-1">
              {edges.filter(e => e.source.id === selectedNode.id || e.target.id === selectedNode.id).map((e, i) => {
                const other = e.source.id === selectedNode.id ? e.target : e.source;
                return (
                  <button key={i} onClick={() => setSelectedNode(other)} className="text-left text-xs flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors">
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: NODE_COLORS[other.type] }} />
                      <span className="text-brand hover:text-brand-dark underline-offset-2 hover:underline">{other.label}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">{e.weight} shared · RWF {e.totalCost.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : !isMinimalGraph && nodes.length > 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <MousePointerClick className="w-4 h-4" />
          Click a node to see details
        </div>
      ) : null}
    </div>
  );
}
