// Behaviour contract of PlanCard, run on the web and in the terminal (src/term/scenario): a group named by
// the plan with its name as a heading, the fold of further specs, the error state's retry, and what loading and error
// leave out. The tone is a look (web: colour; terminal: border colour, ground and a heavy accent border), pinned by
// PlanCard.term.test.tsx and the web PlanCard.test.tsx.
import { createElement as h, type ReactElement } from 'react';
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { PlanCard, PlanGrid } from './PlanCard';

const card = { role: 'group', name: 'Pro' };
// The fold's trigger (closed: the web keeps the folded lines in the DOM, hidden, so the state is what is compared).
const fold = { role: 'button', name: /Show all 4 details/ };
const base = { name: 'Pro', price: { amount: '$12', per: '/month' }, specs: ['4 cores', '8 GB memory'], more: ['Snapshots', 'Aliases'] };

const planCard = scenarios('PlanCard', loose(PlanCard), {
  ignored: {
    tone: 'read: look only; each platform draws its own frame (PlanCard.term.test.tsx, PlanCard.test.tsx)',
    fill: 'look only: a plan fill is a ground colour of the web card; the terminal frame says the tone',
    className: 'no CSS classes in a terminal',
  },
  unsupported: {},
  cases: [
    {
      name: 'a group named by the plan, its name a heading; the further specs start folded',
      props: base,
      steps: [],
      expect: { nodes: [{ target: card }, { target: { role: 'heading', name: 'Pro' } }, { target: { text: '4 cores' } }, { target: fold, states: { expanded: false } }] },
    },
    {
      name: 'the fold counts every spec line and opens to the rest',
      props: base,
      steps: [{ press: fold }],
      expect: { nodes: [{ target: fold, states: { expanded: true } }, { target: { text: 'Snapshots' } }, { target: { text: 'Aliases' } }] },
    },
    {
      name: 'error: the note under the error, Try again retries once, no price and no action',
      props: (s) => ({ ...base, state: 'error', note: 'The plans did not load.', onRetry: s.fn('onRetry'), action: 'Get Pro' }),
      steps: [{ press: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1 }, nodes: [{ target: { text: 'The plans did not load.' } }, { target: { text: '$12' }, absent: true }, { target: { text: 'Get Pro' }, absent: true }] },
    },
    {
      name: 'error while a retry runs: Try again does not retry again',
      props: (s) => ({ ...base, state: 'error', note: 'The plans did not load.', onRetry: s.fn('onRetry'), retrying: true }),
      steps: [{ press: { role: 'button', name: /Try again/ }, force: true }],
      expect: { calls: { onRetry: 0 } },
    },
    {
      name: 'loading: the card is busy and shows no price, note or action',
      props: { ...base, state: 'loading', note: 'Renews on the 3rd', action: 'Get Pro' },
      steps: [],
      expect: { nodes: [{ target: card, states: { busy: true } }, { target: { text: '$12' }, absent: true }, { target: { text: 'Renews on the 3rd' }, absent: true }, { target: { text: 'Get Pro' }, absent: true }] },
    },
    {
      name: 'ready: chip, marks, price and its period, lead, rows, footnote, note and the action are all shown',
      props: { ...base, chip: 'Shared', marks: 'Yours', lead: 'For a team', rows: [{ id: 'disk', label: 'Disk', value: '60 GB' }], footnote: 'Kept 7 days', note: 'Renews on the 3rd', action: 'Get Pro' },
      steps: [],
      expect: { nodes: ['Shared', 'Yours', '$12', '/month', 'For a team', 'Disk', '60 GB', 'Kept 7 days', 'Renews on the 3rd', 'Get Pro'].map((text) => ({ target: { text } })) },
    },
    {
      name: 'the line under the name, a price row in the price place and the regions are shown',
      props: {
        name: 'Pro',
        subTitle: 'A server of your own',
        rows: [{ id: 'from', label: 'From', value: '$70 a month', price: true }, { id: 'disk', label: 'Disk', value: '60 GB' }],
        regions: { label: 'Region', items: [{ id: 'par', name: 'Paris' }], note: 'More soon' },
      },
      steps: [],
      expect: { nodes: ['A server of your own', 'From', '$70 a month', 'Disk', '60 GB', 'Region', 'Paris', 'More soon'].map((text) => ({ target: { text } })) },
    },
  ],
});

type Html = (t: string, a: Record<string, unknown> | null, ...c: unknown[]) => ReactElement;
/** Three cards' worth of children, through each side's own HTML factory. */
const cards = (html: unknown): ReactElement[] => ['Free', 'Plus', 'Bare metal'].map((name) => (html as Html)('p', { key: name }, name));

const planGrid = scenarios('PlanGrid', loose(PlanGrid), {
  ignored: {
    '*': "HTML attributes of the web grid's own element (pages pass data-* marks only): the terminal grid has no element to carry them",
  },
  unsupported: {},
  cases: [
    {
      name: 'every card is shown, in fixed columns too',
      props: { columns: 3 },
      mount: (C, p, _s, html) => h(C, { ...(p as Record<string, unknown>), children: cards(html) } as never),
      covers: ['children', 'columns'],
      steps: [],
      expect: { nodes: ['Free', 'Plus', 'Bare metal'].map((text) => ({ target: { text } })) },
    },
    {
      name: 'wide: the last card keeps its place after the others',
      props: { wide: true },
      mount: (C, p, _s, html) => h(C, { ...(p as Record<string, unknown>), children: cards(html) } as never),
      covers: ['children', 'wide'],
      steps: [],
      expect: { nodes: ['Free', 'Plus', 'Bare metal'].map((text) => ({ target: { text } })) },
    },
  ],
});

export default [planCard, planGrid];
