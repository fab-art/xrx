import { useMemo } from 'react'
import { FIELD_DEFS } from '../config'

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

      <button
        onClick={onContinue}
        className="bg-brand text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-brand-dark transition-colors"
      >
        Continue to column mapping →
      </button>
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
