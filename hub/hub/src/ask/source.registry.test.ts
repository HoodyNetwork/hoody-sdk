// OpenRef takes the computer the page shows (`at`) only when its handle is the
// reference's computer, so a chat never opens on another computer; the directory, when it names the computer, wins.
// The provider the pages reach through kit/agent/conversations opens one pinned engine per holder and lets it go once.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';

vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('./fake');
  const { realClock } = await import('./engine');
  return {
    ...real,
    // One agent per computer for the whole test (the test seeds its sessions through `fakeAgent()`); options per test.
    liveIO: (t: { container: { id: string } }) => {
      const g = globalThis as { __fake?: InstanceType<typeof FakeAgent>; __fakeOpts?: object };
      g.__fake ??= new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'], ...g.__fakeOpts }, realClock);
      return real.withFixtureDest(g.__fake, t.container.id);
    },
  };
});

import './data';
import { computerHandle } from '@core';
import { AskEngine, type Snapshot } from './engine';
import type { FakeAgent } from './fake';
import { scripts } from './fake';
import strings from './strings.en.json';
import { ACCOUNT, REALM, slot, world, type World } from './accept/env';

let w: World | null = null;
afterEach(async () => {
  const R = await import('./registry');
  R.resetRegistryForTests();
  vi.restoreAllMocks();
  w?.dispose();
  w = null;
  const g = globalThis as { __fake?: unknown; __fakeOpts?: unknown };
  delete g.__fake;
  delete g.__fakeOpts;
});
const fakeAgent = (): FakeAgent => (globalThis as { __fake?: FakeAgent }).__fake!;
const BODY = (realm: string) => ({ realm, computer: slot.computer, tool_mode: 'standard' as const, dir_scope: 'home' as const, approval: { mode: 'default' as const }, expected_binding: { realm, computer: slot.computer } });
const fill = (k: keyof typeof strings, v: Record<string, string> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');

const AT = { project: slot.project, id: slot.computer, name: 'atlas' };
const HANDLE = computerHandle(AT);
const OTHER = { project: slot.project, id: 'c0a7150000000000000000b2', name: 'orion' };
const ref = (computer = HANDLE, sid = 'sess-1') => ({ computer, realm: REALM, sid });

// The read sources (./source) pull in the kit: loaded once here, so the first test never spends its time limit on the cold
// transform.
beforeAll(async () => { await import('./source'); }, 180_000);

describe('openRef(account, ref, at)', () => {
  it('no directory: the shown computer opens its own chat, on that computer', async () => {
    w = world();
    const R = await import('./registry');
    const h = R.openRef(ACCOUNT, ref(), AT);
    expect(h).not.toBeNull();
    expect(h!.current().slot).toMatchObject({ account: ACCOUNT, computer: AT.id, project: AT.project, realm: REALM, name: 'atlas' });
    h!.release();
  });

  it('a chat bound to a named realm or to Global opens and reads its session; neither blocks on the realm', async () => {
    w = world();
    const R = await import('./registry');
    const { askConversations } = await import('./source');
    R.openRef(ACCOUNT, ref(HANDLE, 'warm'), AT)?.release(); // makes the computer's agent
    for (const realm of [REALM, 'global']) {
      const { session_id: sid } = (await fakeAgent().create(BODY(realm), 'k-' + realm, realm)) as { session_id: string };
      const held = askConversations.open(ACCOUNT, { computer: HANDLE, realm, sid }, AT)!;
      await vi.waitFor(() => {
        const v = held.source.snapshot();
        expect(v.facts.reach, realm).toBe('ok');
        expect(v.meta!.status, realm).toBe('idle');
      }, { timeout: 8000 });
      expect(held.source.snapshot().blocks.find((b) => b.k === 'line' && b.key === 'reach'), realm).toBeUndefined();
      held.release();
    }
  });

  it('a pinned session the agent does not have (transcript 404, no evidence): the engine says "gone or not reachable"; never an empty idle chat (C9)', async () => {
    w = world();
    const R = await import('./registry');
    const { askConversations } = await import('./source');
    const h = R.openRef(ACCOUNT, { computer: HANDLE, realm: REALM, sid: 'sess-missing' }, AT)!;
    const held = askConversations.open(ACCOUNT, { computer: HANDLE, realm: REALM, sid: 'sess-missing' }, AT)!;
    await vi.waitFor(() => expect(h.current().getSnapshot().phase).toBe('blocked'), { timeout: 8000 });
    expect(h.current().getSnapshot().blocked).toMatchObject({ key: 'ask.goneOrUnreachable' });
    const v = held.source.snapshot();
    expect(v.facts).toMatchObject({ reach: 'missing', state: 'loading' });
    expect(v.meta!.status).toBe('unreachable');
    expect(v.blocks[0]).toMatchObject({ k: 'line', key: 'reach', text: fill('ask.goneOrUnreachable') });
    held.release();
    h.release();
  });

  it('a pinned chat whose request keys cannot be made: an explicit unavailable state, never an empty idle chat', async () => {
    w = world();
    const R = await import('./registry');
    const { askConversations } = await import('./source');
    R.openRef(ACCOUNT, ref(HANDLE, 'warm'), AT)?.release();
    const { session_id: sid } = (await fakeAgent().create(BODY(REALM), 'k-keys', REALM)) as { session_id: string };
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => { throw new Error('no randomness'); });
    const h = R.openRef(ACCOUNT, { computer: HANDLE, realm: REALM, sid }, AT)!;
    const held = askConversations.open(ACCOUNT, { computer: HANDLE, realm: REALM, sid }, AT)!;
    await vi.waitFor(() => expect(h.current().getSnapshot().phase).toBe('blocked'), { timeout: 8000 });
    expect(h.current().getSnapshot().blocked).toMatchObject({ key: 'ask.cantOpenHere' });
    const v = held.source.snapshot();
    expect(v.facts.reach).toBe('unreachable');
    expect(v.meta!.status).toBe('unreachable');
    expect(v.blocks[0]).toMatchObject({ k: 'line', key: 'reach', text: fill('ask.cantOpenHere') });
    held.release();
    h.release();
  });

  for (const [name, opts, key] of [
    ['the agent cannot be reached', { health: 'lost' }, 'ask.unreachable'],
    ['the computer is stopped', { computerStatus: 'stopped', health: 'lost' }, 'ask.stopped'],
  ] as const) {
    it(`preflight: ${name} before any transcript read keeps its own reason, not "gone"`, async () => {
      (globalThis as { __fakeOpts?: object }).__fakeOpts = opts;
      w = world();
      const R = await import('./registry');
      const { askConversations } = await import('./source');
      const held = askConversations.open(ACCOUNT, { computer: HANDLE, realm: REALM, sid: 'sess-1' }, AT)!;
      await vi.waitFor(() => expect(held.source.snapshot().blocks[0]).toMatchObject({ k: 'line', key: 'reach', text: fill(key, { computer: 'atlas' }) }), { timeout: 8000 });
      expect(held.source.snapshot().facts.reach).toBe('unreachable');
      expect(fakeAgent().log.filter((x) => x[0] === 'transcript')).toHaveLength(0);
      held.release();
      void R;
    });
  }

  it('a stream lost mid-turn (the engine\'s own status "lost") reads not reachable with its reason, never Running', async () => {
    (globalThis as { __fakeOpts?: object }).__fakeOpts = { streamDrops: true, script: [scripts.approval] };
    w = world();
    const R = await import('./registry');
    const { askConversations } = await import('./source');
    R.openRef(ACCOUNT, ref(HANDLE, 'warm'), AT)?.release();
    const { session_id: sid } = (await fakeAgent().create(BODY(REALM), 'k-lost', REALM)) as { session_id: string };
    await fakeAgent().turn(sid, 'do it', 'tk-1');
    const h = R.openRef(ACCOUNT, { computer: HANDLE, realm: REALM, sid }, AT)!;
    const held = askConversations.open(ACCOUNT, { computer: HANDLE, realm: REALM, sid }, AT)!;
    const seen: { eng: Snapshot['status']; reach: string; status: string; line: string | undefined; turn: boolean }[] = [];
    const off = held.source.subscribe(() => {
      const v = held.source.snapshot();
      const line = v.blocks.find((b) => b.k === 'line' && b.key === 'reach');
      seen.push({ eng: h.current().getSnapshot().status, reach: v.facts.reach, status: v.meta!.status, line: line && 'text' in line ? line.text : undefined, turn: v.facts.turn });
    });
    await vi.waitFor(() => expect(seen.some((x) => x.eng === 'lost')).toBe(true), { timeout: 8000 });
    off();
    for (const x of seen.filter((y) => y.eng === 'lost')) expect(x).toEqual({ eng: 'lost', reach: 'unreachable', status: 'unreachable', line: fill('ask.lost'), turn: false });
    // Reconnecting (the turn's state unsure) is always loading, never Running. Its line says "Reconnecting…" only after the
    // stream that was open broke: the catch-up of the first open, before any loss, shows no line.
    const firstLost = seen.findIndex((y) => y.eng === 'lost');
    seen.forEach((x, i) => { if (x.eng === 'reconnecting') expect(x).toMatchObject({ status: 'loading', turn: false, line: i < firstLost ? undefined : fill('ask.status.reconnecting') }); });
    held.release();
    h.release();
  });

  it('no directory: another computer’s chat does not open on the shown one', async () => {
    w = world();
    const R = await import('./registry');
    expect(R.openRef(ACCOUNT, ref(), OTHER)).toBeNull();
    expect(R.openRef(ACCOUNT, ref(computerHandle(OTHER)), AT)).toBeNull();
    expect(R.openRef(ACCOUNT, ref())).toBeNull();
  });

  it('a directory that names the computer wins over `at`', async () => {
    w = world();
    const R = await import('./registry');
    R.setComputerDirectory({ resolve: (h) => (h === HANDLE ? AT : null), handleOf: () => null });
    const h = R.openRef(ACCOUNT, ref(), OTHER);
    expect(h!.current().slot.computer).toBe(AT.id);
    h!.release();
  });

  it('a directory that does not name it falls back to a matching `at` only', async () => {
    w = world();
    const R = await import('./registry');
    R.setComputerDirectory({ resolve: () => null, handleOf: () => null });
    expect(R.openRef(ACCOUNT, ref(), OTHER)).toBeNull();
    const h = R.openRef(ACCOUNT, ref(), AT);
    expect(h!.current().slot.computer).toBe(AT.id);
    h!.release();
  });
});

