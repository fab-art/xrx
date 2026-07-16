import { useMemo, useState } from 'react'
import { FIELD_DEFS, CLASSIFICATION_DEFS } from '../config'

function uniqueUpper(cards, getter) {
  const set = new Set()
  cards.forEach(c => {
    const v = String(getter(c) || '').trim().toUpperCase()
    if (v) set.add(v)
  })
  return set.size
}

export default function SummaryView({ cards, headers, mapping, fileName, mappedValue, originalAmount, dateOf, onContinue }) {
  const stats = useMemo(() => {
    let totalAmount = 0
    let amountCount = 0
    let missingAmount = 0
    let minDate = null
    let maxDate = null

    cards.forEach(c => {
      const amt = originalAmount(c)
      if (amt !== null) {
        totalAmount += amt
        amountCount += 1
      } else {
        missingAmount += 1
      }
      const dt = dateOf(c)
      if (dt) {
        if (!minDate || dt < minDate) minDate = dt
        if (!maxDate || dt > maxDate) maxDate = dt
      }
    })

    return {
      totalAmount,
      amountCount,
      missingAmount,
      minDate,
      maxDate,
      patients: uniqueUpper(cards, c => mappedValue(c, 'patient_name')),
      facilities: uniqueUpper(cards, c => mappedValue(c, 'facility_name')),
      doctors: uniqueUpper(cards, c => mappedValue(c, 'doctor_name'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, mapping])

  const chartData = useMemo(() => {
    const byFacility = {}
    const byMonth = {}
    let verified = 0
    const classificationCounts = { pharma: 0, rssb: 0, fraud: 0 }

    cards.forEach(c => {
      const facility = String(mappedValue(c, 'facility_name') || 'Unknown').trim() || 'Unknown'
      const amt = originalAmount(c) || 0
      byFacility[facility] = (byFacility[facility] || 0) + amt

      const dt = dateOf(c)
      if (dt) {
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
        byMonth[key] = (byMonth[key] || 0) + amt
      }

      if (c.status === 'verified') verified += 1
      CLASSIFICATION_DEFS.forEach(cl => {
        if (c.classifications?.[cl.key]) classificationCounts[cl.key] += 1
      })
    })

    const facilityBars = Object.entries(byFacility)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }))

    const monthBars = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value }))

    return {
      facilityBars,
      monthBars,
      statusSplit: [
        { label: 'Verified', value: verified },
        { label: 'Pending', value: cards.length - verified }
      ],
      classificationBars: CLASSIFICATION_DEFS.map(cl => ({ label: cl.label, value: classificationCounts[cl.key] }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, mapping])

  const mappedCount = Object.values(mapping).filter(Boolean).length
  const unmappedFields = FIELD_DEFS.filter(f => !mapping[f.key])
  const dateLabel = stats.minDate && stats.maxDate
    ? (stats.minDate.toDateString() === stats.maxDate.toDateString()
        ? stats.minDate.toLocaleDateString()
        : `${stats.minDate.toLocaleDateString()} – ${stats.maxDate.toLocaleDateString()}`)
    : 'No dates detected yet'

  return (
    <div className="max-w-4xl">
      <div className="rounded-card border border-border bg-surface-1 p-5 sm:p-6 mb-5">
        <h2 className="text-base font-medium mb-1">File loaded: {fileName}</h2>
        <p className="text-sm text-ink-muted">
          Here's a quick look at what came in before you map columns or start reviewing. Nothing has been
          changed yet — this is just a sanity check.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Vouchers" value={cards.length.toLocaleString()} />
        <StatCard label="Columns detected" value={headers.length} />
        <StatCard
          label="Fields auto-mapped"
          value={`${mappedCount} / ${FIELD_DEFS.length}`}
          tone={mappedCount === FIELD_DEFS.length ? 'good' : unmappedFields.length > 4 ? 'warn' : 'default'}
        />
        <StatCard label="Date range" value={dateLabel} small />
        <StatCard
          label="Total cost"
          value={stats.amountCount ? stats.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
        />
        <StatCard label="Unique patients" value={stats.patients.toLocaleString()} />
        <StatCard label="Unique facilities" value={stats.facilities.toLocaleString()} />
        <StatCard label="Unique doctors" value={stats.doctors.toLocaleString()} />
      </div>

      {stats.missingAmount > 0 && (
        <div className="rounded-card border border-warn bg-warn-light text-warn-dark text-sm px-4 py-3 mb-5">
          {stats.missingAmount} voucher{stats.missingAmount === 1 ? '' : 's'} {stats.missingAmount === 1 ? 'has' : 'have'} no readable amount yet —
          this is normal if the amount column hasn't been mapped or cleaned yet.
        </div>
      )}

      {unmappedFields.length > 0 && (
        <div className="rounded-card border border-border bg-surface-1 p-4 mb-5">
          <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
            Couldn't confidently auto-map ({unmappedFields.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {unmappedFields.map(f => (
              <span key={f.key} className="text-xs px-2 py-1 rounded-full bg-surface-2 text-ink-muted">{f.label}</span>
            ))}
          </div>
          <p className="text-xs text-ink-muted mt-2">You'll be able to map these manually on the next screen.</p>
        </div>
      )}

      <div className="rounded-card border border-border bg-surface-1 p-4 mb-6">
        <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-3">Columns found in this file</h3>
        <div className="flex flex-wrap gap-1.5">
          {headers.map(h => (
            <span key={h} className="text-xs px-2 py-1 rounded-full bg-surface-2">{h}</span>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-medium mb-3">Interactive overview</h3>
        <p className="text-xs text-ink-muted mb-4 max-w-2xl">
          Built from the pharmacy data currently loaded — reflects any column mapping and data cleaning
          already applied. Hover a bar or slice for the exact figure.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={`Total cost by facility (top ${chartData.facilityBars.length})`}>
            <BarChart data={chartData.facilityBars} />
          </ChartCard>
          <ChartCard title="Total cost by month">
            <BarChart data={chartData.monthBars} />
          </ChartCard>
          <ChartCard title="Verification progress">
            <DonutChart data={chartData.statusSplit} colors={['#16a34a', '#f59e0b']} />
          </ChartCard>
          <ChartCard title="Deduction classifications">
            <BarChart data={chartData.classificationBars} horizontal />
          </ChartCard>
        </div>
      </div>

      <button
        onClick={onContinue}
        className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark transition-colors"
      >
        Continue to verification →
      </button>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-card border border-border bg-surface-1 p-4">
      <h4 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-3">{title}</h4>
      {children}
    </div>
  )
}

// Lightweight, dependency-free SVG bar chart with hover tooltips. Vertical by
// default (categories along the x-axis); `horizontal` lays bars out top to
// bottom instead, better suited to a small, fixed set of labeled categories.
function BarChart({ data, horizontal = false }) {
  const [hover, setHover] = useState(null)
  if (!data.length || data.every(d => d.value === 0)) {
    return <p className="text-xs text-ink-muted py-6 text-center">No data yet.</p>
  }
  const max = Math.max(...data.map(d => d.value), 1)

  if (horizontal) {
    return (
      <div className="flex flex-col gap-2.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="w-40 shrink-0 truncate text-ink-muted" title={d.label}>{d.label}</span>
            <div className="flex-1 h-5 bg-surface-2 rounded overflow-hidden relative">
              <div
                className="h-full bg-brand rounded transition-all cursor-default"
                style={{ width: `${(d.value / max) * 100}%` }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </div>
            <span className="w-14 shrink-0 text-right tabular-nums">{hover === i ? d.value.toLocaleString() : d.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    )
  }

  const width = 560
  const height = 200
  const padding = 28
  const barGap = 8
  const barWidth = Math.max(10, (width - padding * 2) / data.length - barGap)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Bar chart">
        {data.map((d, i) => {
          const barHeight = (d.value / max) * (height - padding * 2)
          const x = padding + i * ((width - padding * 2) / data.length)
          const y = height - padding - barHeight
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={2}
                className={hover === i ? 'fill-brand-dark' : 'fill-brand'}
                style={{ cursor: 'default', transition: 'height 0.2s, y 0.2s' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              <text
                x={x + barWidth / 2}
                y={height - padding + 12}
                textAnchor="middle"
                className="fill-current text-ink-muted"
                style={{ fontSize: 8 }}
              >
                {d.label.length > 10 ? d.label.slice(0, 9) + '…' : d.label}
              </text>
            </g>
          )
        })}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" className="text-border" />
      </svg>
      {hover !== null && (
        <div className="absolute top-0 right-0 text-xs bg-surface-0 border border-border rounded-lg px-2 py-1 shadow">
          <span className="font-medium">{data[hover].label}:</span> {data[hover].value.toLocaleString()}
        </div>
      )}
    </div>
  )
}

// Simple two-slice (or N-slice) donut built from SVG stroke-dasharray arcs —
// enough for status splits without pulling in a charting library.
function DonutChart({ data, colors }) {
  const [hover, setHover] = useState(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <p className="text-xs text-ink-muted py-6 text-center">No data yet.</p>

  const radius = 60
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 160 160" className="w-36 h-36 shrink-0" role="img" aria-label="Donut chart">
        <g transform="translate(80,80) rotate(-90)">
          {data.map((d, i) => {
            const frac = d.value / total
            const dash = frac * circumference
            const el = (
              <circle
                key={d.label}
                r={radius}
                fill="transparent"
                stroke={colors[i % colors.length]}
                strokeWidth={hover === i ? 26 : 22}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                style={{ transition: 'stroke-width 0.15s', cursor: 'default' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            )
            offset += dash
            return el
          })}
        </g>
        <text x="80" y="84" textAnchor="middle" className="fill-current" style={{ fontSize: 20, fontWeight: 600 }}>
          {total}
        </text>
      </svg>
      <ul className="flex flex-col gap-2 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
            <span className="text-ink-muted">{d.label}:</span>
            <span className="font-medium">{d.value.toLocaleString()}</span>
            <span className="text-ink-muted text-xs">({total ? Math.round((d.value / total) * 100) : 0}%)</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatCard({ label, value, tone = 'default', small }) {
  const toneClasses = {
    default: 'border-border bg-surface-1',
    good: 'border-brand bg-brand-light text-brand-dark',
    warn: 'border-warn bg-warn-light text-warn-dark'
  }[tone]
  return (
    <div className={`rounded-card border px-3.5 py-3 ${toneClasses}`}>
      <div className="text-[11px] opacity-80">{label}</div>
      <div className={small ? 'text-sm font-medium mt-0.5' : 'text-lg font-medium mt-0.5'}>{value}</div>
    </div>
  )
}
