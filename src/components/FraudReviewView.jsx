export default function FraudReviewView({ cards, updateCard, needsFraudReview, voucherOf, mappedValue, originalAmount, facilityOf, generateFraudReport }) {
  const fraudCards = cards.filter(c => c.classifications?.fraud)

  return (
    <div>
      <p className="text-sm text-ink-muted mb-2">
        All vouchers flagged as fraud activity. Adjust deduction, comment, prescription date, and facility here before generating the report.
      </p>
      <p className="text-xs text-ink-muted mb-4 bg-surface-2 border border-border rounded-lg px-3 py-2 max-w-3xl">
        Reminder: a deduction is normally calculated against 85% of the total cost, or the mapped
        insurance co-payment amount when available. Vouchers sent here as confirmed Fraud Risk or
        Ghost Patient have that entire basis withheld — the approved amount becomes 0. Adjust the
        deduction field manually if only a partial amount should be withheld instead.
      </p>
      <div className="overflow-x-auto rounded-card border border-border mb-4">
        <table className="w-full text-sm bg-surface-1">
          <thead>
            <tr className="text-xs text-ink-muted text-left">
              <th className="px-3 py-2 font-medium">Voucher</th>
              <th className="px-3 py-2 font-medium">Patient</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Deduction</th>
              <th className="px-3 py-2 font-medium">Prescription date</th>
              <th className="px-3 py-2 font-medium">Health facility</th>
              <th className="px-3 py-2 font-medium">Comment</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {fraudCards.map(c => (
              <tr key={c.id} className={`border-t border-border align-top ${needsFraudReview(c) ? 'bg-danger-light/40' : ''}`}>
                <td className="px-3 py-2">{voucherOf(c) || '—'}</td>
                <td className="px-3 py-2">{mappedValue(c, 'patient_name') || '—'}</td>
                <td className="px-3 py-2">{originalAmount(c)?.toLocaleString() ?? '—'}</td>
                <td className="px-3 py-2">
                  <input type="number" min="0" value={c.deduction || ''} onChange={e => updateCard(c.id, { deduction: e.target.value })}
                    className="w-24 border border-border rounded-lg px-2 py-1 text-sm bg-surface-2 text-right" />
                </td>
                <td className="px-3 py-2">
                  <input type="date" value={c.prescriptionDate} onChange={e => updateCard(c.id, { prescriptionDate: e.target.value })}
                    className={`border rounded-lg px-2 py-1 text-sm bg-surface-2 ${!c.prescriptionDate ? 'border-danger' : 'border-border'}`} />
                </td>
                <td className="px-3 py-2">
                  <input type="text" value={c.facilityOverride} placeholder={mappedValue(c, 'facility_name') || 'Facility'} onChange={e => updateCard(c.id, { facilityOverride: e.target.value })}
                    className={`min-w-[150px] border rounded-lg px-2 py-1 text-sm bg-surface-2 ${!facilityOf(c) ? 'border-danger' : 'border-border'}`} />
                </td>
                <td className="px-3 py-2">
                  <input type="text" value={c.comment} onChange={e => updateCard(c.id, { comment: e.target.value })}
                    className="min-w-[180px] border border-border rounded-lg px-2 py-1 text-sm bg-surface-2" />
                </td>
                <td className="px-3 py-2">
                  {needsFraudReview(c) ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger-dark">Needs review</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-light text-brand-dark">Ready</span>
                  )}
                </td>
              </tr>
            ))}
            {fraudCards.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-ink-muted text-sm">No vouchers flagged as fraud activity yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button onClick={generateFraudReport} className="text-sm rounded-lg px-4 py-2 bg-danger text-white hover:bg-danger-dark transition-colors">
        Generate Anti Fraud Report
      </button>
    </div>
  )
}
