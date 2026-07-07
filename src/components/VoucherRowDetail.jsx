import { CLASSIFICATION_DEFS } from '../config'

export default function VoucherRowDetail({
  card, headers, mapping, updateCard, toggleClassification,
  needsFraudReview, facilityOf, mappedValue, originalAmount, approvedAmount,
  onOpenFullView
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        <h4 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Voucher fields</h4>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {headers.slice(0, 10).map(h => (
            <div key={h} className="overflow-hidden">
              <div className="text-[11px] text-ink-muted">{h}</div>
              <div className="text-sm truncate" title={String(card.row[h])}>{String(card.row[h])}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <span className="text-xs text-ink-muted uppercase tracking-wide block mb-1.5">Deduction classification</span>
          <div className="flex flex-wrap gap-2">
            {CLASSIFICATION_DEFS.map(cl => (
              <label
                key={cl.key}
                className={`text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                  card.classifications?.[cl.key] ? 'bg-brand text-white border-brand' : 'border-border bg-surface-2'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!card.classifications?.[cl.key]}
                  onChange={() => toggleClassification(card.id, cl.key)}
                  className="sr-only"
                />
                {cl.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`pdate-${card.id}`} className="text-xs text-ink-muted block mb-1">Prescription date</label>
            <input
              id={`pdate-${card.id}`}
              type="date"
              value={card.prescriptionDate}
              onChange={e => updateCard(card.id, { prescriptionDate: e.target.value })}
              className={`w-full border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2 ${
                needsFraudReview(card) && !card.prescriptionDate ? 'border-danger' : 'border-border'
              }`}
            />
          </div>
          <div>
            <label htmlFor={`facility-${card.id}`} className="text-xs text-ink-muted block mb-1">Health facility</label>
            <input
              id={`facility-${card.id}`}
              type="text"
              placeholder={mappedValue(card, 'facility_name') || 'Enter facility name'}
              value={card.facilityOverride}
              onChange={e => updateCard(card.id, { facilityOverride: e.target.value })}
              className={`w-full border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2 ${
                needsFraudReview(card) && !facilityOf(card) ? 'border-danger' : 'border-border'
              }`}
            />
          </div>
        </div>

        {card.classifications?.fraud && (
          <div className={`rounded-lg border p-2.5 text-xs font-medium ${
            needsFraudReview(card) ? 'border-danger bg-danger-light text-danger-dark' : 'border-brand bg-brand-light text-brand-dark'
          }`}>
            {needsFraudReview(card)
              ? 'Missing prescription date and/or facility — required before this voucher appears in the fraud report.'
              : 'Fraud review complete — ready for the fraud report.'}
          </div>
        )}

        {mapping.amount && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm bg-surface-2 rounded-lg px-3 py-2">
            <span className="text-ink-muted">Original: <span className="text-ink">{originalAmount(card)?.toLocaleString() ?? '—'}</span></span>
            <div className="flex items-center gap-2">
              <label htmlFor={`deduct-${card.id}`} className="text-ink-muted">Deduct</label>
              <input
                id={`deduct-${card.id}`}
                type="number"
                min="0"
                value={card.deduction || ''}
                placeholder="0"
                onChange={e => updateCard(card.id, { deduction: e.target.value })}
                className="w-24 border border-border rounded-lg px-2 py-1 text-sm bg-surface-1 text-right"
              />
            </div>
            <span className="font-medium">Approved: {approvedAmount(card)?.toLocaleString() ?? '—'}</span>
          </div>
        )}

        <div>
          <label htmlFor={`comment-${card.id}`} className="text-xs text-ink-muted block mb-1">Comment</label>
          <textarea
            id={`comment-${card.id}`}
            placeholder="Add comment..."
            value={card.comment}
            onChange={e => updateCard(card.id, { comment: e.target.value })}
            className="w-full min-h-[52px] border border-border rounded-lg px-3 py-2 text-sm bg-surface-2 resize-y"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => updateCard(card.id, { status: card.status === 'verified' ? 'pending' : 'verified' })}
            className={`text-sm rounded-lg px-3 py-1.5 border transition-colors ${
              card.status === 'verified' ? 'bg-brand text-white border-brand' : 'border-border bg-surface-2 hover:bg-surface-0'
            }`}
          >
            {card.status === 'verified' ? 'Verified ✓ (click to undo)' : 'Mark as verified'}
          </button>
          <button onClick={onOpenFullView} className="text-sm text-ink-muted underline ml-auto">
            Open in full verify view →
          </button>
        </div>
      </div>
    </div>
  )
}
