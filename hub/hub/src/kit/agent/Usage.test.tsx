// Details → Usage on a live component over a fake api: totals, by model, requests under turns by their stream_done
// counts, other spend, failed and unfinished requests, the failed / stale / empty states.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { UsageTab, type UsageTurn } from './Usage';
import { createUsageStore } from './useUsage';
import strings from './Usage.strings.en.json';

type Ans = { ok: true; body: unknown } | { ok: false; err: { kind: 'failed'; code: string; status: number; retryAfter: null; details: object } };
const w = (id: number, o: Record<string, unknown> = {}) => ({
  id, ts: 1760000000 + id, turn_id: `r${id}`, attempt: -1, model: 'model-a', provider: 'p', input_tokens: 10, output_tokens: 5, cache_read_tokens: 90,
  cache_write_tokens: 0, cost_usd: 0.25, latency_ms: 800, success: true, error_code: '', kind: 'chat', ...o,
});
const totals = { calls: 3, input_tokens: 30, output_tokens: 15, cache_read_tokens: 270, cache_write_tokens: 0, cost_usd: 0.75, cache_read_pct: 90, by_kind: {} };
const body = (items: unknown[], o: Record<string, unknown> = {}) => ({ items, totals, next_after_id: items.length ? (items[items.length - 1] as { id: number }).id : 0, has_more: false, ...o });

