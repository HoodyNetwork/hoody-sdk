// CardGrid (web and terminal): one Tab stop over the cards; arrows move, Enter picks the card under the
// cursor; a click picks a card; nothing to pick shows `empty`.
import { createElement as h } from 'react';
import { scenarios } from '../scenario-types';
import { loose } from '../layouts/scenarioRoute';
import { CardGrid } from './CardGrid';
import { PickCard } from './PickCard';

const ITEMS = [{ k: 'kuma', t: 'Uptime Kuma' }, { k: 'gitea', t: 'Gitea' }, { k: 'n8n', t: 'n8n' }];
const base = (s: { fn: (n: string) => (...a: unknown[]) => void }) => ({
  label: 'Programs',
  items: ITEMS,
  keyOf: (i: { k: string }) => i.k,
  textOf: (i: { t: string }) => i.t,
  renderCard: (i: { t: string }) => h(PickCard, { title: i.t }),
  onPick: s.fn('onPick'),
});

export default scenarios('CardGrid', loose(CardGrid), {
  ignored: { className: 'no CSS classes in a terminal' },
  unsupported: { focusKey: 'focus after a return; pinned in CardGrid.test.tsx (web) and CardGrid.term.test.tsx' },
  cases: [
    {
      name: 'a click picks that card',
      props: (s) => base(s),
      covers: ['label', 'items', 'keyOf', 'textOf', 'renderCard', 'onPick'],
      steps: [{ click: { role: 'row', name: 'Gitea' } }],
      expect: { calls: { onPick: [['gitea']] } },
    },
    {
      name: 'nothing to pick shows the empty state',
      props: (s) => ({ ...base(s), items: [], empty: 'No programs match' }),
      covers: ['empty'],
      steps: [],
      expect: { nodes: [{ target: { text: /No programs match/ } }] },
    },
  ],
});