describe('the Ask conversation provider', () => {
  it('opens a read source on the pinned engine; two holders share one engine; the last release ends it', async () => {
    w = world();
    const { askConversations } = await import('./source');
    const end = vi.spyOn(AskEngine.prototype, 'end');
    const a = askConversations.open(ACCOUNT, ref(), AT);
    const b = askConversations.open(ACCOUNT, ref(), AT);
    expect(a && b).toBeTruthy();
    expect(a!.source.ref).toEqual(ref());
    a!.release();
    a!.release();
    expect(end).not.toHaveBeenCalled();
    b!.release();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('names the shown computer only when it is the reference\'s own; a directory-resolved chat keeps its handle', async () => {
    w = world();
    const R = await import('./registry');
    const { askConversations } = await import('./source');
    const own = askConversations.open(ACCOUNT, ref(), AT)!;
    expect(own.source.snapshot().meta!.computer).toBe('atlas');
    own.release();
    R.setComputerDirectory({ resolve: (h) => (h === HANDLE ? AT : null), handleOf: () => null });
    const viaDir = askConversations.open(ACCOUNT, ref(), OTHER)!;
    expect(viaDir.source.snapshot().meta!.computer).toBe(HANDLE);
    viaDir.release();
  });

  it('another computer’s chat, or no account, opens nothing', async () => {
    w = world();
    const { askConversations } = await import('./source');
    expect(askConversations.open(ACCOUNT, ref(), OTHER)).toBeNull();
    expect(askConversations.open('', ref(), AT)).toBeNull();
  });

  it('a different session is a different engine', async () => {
    w = world();
    const { askConversations } = await import('./source');
    const a = askConversations.open(ACCOUNT, ref(HANDLE, 'sess-1'), AT)!;
    const b = askConversations.open(ACCOUNT, ref(HANDLE, 'sess-2'), AT)!;
    expect(a.source.ref).not.toEqual(b.source.ref);
    const end = vi.spyOn(AskEngine.prototype, 'end');
    a.release();
    expect(end).toHaveBeenCalledTimes(1);
    b.release();
    expect(end).toHaveBeenCalledTimes(2);
  });
});

describe('the Ask ACTIVE conversation provider', () => {
  it('opens an active source on the SAME pinned engine as a read holder (one stream); the last release ends it', async () => {
    w = world();
    const { askConversations } = await import('./source');
    const { askActiveConversations } = await import('./active');
    const end = vi.spyOn(AskEngine.prototype, 'end');
    const r = askConversations.open(ACCOUNT, ref(), AT)!;
    const a = askActiveConversations.open(ACCOUNT, ref(), AT)!;
    expect(a).toBeTruthy();
    expect(typeof (a.source as { send?: unknown }).send).toBe('function');
    expect(typeof (r.source as { send?: unknown }).send, 'the read holder stays read only').toBe('undefined');
    expect(a.source.ref).toEqual(ref());
    a.release();
    a.release();
    expect(end).not.toHaveBeenCalled();
    r.release();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('another computer’s chat, or no account, opens nothing', async () => {
    w = world();
    const { askActiveConversations } = await import('./active');
    expect(askActiveConversations.open(ACCOUNT, ref(), OTHER)).toBeNull();
    expect(askActiveConversations.open('', ref(), AT)).toBeNull();
  });
});

describe('the live wiring of the active adapter', () => {
  it('reads the journal’s unsettled entries and tells of their changes through the registry, and leases through the page’s managers', async () => {
    w = world();
    const R = await import('./registry');
    const { liveDeps } = await import('./active');
    const d = liveDeps();
    expect(d.pending).toBe(R.unsettledSends);
    expect(d.onPending).toBe(R.subscribeUnsettled);
    const off = R.subscribeUnsettled(() => undefined);
    expect(typeof off).toBe('function');
    off();
    expect(typeof d.leases.track).toBe('function');
    expect(typeof d.approvers.state).toBe('function');
  });
});

describe('subscribeUnsettled: another tab’s journal write reaches a listener without any engine update', () => {
  it('a write by another tab is published by the coalesced scan; no listener, no scan; unsubscribe stops it', async () => {
    w = world();
    const R = await import('./registry');
    const { seedEntryForTests } = await import('./journal/testing');
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const off = R.subscribeUnsettled(fn);
      await vi.advanceTimersByTimeAsync(R.UNSETTLED_SCAN_MS + 10);
      fn.mockClear();
      const entry = { k: 'hx-' + '7'.repeat(32), kind: 'turn' as const, h: HANDLE, r: REALM, s: 'sess-1', c: 'hx-' + '1'.repeat(32), ct: slot.computer, at: 1 };
      w.asB(() => seedEntryForTests(w!.jB, entry));
      await vi.advanceTimersByTimeAsync(R.UNSETTLED_SCAN_MS + 10);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(R.unsettledSends(HANDLE).map((e) => e.k)).toContain(entry.k);
      await vi.advanceTimersByTimeAsync(2000);
      expect(fn, 'nothing changed: nothing published').toHaveBeenCalledTimes(1);
      off();
      off();
      fn.mockClear();
      w.asB(() => seedEntryForTests(w!.jB, { ...entry, k: 'hx-' + '8'.repeat(32) }));
      await vi.advanceTimersByTimeAsync(2000);
      expect(fn, 'unsubscribed').not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('subscribeUnsettled: the page’s own engine updates and the last unsubscribe', () => {
  const entry = (c: string) => ({ k: 'hx-' + c.repeat(32), kind: 'turn' as const, h: HANDLE, r: REALM, s: 'sess-1', c: 'hx-' + '1'.repeat(32), ct: slot.computer, at: 1 });

  it('an engine update schedules a scan: a write that raised no storage event (another life of this tab) is still published', async () => {
    w = world();
    const R = await import('./registry');
    const { seedEntryForTests } = await import('./journal/testing');
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const off = R.subscribeUnsettled(fn);
      await vi.advanceTimersByTimeAsync(R.UNSETTLED_SCAN_MS + 10);
      fn.mockClear();
      // written outside asB(): this tab sees no storage event for it
      seedEntryForTests(w.jB, entry('5'));
      await vi.advanceTimersByTimeAsync(2000);
      expect(fn, 'nothing woke the scan yet').not.toHaveBeenCalled();
      // an engine of the registry publishing (here: a chat opening) is what wakes it
      const h = R.openRef(ACCOUNT, ref(), AT);
      expect(h).not.toBeNull();
      await vi.advanceTimersByTimeAsync(R.UNSETTLED_SCAN_MS + 10);
      expect(fn).toHaveBeenCalled();
      expect(R.unsettledSends(HANDLE).map((e) => e.k)).toContain(entry('5').k);
      h!.release();
      off();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the last unsubscribe ends the scan for good: a later storage event or engine update scans nothing', async () => {
    w = world();
    const R = await import('./registry');
    const { seedEntryForTests } = await import('./journal/testing');
    const { Journal } = await import('./journal');
    vi.useFakeTimers();
    try {
      const a = vi.fn(), b = vi.fn();
      const offA = R.subscribeUnsettled(a);
      const offB = R.subscribeUnsettled(b);
      await vi.advanceTimersByTimeAsync(R.UNSETTLED_SCAN_MS + 10);
      offA();
      // one listener is left: the scan still serves it
      b.mockClear();
      w.asB(() => seedEntryForTests(w!.jB, entry('6')));
      await vi.advanceTimersByTimeAsync(R.UNSETTLED_SCAN_MS + 10);
      expect(b, 'the remaining listener is still served').toHaveBeenCalledTimes(1);
      offB();
      const scans = vi.spyOn(Journal.prototype, 'pending');
      w.asB(() => seedEntryForTests(w!.jB, entry('7')));
      await vi.advanceTimersByTimeAsync(2000);
      expect(scans, 'nobody listens: no scan').not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
