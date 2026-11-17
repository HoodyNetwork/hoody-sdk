// Details → Usage logic: strict reading, requests from rows, requests placed under turns by stream_done counts,
// the per-model table and the PascalCase rollup.
import { describe, expect, it } from 'vitest';
import {
  byModel, cachePct, groupTurns, mergeRows, requestsOf, rollupOf, sideOf, speechOf, usagePageOf,
  type Response, type UsageRequest, type UsageRow,
} from './usage';

let n = 0;
const wire = (o: Record<string, unknown> = {}) => ({
  id: ++n, ts: 1760000000 + n, turn_id: `req-${n}`, attempt: -1, model: 'm1', provider: 'p1', input_tokens: 10, output_tokens: 5,
  cache_read_tokens: 100, cache_write_tokens: 0, cost_usd: 0.01, latency_ms: 900, success: true, error_code: '', kind: 'chat', ...o,
});
const totals = { calls: 1, input_tokens: 10, output_tokens: 5, cache_read_tokens: 100, cache_write_tokens: 0, cost_usd: 0.01, cache_read_pct: 90.9, by_kind: {} };
const lastId = (items: unknown[]): number => (items.length ? (((items[items.length - 1] as { id?: number } | null)?.id ?? 0)) : 0);
const page = (items: unknown[], o: Record<string, unknown> = {}) => ({ items, totals, next_after_id: lastId(items), has_more: false, ...o });
const rows = (items: Array<Record<string, unknown>>): UsageRow[] => usagePageOf(page(items))!.rows;
const resp = (input: number, output: number, cacheRead = 0, cacheWrite = 0): Response => ({ input, output, cacheRead, cacheWrite });

describe('usagePageOf', () => {
  it('reads a page: rows, totals, the cursor', () => {
    const p = usagePageOf(page([wire({ id: 3, turn_id: 'a' })], { next_after_id: 3, has_more: true }))!;
    expect(p.rows[0]).toMatchObject({ id: 3, request: 'a', attempt: -1, model: 'm1', input: 10, output: 5, cacheRead: 100, cacheWrite: 0, cost: 0.01, kind: 'chat', success: true });
    expect(p.totals).toMatchObject({ calls: 1, input: 10, cachePct: 90.9 });
    expect(p).toMatchObject({ next: 3, more: true });
  });
  it('an older agent\'s row without kind is a chat row', () => {
    const w = wire();
    delete (w as Record<string, unknown>).kind;
    expect(usagePageOf(page([w]))!.rows[0]!.kind).toBe('chat');
  });
  it('any malformed row, total or cursor makes the page unreadable (never a shorter list)', () => {
    const bad: unknown[] = [
      null, [], {}, { items: 'x', totals }, page([wire(), null]), page([wire({ id: -1 })]), page([wire({ cost_usd: 'x' })]),
      page([wire({ cost_usd: -1 })]), page([wire({ input_tokens: 1.5 })]), page([wire({ success: 'yes' })]), page([wire({ attempt: -3 })]),
      page([wire({ kind: 'dream' })]), page([wire({ turn_id: 5 })]), page([wire({ error_code: 5 })]),
      page([], { totals: null }), page([], { totals: { ...totals, cache_read_pct: 120 } }), page([], { next_after_id: 'x' }), page([], { has_more: 'no' }),
    ];
    for (const b of bad) expect(usagePageOf(b)).toBeNull();
  });
  it('an empty page is readable', () => {
    expect(usagePageOf(page([], { next_after_id: 0 }))).toMatchObject({ rows: [], next: 0, more: false });
  });
});

