import { useMemo, useState, useRef } from 'react'
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
  const dragRef = useRef(null)

  function categoryOf(cardId) {
    if (matchOverrides[cardId]) return matchOverrides[cardId]
    return matchResults?.[cardId]?.category || null
  }

  const fullGraph = useMemo(
    () => buildGraph(cards, mapping, matchResults ? categoryOf : null),
    [cards, mapping, matchResults, matchOverrides]
  )

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

  const selected = selectedId ? nodeById.get(selectedId) : null
  const selectedEdges = useMemo(() => {
    if (!selected) return []
    return layout.edges
      .filter(e => (e.source.id || e.source) === selected.id || (e.target.id || e.target) === selected.id)
      .sort((a, b) => b.weight - a.weight)
  }, [selected, layout])

  function toggle(list, setList, val) {
    setList(list.includes(val) ? list.filter(x => x !== val) : [...list, val])
  }

  function handleWheel(e) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setView(v => ({ ...v, scale: Math.min(4, Math.max(0.2, v.scale * delta)) }))
  }
  function handleMouseDown(e) {
    dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
  function handleMouseMove(e) {
    if (!dragRef.current) return
    setView(v => ({ ...v, x: dragRef.current.vx + (e.clientX - dragRef.current.x), y: dragRef.current.vy + (e.clientY - dragRef.current.y) }))
  }
  function stopDrag() { dragRef.current = null }
  function resetView() { setView({ scale: 1, x: 0, y: 0 }) }

  return (
    <div className="lg:grid lg:grid-cols-[240px_1fr_260px] lg:gap-4 lg:items-start">
      <aside className="rounded-card border border-border bg-surface-1 p-4 flex flex-col gap-4 mb-4 lg:mb-0">
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

      <div className="rounded-card border border-border bg-surface-1 overflow-hidden relative">
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <button onClick={resetView} className="text-xs border border-border rounded-lg px-2 py-1 bg-surface-1 hover:bg-surface-2">Reset view</button>
        </div>
        <svg
          width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={stopDrag} onMouseLeave={stopDrag}
          style={{ cursor: dragRef.current ? 'grabbing' : 'grab', display: 'block', minHeight: HEIGHT }}
        >
          <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
            {layout.edges.map(e => {
              const s = e.source, t = e.target
              if (!s || !t || s.x === undefined || t.x === undefined) return null
              const fraudRatio = e.weight ? e.fraudCount / e.weight : 0
              const isSelected = selected && (s.id === selected.id || t.id === selected.id)
              return (
                <line key={e.id} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={fraudRatio > 0.4 ? '#a32d2d' : '#94a3b8'}
                  strokeWidth={Math.min(9, 1 + Math.log2(e.weight + 1) * 1.6)}
                  strokeOpacity={isSelected ? 0.85 : 0.4} />
              )
            })}
            {layout.nodes.map(n => {
              if (n.x === undefined) return null
              const r = 7 + Math.sqrt(n.voucherCount || 1) * 2.6
              const fraudRatio = n.voucherCount ? n.fraudCount / n.voucherCount : 0
              const isSelected = selected?.id === n.id
              return (
                <g key={n.id} transform={`translate(${n.x},${n.y})`} onClick={() => setSelectedId(n.id)} style={{ cursor: 'pointer' }}>
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

      <aside className="rounded-card border border-border bg-surface-1 p-4 mt-4 lg:mt-0 lg:sticky lg:top-20 max-h-[70vh] overflow-y-auto">
        {!selected && (
          <p className="text-sm text-ink-muted">Click a node to see its connections, voucher count, and total cost.</p>
        )}
        {selected && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: NODE_COLORS[selected.type] }} />
              <span className="text-xs uppercase text-ink-muted">{selected.type}</span>
            </div>
            <h3 className="text-sm font-medium mb-3 break-words">{selected.label}</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                <div className="text-[11px] text-ink-muted">Vouchers</div>
                <div className="text-sm font-medium">{selected.voucherCount}</div>
              </div>
              <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                <div className="text-[11px] text-ink-muted">Total cost</div>
                <div className="text-sm font-medium">{selected.totalCost.toLocaleString()}</div>
              </div>
              {matchResults && (
                <div className="rounded-lg bg-danger-light px-2.5 py-1.5 col-span-2">
                  <div className="text-[11px] text-danger-dark">Fraud-risk / orphan vouchers</div>
                  <div className="text-sm font-medium text-danger-dark">{selected.fraudCount} of {selected.voucherCount}</div>
                </div>
              )}
            </div>
            <h4 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Connections ({selectedEdges.length})</h4>
            <ul className="flex flex-col gap-1.5">
              {selectedEdges.map(e => {
                const other = (e.source.id || e.source) === selected.id ? e.target : e.source
                const fraudRatio = e.weight ? e.fraudCount / e.weight : 0
                return (
                  <li key={e.id} className={`text-xs rounded-lg px-2.5 py-1.5 border ${fraudRatio > 0.4 ? 'border-danger bg-danger-light' : 'border-border bg-surface-2'}`}>
                    <div className="font-medium truncate">{other.label}</div>
                    <div className="text-ink-muted">{e.weight} voucher{e.weight === 1 ? '' : 's'} · {e.totalCost.toLocaleString()}</div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}
