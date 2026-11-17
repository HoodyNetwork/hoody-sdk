// Delete and Reset to shipped: not sent while paused, a pause refusal is "nothing was done", an unknown outcome
// is read back (never resent, never called done or failed), answers after reset() change nothing.
import { describe, expect, it } from 'vitest';
import { createDangerStore } from './danger';
import type { Refusal, Settled } from './sourceApi';

const ok: Settled = { ok: true, body: { output: 'x', is_error: false } };
const err = (kind: Refusal['kind'], o: Partial<Refusal> = {}): Settled => ({ ok: false, err: { kind, code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null, ...o } });
const paused = err('failed', { code: 'daemon_paused', status: 503, notApplied: true });
const doc = (revision: string): Settled => ({ ok: true, body: { path: '/p', content: 'c', revision } });

function fake(isPaused = false) {
  const st = { removes: [] as Array<(s: Settled) => void>, resets: [] as Array<(s: Settled) => void>, gets: [] as Array<(s: Settled) => void>, paused: isPaused };
  const api = {
    remove: () => new Promise<Settled>((r) => st.removes.push(r)),
    reset: () => new Promise<Settled>((r) => st.resets.push(r)),
    get: () => new Promise<Settled>((r) => st.gets.push(r)),
  };
  return { st, s: createDangerStore({ api, paused: () => st.paused }) };
}

describe('run', () => {
  it('delete: sent once; done means gone', async () => {
    const { st, s } = fake();
    const p = s.run('delete', 'r1');
    void s.run('delete', 'r1');
    expect(st.removes.length).toBe(1);
    expect(s.view().phase).toBe('running');
    st.removes[0]!(ok);
    await p;
    expect(s.view()).toMatchObject({ phase: 'done', kind: 'delete', gone: true });
  });
  it('reset: done does not mean gone', async () => {
    const { st, s } = fake();
    const p = s.run('reset', 'r1');
    st.resets[0]!(ok);
    await p;
    expect(s.view()).toMatchObject({ phase: 'done', kind: 'reset', gone: false });
    expect(st.removes.length).toBe(0);
  });
  it('sends nothing while the daemon is known to be paused', async () => {
    const { st, s } = fake(true);
    await s.run('delete', 'r1');
    await s.run('reset', 'r1');
    expect(st.removes.length + st.resets.length).toBe(0);
    expect(s.view().phase).toBe('idle');
  });
  it('a daemon_paused refusal (it paused after we last read) is "nothing was done"', async () => {
    const { st, s } = fake();
    const p = s.run('delete', 'r1');
    st.removes[0]!(paused);
    await p;
    expect(s.view().phase).toBe('paused');
    s.clear();
    expect(s.view().phase).toBe('idle');
  });
  it('another definite refusal keeps its code; it may be tried again', async () => {
    const { st, s } = fake();
    let p = s.run('reset', 'r1');
    st.resets[0]!(err('failed', { code: 'not_found', status: 404 }));
    await p;
    expect(s.view()).toMatchObject({ phase: 'refused', refusal: { code: 'not_found', status: 404 } });
    s.clear();
    p = s.run('reset', 'r1');
    expect(st.resets.length).toBe(2);
    st.resets[1]!(ok);
    await p;
  });
  it('a tool error after it may have started, or a lost answer, is unsure; nothing is sent again', async () => {
    for (const a of [err('pending'), err('pending', { code: 'tool_error', status: 200 })]) {
      const { st, s } = fake();
      const p = s.run('delete', 'r1');
      st.removes[0]!(a);
      await p;
      expect(s.view().phase).toBe('unsure');
      await s.run('delete', 'r1');
      s.clear();
      expect(st.removes.length).toBe(1);
      expect(s.view().phase).toBe('unsure');
    }
  });
  it('a dropped (stale) answer changes nothing', async () => {
    const { st, s } = fake();
    const p = s.run('delete', 'r1');
    st.removes[0]!(err('stale'));
    await p;
    expect(s.view().phase).toBe('idle');
  });
});

describe('a success the Hub cannot read', () => {
  it('is not shown as done: an envelope without is_error false is an unknown outcome', async () => {
    for (const body of [{}, 'ok', null, { output: 'x' }, { output: 'x', is_error: 'false' }, { is_error: 0 }]) {
      for (const kind of ['delete', 'reset'] as const) {
        const { st, s } = fake();
        const p = s.run(kind, 'r1');
        (kind === 'delete' ? st.removes : st.resets)[0]!({ ok: true, body } as Settled);
        await p;
        expect(s.view()).toMatchObject({ phase: 'unsure', gone: false });
      }
    }
  });
});