describe('usagePageOf: a page that is not a consistent slice is unreadable', () => {
  it('rows must grow strictly, start after the cursor asked, and the cursor returned is the last row id (or the one asked when empty)', () => {
    expect(usagePageOf(page([wire({ id: 1 })], { next_after_id: 100 }))).toBeNull(); // would skip rows 2..100 on the next read
    expect(usagePageOf(page([wire({ id: 5, turn_id: 'a' }), wire({ id: 5, turn_id: 'a' })]))).toBeNull(); // the same row twice = double spend
    expect(usagePageOf(page([wire({ id: 6 }), wire({ id: 5 })]))).toBeNull();
    expect(usagePageOf(page([wire({ id: 3 })]), 3)).toBeNull(); // after_id is exclusive
    expect(usagePageOf(page([wire({ id: 4 })]), 3)).not.toBeNull();
    expect(usagePageOf(page([], { next_after_id: 9 }), 3)).toBeNull(); // empty: the cursor asked comes back
    expect(usagePageOf(page([], { next_after_id: 3 }), 3)).not.toBeNull();
  });
  it('mergeRows never doubles a row, even inside one page', () => {
    const a = rows([wire({ id: 50, turn_id: 'x', cost_usd: 1 })]);
    const dup = { ...a[0]! };
    expect(mergeRows([], [a[0]!, dup])).toHaveLength(1);
  });
  it('totals carry the whole-chat speech spend when the agent gives by_kind.speech; a malformed one is unreadable; absent is unknown', () => {
    const t = (by_kind: unknown) => page([], { totals: { ...totals, by_kind } });
    expect(usagePageOf(t({ speech: { calls: 2, cost_usd: 4 } }))!.totals.speech).toEqual({ calls: 2, cost: 4 });
    expect(usagePageOf(t({}))!.totals.speech).toBeNull();
    expect(usagePageOf(t({ speech: { calls: 2, cost_usd: -1 } }))).toBeNull();
    expect(usagePageOf(t({ speech: { calls: 'x', cost_usd: 1 } }))).toBeNull();
  });
});

describe('requestsOf', () => {
  it('rows sharing a turn_id are one request: failed attempts, then the outcome row; its counts are the outcome\'s', () => {
    const r = requestsOf(rows([
      wire({ id: 1, turn_id: 'a', attempt: 0, success: false, error_code: 'rate_limit', cost_usd: 0.002, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 }),
      wire({ id: 2, turn_id: 'a', attempt: -1, input_tokens: 7, output_tokens: 3, cache_read_tokens: 50, cost_usd: 0.02 }),
    ]));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'a', state: 'ok', retries: 1, input: 7, output: 3, cacheRead: 50, errorCode: '', firstRow: 1, lastRow: 2 });
    expect(r[0]!.cost).toBeCloseTo(0.022);
  });
  it('a failed outcome keeps its error code; a request with only failed attempts is open', () => {
    const r = requestsOf(rows([
      wire({ id: 1, turn_id: 'a', attempt: -1, success: false, error_code: 'timeout' }),
      wire({ id: 2, turn_id: 'b', attempt: 0, success: false, error_code: 'network' }),
    ]));
    expect(r.map((q) => [q.state, q.errorCode])).toEqual([['failed', 'timeout'], ['open', 'network']]);
  });
  it('a failed fusion spend (-2) adds cost but is not a retry and not an outcome', () => {
    const r = requestsOf(rows([
      wire({ id: 1, turn_id: 'a', attempt: -2, cost_usd: 0.5, success: false }),
      wire({ id: 2, turn_id: 'a', attempt: -1, success: false, error_code: 'provider', cost_usd: 0 }),
    ]));
    expect(r[0]).toMatchObject({ state: 'failed', retries: 0, cost: 0.5 });
  });
  it('speech rows are not model requests; compaction and side rows are', () => {
    const rs = rows([wire({ id: 1, turn_id: 'compact:1', kind: 'compaction' }), wire({ id: 2, turn_id: 's', kind: 'side' }), wire({ id: 3, turn_id: 'v', kind: 'speech', cost_usd: 0.3 })]);
    expect(requestsOf(rs).map((q) => q.kind)).toEqual(['compaction', 'side']);
    expect(speechOf(rs)).toEqual({ calls: 1, cost: 0.3 });
  });
  it('requests keep the order of their first row; uncertain cost is carried', () => {
    const r = requestsOf(rows([wire({ id: 1, turn_id: 'b' }), wire({ id: 2, turn_id: 'a', cost_uncertain: true }), wire({ id: 3, turn_id: 'b', attempt: -2 })]));
    expect(r.map((q) => q.id)).toEqual(['b', 'a']);
    expect(r[1]!.uncertain).toBe(true);
  });
});

