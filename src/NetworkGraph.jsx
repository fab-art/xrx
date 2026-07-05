import { useMemo, useState, useRef, useEffect } from 'react'
import { buildGraph, filterGraph, layoutGraph, EDGE_KINDS, NODE_TYPES } from './network'

const NODE_COLORS = { doctor: '#c99a2e', patient: '#1e3a8a', facility: '#0f766e' }
const WIDTH = 900
const HEIGHT = 560

export default function NetworkGraph({ cards, mapping, matchResults, matchOverrides }) {
  const [types, setTypes] = useState(['doctor', 'patient', 'facility'])
  const [kinds, setKinds] = useState(['doctor-patient', 'patient-facility', 'doctor-facility'])
  const [minVoucherCount, setMinVoucherCount] = useState(1)
  const [minTotalCost, setMinTotalCost] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [showFilters, setShowFilters] = useState(true)
  const [positions, setPositions] = useState({}) // nodeId -> {x,y} manual drag overrides
  const panRef = useRef(null)
  const dragNodeRef = useRef(null)
  const svgRef = useRef(null)

  function categoryOf(cardId) {
    if (matchOverrides[cardId]) return matchOverrides[cardId]
    return matchResults?.[cardId]?.category || null
  }

  const fullGraph = useMemo(
    () => buildGraph(cards, mapping, matchResults ? categoryOf : null),
    [cards, mapping, matchResults, matchOverrides]
  )

  // Clear manual drag positions only when the underlying data changes (not on
  // filter changes), so repositioning survives toggling filters/search.
  useEffect(() => { setPositions({}) }, [cards, mapping])

  const filtered = useMemo(
    () => filterGraph(fullGraph, { types, kinds, minVoucherCount: Number(minVoucherCount) || 1, minTotalCost: Number(minTotalCost) || 0, search }),
    [fullGraph, types, kinds, minVoucherCount, minTotalCost, search]
  )

  const layout = useMemo(() => layoutGraph(filtered.nodes, filtered.edges, WIDTH, HEIGHT), [filtered])

  const nodeById = useMemo(() => {
    const m = new Map()
    layout.nodes.forEach(n => m.set(n.id, n))
    return m
  }, [layout])

  function getXY(node) {
    return positions[node.id] || { x: node.x, y: node.y }
  }

  const selected = selectedId ? nodeById.get(selectedId) : null
  const selectedEdges = useMemo(() => {
    if (!selected) return []
    return layout.edges
      .filter(e => (e.source.id || e.source) === selected.id || (e.target.id || e.target) === selected.id)
      .sort((a, b) => b.weight - a.weight)
  }, [selected, layout])

  const selectedVouchers = useMemo(() => {
    if (!selected) return []
    const idSet = new Set(selected.voucherIds)
    return cards.filter(c => idSet.has(c.id))
  }, [selected, cards])

  function toggle(list, setList, val) {
    setList(list.includes(val) ? list.filter(x => x !== val) : [...list, val])
  }

  function screenToGraph(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = (clientX - rect.left) * (WIDTH / rect.width)
    const svgY = (clientY - rect.top) * (HEIGHT / rect.height)
    return { x: (svgX - view.x) / view.scale, y: (svgY - view.y) / view.scale }
  }

  function handleWheel(e) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setView(v => ({ ...v, scale: Math.min(4, Math.max(0.2, v.scale * delta)) }))
  }

  function handleCanvasMouseDown(e) {
    panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }

  function handleNodeMouseDown(e, node) {
    e.stopPropagation()
    const start = screenToGraph(e.clientX, e.clientY)
    const current = getXY(node)
    dragNodeRef.current = { id: node.id, offX: current.x - start.x, offY: current.y - start.y }
  }

  function handleMouseMove(e) {
    if (dragNodeRef.current) {
      const g = screenToGraph(e.clientX, e.clientY)
      const { id, offX, offY } = dragNodeRef.current
      setPositions(p => ({ ...p, [id]: { x: g.x + offX, y: g.y + offY } }))
      return
    }
    if (panRef.current) {
      setView(v => ({ ...v, x: panRef.current.vx + (e.clientX - panRef.current.x), y: panRef.current.vy + (e.clientY - panRef.current.y) }))
    }
  }

  function stopDrag() {
    panRef.current = null
    dragNodeRef.current = null
  }

  function resetView() { setView({ scale: 1, x: 0, y: 0 }) }
  function resetLayout() { setPositions({}) }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 items-start">
        {showFilters && (
          <aside className="w-60 shrink-0 rounded-card border border-border bg-surface-1 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide">Filters</h3>
              <button onClick={() => setShowFilters(false)} title="Hide filters to expand the canvas"
                className="text-xs border border-border rounded-lg px-2 py-1 hover:bg-surface-2">
                Hide ⏴
              </button>
            </div>
            <div>
              <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Node types</h3>
              <div className="flex flex-col gap-1.5">
                {NODE_TYPES.map(([key, label]) => (
                  <label key={key} className="text-sm flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={types.includes(key)} onChange={() => toggle(types, setTypes, key)} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: NODE_COLORS[key] }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Relationship types</h3>
              <div className="flex flex-col gap-1.5">
                {EDGE_KINDS.map(([key, label]) => (
                  <label key={key} className="text-sm flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={kinds.includes(key)} onChange={() => toggle(kinds, setKinds, key)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted uppercase tracking-wide block mb-1">Min vouchers per node</label>
              <input type="number" min="1" value={minVoucherCount} onChange={e => setMinVoucherCount(e.target.value)}
                className="w-full border border-border rounded-lg px-2 py-1 text-sm bg-surface-2" />
              <p className="text-xs text-ink-muted mt-1">Raise this to isolate high-volume doctors, patients, or facilities.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted uppercase tracking-wide block mb-1">Min total cost per node</label>
              <input type="number" min="0" value={minTotalCost} onChange={e => setMinTotalCost(e.target.value)}
                className="w-full border border-border rounded-lg px-2 py-1 text-sm bg-surface-2" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted uppercase tracking-wide block mb-1">Search</label>
              <input type="text" placeholder="Doctor, patient, or facility..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full border border-border rounded-lg px-2 py-1 text-sm bg-surface-2" />
            </div>
            <div className="text-xs text-ink-muted border-t border-border pt-3">
              {layout.nodes.length} nodes · {layout.edges.length} relationships shown
            </div>
            {matchResults && (
              <div className="text-xs rounded-lg bg-danger-light text-danger-dark px-2.5 py-2">
                Red outline/edges = relationship where over 40% of shared vouchers are Fraud Risk or Orphan.
              </div>
            )}
          </aside>
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {!showFilters && (
              <button onClick={() => setShowFilters(true)} className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1 hover:bg-surface-2">
                ⏵ Show filters
              </button>
            )}
            <span className="text-xs text-ink-muted">Drag nodes to reposition · scroll to zoom · drag empty space to pan</span>
            <div className="ml-auto flex gap-1.5">
              <button onClick={resetLayout} className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1 hover:bg-surface-2">Reset positions</button>
              <button onClick={resetView} className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-surface-1 hover:bg-surface-2">Reset view</button>
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface-1 overflow-hidden relative">
            <svg
              ref={svgRef}
              width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              onWheel={handleWheel} onMouseDown={handleCanvasMouseDown} onMouseMove={handleMouseMove}
              onMouseUp={stopDrag} onMouseLeave={stopDrag}
              style={{ cursor: panRef.current ? 'grabbing' : 'grab', display: 'block', minHeight: HEIGHT }}
            >
              <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
                {layout.edges.map(e => {
                  const s = e.source, t = e.target
                  if (!s || !t) return null
                  const sp = getXY(s), tp = getXY(t)
                  if (sp.x === undefined || tp.x === undefined) return null
                  const fraudRatio = e.weight ? e.fraudCount / e.weight : 0
                  const isSelected = selected && (s.id === selected.id || t.id === selected.id)
                  return (
                    <line key={e.id} x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                      stroke={fraudRatio > 0.4 ? '#a32d2d' : '#94a3b8'}
                      strokeWidth={Math.min(9, 1 + Math.log2(e.weight + 1) * 1.6)}
                      strokeOpacity={isSelected ? 0.85 : 0.4} />
                  )
                })}
                {layout.nodes.map(n => {
                  const p = getXY(n)
                  if (p.x === undefined) return null
                  const r = 7 + Math.sqrt(n.voucherCount || 1) * 2.6
                  const fraudRatio = n.voucherCount ? n.fraudCount / n.voucherCount : 0
                  const isSelected = selected?.id === n.id
                  return (
                    <g key={n.id} transform={`translate(${p.x},${p.y})`}
                      onMouseDown={e => handleNodeMouseDown(e, n)}
                      onClick={() => setSelectedId(n.id)}
                      style={{ cursor: 'grab' }}>
                      <circle r={r} fill={NODE_COLORS[n.type]}
                        stroke={isSelected ? '#0b0b0b' : (fraudRatio > 0.4 ? '#a32d2d' : 'none')}
                        strokeWidth={isSelected ? 3 : (fraudRatio > 0.4 ? 3 : 0)}
                        opacity={0.9} />
                      <text y={r + 11} textAnchor="middle" fontSize="10" fill="currentColor">
                        {n.label.length > 18 ? n.label.slice(0, 16) + '…' : n.label}
                      </text>
                    </g>
                  )
                })}
              </g>
            </svg>
            {layout.nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">
                No relationships match the current filters.
              </div>
            )}
          </div>
        </div>
      </div>

      {selected && (
        <div className="rounded-card border border-border bg-surface-1 p-5">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: NODE_COLORS[selected.type] }} />
                <span className="text-xs uppercase text-ink-muted">{selected.type}</span>
              </div>
              <h3 className="text-base font-medium break-words">{selected.label}</h3>
            </div>
            <button onClick={() => setSelectedId(null)} className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-surface-2">Close</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="text-[11px] text-ink-muted">Vouchers</div>
              <div className="text-base font-medium">{selected.voucherCount}</div>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="text-[11px] text-ink-muted">Total cost</div>
              <div className="text-base font-medium">{selected.totalCost.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="text-[11px] text-ink-muted">Connections</div>
              <div className="text-base font-medium">{selectedEdges.length}</div>
            </div>
            {matchResults && (
              <div className="rounded-lg bg-danger-light px-3 py-2">
                <div className="text-[11px] text-danger-dark">Fraud-risk / orphan vouchers</div>
                <div className="text-base font-medium text-danger-dark">{selected.fraudCount} of {selected.voucherCount}</div>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <h4 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Connections</h4>
              <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                {selectedEdges.map(e => {
                  const other = (e.source.id || e.source) === selected.id ? e.target : e.source
                  const fraudRatio = e.weight ? e.fraudCount / e.weight : 0
                  return (
                    <li key={e.id} className={`text-xs rounded-lg px-2.5 py-1.5 border cursor-pointer ${fraudRatio > 0.4 ? 'border-danger bg-danger-light' : 'border-border bg-surface-2'}`}
                      onClick={() => setSelectedId(other.id)}>
                      <div className="font-medium truncate">{other.label} <span className="text-ink-muted font-normal">({other.type})</span></div>
                      <div className="text-ink-muted">{e.weight} voucher{e.weight === 1 ? '' : 's'} · {e.totalCost.toLocaleString()}</div>
                    </li>
                  )
                })}
                {selectedEdges.length === 0 && <li className="text-xs text-ink-muted">No connections under current filters.</li>}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Vouchers ({selectedVouchers.length})</h4>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-muted text-left bg-surface-2">
                      <th className="px-2 py-1.5 font-medium">Patient</th>
                      <th className="px-2 py-1.5 font-medium">Doctor</th>
                      <th className="px-2 py-1.5 font-medium">Facility</th>
                      <th className="px-2 py-1.5 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVouchers.map(c => (
                      <tr key={c.id} className="border-t border-border">
                        <td className="px-2 py-1.5">{mapping.patient_name ? c.row[mapping.patient_name] : '—'}</td>
                        <td className="px-2 py-1.5">{mapping.doctor_name ? c.row[mapping.doctor_name] : '—'}</td>
                        <td className="px-2 py-1.5">{mapping.facility_name ? c.row[mapping.facility_name] : '—'}</td>
                        <td className="px-2 py-1.5">{mapping.amount ? Number(c.row[mapping.amount]).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
