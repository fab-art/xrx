import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { useSessionStore } from '@/store/session-store';
import { useCardHelpers } from './use-card-helpers';
import { MATCH_CATEGORIES, CLASSIFICATION_DEFS } from '@/lib/rssb/config';
import { CATEGORY_LABELS } from '@/lib/rssb/matching';
import { buildMatchReportWorkbook } from '@/lib/rssb/reportGenerators';
import type { Card, MatchCategory, MatchResult } from '@/lib/rssb/types';
import { Search, Download, ShieldAlert, ArrowRight, GitCompareArrows, FilterX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const CAT_COLORS: Record<MatchCategory, string> = {
  clean: 'bg-primary/10 text-primary',
  review: 'bg-warn-light text-warn-dark',
  fraud_risk: 'bg-danger-light text-danger-dark',
  orphan: 'bg-muted text-muted-foreground',
};

export function MatchReviewView() {
  const cards = useSessionStore(s => s.cards);
  const matchResults = useSessionStore(s => s.matchResults);
  const matchOverrides = useSessionStore(s => s.matchOverrides);
  const setMatchOverrides = useSessionStore(s => s.setMatchOverrides);
  const matchNotes = useSessionStore(s => s.matchNotes);
  const setMatchNotes = useSessionStore(s => s.setMatchNotes);
  const updateCard = useSessionStore(s => s.updateCard);
  const setStage = useSessionStore(s => s.setStage);
  const fileName = useSessionStore(s => s.fileName);
  const helpers = useCardHelpers();
  const { toast } = useToast();
  const [matchCategoryFilter, setMatchCategoryFilter] = useState<MatchCategory | 'all'>('all');
  const [matchSearch, setMatchSearch] = useState('');

  const matchSummary = useMemo(() => {
    if (!matchResults) return null;
    const counts: Record<MatchCategory, number> = { clean: 0, review: 0, fraud_risk: 0, orphan: 0 };
    cards.forEach(c => {
      const cat = matchOverrides[c.id] || matchResults[c.id]?.category;
      if (cat && counts[cat] !== undefined) counts[cat] += 1;
    });
    return counts;
  }, [matchResults, matchOverrides, cards]);

  function categoryOf(cardId: number): MatchCategory | null {
    if (matchOverrides[cardId]) return matchOverrides[cardId];
    return matchResults?.[cardId]?.category || null;
  }

  const filteredMatchList = useMemo(() => {
    if (!matchResults) return [];
    let list = cards.map(c => ({ card: c, result: matchResults[c.id] })).filter(x => x.result);
    if (matchCategoryFilter !== 'all') {
      list = list.filter(x => categoryOf(x.card.id) === matchCategoryFilter);
    }
    if (matchSearch.trim()) {
      const q = matchSearch.trim().toLowerCase();
      list = list.filter(x =>
        Object.values(x.card.row).some(v => String(v).toLowerCase().includes(q)) ||
        String(x.result.matchedHospital?.name || '').toLowerCase().includes(q) ||
        String(helpers.voucherOf(x.card) || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [matchResults, matchOverrides, matchCategoryFilter, matchSearch, cards, helpers]);

  function setMatchOverride(cardId: number, category: MatchCategory) {
    setMatchOverrides({ ...matchOverrides, [cardId]: category });
  }

  function sendToFraudReview(card: Card, categoryLabel: string) {
    updateCard(card.id, {
      classifications: { ...card.classifications, fraud: true },
      deduction: helpers.fraudBasisAmount(card),
      comment: card.comment || `Flagged via Match Review — ${categoryLabel}. Full amount withheld (fraud/ghost patient).`,
    });
  }

  function undoSendToFraudReview(card: Card) {
    updateCard(card.id, {
      classifications: { ...card.classifications, fraud: false },
      deduction: 0,
    });
  }

  async function sendBatchToFraud() {
    const targets = cards.filter(c => {
      const cat = categoryOf(c.id);
      return (cat === 'fraud_risk' || cat === 'orphan') && !c.classifications?.fraud;
    });
    if (!targets.length) {
      toast({ title: 'Nothing to send', description: 'No unflagged Fraud Risk or Not Found records to send.' });
      return;
    }
    const ok = confirm(`Send ${targets.length} Fraud Risk / Not Found voucher(s) to Fraud Review? Their full RSSB-payable amount will be withheld (approved amount set to 0).`);
    if (!ok) return;
    targets.forEach(c => sendToFraudReview(c, CATEGORY_LABELS[categoryOf(c.id) as MatchCategory]));
    toast({ title: 'Sent to Fraud Review', description: `${targets.length} vouchers flagged.` });
  }

  function exportMatchResults() {
    if (!matchResults) return;
    const wb = buildMatchReportWorkbook(cards, matchResults, matchNotes, categoryOf);
    XLSX.writeFile(wb, `hospital_match_${fileName || 'export'}.xlsx`);
    toast({ title: 'Exported', description: 'Match report workbook downloaded.' });
  }

  if (!matchResults) {
    return (
      <div>
        <div className="empty-state rounded-xl border border-dashed border-border bg-card max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <GitCompareArrows className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-sm font-semibold text-foreground">No matches found</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Upload hospital data and run matching to compare pharmacy claims against hospital records.
              Matched records will appear here for review.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStage('hospital')}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors btn-press"
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            Go to Hospital Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {MATCH_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setMatchCategoryFilter(matchCategoryFilter === cat ? 'all' : cat)}
            className={`rounded-xl p-3.5 text-left border transition-colors ${CAT_COLORS[cat]} ${matchCategoryFilter === cat ? 'border-foreground' : 'border-transparent'}`}
          >
            <div className="text-xs font-medium opacity-80">{CATEGORY_LABELS[cat]}</div>
            <div className="text-xl font-semibold mt-1">{matchSummary?.[cat] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            placeholder="Search matched records…"
            value={matchSearch}
            onChange={e => setMatchSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card"
          />
        </div>
        <select value={matchCategoryFilter} onChange={e => setMatchCategoryFilter(e.target.value as MatchCategory | 'all')} className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card">
          <option value="all">All categories</option>
          {MATCH_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <button
          onClick={sendBatchToFraud}
          className="ml-auto inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 bg-danger text-white hover:bg-danger/90 transition-colors"
        >
          <ShieldAlert className="w-4 h-4" />
          Send Fraud Risk + Not Found to Fraud Review
        </button>
        <button
          onClick={exportMatchResults}
          className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export match report
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-4 max-w-3xl">
        Reminder: a normal deduction is calculated against 85% of total cost, or the mapped
        insurance co-payment amount if present. For vouchers sent here as Fraud Risk or Not Found,
        that entire basis is withheld — the approved/RSSB-payable amount becomes 0.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border max-h-[65vh] overflow-y-auto scrollbar-thin">
        <table className="w-full text-sm bg-card">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="text-xs text-muted-foreground text-left border-b border-border">
              <th className="px-3 py-2 font-medium">Voucher #</th>
              <th className="px-3 py-2 font-medium">Voucher date</th>
              <th className="px-3 py-2 font-medium">Pharmacy patient</th>
              <th className="px-3 py-2 font-medium">Pharmacy ID</th>
              <th className="px-3 py-2 font-medium">Matched hospital record</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Evidence</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Reviewer note</th>
              <th className="px-3 py-2 font-medium">Fraud review</th>
            </tr>
          </thead>
          <tbody>
            {filteredMatchList.map(({ card, result }: { card: Card; result: MatchResult }) => {
              const cat = categoryOf(card.id) as MatchCategory;
              const voucherDate = helpers.dateOf(card)?.toLocaleDateString() || helpers.dispensingDateOf(card)?.toLocaleDateString() || '—';
              return (
                <tr key={card.id} className="border-t border-border align-top row-hover-highlight">
                  <td className="px-3 py-2.5 font-medium">{helpers.voucherOf(card) || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{voucherDate}</td>
                  <td className="px-3 py-2.5">{String(helpers.mappedValue(card, 'patient_name') || `Record ${card.id + 1}`)}</td>
                  <td className="px-3 py-2.5">{String(helpers.mappedValue(card, 'rama_number') || '—')}</td>
                  <td className="px-3 py-2.5">
                    {result.matchedHospital ? (
                      <div>
                        <div>{result.matchedHospital.name}</div>
                        <div className="text-xs text-muted-foreground">{result.matchedHospital.fileName} · ID {String(result.matchedHospital.id || '—')}</div>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">{result.score}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[220px]">{result.reasons.join('; ')}</td>
                  <td className="px-3 py-2.5">
                    <select
                      value={cat}
                      onChange={e => setMatchOverride(card.id, e.target.value as MatchCategory)}
                      className={`text-xs rounded-lg px-2 py-1 border-0 ${CAT_COLORS[cat]}`}
                    >
                      {MATCH_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="text"
                      value={matchNotes[card.id] || ''}
                      onChange={e => setMatchNotes({ ...matchNotes, [card.id]: e.target.value })}
                      placeholder="Analyst note…"
                      className="min-w-[160px] border border-border rounded-lg px-2 py-1 text-xs bg-muted"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {card.classifications?.fraud ? (
                      <div className="flex flex-col gap-1 items-start">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-danger-light text-danger-dark">Sent ✓ ({(parseFloat(String(card.deduction)) || 0).toLocaleString()})</span>
                        <button onClick={() => undoSendToFraudReview(card)} className="text-xs text-muted-foreground underline">Undo</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => sendToFraudReview(card, CATEGORY_LABELS[cat])}
                        className="text-xs inline-flex items-center gap-1 border border-danger text-danger-dark rounded-lg px-2 py-1 hover:bg-danger-light transition-colors"
                      >
                        <ShieldAlert className="w-3 h-3" />
                        Send to Fraud Review
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredMatchList.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-16">
                  <div className="empty-state">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                      <FilterX className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <div className="text-center max-w-sm">
                      <p className="text-sm font-semibold text-foreground">No matches found</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {matchCategoryFilter !== 'all' || matchSearch
                          ? 'Try adjusting the category filter or search query to see more matched records.'
                          : 'No matched records to display.'}
                      </p>
                    </div>
                    {(matchCategoryFilter !== 'all' || matchSearch) && (
                      <button
                        type="button"
                        onClick={() => { setMatchCategoryFilter('all'); setMatchSearch(''); }}
                        className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors btn-press"
                      >
                        <FilterX className="w-3.5 h-3.5" />
                        Clear filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => setStage('fraud')}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        Continue to Fraud Review
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

void CLASSIFICATION_DEFS;