describe('groupTurns', () => {
  const req = (id: string, i: number, o: number, extra: Partial<Omit<UsageRequest, 'billed'>> = {}): UsageRequest => ({
    id, kind: 'chat', model: 'm', provider: 'p', state: 'ok', retries: 0, input: i, output: o, cacheRead: 0, cacheWrite: 0, cost: 1, billed: { input: i, output: o, cacheRead: 0, cacheWrite: 0 }, latencyMs: 0,
    errorCode: '', uncertain: false, at: 0, firstRow: 0, lastRow: 0, ...extra,
  });
  it('each turn takes the requests whose four counts equal its responses, in order', () => {
    const r = [req('a', 1, 1), req('b', 2, 2), req('c', 3, 3)];
    const g = groupTurns(r, [{ key: 't1', responses: [resp(1, 1), resp(2, 2)] }, { key: 't2', responses: [resp(3, 3)] }]);
    expect(g.turns.map((t) => t.requests.map((x) => x.request.id))).toEqual([['a', 'b'], ['c']]);
    expect(g.turns.map((t) => t.cost)).toEqual([2, 1]);
    expect(g.other).toEqual([]);
  });
  it('a request no response claims lies in a turn only between its claimed requests; before or after it is other', () => {
    const r = [req('bg0', 9, 9), req('a', 1, 1), req('helper', 8, 8), req('b', 2, 2), req('bg1', 7, 7)];
    const g = groupTurns(r, [{ key: 't1', responses: [resp(1, 1), resp(2, 2)] }]);
    expect(g.turns[0]!.requests.map((x) => [x.request.id, x.claimed])).toEqual([['a', true], ['helper', false], ['b', true]]);
    expect(g.other.map((q) => q.id)).toEqual(['bg0', 'bg1']);
  });
  it('identical counts are claimed first-come in order, never twice', () => {
    const r = [req('a', 5, 5), req('b', 5, 5)];
    const g = groupTurns(r, [{ key: 't1', responses: [resp(5, 5)] }, { key: 't2', responses: [resp(5, 5)] }]);
    expect(g.turns.map((t) => t.requests.map((x) => x.request.id))).toEqual([['a'], ['b']]);
  });
  it('a history request with the same counts as a live response stays other: the live response takes the newest equal request', () => {
    const r = [req('old', 5, 5), req('live', 5, 5)];
    const g = groupTurns(r, [{ key: 't1', responses: [resp(5, 5)] }]);
    expect(g.turns[0]!.requests.map((x) => x.request.id)).toEqual(['live']);
    expect(g.other.map((q) => q.id)).toEqual(['old']);
  });
  it('equal counts across live responses keep their order: later responses take later requests, in a turn and across turns, and history stays other', () => {
    const r = [req('h', 5, 5), req('a', 5, 5), req('b', 5, 5), req('c', 5, 5)];
    const g = groupTurns(r, [{ key: 't1', responses: [resp(5, 5), resp(5, 5)] }, { key: 't2', responses: [resp(5, 5)] }]);
    expect(g.turns.map((t) => t.requests.map((x) => x.request.id))).toEqual([['a', 'b'], ['c']]);
    expect(g.other.map((q) => q.id)).toEqual(['h']);
  });
  it('a response no request matches is counted, not invented; later responses still match', () => {
    const r = [req('a', 1, 1), req('c', 3, 3)];
    const g = groupTurns(r, [{ key: 't1', responses: [resp(1, 1), resp(2, 2), resp(3, 3)] }]);
    expect(g.turns[0]).toMatchObject({ unmatched: 1 });
    expect(g.turns[0]!.requests.map((x) => x.request.id)).toEqual(['a', 'c']);
  });
  it('only an ok chat request can be a response: failed, compaction and side requests with the same counts are never claimed', () => {
    const r = [req('a', 1, 1), req('f', 2, 2, { state: 'failed' }), req('k', 2, 2, { kind: 'compaction' }), req('s', 2, 2, { kind: 'side' }), req('b', 2, 2)];
    const g = groupTurns(r, [{ key: 't1', responses: [resp(1, 1), resp(2, 2)] }]);
    expect(g.turns[0]!.requests.map((x) => [x.request.id, x.claimed])).toEqual([['a', true], ['f', false], ['k', false], ['s', false], ['b', true]]);
  });
  it('no turns: everything is other; turns without responses are empty', () => {
    const r = [req('a', 1, 1)];
    expect(groupTurns(r, []).other).toHaveLength(1);
    expect(groupTurns(r, [{ key: 't', responses: [] }]).turns[0]).toMatchObject({ requests: [], unmatched: 0 });
  });
  it('cache counts take part in the match', () => {
    const r = [req('a', 1, 1, { cacheRead: 50 })];
    expect(groupTurns(r, [{ key: 't', responses: [resp(1, 1, 0, 0)] }]).other).toHaveLength(1);
    expect(groupTurns(r, [{ key: 't', responses: [resp(1, 1, 50, 0)] }]).other).toHaveLength(0);
  });
});

