// Usage.term: the by-model table is sized to its figures (right-aligned, digits in line, one rule under the header) and
// the name takes the rest; under NAME_MIN cells of name it stacks; a turn is a block with its requests indented. The
// web markup through the compat runtime drew four equal columns with left-aligned figures, a rule under each name and
// every request line flush left, so the alignment, rule, stack and indent tests fail on that drawing.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { UsageTab, type UsageTurn } from './Usage';
import { requestsOf, usagePageOf } from './usage';
import type { UsageStore, UsageView } from './useUsage';

const LONG = 'anthropic/claude-sonnet-4.5-with-a-rather-long-name';
const row = (id: number, o: Record<string, unknown> = {}) => ({
  id, ts: 1760000000 + id, turn_id: `r${id}`, attempt: -1, model: 'hoody-ai/hoody-free', provider: 'p', input_tokens: 1210, output_tokens: 530, cache_read_tokens: 90400,
  cache_write_tokens: 0, cost_usd: 0.25, latency_ms: 800, success: true, error_code: '', kind: 'chat', ...o,
});
const TOTALS = { calls: 3, input_tokens: 3630, output_tokens: 1590, cache_read_tokens: 271200, cache_write_tokens: 0, cost_usd: 0.9312, cache_read_pct: 99, by_kind: {} };
function fake(items: unknown[], o: Partial<UsageView> = {}) {
  const page = usagePageOf({ items, totals: TOTALS, next_after_id: items.length, has_more: false })!;
  const v: UsageView = { phase: 'ready', error: null, rows: page.rows, requests: requestsOf(page.rows), totals: page.totals, more: false, heldPast: false, stale: false, reading: false, ...o };
  const calls: string[] = [];
  const store: UsageStore = { view: () => v, subscribe: () => () => {}, load: async () => { calls.push('load'); }, refresh: async () => { calls.push('refresh'); }, reset: () => {} };
  return { store, calls };
}
const ITEMS = [row(1), row(2), row(3, { model: LONG, cost_usd: 0.4312 })];
const lines = (f: string): string[] => f.split('\n').map((l) => l.trimEnd());

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });
async function draw(store: UsageStore, width: number, turns: UsageTurn[] = [], height = 60): Promise<string[]> {
  term = await drawTest(<FocusRoot><Box dir="column" width={width}><UsageTab store={store} turns={turns} /></Box></FocusRoot>, { width, height });
  return lines(await term.settle());
}
const from = (rows: string[], head: string): string[] => rows.slice(rows.findIndex((r) => r.trim() === head) + 1);

test('by model at 80 and 120 cells: figure columns as wide as their widest value, right-aligned, one rule under the header', async () => {
  for (const width of [80, 120]) {
    const { store } = fake(ITEMS);
    const t = from(await draw(store, width), 'By model');
    expect(t[0], String(width)).toBe('Model' + ' '.repeat(width - 5 - 34) + 'Requests  Tokens in / out     Cost');
    expect(t[1]).toBe('─'.repeat(width));
    expect(t[2]).toBe('hoody-ai/hoody-free'.padEnd(width - 34) + '       2  183,220 / 1,060    $0.50');
    expect(t[3]!.endsWith('       1     91,610 / 530  $0.4312')).toBe(true);
    // The name is never cut: every character of it is on the row, or wrapped under it in its own column.
    const name = (t[3]!.slice(0, width - 34) + (width === 80 ? t[4]! : '')).replace(/\s+/g, '');
    expect(name).toBe(LONG);
    expect(t.slice(2, 6).some((r) => r.includes('─'))).toBe(false);
    term!.renderer.destroy();
    term = null;
  }
}, 60_000);

test('by model in a 44-cell pane stacks: the name, then its figures under their column names', async () => {
  const { store } = fake(ITEMS);
  const t = from(await draw(store, 44, [], 80), 'By model');
  expect(t[0]).toBe('hoody-ai/hoody-free');
  expect(t[1]).toBe('  Requests 2');
  expect(t.slice(1, 4).join(' ').replace(/\s+/g, ' ')).toBe(' Requests 2 Tokens in / out 183,220 / 1,060 Cost $0.50');
  expect(t.some((r) => r.includes('…'))).toBe(false);
  expect(t.join('').replace(/\s+/g, '')).toContain(LONG);
}, 60_000);

test('a turn is a block: label with its count and cost at the row end, requests indented under it, a blank row between turns', async () => {
  const resp = { input: 1210, output: 530, cacheRead: 90400, cacheWrite: 0 };
  const { store } = fake([row(1, { turn_id: 'a' }), row(2, { turn_id: 'b', model: LONG, cost_usd: 0.4312, input_tokens: 99, output_tokens: 7, cache_read_tokens: 0 })]);
  const rows = await draw(store, 80, [{ key: 't1', label: 'Fix the checkout tests', responses: [resp] }, { key: 't2', label: 'Turn 2', responses: [{ input: 99, output: 7, cacheRead: 0, cacheWrite: 0 }] }]);
  const t = from(rows, 'By turn').filter((r, i) => i > 1 || !r.startsWith('A turn') && !r.startsWith('step'));
  const at = t.findIndex((r) => r.startsWith('Fix the checkout tests'));
  expect(t[at]).toBe('Fix the checkout tests' + ' '.repeat(80 - 22 - 17) + '1 request · $0.25');
  expect(t[at + 1]).toBe('  hoody-ai/hoody-free');
  expect(t[at + 2]).toBe('    91,610 in, 530 out · 90,400 cached · $0.25');
  expect(t[at + 3]).toBe('');
  expect(t[at + 4]).toBe('Turn 2' + ' '.repeat(80 - 6 - 19) + '1 request · $0.4312');
  expect(t[at + 5]).toBe('  ' + LONG);
  expect(t[at + 6]).toBe('    99 in, 7 out · $0.4312');
}, 60_000);

test('keys: Tab reaches Update and Enter refreshes once; the mount read once', async () => {
  const { store, calls } = fake(ITEMS);
  await draw(store, 80);
  expect(calls).toEqual(['load']);
  term!.mockInput.pressTab();
  await term!.settle();
  term!.mockInput.pressEnter();
  await term!.settle();
  expect(calls).toEqual(['load', 'refresh']);
}, 60_000);

test('a failed or unfinished request is marked on its model row and on its own line, in fixed words', async () => {
  const { store } = fake([row(1, { success: false, error_code: 'rate_limit' })]);
  const rows = await draw(store, 80);
  expect(from(rows, 'By model')[2]!.startsWith('hoody-ai/hoody-free · 1 failed')).toBe(true);
  const other = from(rows, 'Other spend').join('\n');
  expect(other).toContain('Failed');
  expect(other).toContain('rate limited');
  expect(rows.join('\n')).not.toContain('rate_limit');
}, 60_000);
