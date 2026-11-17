// useLiveSession's unproven attempts (C9): a change whose outcome is not proven is kept outside the render, by its
// target (computer, realm, conversation), across an unmount and a remount, and no second change is sent until a read-back proves the
// first. Another conversation, realm or computer never sees it; a definite refusal and a proof leave nothing behind.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type { Target } from '@core';
import { forgetLiveAttempts, useLiveSession } from './useLiveSession';

type Settled = { ok: true; body: unknown } | { ok: false; err: { kind: 'failed' | 'pending' | 'stale'; code: string; status: number; retryAfter: null; details: Record<string, never> } };
const M = vi.hoisted(() => ({
  model: 'hoody-ai/hoody-free',
  /** The next change's answer: ok, a refusal code, or lost. */
  answer: 'ok' as 'ok' | 'fail' | 'lost',
  code: '',
  body: {} as Record<string, unknown>,
  /** Whether a sent change lands on the conversation. */
  lands: true,
  hold: false,
  held: [] as Array<() => void>,
  sent: [] as string[],
  /** Conversation reads made, and whether they wait until released. */
  reads: 0,
  holdRead: false,
  heldReads: [] as Array<() => void>,
  /** How many next conversation reads are refused. */
  failReads: 0,
}));

vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  const fake: CoreMod.agent.LiveApi = {
    session: (id) => {
      M.reads += 1;
      if (M.failReads > 0) {
        M.failReads -= 1;
        return Promise.resolve({ ok: false, err: { kind: 'failed', code: 'boom', status: 500, retryAfter: null, details: {} } } as Settled) as never;
      }
      // The answer is what the conversation was when the read was made, even when it is released later.
      const r = { ok: true, body: { session: { id, model: M.model, agent: 'general', state: 'idle' } } } as Settled;
      if (!M.holdRead) return Promise.resolve(r) as never;
      return new Promise<Settled>((resolve) => M.heldReads.push(() => resolve(r))) as never;
    },
    setModel: (_id, m) => {
      M.sent.push(`model=${m}`);
      if (M.lands && M.answer !== 'fail') M.model = m;
      const r: Settled = M.answer === 'ok' ? { ok: true, body: { status: 'ok', ...M.body } } : M.answer === 'fail' ? { ok: false, err: { kind: 'failed', code: M.code, status: 409, retryAfter: null, details: {} } } : { ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } };
      if (!M.hold) return Promise.resolve(r) as never;
      return new Promise<Settled>((resolve) => M.held.push(() => resolve(r))) as never;
    },
    setAgent: () => Promise.reject(new Error('not used')),
  };
  return { ...real, agent: { ...real.agent, liveApi: () => fake } };
});

const T = (c: string) => ({ project: { id: 'p1' }, container: { id: c, server_name: 'srv' } }) as unknown as Target;
const CHANGE = { field: 'model', value: 'openai/o9' } as const;
type P = { target: Target; session: string; realm: string; onSaved?: () => void };
const BASE: P = { target: T('c1'), session: 's1', realm: 'Work' };
const mount = (p: P = BASE) => renderHook((q: P) => useLiveSession(q.target, q.session, q.onSaved, false, q.realm), { initialProps: p });
const ready = async (h: { result: { current: { phase: string } } }) => { await waitFor(() => expect(h.result.current.phase).toBe('done')); };
const start = async (h: ReturnType<typeof mount>) => { await act(async () => { h.result.current.save(CHANGE); }); };

beforeEach(() => {
  M.model = 'hoody-ai/hoody-free';
  M.answer = 'ok';
  M.code = '';
  M.body = { persisted: true, scope: 'session' };
  M.lands = true;
  M.hold = false;
  M.held = [];
  M.sent = [];
  M.reads = 0;
  M.holdRead = false;
  M.heldReads = [];
  M.failReads = 0;
  forgetLiveAttempts();
});

/** An attempt whose outcome is unknown: the answer was lost and the read-back does not show it. */
const unknown = async (p: P = BASE) => {
  M.answer = 'lost';
  M.lands = false;
  const h = mount(p);
  await ready(h);
  await start(h);
  await waitFor(() => expect(h.result.current.change?.kind).toBe('pending'));
  return h;
};

