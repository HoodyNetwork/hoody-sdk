// Behaviour contract of Details → Usage (web and terminal). What both builds keep: the tab reads once on
// mount and never by itself again; Update and the stale band's Try again call refresh, a failed first read's Try again
// calls load; the by-model figures are a table with a row header per model; requests sit under their turn; fixed words only.
import { scenarios } from '../scenario-types';
import { UsageTab, type UsageTabProps } from './Usage';
import { requestsOf, usagePageOf } from './usage';
import type { UsageStore, UsageView } from './useUsage';
import strings from './Usage.strings.en.json';

const row = (id: number, o: Record<string, unknown> = {}) => ({
  id, ts: 1760000000 + id, turn_id: `r${id}`, attempt: -1, model: 'model-a', provider: 'p', input_tokens: 10, output_tokens: 5, cache_read_tokens: 90,
  cache_write_tokens: 0, cost_usd: 0.25, latency_ms: 800, success: true, error_code: '', kind: 'chat', ...o,
});
const TOTALS = { calls: 3, input_tokens: 30, output_tokens: 15, cache_read_tokens: 270, cache_write_tokens: 0, cost_usd: 0.75, cache_read_pct: 90, by_kind: {} };
function view(items: unknown[], o: Partial<UsageView> = {}): UsageView {
  const page = usagePageOf({ items, totals: TOTALS, next_after_id: items.length, has_more: false });
  if (!page) throw new Error('Usage.scenario: the fixture is not a usage page');
  return { phase: 'ready', error: null, rows: page.rows, requests: requestsOf(page.rows), totals: page.totals, more: false, heldPast: false, stale: false, reading: false, ...o };
}
function store(s: { fn(n: string): (...a: unknown[]) => void }, v: UsageView): UsageStore {
  const load = s.fn('load');
  const refresh = s.fn('refresh');
  return { view: () => v, subscribe: () => () => {}, load: async () => { load(); }, refresh: async () => { refresh(); }, reset: () => {} };
}
const THREE = [row(1), row(2, { model: 'model-b', cost_usd: 0.4312 }), row(3)];
const resp = (input: number, output: number, cacheRead: number) => ({ input, output, cacheRead, cacheWrite: 0 });
const UPDATE = { role: 'button', name: strings.update };
const RETRY = { role: 'button', name: strings.retry };

export default scenarios<UsageTabProps>('UsageTab', UsageTab, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'reads once on mount; the totals sit under the Usage heading and the models a table with a row header each',
      covers: ['store'],
      props: (s) => ({ turns: [], store: store(s, view(THREE)) }),
      steps: [],
      expect: {
        nodes: [{ target: { role: 'heading', name: strings.title } }, { target: { role: 'table' } }, { target: { role: 'rowheader', name: 'model-a' } }, { target: { role: 'rowheader', name: 'model-b' } }, { target: { role: 'cell', name: '$0.4312' } }, { target: { text: /^\$0\.75$/ } }],
        calls: { load: 1, refresh: 0 },
      },
    },
    {
      name: 'Update reads again through the store, once',
      covers: ['store'],
      props: (s) => ({ turns: [], store: store(s, view(THREE)) }),
      steps: [{ press: UPDATE }],
      expect: { calls: { refresh: 1, load: 1 } },
    },
    {
      name: 'while a read is out Update says Updating',
      covers: ['store'],
      props: (s) => ({ turns: [], store: store(s, view(THREE, { reading: true })) }),
      steps: [],
      expect: { nodes: [{ target: { role: 'button', name: new RegExp(strings.updating) } }], calls: { refresh: 0 } },
    },
    {
      name: 'a failed first read shows fixed words and Try again loads again',
      covers: ['store'],
      props: (s) => ({ turns: [], store: store(s, { ...view([]), phase: 'failed', error: { code: 'unreadable', status: 0 }, totals: null }) }),
      steps: [{ press: RETRY }],
      expect: { nodes: [{ target: { text: strings['failed.title'] } }, { target: { text: strings['failed.unreadable'] } }, { target: { role: 'table' }, absent: true }], calls: { load: 2, refresh: 0 } },
    },
    {
      name: 'a failed later read keeps the figures under a band whose Try again refreshes',
      covers: ['store'],
      props: (s) => ({ turns: [], store: store(s, view(THREE, { stale: true })) }),
      steps: [{ press: RETRY }],
      expect: { nodes: [{ target: { text: strings.stale } }, { target: { role: 'table' } }], calls: { refresh: 1, load: 1 } },
    },
    {
      name: 'no requests yet: the figures and the empty words, no table',
      covers: ['store'],
      props: (s) => ({ turns: [], store: store(s, view([])) }),
      steps: [],
      expect: { nodes: [{ target: { text: strings.empty } }, { target: { role: 'table' }, absent: true }], neverShown: [strings['turns.title'], strings['other.title']] },
    },
    {
      name: 'a request sits under the turn whose counts match; the rest is Other spend',
      covers: ['turns', 'store'],
      props: (s) => ({ turns: [{ key: 't1', label: 'Fix the checkout tests', responses: [resp(10, 5, 90)] }], store: store(s, view([row(1), row(2, { kind: 'compaction', turn_id: 'helper', input_tokens: 77 })])) }),
      steps: [],
      expect: {
        nodes: [{ target: { role: 'heading', name: strings['turns.title'] } }, { target: { text: 'Fix the checkout tests' } }, { target: { role: 'heading', name: strings['other.title'] } }, { target: { text: /^Compaction$/ } }],
      },
    },
    {
      name: 'without turns nothing is placed under a turn',
      covers: ['turns'],
      props: (s) => ({ turns: [], store: store(s, view([row(1)])) }),
      steps: [],
      expect: { nodes: [{ target: { role: 'heading', name: strings['other.title'] } }], neverShown: [strings['turns.title'], 'Fix the checkout tests'] },
    },
    {
      name: 'a failed request says Failed and the fixed word for its code, never the code',
      covers: ['store'],
      props: (s) => ({ turns: [], store: store(s, view([row(1, { success: false, error_code: 'rate_limit' })])) }),
      steps: [],
      expect: { nodes: [{ target: { text: /1 failed/ } }, { target: { text: strings['req.err.rate_limit'] } }], neverShown: ['rate_limit'] },
    },
    {
      name: 'before the first answer there are no figures',
      covers: ['store'],
      props: (s) => ({ turns: [], store: store(s, { ...view([]), phase: 'loading', totals: null, reading: true }) }),
      steps: [],
      expect: { nodes: [{ target: { role: 'table' }, absent: true }, { target: UPDATE, absent: true }], neverShown: [strings.empty], calls: { load: 1 } },
    },
  ],
});
