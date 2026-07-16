import { useCardHelpers } from './use-card-helpers';
import { CLASSIFICATION_DEFS } from '@/lib/rssb/config';
import { useSessionStore } from '@/store/session-store';
import type { Card } from '@/lib/rssb/types';
import { ArrowUpRight, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  card: Card;
  headers: string[];
  onUpdateCard: (id: number, patch: Partial<Card>) => void;
  onToggleClassification: (id: number, key: 'pharma' | 'rssb' | 'fraud') => void;
  onOpenFullView: () => void;
}

export function VoucherRowDetail({ card, headers, onUpdateCard, onToggleClassification, onOpenFullView }: Props) {
  const helpers = useCardHelpers();
  const needsReview = helpers.needsFraudReview(card);
  const originalAmt = helpers.originalAmount(card);
  const approvedAmt = helpers.approvedAmount(card);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Voucher fields</h4>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {headers.slice(0, 12).map(h => (
            <div key={h} className="overflow-hidden">
              <div className="text-[11px] text-muted-foreground">{h}</div>
              <div className="text-sm truncate" title={String(card.row[h])}>{String(card.row[h])}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Deduction classification</h4>
          <div className="flex flex-wrap gap-2">
            {CLASSIFICATION_DEFS.map(cl => (
              <label
                key={cl.key}
                className={`text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                  card.classifications?.[cl.key] ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-muted'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!card.classifications?.[cl.key]}
                  onChange={() => onToggleClassification(card.id, cl.key)}
                  className="sr-only"
                />
                {cl.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Prescription date</label>
            <input
              type="date"
              value={card.prescriptionDate}
              onChange={e => onUpdateCard(card.id, { prescriptionDate: e.target.value })}
              className={`w-full border rounded-lg px-2.5 py-1.5 text-sm bg-muted ${!card.prescriptionDate && needsReview ? 'border-danger' : 'border-border'}`}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Health facility</label>
            <input
              type="text"
              placeholder={String(helpers.mappedValue(card, 'facility_name') || 'Facility')}
              value={card.facilityOverride}
              onChange={e => onUpdateCard(card.id, { facilityOverride: e.target.value })}
              className={`w-full border rounded-lg px-2.5 py-1.5 text-sm bg-muted ${!helpers.facilityOf(card) && needsReview ? 'border-danger' : 'border-border'}`}
            />
          </div>
        </div>

        {card.classifications?.fraud && (
          <div className={`rounded-lg border p-2.5 flex items-start gap-2 ${needsReview ? 'border-danger bg-danger-light' : 'border-primary bg-primary/10'}`}>
            {needsReview ? <AlertTriangle className="w-4 h-4 text-danger mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />}
            <span className={`text-xs ${needsReview ? 'text-danger-dark' : 'text-primary'}`}>
              {needsReview ? 'Needs prescription date & facility before fraud report.' : 'Ready for fraud report.'}
            </span>
          </div>
        )}

        {originalAmt !== null && (
          <div className="rounded-lg border border-border p-2.5 flex flex-col gap-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Original</span><span>{originalAmt.toLocaleString()}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Deduct</span>
              <input
                type="number"
                min="0"
                value={card.deduction || ''}
                placeholder="0"
                onChange={e => onUpdateCard(card.id, { deduction: e.target.value })}
                className="w-28 border border-border rounded-lg px-2 py-1 text-sm bg-muted text-right"
              />
            </div>
            <div className="flex justify-between font-medium pt-1 border-t border-border"><span>Approved</span><span>{approvedAmt?.toLocaleString()}</span></div>
          </div>
        )}

        <textarea
          placeholder="Add comment…"
          value={card.comment}
          onChange={e => onUpdateCard(card.id, { comment: e.target.value })}
          className="w-full min-h-[60px] border border-border rounded-lg px-3 py-2 text-sm bg-muted resize-y"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdateCard(card.id, { status: card.status === 'verified' ? 'pending' : 'verified' })}
            className={`text-sm rounded-lg px-3 py-1.5 border transition-colors ${
              card.status === 'verified' ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-muted hover:bg-accent'
            }`}
          >
            {card.status === 'verified' ? 'Verified ✓' : 'Mark verified'}
          </button>
          <button
            onClick={onOpenFullView}
            className="text-sm inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open in full verify view
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// silence unused import warning for useSessionStore (kept for future use)
void useSessionStore;
