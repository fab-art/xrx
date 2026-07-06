export default function CounterVerificationView({ cards, updateCard, counterHeader, setCounterHeader, voucherOf, mappedValue, originalAmount, generateCounterReport }) {
  const deducted = cards.filter(c => (parseFloat(c.deduction) || 0) > 0)

  return (
    <div>
      <p className="text-sm text-ink-muted mb-4">
        Review every voucher that currently has a deduction, adjust the amount or explanation as a final check, then generate the counter verification report.
      </p>

      <div className="rounded-card border border-border bg-surface-1 p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['code', 'Code / Pharmacy', 'e.g. 20331037'],
          ['pharmacyName', 'Pharmacy / facility name', 'e.g. NYARUGENGE - PHARMACIE NEZA'],
          ['period', 'Period', 'e.g. DECEMBER 2024'],
          ['tin', 'TIN', 'e.g. 102808467']
        ].map(([key, label, placeholder]) => (
          <div key={key}>
            <label className="text-xs text-ink-muted block mb-1">{label}</label>
            <input value={counterHeader[key]} onChange={e => setCounterHeader(h => ({ ...h, [key]: e.target.value }))}
              className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2" placeholder={placeholder} />
          </div>
        ))}
      </div>

      <div className="rounded-card border border-border bg-surface-1 p-4 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ['preparedBy', 'preparedByPosition', 'Prepared by'],
          ['verifiedBy', 'verifiedByPosition', 'Verified by'],
          ['approvedBy', 'approvedByPosition', 'Approved by']
        ].map(([key, posKey, label]) => (
          <div key={key} className="flex flex-col gap-2">
            <div>
              <label className="text-xs text-ink-muted block mb-1">{label}</label>
              <input value={counterHeader[key]} onChange={e => setCounterHeader(h => ({ ...h, [key]: e.target.value }))}
                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2" placeholder="Full name" />
            </div>
            <div>
              <label className="text-xs text-ink-muted block mb-1">Position / title</label>
              <input value={counterHeader[posKey]} onChange={e => setCounterHeader(h => ({ ...h, [posKey]: e.target.value }))}
                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface-2" placeholder="e.g. Pharmacist in Charge" />
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-card border border-border mb-4">
        <table className="w-full text-sm bg-surface-1">
          <thead>
            <tr className="text-xs text-ink-muted text-left">
              <th className="px-3 py-2 font-medium">NO</th>
              <th className="px-3 py-2 font-medium">N° BEN. / Voucher</th>
              <th className="px-3 py-2 font-medium">RAMA Number</th>
              <th className="px-3 py-2 font-medium">Original amount</th>
              <th className="px-3 py-2 font-medium">Deduction (adjustable)</th>
              <th className="px-3 py-2 font-medium">Difference</th>
              <th className="px-3 py-2 font-medium">Explanation of deduction</th>
            </tr>
          </thead>
          <tbody>
            {deducted.map((c, i) => (
              <tr key={c.id} className="border-t border-border align-top">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">{voucherOf(c) || '—'}</td>
                <td className="px-3 py-2">{mappedValue(c, 'rama_number') || '—'}</td>
                <td className="px-3 py-2">{originalAmount(c)?.toLocaleString() ?? '—'}</td>
                <td className="px-3 py-2">
                  <input type="number" min="0" value={c.deduction || ''} onChange={e => updateCard(c.id, { deduction: e.target.value })}
                    className="w-24 border border-border rounded-lg px-2 py-1 text-sm bg-surface-2 text-right" />
                </td>
                <td className="px-3 py-2 text-danger">-{(parseFloat(c.deduction) || 0).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <input type="text" value={c.explanation} placeholder={c.comment || 'e.g. Different reception signature'} onChange={e => updateCard(c.id, { explanation: e.target.value })}
                    className="w-full min-w-[220px] border border-border rounded-lg px-2 py-1 text-sm bg-surface-2" />
                </td>
              </tr>
            ))}
            {deducted.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-muted text-sm">No vouchers currently have a deduction.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button onClick={generateCounterReport} className="text-sm rounded-lg px-4 py-2 bg-brand text-white hover:bg-brand-dark transition-colors">
        Generate counter verification report
      </button>
    </div>
  )
}