describe('useLiveSession: an unproven change outlives the tab', () => {
  it('unknown, then the tab goes and comes back: still unknown with its change, and a second change is refused (nothing sent)', async () => {
    const h = await unknown();
    h.unmount();
    M.answer = 'ok';
    const again = mount();
    expect(again.result.current.change).toMatchObject({ kind: 'pending', change: CHANGE });
    await ready(again);
    await start(again);
    expect(M.sent).toEqual(['model=openai/o9']);
    expect(again.result.current.change?.kind).toBe('pending');
  });

  it('the restored attempt is seen only by its own conversation, realm and computer', async () => {
    const h = await unknown();
    h.unmount();
    for (const other of [{ ...BASE, session: 's2' }, { ...BASE, realm: 'Home' }, { ...BASE, target: T('c2') }]) {
      M.answer = 'ok';
      M.lands = true;
      const o = mount(other);
      expect(o.result.current.change).toBeNull();
      await ready(o);
      await start(o);
      await waitFor(() => expect(o.result.current.change?.kind).toBe('done'));
      o.unmount();
    }
    expect(M.sent).toEqual(['model=openai/o9', 'model=openai/o9', 'model=openai/o9', 'model=openai/o9']);
  });

  it('a change still in flight when the tab goes: the remounted tab shows it running and sends nothing; its late answer settles it for the store', async () => {
    M.hold = true;
    const h = mount();
    await ready(h);
    await start(h);
    h.unmount();
    const again = mount();
    expect(again.result.current.change?.kind).toBe('running');
    expect(again.result.current.active()).toBe(true);
    // (It does not read the conversation while the change is in flight, so it has nothing to send a second change from either.)
    await start(again);
    expect(M.sent).toHaveLength(1);
    // The answer comes after the tab went, and the conversation shows the change: proven, nothing left behind.
    await act(async () => { for (const f of M.held.splice(0)) f(); });
    await waitFor(() => expect(again.result.current.change).toBeNull());
    expect(again.result.current.active()).toBe(false);
  });

  it('a lost late answer after the tab went leaves the change unknown for the next tab', async () => {
    M.hold = true;
    M.answer = 'lost';
    M.lands = false;
    const h = mount();
    await ready(h);
    await start(h);
    h.unmount();
    await act(async () => { for (const f of M.held.splice(0)) f(); });
    const again = mount();
    await waitFor(() => expect(again.result.current.change?.kind).toBe('pending'));
  });

  it('Check again that proves the change leaves nothing behind: the next tab is clean and may change again; the saved callback ran once', async () => {
    const saved = vi.fn();
    const h = await unknown({ ...BASE, onSaved: saved });
    h.unmount();
    const again = mount({ ...BASE, onSaved: saved });
    await ready(again);
    M.model = 'openai/o9';
    let ok = false;
    await act(async () => { ok = await again.result.current.check(); });
    expect(ok).toBe(true);
    expect(again.result.current.change?.kind).toBe('done');
    expect(saved).toHaveBeenCalledTimes(1);
    again.unmount();
    const clean = mount();
    expect(clean.result.current.change).toBeNull();
    await ready(clean);
    await start(clean);
    expect(M.sent).toHaveLength(2);
  });

  it('Check again that does not show the change keeps it unknown, for this tab and the next', async () => {
    const h = await unknown();
    let ok = true;
    await act(async () => { ok = await h.result.current.check(); });
    expect(ok).toBe(false);
    expect(h.result.current.change?.kind).toBe('pending');
    h.unmount();
    expect(mount().result.current.change?.kind).toBe('pending');
  });

  it('a definite refusal (busy, or any refusal) leaves nothing behind: the next tab is clean', async () => {
    for (const code of ['turn_in_flight', 'model_unavailable']) {
      M.answer = 'fail';
      M.code = code;
      const h = mount();
      await ready(h);
      await start(h);
      await waitFor(() => expect(h.result.current.change?.kind).toMatch(/busy|failed|not_sent/));
      h.unmount();
      expect(mount().result.current.change).toBeNull();
    }
  });

  it('Check again is the attempt\'s operation for every mount: a second mount\'s Check reads nothing and its tab sees the check running; the proof settles both', async () => {
    const h = await unknown();
    h.unmount();
    const a = mount();
    const b = mount();
    await ready(a);
    await ready(b);
    M.model = 'openai/o9';
    M.holdRead = true;
    const reads = M.reads;
    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => { first = a.result.current.check(); });
    expect(b.result.current.change?.kind).toBe('running');
    expect(b.result.current.active()).toBe(true);
    let second = true;
    await act(async () => { second = await b.result.current.check(); });
    expect(second).toBe(false);
    expect(M.reads).toBe(reads + 1);
    await act(async () => { for (const f of M.heldReads.splice(0)) f(); await first; });
    expect(await first).toBe(true);
    await waitFor(() => expect(b.result.current.change).toBeNull());
    expect(b.result.current.active()).toBe(false);
    a.unmount();
    b.unmount();
    expect(mount().result.current.change).toBeNull();
  });

  it('a Check that does not show the change leaves it pending for every mount, and the next Check can prove it', async () => {
    const h = await unknown();
    h.unmount();
    const a = mount();
    const b = mount();
    await ready(a);
    await ready(b);
    await act(async () => { expect(await a.result.current.check()).toBe(false); });
    expect(b.result.current.change?.kind).toBe('pending');
    M.model = 'openai/o9';
    await act(async () => { expect(await b.result.current.check()).toBe(true); });
    await waitFor(() => expect(a.result.current.change).toBeNull());
    expect(mount().result.current.change).toBeNull();
  });

  it('a tab mounted while a change of its conversation is in flight does not read the conversation until it is settled', async () => {
    M.hold = true;
    const first = mount();
    await ready(first);
    await start(first);
    const reads = M.reads;
    const second = mount();
    await act(async () => { await Promise.resolve(); });
    expect(M.reads).toBe(reads);
    expect(second.result.current.phase).toBe('loading');
    await act(async () => { for (const f of M.held.splice(0)) f(); });
    await waitFor(() => expect(second.result.current.phase).toBe('done'));
    expect(M.reads).toBeGreaterThan(reads);
  });

  it('an ordinary read that began in another mount before a Check proved the change is read again, never shown: no old model after the proof', async () => {
    const h = await unknown();
    h.unmount();
    const a = mount();
    const b = mount();
    await ready(a);
    await ready(b);
    // B's read is made while the conversation still has the old model, and is released after A's Check proved the change.
    M.holdRead = true;
    await act(async () => { b.result.current.retry(); });
    expect(M.heldReads).toHaveLength(1);
    M.holdRead = false;
    M.model = 'openai/o9';
    await act(async () => { expect(await a.result.current.check()).toBe(true); });
    const reads = M.reads;
    await act(async () => { for (const f of M.heldReads.splice(0)) f(); });
    await waitFor(() => expect(M.reads).toBeGreaterThan(reads));
    await waitFor(() => expect(b.result.current.live?.model).toBe('openai/o9'));
    expect(b.result.current.change).toBeNull();
  });

  it('the only mount goes while its Check again is reading: the late read still settles the attempt for the next mount', async () => {
    const h = await unknown();
    h.unmount();
    const a = mount();
    await ready(a);
    M.model = 'openai/o9';
    M.holdRead = true;
    await act(async () => { void a.result.current.check(); });
    a.unmount();
    expect(mount().result.current.change?.kind).toBe('running');
    M.holdRead = false;
    await act(async () => { for (const f of M.heldReads.splice(0)) f(); await Promise.resolve(); });
    await waitFor(() => expect(mount().result.current.change).toBeNull());
  });

  it('Try again held back by another mount\'s Check keeps its foreground mode: when the replacement read fails B ends in the error phase (never stuck loading) and can try again', async () => {
    const h = await unknown();
    h.unmount();
    const a = mount();
    const b = mount();
    await ready(a);
    await ready(b);
    // B asks to read again (it has a live value) and the read is held; A's Check then starts and is held too.
    M.holdRead = true;
    await act(async () => { b.result.current.retry(); });
    await act(async () => { void a.result.current.check(); });
    expect(M.heldReads).toHaveLength(2);
    // B's read returns while the Check runs: it may predate the Check, so B waits; the Check does not prove the change; the replacement read fails.
    M.holdRead = false;
    M.failReads = 1;
    await act(async () => { for (const f of M.heldReads.splice(0)) f(); });
    await waitFor(() => expect(b.result.current.phase).toBe('failed'));
    expect(b.result.current.liveError).toBeTruthy();
    // It is not stuck: Try again reads, and the conversation shows.
    await act(async () => { b.result.current.retry(); });
    await waitFor(() => expect(b.result.current.phase).toBe('done'));
  });

  /** A mount whose pause is a prop, the way the settings hook pauses the conversation hook. */
  const mountPausable = () => renderHook((q: { paused: boolean }) => useLiveSession(BASE.target, BASE.session, undefined, q.paused, BASE.realm), { initialProps: { paused: false } });
  const focus = async () => { await act(async () => { window.dispatchEvent(new Event('focus')); }); };

  it('a background read replaced because another mount settled a change does not run while paused, and when the hooks are quiet it runs once, as the foreground Try again asked', async () => {
    const h = await unknown();
    h.unmount();
    // A is paused for the whole test, so the window coming back into view starts a background read in B only.
    const a = mountPausable();
    const b = mountPausable();
    await ready(a);
    a.rerender({ paused: true });
    await waitFor(() => expect(b.result.current.phase).toBe('done'));
    // B's background read (the window came back into view) is in flight and held.
    M.holdRead = true;
    await focus();
    expect(M.heldReads).toHaveLength(1);
    // The settings hook goes busy; Try again is deferred; A's Check then proves the change while B's read is still out.
    b.rerender({ paused: true });
    await act(async () => { b.result.current.retry(); });
    M.holdRead = false;
    M.model = 'openai/o9';
    await act(async () => { expect(await a.result.current.check()).toBe(true); });
    const reads = M.reads;
    await act(async () => { for (const f of M.heldReads.splice(0)) f(); });
    await act(async () => { await Promise.resolve(); });
    // Paused: the replacement did not start, so the deferred foreground read has not been delayed behind a second read.
    expect(M.reads).toBe(reads);
    // Quiet again: exactly one read, in the foreground (loading), and it shows the proved model.
    M.holdRead = true;
    b.rerender({ paused: false });
    await waitFor(() => expect(M.heldReads).toHaveLength(1));
    expect(M.reads).toBe(reads + 1);
    expect(b.result.current.phase).toBe('loading');
    await act(async () => { for (const f of M.heldReads.splice(0)) f(); });
    await waitFor(() => expect(b.result.current.phase).toBe('done'));
    expect(b.result.current.live?.model).toBe('openai/o9');
    expect(M.reads).toBe(reads + 1);
  });

  it('a foreground read replaced while the hooks are paused stays foreground: it waits, then runs once with the loading phase', async () => {
    const h = await unknown();
    h.unmount();
    const a = mount();
    const b = mountPausable();
    await ready(a);
    await waitFor(() => expect(b.result.current.phase).toBe('done'));
    M.holdRead = true;
    await act(async () => { b.result.current.retry(); });
    expect(M.heldReads).toHaveLength(1);
    b.rerender({ paused: true });
    M.holdRead = false;
    M.model = 'openai/o9';
    await act(async () => { expect(await a.result.current.check()).toBe(true); });
    const reads = M.reads;
    await act(async () => { for (const f of M.heldReads.splice(0)) f(); });
    await act(async () => { await Promise.resolve(); });
    expect(M.reads).toBe(reads);
    M.holdRead = true;
    b.rerender({ paused: false });
    await waitFor(() => expect(M.heldReads).toHaveLength(1));
    expect(M.reads).toBe(reads + 1);
    expect(b.result.current.phase).toBe('loading');
    await act(async () => { for (const f of M.heldReads.splice(0)) f(); });
    await waitFor(() => expect(b.result.current.live?.model).toBe('openai/o9'));
    expect(M.reads).toBe(reads + 1);
  });

  it('the replacement of a foreground read is itself foreground: when it fails, B ends in the error phase (a background read would leave the conversation shown), and Try again recovers', async () => {
    const h = await unknown();
    h.unmount();
    const a = mount();
    const b = mountPausable();
    await ready(a);
    await waitFor(() => expect(b.result.current.phase).toBe('done'));
    M.holdRead = true;
    await act(async () => { b.result.current.retry(); });
    expect(M.heldReads).toHaveLength(1);
    b.rerender({ paused: true });
    M.holdRead = false;
    M.model = 'openai/o9';
    await act(async () => { expect(await a.result.current.check()).toBe(true); });
    await act(async () => { for (const f of M.heldReads.splice(0)) f(); });
    await act(async () => { await Promise.resolve(); });
    const reads = M.reads;
    // The replacement starts once the hooks are quiet, and fails.
    M.failReads = 1;
    b.rerender({ paused: false });
    await waitFor(() => expect(b.result.current.phase).toBe('failed'));
    expect(M.reads).toBe(reads + 1);
    expect(b.result.current.liveError).toBeTruthy();
    await act(async () => { b.result.current.retry(); });
    await waitFor(() => expect(b.result.current.phase).toBe('done'));
    expect(b.result.current.live?.model).toBe('openai/o9');
  });
});