function fake() {
  const q: Array<(a: Ans) => void> = [];
  return { q, api: { session: () => new Promise<Ans>((r) => q.push(r)) as never } };
}
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const words = (k: keyof typeof strings, v: Record<string, string> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');
const resp = (input: number, output: number, cacheRead: number) => ({ input, output, cacheRead, cacheWrite: 0 });

async function show(items: unknown[], turns: UsageTurn[] = [], o: Record<string, unknown> = {}) {
  const f = fake();
  const store = createUsageStore({ api: f.api, id: 's1' });
  render(<UsageTab store={store} turns={turns} />);
  await settle();
  await act(async () => { f.q[0]!({ ok: true, body: body(items, o) }); });
  await settle();
  return { f, store };
}

afterEach(() => cleanup());

/** The totals: a kit section named by its own header. */
const totalsRegion = () => screen.getByRole('region', { name: words('title') });

describe('the tab', () => {
  it('reads on mount and shows the totals of the whole chat', async () => {
    await show([w(1), w(2), w(3)]);
    const facts = totalsRegion();
    expect(within(facts).getByText('3')).toBeTruthy();
    expect(within(facts).getByText('300')).toBeTruthy(); // prompt tokens: 30 + 270 cached
    expect(within(facts).getByText('15')).toBeTruthy();
    expect(within(facts).getByText(words('cache.pct', { pct: '90' }))).toBeTruthy();
    expect(within(facts).getByText('$0.75')).toBeTruthy();
  });
  it('speech cost is not in the server totals, so the cost fact adds it and the note names the calls', async () => {
    await show([w(1), w(2), w(3), w(4, { turn_id: 'v1', kind: 'speech', cost_usd: 0.1 })]);
    const facts = totalsRegion();
    expect(within(facts).getByText('$0.85')).toBeTruthy(); // 0.75 chat + 0.10 speech
    expect(screen.getByText(words('speech_one', { count: '1', cost: '$0.10' }))).toBeTruthy();
  });
  it('cost: the chat and compaction total, plus the whole chat\'s speech from the agent\'s totals (not only loaded rows), plus side questions read', async () => {
    await show([w(1, { cost_usd: 1 }), w(2, { turn_id: 'side1', kind: 'side', cost_usd: 4 })], [], { totals: { ...totals, cost_usd: 1, calls: 1, by_kind: { speech: { calls: 2, cost_usd: 3 } } } });
    const facts = totalsRegion();
    expect(within(facts).getByText('$8.00')).toBeTruthy(); // 1 + 3 speech (none loaded) + 4 side
    expect(screen.getByText(words('speech_other', { count: '2', cost: '$3.00' }))).toBeTruthy();
    expect(screen.getByText(words('side_one', { count: '1', cost: '$4.00' }))).toBeTruthy();
  });
  it('cost is "at least" while rows are unread: side questions in them are not in the agent\'s totals', async () => {
    await show([], [], { has_more: true, next_after_id: 0 });
    const facts = totalsRegion();
    expect(within(facts).getByText(words('cost.atLeast', { cost: '$0.75' }))).toBeTruthy();
  });
  it('with rows unread, a lone token-count placement is still marked, since the identical request may be unread', async () => {
    const f = fake();
    const store = createUsageStore({ api: f.api, id: 's1' });
    render(<UsageTab store={store} turns={[{ key: 't1', label: 'Turn 1', responses: [resp(10, 5, 90)] }]} />);
    await settle();
    await act(async () => { f.q[0]!({ ok: true, body: body([w(1, { turn_id: 'helper', cost_usd: 8 })], { has_more: true }) }); });
    await settle();
    await act(async () => { f.q[1]!({ ok: true, body: body([], { has_more: true, next_after_id: 1 }) }); }); // moves nowhere: rows stay unread
    await settle();
    expect(screen.getByText(words('more'))).toBeTruthy();
    expect(screen.getByText(/Placed by token counts/)).toBeTruthy();
  });
  it('rows kept from an earlier read say so in the More band (the read cap)', async () => {
    const f = fake();
    const real = createUsageStore({ api: f.api, id: 's1' });
    let last: ReturnType<typeof real.view> | null = null, mapped = real.view();
    const held = { ...real, view: () => { const cur = real.view(); if (cur !== last) { last = cur; mapped = { ...cur, heldPast: true }; } return mapped; } };
    render(<UsageTab store={held} turns={[]} />);
    await settle();
    await act(async () => { f.q[0]!({ ok: true, body: body([w(1)]) }); });
    await settle();
    expect(screen.getByText(words('more.held'))).toBeTruthy();
    expect(screen.queryByText(words('more'))).toBeNull();
  });
  it('the server\'s call count includes failed attempts, so it is labelled as calls, not requests', async () => {
    await show([w(1, { turn_id: 'a', attempt: 0, success: false, error_code: 'timeout' }), w(2, { turn_id: 'a' })], [], { totals: { ...totals, calls: 2 } });
    const facts = totalsRegion();
    expect(within(facts).getByText(words('facts.calls'))).toBeTruthy();
    expect(within(facts).queryByText('Requests')).toBeNull();
    const row = within(screen.getByRole('table')).getAllByRole('row')[1]!;
    expect(within(row).getAllByRole('cell')[0]!.textContent).toBe('1'); // one logical request in the model table
  });
  it('tokens include a failed attempt\'s billed tokens', async () => {
    await show([
      w(1, { turn_id: 'a', attempt: 0, success: false, error_code: 'timeout', input_tokens: 1200, cache_read_tokens: 300, cache_write_tokens: 40, output_tokens: 800 }),
      w(2, { turn_id: 'a', input_tokens: 10, output_tokens: 5, cache_read_tokens: 0 }),
    ]);
    const row = within(screen.getByRole('table')).getAllByRole('row')[1]!;
    expect(within(row).getAllByRole('cell')[1]!.textContent).toBe('1,550 / 805300 cached'); // 1200+300+40+10 in; then the cached line (300)
    expect(screen.getByText(/1,550 in, 805 out/)).toBeTruthy(); // the request list says the same
  });
  it('a request placed under a turn only by equal token counts, with an identical one left over, is marked', async () => {
    await show([w(1, { turn_id: 'helper', cost_usd: 8 }), w(2, { turn_id: 'fore', cost_usd: 1 })], [{ key: 't1', label: 'Turn 1', responses: [resp(10, 5, 90)] }]);
    expect(screen.getByText(/Placed by token counts/)).toBeTruthy();
    expect(screen.getByText(words('turn.ambiguous', { n: '1' }))).toBeTruthy();
  });
  it('by model: a model with nothing served from the cache says no "0 cached", as a request row does not', async () => {
    await show([w(1, { model: 'cold', input_tokens: 10, output_tokens: 5, cache_read_tokens: 0 })]);
    const row = within(screen.getByRole('table')).getAllByRole('row')[1]!;
    expect(within(row).getAllByRole('cell')[1]!.textContent).not.toMatch(/cached/);
  });
  it('by model: one row per model with its requests, tokens and cost; failed and unfinished requests are counted apart', async () => {
    await show([w(1, { model: 'cheap', cost_usd: 0.01 }), w(2, { model: 'big', cost_usd: 1 }), w(3, { model: 'big', cost_usd: 0.5, success: false, error_code: 'timeout' }), w(4, { model: 'big', attempt: 0, success: false, error_code: 'network' })]);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    // Requests; tokens in / out with, on a line of its own, those of the tokens in served from the cache (90 a request); cost.
    expect(rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([['3', '300 / 15270 cached', '$1.75'], ['1', '100 / 590 cached', '$0.01']]);
    expect(within(rows[0]!).getByText('270 cached').tagName).toBe('SPAN');
    expect(within(rows[0]!).getByRole('rowheader').textContent).toContain('big');
    expect(within(rows[0]!).getByRole('rowheader').textContent).toContain(words('model.failed', { n: '1' }));
    expect(within(rows[0]!).getByRole('rowheader').textContent).toContain(words('model.open', { n: '1' }));
    expect(within(rows[1]!).getByRole('rowheader').textContent).toContain('cheap');
  });
  it('requests sit under the turn whose stream_done counts they match; the rest is Other spend', async () => {
    await show(
      [w(1, { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cost_usd: 1 }), w(2, { input_tokens: 2, output_tokens: 2, cache_read_tokens: 0, cost_usd: 2, model: 'helper-model' }), w(3, { input_tokens: 3, output_tokens: 3, cache_read_tokens: 0, cost_usd: 3 })],
      [{ key: 't1', label: 'Turn 1', responses: [resp(1, 1, 0)] }, { key: 't2', label: 'Turn 2', responses: [resp(3, 3, 0)] }],
    );
    const sections = screen.getByRole('region', { name: words('turns.title') });
    expect(within(sections).getByText('Turn 1')).toBeTruthy();
    expect(within(sections).getByText('Turn 2')).toBeTruthy();
    expect(within(sections).queryByText('helper-model')).toBeNull();
    const other = screen.getByRole('region', { name: words('other.title') });
    expect(within(other).getByText('helper-model')).toBeTruthy();
  });
  it('a response no request matches says so', async () => {
    await show([w(1)], [{ key: 't1', label: 'Turn 1', responses: [resp(999, 1, 0)] }]);
    expect(screen.getByText(words('turn.unmatched', { n: '1' }))).toBeTruthy();
    expect(screen.getByText(words('turn.empty'))).toBeTruthy();
  });
  it('a failed request names why in fixed words; an unknown code reads as unknown, never the server text', async () => {
    await show([w(1, { success: false, error_code: 'rate_limit' }), w(2, { success: false, error_code: 'secret thing /home/x' })]);
    expect(screen.getAllByText(words('req.failed')).length).toBe(2);
    expect(screen.getByText(words('req.err.rate_limit'))).toBeTruthy();
    expect(screen.getByText(words('req.err.unknown'))).toBeTruthy();
    expect(screen.queryByText(/secret thing/)).toBeNull();
  });
  it('an empty chat says so', async () => {
    await show([]);
    expect(screen.getByText(words('empty'))).toBeTruthy();
  });
  it('each part is a kit section under its own header; Update is the totals\' inline action, not a header one', async () => {
    await show(
      [w(1, { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cost_usd: 1 }), w(2, { input_tokens: 2, output_tokens: 2, cache_read_tokens: 0, cost_usd: 2, model: 'helper-model' })],
      [{ key: 't1', label: 'Turn 1', responses: [resp(1, 1, 0)] }],
    );
    const names = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(names).toEqual([words('title'), words('model.title'), words('turns.title'), words('other.title')]);
    const totals = totalsRegion();
    expect(within(totals).getByRole('button', { name: words('update') })).toBeTruthy();
    expect(within(totals).getByRole('heading').closest('header')?.querySelector('button')).toBeNull();
    expect(within(screen.getByRole('region', { name: words('model.title') })).getByRole('table')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: words('turns.title') })).getByText(words('turns.note'))).toBeTruthy();
    expect(within(screen.getByRole('region', { name: words('other.title') })).getByText(words('other.note'))).toBeTruthy();
  });
  it('Update stays a button on a narrow Details (under 600 px of content), not folded into a More menu', async () => {
    const main = document.createElement('div');
    main.id = 'hub-main';
    Object.defineProperty(main, 'clientWidth', { configurable: true, value: 360 });
    document.body.appendChild(main);
    try {
      await show([w(1)]);
      expect(within(totalsRegion()).getByRole('button', { name: words('update') })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /More/ })).toBeNull();
    } finally {
      main.remove();
    }
  });
  it('an empty chat has only the totals section', async () => {
    await show([]);
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([words('title')]);
    expect(within(totalsRegion()).getByText(words('empty'))).toBeTruthy();
  });
  it('more rows than the page cap: says the totals still count all of them', async () => {
    await show([], [], { has_more: true, next_after_id: 0 });
    expect(screen.getByText(words('more'))).toBeTruthy();
  });
});