describe('byModel', () => {
  it('groups by provider and model, largest spend first; failed and open are counted apart', () => {
    const rs = requestsOf(rows([
      wire({ id: 1, turn_id: 'a', model: 'x', provider: 'p', cost_usd: 1, input_tokens: 10 }),
      wire({ id: 2, turn_id: 'b', model: 'x', provider: 'p', cost_usd: 1, success: false, error_code: 'timeout', input_tokens: 0 }),
      wire({ id: 3, turn_id: 'c', model: 'y', provider: 'p', cost_usd: 5 }),
      wire({ id: 4, turn_id: 'd', model: 'x', provider: 'q', cost_usd: 0.1 }),
      wire({ id: 5, turn_id: 'e', attempt: 0, model: 'y', provider: 'p', success: false, cost_usd: 0 }),
    ]));
    const m = byModel(rs);
    expect(m.map((x) => `${x.provider}/${x.model}`)).toEqual(['p/y', 'p/x', 'q/x']);
    expect(m[0]).toMatchObject({ requests: 2, open: 1, failed: 0, cost: 5 });
    expect(m[1]).toMatchObject({ requests: 2, failed: 1, input: 10, cost: 2 });
  });
  it('is empty for no requests', () => expect(byModel([])).toEqual([]));
});

describe('cachePct and mergeRows', () => {
  it('cachePct is the cached share of prompt tokens; none at all is null, not 0', () => {
    expect(cachePct(10, 90, 0)).toBe(90);
    expect(cachePct(0, 0, 0)).toBeNull();
  });
  it('mergeRows appends only rows after the last held id', () => {
    const a = rows([wire({ id: 1 }), wire({ id: 2 })]);
    const b = rows([wire({ id: 2 }), wire({ id: 3 })]);
    expect(mergeRows(a, b).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(mergeRows([], b).map((r) => r.id)).toEqual([2, 3]);
  });
});

describe('rollupOf (usageByModel, Go field names)', () => {
  const go = (o: Record<string, unknown> = {}) => ({ Model: 'gpt-x', Provider: 'oa', Calls: 10, Successes: 9, SuccessRate: 0.9, TotalCostUSD: 1.5, AvgLatencyMs: 800.5, CostPerSuccessUSD: 0.1667, ...o });
  it('maps the PascalCase rows', () => {
    expect(rollupOf({ status: 'ok', rollup: [go()] })).toEqual([{ model: 'gpt-x', provider: 'oa', account: '', calls: 10, successes: 9, successRate: 0.9, cost: 1.5, avgLatencyMs: 800.5, costPerSuccess: 0.1667 }]);
  });
  it('reads snake_case too, and the by-account shape (Account, no Model)', () => {
    expect(rollupOf({ rollup: [{ model: 'm', provider: 'p', calls: 1, successes: 1, success_rate: 1, total_cost_usd: 0, avg_latency_ms: 5, cost_per_success_usd: 0 }] })![0]).toMatchObject({ model: 'm', successRate: 1 });
    const acc = rollupOf({ rollup: [{ Provider: 'p', Account: 'acct-1', Calls: 2, Successes: 1, SuccessRate: 0.5, TotalCostUSD: 1, AvgLatencyMs: 1, CostPerSuccessUSD: 1 }] })!;
    expect(acc[0]).toMatchObject({ account: 'acct-1', model: '' });
  });
  it('an empty rollup is an empty table; anything malformed is unreadable', () => {
    expect(rollupOf({ rollup: [] })).toEqual([]);
    for (const b of [null, {}, { rollup: 'x' }, { rollup: [null] }, { rollup: [go({ Calls: -1 })] }, { rollup: [go({ SuccessRate: 2 })] }, { rollup: [go({ Provider: 1 })] }, { rollup: [go({ TotalCostUSD: 'x' })] }, { rollup: [go({ Model: undefined })] }]) expect(rollupOf(b)).toBeNull();
  });
});

describe('billed tokens', () => {
  it('a failed attempt\'s billed tokens count in the request and the model table; matching still uses the outcome counts', () => {
    const rs = rows([
      wire({ id: 1, turn_id: 'a', attempt: 0, success: false, error_code: 'timeout', input_tokens: 1200, cache_read_tokens: 300, cache_write_tokens: 40, output_tokens: 800, cost_usd: 0.1 }),
      wire({ id: 2, turn_id: 'a', attempt: -1, input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0.01 }),
    ]);
    const q = requestsOf(rs)[0]!;
    expect(q).toMatchObject({ input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }); // the response's counts, for matching
    expect(q.billed).toEqual({ input: 1210, output: 805, cacheRead: 300, cacheWrite: 40 });
    expect(byModel([q])[0]).toMatchObject({ input: 1210, output: 805, cacheRead: 300, cacheWrite: 40 });
  });
  it('a failed fusion spend (-2) tokens are billed too, as the agent sums them', () => {
    const q = requestsOf(rows([wire({ id: 1, turn_id: 'a', attempt: -2, input_tokens: 70, output_tokens: 30, cache_read_tokens: 0 }), wire({ id: 2, turn_id: 'a', attempt: -1, input_tokens: 1, output_tokens: 1, cache_read_tokens: 0 })]))[0]!;
    expect(q.billed).toMatchObject({ input: 71, output: 31 });
  });
});

describe('groupTurns: an identical request is flagged, not hidden', () => {
  const mk = (id: string, c: number) => ({ id, kind: 'chat', state: 'ok', input: 1, output: 1, cacheRead: 0, cacheWrite: 0, billed: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, cost: c, model: 'm', provider: 'p', retries: 0, latencyMs: 0, errorCode: '', uncertain: false, at: 0, firstRow: 0, lastRow: 0 }) as UsageRequest;
  it('a helper with the same counts ahead of the foreground request is claimed, but marked ambiguous', () => {
    const g = groupTurns([mk('helper', 8), mk('fore', 1)], [{ key: 't1', responses: [resp(1, 1)] }]);
    expect(g.turns[0]!.requests).toEqual([expect.objectContaining({ claimed: true, ambiguous: true })]);
    expect(g.turns[0]!.ambiguous).toBe(1);
  });
  it('while rows are unread every token-count placement is provisional: the competing request may be past the cap', () => {
    const g = groupTurns([mk('helper', 8)], [{ key: 't1', responses: [resp(1, 1)] }], { partial: true });
    expect(g.turns[0]!.requests[0]).toMatchObject({ claimed: true, ambiguous: true });
    expect(g.turns[0]!.ambiguous).toBe(1);
    const whole = groupTurns([mk('helper', 8)], [{ key: 't1', responses: [resp(1, 1)] }]);
    expect(whole.turns[0]!.ambiguous).toBe(0);
  });
  it('identical requests that every response claims are not ambiguous', () => {
    const g = groupTurns([mk('a', 1), mk('b', 1)], [{ key: 't1', responses: [resp(1, 1)] }, { key: 't2', responses: [resp(1, 1)] }]);
    expect(g.turns.map((t) => t.ambiguous)).toEqual([0, 0]);
  });
  it('a request with counts nobody else shares is not ambiguous', () => {
    const g = groupTurns([mk('a', 1)], [{ key: 't1', responses: [resp(1, 1)] }]);
    expect(g.turns[0]!.ambiguous).toBe(0);
  });
});

describe('sideOf', () => {
  it('side calls and their spend from the rows read; a -2 row is spend but not a call', () => {
    const rs = rows([wire({ id: 1, turn_id: 's1', kind: 'side', cost_usd: 4 }), wire({ id: 2, turn_id: 's2', kind: 'side', attempt: -2, cost_usd: 1 }), wire({ id: 3, turn_id: 'c' })]);
    expect(sideOf(rs)).toEqual({ calls: 1, cost: 5 });
  });
});
