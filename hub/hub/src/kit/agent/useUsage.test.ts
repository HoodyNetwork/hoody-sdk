// The Usage tab's store: paging from the first row, the page cap, incremental refresh, a bad page is not fewer
// rows, late answers after reset() change nothing.
import { describe, expect, it } from 'vitest';
import { createUsageStore, USAGE_MAX_PAGES } from './useUsage';

type Ans = { ok: true; body: unknown } | { ok: false; err: { kind: 'failed' | 'pending' | 'stale' | 'not_sent'; code: string; status: number; retryAfter: number | null; details: object } };
const bad = (status = 500, kind: 'failed' | 'stale' = 'failed'): Ans => ({ ok: false, err: { kind, code: '', status, retryAfter: null, details: {} } });
const row = (id: number, o: Record<string, unknown> = {}) => ({
  id, ts: 1760000000 + id, turn_id: `r${id}`, attempt: -1, model: 'm', provider: 'p', input_tokens: 1, output_tokens: 1, cache_read_tokens: 0,
  cache_write_tokens: 0, cost_usd: 0.5, latency_ms: 1, success: true, error_code: '', kind: 'chat', ...o,
});
const totals = { calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0, cache_read_pct: 0, by_kind: {} };
const page = (ids: number[], more = false, next?: number): Ans => ({ ok: true, body: { items: ids.map((i) => row(i)), totals: { ...totals, calls: ids.length }, next_after_id: next ?? ids[ids.length - 1] ?? 0, has_more: more } });