describe('failures', () => {
  it('a failed first read never shows a code the tab does not know', async () => {
    const f = fake();
    const store = createUsageStore({ api: f.api, id: 's1' });
    render(<UsageTab store={store} turns={[]} />);
    await settle();
    await act(async () => { f.q[0]!({ ok: false, err: { kind: 'failed', code: 'server private /home/x', status: 500, retryAfter: null, details: {} } }); });
    await settle();
    expect(screen.getByText(words('failed.status', { status: '500' }))).toBeTruthy();
    expect(screen.queryByText(/private/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/home\/x/);
  });
  it('a first read dropped because the context moved offers Try again, not an endless skeleton', async () => {
    const f = fake();
    const store = createUsageStore({ api: f.api, id: 's1' });
    render(<UsageTab store={store} turns={[]} />);
    await settle();
    await act(async () => { f.q[0]!({ ok: false, err: { kind: 'stale', code: '', status: 0, retryAfter: null, details: {} } as never }); });
    await settle();
    expect(screen.getByText(words('failed.stale'))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await settle();
    await act(async () => { f.q[1]!({ ok: true, body: body([w(1)]) }); });
    await settle();
    expect(screen.getByRole('table')).toBeTruthy();
  });
  it('a failed first read offers Try again, which reads again', async () => {
    const f = fake();
    const store = createUsageStore({ api: f.api, id: 's1' });
    render(<UsageTab store={store} turns={[]} />);
    await settle();
    await act(async () => { f.q[0]!({ ok: false, err: { kind: 'failed', code: 'internal', status: 500, retryAfter: null, details: {} } }); });
    await settle();
    expect(screen.getByText(words('failed.title'))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await settle();
    expect(f.q.length).toBe(2);
    await act(async () => { f.q[1]!({ ok: true, body: body([w(1)]) }); });
    await settle();
    expect(screen.queryByText(words('failed.title'))).toBeNull();
  });
  it('an unreadable answer is not shown as an empty chat', async () => {
    const f = fake();
    const store = createUsageStore({ api: f.api, id: 's1' });
    render(<UsageTab store={store} turns={[]} />);
    await settle();
    await act(async () => { f.q[0]!({ ok: true, body: { items: [{ id: 'x' }] } }); });
    await settle();
    expect(screen.getByText(words('failed.unreadable'))).toBeTruthy();
    expect(screen.queryByText(words('empty'))).toBeNull();
  });
  it('a failed update keeps the figures and says they may be out of date; Update reads only what is new', async () => {
    const { f } = await show([w(1)]);
    await userEvent.click(screen.getByRole('button', { name: words('update') }));
    await settle();
    expect(f.q.length).toBe(2);
    await act(async () => { f.q[1]!({ ok: false, err: { kind: 'failed', code: '', status: 503, retryAfter: null, details: {} } }); });
    await settle();
    expect(screen.getByText(words('stale'))).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });
});