describe('blocked by a save', () => {
  it('sends nothing while the other store says blocked', async () => {
    const st = { removes: [] as Array<(s: Settled) => void>, blocked: true };
    const s = createDangerStore({ api: { remove: () => new Promise<Settled>((r) => st.removes.push(r)), reset: () => new Promise<Settled>(() => {}), get: () => new Promise<Settled>(() => {}) }, paused: () => false, blocked: () => st.blocked });
    await s.run('delete', 'r1');
    expect(st.removes.length).toBe(0);
    st.blocked = false;
    void s.run('delete', 'r1');
    expect(st.removes.length).toBe(1);
  });
});

describe('check after an unknown outcome: it reports what it sees, and settles only a delete that finds the agent gone', () => {
  async function unsure(kind: 'delete' | 'reset' = 'delete', baseline: string | null = 'r1') {
    const r = fake();
    const p = r.s.run(kind, baseline);
    (kind === 'delete' ? r.st.removes : r.st.resets)[0]!(err('pending'));
    await p;
    return r;
  }
  it('delete, the source is gone (404): it was deleted', async () => {
    const { st, s } = await unsure();
    const p = s.check();
    expect(s.view().reading).toBe(true);
    st.gets[0]!(err('failed', { status: 404, code: 'not_found' }));
    await p;
    expect(s.view()).toMatchObject({ phase: 'done', gone: true, reading: false });
  });
  it('reset, the source is gone: that proves nothing (a reset leaves a file); still unsure', async () => {
    const { st, s } = await unsure('reset');
    const p = s.check();
    st.gets[0]!(err('failed', { status: 404, code: 'not_found' }));
    await p;
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'gone', gone: false });
  });
  it('the same revision proves nothing (it may still land, or the same bytes came back): unsure, Reset and Delete stay held', async () => {
    for (const kind of ['delete', 'reset'] as const) {
      const { st, s } = await unsure(kind);
      const p = s.check();
      st.gets[0]!(doc('r1'));
      await p;
      expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same' });
      await s.run(kind, 'r1');
      expect((kind === 'delete' ? st.removes : st.resets).length).toBe(1);
    }
  });
  it('a different revision proves nothing either (someone may have edited): unsure, observed changed, never done', async () => {
    for (const kind of ['delete', 'reset'] as const) {
      const { st, s } = await unsure(kind);
      const p = s.check();
      st.gets[0]!(doc('r9'));
      await p;
      expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'changed', gone: false });
    }
  });
  it('no baseline, an unreadable answer or a failed read: observed failed or changed, still unsure; can check again', async () => {
    for (const [baseline, a, want] of [['r1', { ok: true, body: {} } as Settled, 'failed'], ['r1', err('pending'), 'failed'], ['r1', err('failed', { status: 500, code: 'internal' }), 'failed'], [null, doc('r1'), 'changed']] as const) {
      const { st, s } = await unsure('delete', baseline);
      const p = s.check();
      st.gets[0]!(a);
      await p;
      expect(s.view()).toMatchObject({ phase: 'unsure', observed: want, reading: false });
    }
  });
  it('forget ends the watch without claiming anything; Reset and Delete come back, nothing was sent again', async () => {
    const { st, s } = await unsure('reset');
    s.forget();
    expect(s.view()).toMatchObject({ phase: 'idle', kind: null, observed: null, gone: false });
    expect(st.resets.length).toBe(1);
    s.clear();
    const p = s.run('reset', 'r1');
    expect(st.resets.length).toBe(2);
    st.resets[1]!(ok);
    await p;
  });
  it('forget does nothing while the check is reading', async () => {
    const { st, s } = await unsure();
    const p = s.check();
    s.forget();
    expect(s.view().phase).toBe('unsure');
    st.gets[0]!(doc('r1'));
    await p;
  });
  it('forget does nothing unless a run is unsure; check does nothing unless a run is unsure', async () => {
    const { st, s } = fake();
    s.forget();
    await s.check();
    expect(st.gets.length).toBe(0);
    expect(s.view().phase).toBe('idle');
  });
});

describe('reset', () => {
  it('forgets the run; its late answer changes nothing', async () => {
    const { st, s } = fake();
    const p = s.run('delete', 'r1');
    s.reset();
    st.removes[0]!(ok);
    await p;
    expect(s.view().phase).toBe('idle');
  });
});
