// Behaviour contract of the Referral credit card (web and terminal): Available is the API's amount as sent, On hold names
// the due day and the hold hint, and Owed shows only above 0. A Referrer reads that withdrawal is for Creators, with no
// Withdraw button.
import strings from '../strings.en.json';
import { scenarios } from '../../../kit/scenario-types';
import type { Me } from '../logic';
import { CreditCard } from './CreditCard';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const me = (credit: Me['credit'], nextReleaseAt: string | null): Me => ({
  eligible: true,
  enrolled: true,
  state: 'active',
  enrolmentOpen: true,
  level: 'referrer',
  ratePercent: '5',
  creatorThreshold: 11,
  creatorRatePercent: '10',
  creatorCustomers: '0',
  codes: [],
  vanityLeft: null,
  counts: { signedUp: '0', paying: '0', active: '0' },
  credit,
  monthly: [],
  nextReleaseAt,
});

export default scenarios('CreditCard', CreditCard, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'a Referrer with credit on hold: the amounts as sent, the due day and the hint, no Withdraw',
      props: { t, me: me({ available: '12.50', pending: '4.00', reversed: '0.00', owed: '0.00' }, '2026-12-01T00:00:00.000Z') },
      steps: [],
      expect: {
        nodes: [
          { target: { role: 'heading', name: 'Referral credit' } },
          { target: { text: '$12.50' } },
          { target: { text: '$4.00' } },
          { target: { text: 'Processing or a review can make it arrive later; refunds can reduce or reverse credit.' } },
          { target: { text: 'Creators only. You\'re a Referrer.' } },
          { target: { text: 'Owed' }, absent: true },
          { target: { role: 'button', name: 'Withdraw…' }, absent: true },
        ],
      },
    },
    {
      name: 'owed above 0 shows its row and note',
      props: { t, me: me({ available: '0.00', pending: '0.00', reversed: '0.00', owed: '3.00' }, null) },
      steps: [],
      expect: { nodes: [{ target: { text: 'Owed' } }, { target: { text: '$3.00' } }] },
    },
  ],
});