function fake() {
  const asked: Array<{ after?: number; limit?: number }> = [];
  const waiting: Array<(a: Ans) => void> = [];
  const api = {
    session: (_id: string, o: { after?: number; limit?: number } = {}) => { asked.push(o); return new Promise<Ans>((r) => waiting.push(r)) as never; },
  };
  return { api, asked, waiting };
}
const tick = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('load', () => {
  it('reads pages from the first row until the last, keeping the latest totals', async () => {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    const p = s.load();
    expect(s.view()).toMatchObject({ phase: 'loading', reading: true });
    f.waiting[0]!(page([1, 2], true));
    await tick();
    f.waiting[1]!(page([3], false));
    await p;
    expect(f.asked.map((a) => a.after)).toEqual([0, 2]);
    expect(s.view().rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(s.view()).toMatchObject({ phase: 'ready', more: false, stale: false, reading: false });
    expect(s.view().totals?.calls).toBe(1);
    expect(s.view().requests).toHaveLength(3);
  });
  it('stops at the page cap and says there is more', async () => {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    const p = s.load();
    for (let i = 0; i < USAGE_MAX_PAGES; i++) {
      await tick();
      f.waiting[i]!(page([i + 1], true));
    }
    await p;
    expect(f.asked).toHaveLength(USAGE_MAX_PAGES);
    expect(s.view()).toMatchObject({ phase: 'ready', more: true });
  });
  it('a page that claims more but moves nowhere ends the read (no endless loop)', async () => {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    const p = s.load();
    f.waiting[0]!(page([], true, 0));
    await p;
    expect(f.asked).toHaveLength(1);
    expect(s.view()).toMatchObject({ phase: 'ready', more: true });
  });
  it('a failed first read is failed with its code; an unreadable page is "unreadable", never fewer rows', async () => {
    let f = fake();
    let s = createUsageStore({ api: f.api, id: 's1' });
    let p = s.load();
    f.waiting[0]!(bad(500));
    await p;
    expect(s.view()).toMatchObject({ phase: 'failed', error: { status: 500 }, rows: [] });
    f = fake();
    s = createUsageStore({ api: f.api, id: 's1' });
    p = s.load();
    f.waiting[0]!(page([1], true));
    await tick();
    f.waiting[1]!({ ok: true, body: { items: [{ id: 'x' }], totals, next_after_id: 5, has_more: false } });
    await p;
    expect(s.view()).toMatchObject({ phase: 'failed', error: { code: 'unreadable' }, rows: [] });
  });
  it('load does nothing while a read is out or once ready', async () => {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    const p = s.load();
    void s.load();
    expect(f.asked).toHaveLength(1);
    f.waiting[0]!(page([1]));
    await p;
    await s.load();
    expect(f.asked).toHaveLength(1);
  });
  it('a dropped (stale) first answer is a recoverable failed state, not an endless skeleton; load() reads again', async () => {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    const p = s.load();
    f.waiting[0]!(bad(0, 'stale'));
    await p;
    expect(s.view()).toMatchObject({ phase: 'failed', error: { code: 'stale' }, reading: false });
    const q = s.load();
    f.waiting[1]!(page([1]));
    await q;
    expect(s.view()).toMatchObject({ phase: 'ready', error: null });
    expect(s.view().rows).toHaveLength(1);
  });
  it('a page whose cursor jumps past its last row, or repeats a row, is unreadable', async () => {
    let f = fake();
    let s = createUsageStore({ api: f.api, id: 's1' });
    let p = s.load();
    f.waiting[0]!(page([1], false, 100));
    await p;
    expect(s.view()).toMatchObject({ phase: 'failed', error: { code: 'unreadable' }, rows: [] });
    f = fake();
    s = createUsageStore({ api: f.api, id: 's1' });
    p = s.load();
    f.waiting[0]!({ ok: true, body: { items: [row(1), row(1)], totals, next_after_id: 1, has_more: false } });
    await p;
    expect(s.view()).toMatchObject({ phase: 'failed', error: { code: 'unreadable' } });
  });
});

describe('refresh', () => {
  async function ready() {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    const p = s.load();
    f.waiting[0]!(page([1, 2]));
    await p;
    return { f, s };
  }
  it('reads the whole window again, so new rows arrive and rows are never doubled', async () => {
    const { f, s } = await ready();
    const p = s.refresh();
    expect(f.asked[1]).toMatchObject({ after: 0 });
    f.waiting[1]!(page([1, 2, 3]));
    await p;
    expect(s.view().rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it('a row the agent updated in place (same id, new counters) shows its new figures after a refresh', async () => {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    const p = s.load();
    f.waiting[0]!({ ok: true, body: { items: [row(1, { output_tokens: 2 })], totals, next_after_id: 1, has_more: false } });
    await p;
    expect(s.view().requests[0]!.output).toBe(2);
    const q = s.refresh();
    f.waiting[1]!({ ok: true, body: { items: [row(1, { output_tokens: 317 })], totals, next_after_id: 1, has_more: false } });
    await q;
    expect(s.view().rows[0]!.output).toBe(317);
    expect(s.view().requests[0]!.output).toBe(317);
    expect(s.view().requests[0]!.billed.output).toBe(317);
  });
  it('rows held beyond the pages a refresh re-reads stay, marked, and the read goes on after them (the read cap)', async () => {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    const tickN = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
    let n = 0;
    const answer = async (i: number, a: Ans) => { while (f.waiting.length <= i) await tickN(); f.waiting[i]!(a); n = i + 1; await tickN(); };
    const p = s.load();
    for (let i = 0; i < USAGE_MAX_PAGES; i++) await answer(i, page([i + 1], true)); // rows 1..30, more
    await p;
    expect(s.view()).toMatchObject({ more: true, heldPast: false });
    // first refresh: re-reads 1..30, then goes on forward: row 31 arrives
    let q = s.refresh();
    for (let i = 0; i < USAGE_MAX_PAGES; i++) await answer(n, page([i + 1], true));
    await answer(n, page([31], false));
    await q;
    expect(s.view().rows.map((r) => r.id).slice(-2)).toEqual([30, 31]);
    expect(s.view()).toMatchObject({ more: false, heldPast: false });
    // second refresh: re-reads 1..30; row 31 is held past the window and stays, the read goes on after it (32)
    q = s.refresh();
    for (let i = 0; i < USAGE_MAX_PAGES; i++) await answer(n, page([i + 1], true));
    await answer(n, page([32], false));
    await q;
    expect(f.asked[f.asked.length - 1]).toMatchObject({ after: 31 });
    expect(s.view().rows.map((r) => r.id).slice(-3)).toEqual([30, 31, 32]);
    expect(s.view()).toMatchObject({ more: false, heldPast: true });
  });
  it('a failed or unreadable refresh keeps what was read and marks it out of date; the next good one clears it', async () => {
    const { f, s } = await ready();
    let p = s.refresh();
    f.waiting[1]!(bad(503));
    await p;
    expect(s.view()).toMatchObject({ phase: 'ready', stale: true });
    expect(s.view().rows).toHaveLength(2);
    p = s.refresh();
    f.waiting[2]!({ ok: true, body: { nope: 1 } });
    await p;
    expect(s.view().stale).toBe(true);
    p = s.refresh();
    f.waiting[3]!(page([1, 2, 3]));
    await p;
    expect(s.view()).toMatchObject({ stale: false });
    expect(s.view().rows).toHaveLength(3);
  });
  it('a refresh page that skips ahead is unreadable and the rows held stay', async () => {
    const { f, s } = await ready();
    let p = s.refresh();
    f.waiting[1]!(page([3], false, 100));
    await p;
    expect(s.view()).toMatchObject({ stale: true });
    expect(s.view().rows.map((r) => r.id)).toEqual([1, 2]);
    p = s.refresh();
    expect(f.asked[2]).toMatchObject({ after: 0 });
    f.waiting[2]!(page([1, 2, 3]));
    await p;
    expect(s.view().rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it('a cursor that goes backwards is unreadable', async () => {
    const { f, s } = await ready();
    const p = s.refresh();
    f.waiting[1]!({ ok: true, body: { items: [], totals, next_after_id: 1, has_more: false } });
    await p;
    expect(s.view().stale).toBe(true);
  });
  it('does nothing before the first read or while a read is out', async () => {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    await s.refresh();
    expect(f.asked).toHaveLength(0);
    const l = s.load();
    await s.refresh();
    expect(f.asked).toHaveLength(1);
    f.waiting[0]!(page([1]));
    await l;
  });
});

describe('reset', () => {
  it('forgets everything; a late answer changes nothing', async () => {
    const f = fake();
    const s = createUsageStore({ api: f.api, id: 's1' });
    const p = s.load();
    s.reset();
    f.waiting[0]!(page([1]));
    await p;
    expect(s.view()).toMatchObject({ phase: 'idle', rows: [] });
    const p2 = s.load();
    f.waiting[1]!(page([9]));
    await p2;
    expect(s.view().rows.map((r) => r.id)).toEqual([9]);
  });
});
