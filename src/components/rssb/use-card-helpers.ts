// Mapping-bound helper hooks — bind the pure cardHelpers functions to the
// current session's mapping so call sites stay clean.

import { useMemo } from 'react';
import { useSessionStore } from '@/store/session-store';
import * as CH from '@/lib/rssb/cardHelpers';
import type { Card } from '@/lib/rssb/types';

export function useCardHelpers() {
  const mapping = useSessionStore(s => s.mapping);
  return useMemo(() => ({
    mappedValue: (card: Card, key: Parameters<typeof CH.mappedValue>[1]) => CH.mappedValue(card, key, mapping),
    facilityOf: (card: Card) => CH.facilityOf(card, mapping),
    doctorOf: (card: Card) => CH.doctorOf(card, mapping),
    voucherOf: (card: Card) => CH.voucherOf(card, mapping),
    dateOf: (card: Card) => CH.dateOf(card, mapping),
    dispensingDateOf: (card: Card) => CH.dispensingDateOf(card, mapping),
    originalAmount: (card: Card) => CH.originalAmount(card, mapping),
    approvedAmount: (card: Card) => CH.approvedAmount(card, mapping),
    fraudBasisAmount: (card: Card) => CH.fraudBasisAmount(card, mapping),
    needsFraudReview: (card: Card) => CH.needsFraudReview(card, mapping),
    findRowValue: (card: Card, candidates: string[]) => CH.findRowValue(card, candidates),
    mapping,
  }), [mapping]);
}
