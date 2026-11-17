// The broadcast controller against a fake capture, recorder, pipe and alias service.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCEPT_MS, IDLE_STATE, REOPEN_MS, holdsComputer, type Outcome } from './broadcaster';
import { LINK_TTL_MS, RENEW_EVERY_MS } from './link';
import { PIPE_NAME } from './name';
import { FIRST_DATA_MS } from './sender';
import { FakeRecorder, fakeStream, flush } from './test/fakes';
import { alias, computer, deferred, goLive, live, other, rig } from './test/rig';

afterEach(() => { FakeRecorder.last = null; });

describe('Broadcaster start', () => {
  it('asks for the capture synchronously inside the click, with the tab-first options', () => {
    const r = rig();
    void r.b.start(computer, { audio: true, area: null });
    expect(r.deps.getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(r.b.state.phase).toBe('picking');
    expect(r.b.state.name).toMatch(PIPE_NAME);
    expect(r.b.running).toBe(true);
  });
  it('opens the status stream, starts the upload on the same name, and is not live until the pipe says so', async () => {
    const r = rig();
    void r.b.start(computer, { audio: false, area: null });
    await flush();
    expect(r.b.state.phase).toBe('connecting');
    expect(r.progress.length).toBe(1);
    expect(r.uploads.length).toBe(1);
    expect(r.uploads[0]!.name).toBe(r.b.state.name);
    expect(r.progress[0]!.name).toBe(r.b.state.name);
    expect(r.uploads[0]!.transfer).toMatch(/^bc-/);
    expect(r.creates.length).toBe(0);
    r.progress[0]!.cb.onEvent('state', live(3));
    await flush();
    expect(r.b.state.phase).toBe('live');
    expect(r.b.state.status.viewers).toBe(3);
  });
  it('refused picker, no screen, no WebM: back to idle with the reason, nothing sent', async () => {
    const denied = rig({ pick: () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) });
    void denied.b.start(computer, { audio: false, area: null });
    await flush();
    expect(denied.b.state).toMatchObject({ phase: 'idle', startError: 'denied', name: null });
    expect(denied.uploads.length).toBe(0);
    const empty = fakeStream({ video: false });
    const nov = rig({ pick: async () => empty.stream });
    void nov.b.start(computer, { audio: false, area: null });
    await flush();
    expect(nov.b.state.startError).toBe('no-source');
    const nw = rig();
    FakeRecorder.supported = new Set();
    try {
      void nw.b.start(computer, { audio: false, area: null });
      await flush();
      expect(nw.b.state.startError).toBe('no-webm');
      expect(nw.streams[0]!.all.every((t) => t.stopped)).toBe(true);
    } finally { FakeRecorder.supported = new Set(['video/webm;codecs=vp8', 'video/webm;codecs=vp8,opus', 'video/webm']); }
  });
  it('a picked window is refused at once: tracks stopped, nothing sent, "this tab only"', async () => {
    const win = fakeStream({ surface: 'window' });
    const r = rig({ pick: async () => win.stream });
    void r.b.start(computer, { audio: false, area: null });
    await flush();
    expect(r.b.state).toMatchObject({ phase: 'idle', startError: 'not-this-tab', name: null, confined: null });
    expect(win.all.every((t) => t.stopped)).toBe(true);
    expect(r.b.running).toBe(false);
    expect(r.uploads.length).toBe(0);
    expect(r.progress.length).toBe(0);
    expect(FakeRecorder.last).toBeNull();
  });
  it('a tab the tile crop refuses (another tab was picked) is refused the same way', async () => {
    const tab = fakeStream();
    tab.video!.cropTo = () => Promise.reject(new Error('not this tab'));
    vi.stubGlobal('CropTarget', { fromElement: async () => ({}) });
    try {
      const r = rig({ pick: async () => tab.stream });
      void r.b.start(computer, { audio: false, area: {} as Element });
      await flush();
      expect(r.b.state).toMatchObject({ phase: 'idle', startError: 'not-this-tab', confined: null });
      expect(tab.all.every((t) => t.stopped)).toBe(true);
      expect(r.uploads.length).toBe(0);
      expect(FakeRecorder.last).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
  it('this tab with the crop applied starts as before', async () => {
    const tab = fakeStream();
    tab.video!.cropTo = async () => {};
    vi.stubGlobal('CropTarget', { fromElement: async () => ({}) });
    try {
      const r = rig({ pick: async () => tab.stream });
      void r.b.start(computer, { audio: false, area: {} as Element });
      await flush();
      expect(r.b.state).toMatchObject({ phase: 'connecting', confined: 'region' });
      expect(r.uploads.length).toBe(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it('no live answer within ACCEPT_MS: the stream stops as no-answer', async () => {
    const r = rig();
    void r.b.start(computer, { audio: false, area: null });
    await flush();
    r.fire(ACCEPT_MS);
    await flush();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.b.state.phase).toBe('ended');
    expect(r.b.state.end?.reason).toBe('no-answer');
    expect(r.creates.length).toBe(0);
  });
  it('a second start while running does nothing', async () => {
    const r = rig();
    await goLive(r);
    void r.b.start(computer, { audio: false, area: null });
    expect(r.deps.getDisplayMedia).toHaveBeenCalledTimes(1);
  });
});

describe('Broadcaster link (C9)', () => {
  it('once live, one alias create for this name; done with a url → ready', async () => {
    const r = rig();
    await goLive(r);
    expect(r.creates.map((c) => c.v)).toEqual([{ computer: 'c1', name: r.b.state.name, until: new Date(1_000_000 + LINK_TTL_MS).toISOString() }]);
    expect(r.b.state.linkState).toBe('making');
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) });
    await flush();
    expect(r.b.state.link).toEqual({ id: 'al1', url: 'https://abc.sv1.alias.test' });
    expect(r.b.state.linkState).toBe('ready');
    r.progress[0]!.cb.onEvent('progress', JSON.stringify({ activeReceivers: 5, elapsed: 3, live: true }));
    expect(r.creates.length).toBe(1);
  });
  it('pending, stale, a thrown call and a held lock are unknown, never failed, never resent; Check reads it back', async () => {
    for (const o of [{ outcome: 'pending' }, { outcome: 'stale' }, { outcome: 'not_sent', code: 'READ_BACK_FIRST' }, null] as const) {
      const r = rig();
      await goLive(r);
      if (o) r.creates[0]!.d.resolve(o as Outcome<null>); else r.creates[0]!.d.reject(new Error('boom'));
      await flush();
      expect(r.b.state.linkState).toBe('unknown');
      r.b.retryLink();
      expect(r.creates.length).toBe(1);
      (r.deps.findLink as ReturnType<typeof vi.fn>).mockResolvedValueOnce(alias(r.b.state.name!, { id: 'al9' }));
      await r.b.checkLink();
      expect(r.b.state).toMatchObject({ linkState: 'ready', link: { id: 'al9' } });
    }
  });
  it('a check whose list answered without the link is not-found (never failed); an unread list keeps it unknown', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'pending' });
    await flush();
    (r.deps.findLink as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('unread'));
    await r.b.checkLink();
    expect(r.b.state.linkState).toBe('unknown');
    await r.b.checkLink();
    expect(r.b.state.linkState).toBe('not-found');
  });
  it('a definite refusal is failed; Retry sends once more', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'failed', code: 'ALIAS_PIN_UNSUPPORTED' });
    await flush();
    expect(r.b.state.linkState).toBe('failed');
    r.b.retryLink();
    expect(r.creates.length).toBe(2);
  });
  it('done without a usable url is unknown (never a made-up link)', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!, { url: '' }) });
    await flush();
    expect(r.b.state).toMatchObject({ linkState: 'unknown', link: null });
  });
});

describe('Broadcaster stop / revoke', () => {
  async function ready(r: ReturnType<typeof rig>) {
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) });
    await flush();
  }
  it('stop keeps the chip (stopping) until the pipe answered, resolves waitEnded, then removes the link once', async () => {
    const r = rig();
    await ready(r);
    r.b.stop();
    expect(r.b.state.phase).toBe('stopping');
    expect(r.b.running).toBe(true);
    let ended = false;
    void r.b.waitEnded().then(() => { ended = true; });
    await flush();
    expect(ended).toBe(false);
    expect(r.removes.length).toBe(0);
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(ended).toBe(true);
    expect(r.b.state).toMatchObject({ phase: 'ended', end: { reason: 'stopped' }, linkState: 'removing' });
    expect(r.b.state.status.viewers).toBeNull();
    expect(r.progress[0]!.closed).toBe(true);
    expect(r.removes.map((x) => x.v)).toEqual([{ computer: 'c1', alias: 'al1' }]);
    r.removes[0]!.d.resolve({ outcome: 'done' });
    await flush();
    expect(r.b.state).toMatchObject({ phase: 'ended', linkState: 'removed', link: null, name: null });
    expect(r.removes.length).toBe(1);
  });
  it('every unexpected end removes the link too (a link never outlives its stream)', async () => {
    for (const end of ['track', 'network', 'refused', 'server'] as const) {
      const r = rig();
      await ready(r);
      if (end === 'track') { r.streams[0]!.video!.end(); await flush(); r.uploads[0]!.answer({ status: 200, text: '' }); }
      else if (end === 'network') r.uploads[0]!.fail();
      else if (end === 'refused') r.uploads[0]!.answer({ status: 409, text: '[ERROR] busy\n' });
      else r.uploads[0]!.answer({ status: 200, text: '[ERROR] Transfer aborted\n' });
      await flush();
      expect(r.b.state.phase).toBe('ended');
      expect(r.removes.length).toBe(1);
    }
  });
  it('live with viewers but no recorded picture: ends as no-picture, the upload aborted, the link removed', async () => {
    const r = rig();
    await ready(r);
    expect(r.b.state.phase).toBe('live');
    expect(r.b.state.status.viewers).toBe(2);
    r.fire(FIRST_DATA_MS);
    await flush();
    expect(r.b.state.phase).toBe('ended');
    expect(r.b.state.end?.reason).toBe('no-picture');
    expect(r.uploads[0]!.signal.aborted).toBe(true);
    expect(r.streams[0]!.all.every((t) => t.stopped)).toBe(true);
    expect(r.removes.length).toBe(1);
  });
  it('a recorded picture keeps it live past FIRST_DATA_MS', async () => {
    const r = rig();
    await ready(r);
    FakeRecorder.last!.chunk([1]);
    await flush();
    r.fire(FIRST_DATA_MS);
    await flush();
    expect(r.b.state.phase).toBe('live');
    expect(r.uploads[0]!.signal.aborted).toBe(false);
  });
  it('Start after an end makes a new name and a new link', async () => {
    const r = rig();
    await ready(r);
    const name = r.b.state.name;
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    r.removes[0]!.d.resolve({ outcome: 'done' });
    await flush();
    await goLive(r);
    expect(r.b.state.name).not.toBe(name);
    expect(r.uploads[1]!.name).toBe(r.b.state.name);
    expect(r.creates.length).toBe(2);
  });
  it('a Start while the earlier link is still being removed is refused as busy', async () => {
    const r = rig();
    await ready(r);
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.b.state.linkState).toBe('removing');
    void r.b.start(computer, { audio: false, area: null });
    expect(r.b.state.startError).toBe('busy');
    expect(r.deps.getDisplayMedia).toHaveBeenCalledTimes(1);
  });
  it('an unknown remove stays unconfirmed (never removed), blocks Start, and is read back', async () => {
    const r = rig();
    await ready(r);
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    r.removes[0]!.d.resolve({ outcome: 'pending' });
    await flush();
    expect(r.b.state.linkState).toBe('removal-unknown');
    expect(r.b.state.link).not.toBeNull();
    void r.b.start(computer, { audio: false, area: null });
    expect(r.b.state.startError).toBe('busy');
    r.b.retryRemove();
    expect(r.removes.length).toBe(1);
    (r.deps.checkRemove as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    await r.b.checkRemoval();
    expect(r.b.state.linkState).toBe('removal-unknown');
    await r.b.checkRemoval();
    expect(r.b.state.linkState).toBe('removed');
  });
  it('a refused remove keeps the link shown and offers Try again, which sends once more', async () => {
    const r = rig();
    await ready(r);
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    r.removes[0]!.d.resolve({ outcome: 'failed' });
    await flush();
    expect(r.b.state.linkState).toBe('removal-failed');
    expect(r.b.state.link).not.toBeNull();
    r.b.retryRemove();
    expect(r.removes.length).toBe(2);
  });
  it('a revoke while the create is unknown removes nothing until the create is read back', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'pending' });
    await flush();
    r.b.revoke();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.removes.length).toBe(0);
    expect(r.b.state.linkState).toBe('unknown');
    (r.deps.findLink as ReturnType<typeof vi.fn>).mockResolvedValueOnce(alias(r.b.state.name!));
    await r.b.checkLink();
    await flush();
    expect(r.removes.length).toBe(1);
  });
  it('a revoke while the create is in flight removes after it lands', async () => {
    const r = rig();
    await goLive(r);
    r.b.revoke();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.removes.length).toBe(0);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) });
    await flush();
    expect(r.removes.length).toBe(1);
  });
  it('an unknown create blocks Start until it is read back', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'pending' });
    await flush();
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    void r.b.start(other, { audio: false, area: null });
    expect(r.b.state.startError).toBe('busy');
    await r.b.checkLink();
    expect(r.b.state.linkState).toBe('not-found');
    void r.b.start(other, { audio: false, area: null });
    expect(r.deps.getDisplayMedia).toHaveBeenCalledTimes(2);
  });
  it('stop while the picker is open drops the capture it later returns', async () => {
    const d = deferred<MediaStream>();
    const r = rig({ pick: () => d.p });
    void r.b.start(computer, { audio: false, area: null });
    r.b.stop();
    expect(r.b.state.phase).toBe('idle');
    const s = fakeStream();
    d.resolve(s.stream);
    await flush();
    expect(s.all.every((t) => t.stopped)).toBe(true);
    expect(r.uploads.length).toBe(0);
  });
});

describe('Broadcaster status stream', () => {
  it('a closed status stream makes viewers unknown and reopens after REOPEN_MS', async () => {
    const r = rig();
    await goLive(r);
    r.progress[0]!.cb.onClosed('network');
    expect(r.b.state.status.viewers).toBeNull();
    expect(r.b.state.status.live).toBe(true);
    r.fire(REOPEN_MS);
    expect(r.progress.length).toBe(2);
    r.progress[1]!.cb.onEvent('progress', JSON.stringify({ activeReceivers: 4, elapsed: 9, live: true }));
    expect(r.b.state.status.viewers).toBe(4);
  });
  it('while the page is hidden it reopens when the page is visible again', async () => {
    const r = rig();
    await goLive(r);
    r.setHidden(true);
    r.progress[0]!.cb.onClosed('hidden');
    expect(r.timers.some((t) => t.ms === REOPEN_MS && !t.dead)).toBe(false);
    r.setHidden(false);
    expect(r.progress.length).toBe(2);
    expect(r.visFns.size).toBe(0);
  });
  it('a done for this transfer is shown; the sender end then ends the broadcast', async () => {
    const r = rig();
    await goLive(r);
    r.progress[0]!.cb.onEvent('done', JSON.stringify({ state: 'failed', reason: 'Idle timeout', transferId: r.uploads[0]!.transfer }));
    expect(r.b.state.status.done?.reason).toBe('Idle timeout');
    r.uploads[0]!.answer({ status: 200, text: '[ERROR] Transfer aborted — idle timeout exceeded.\n' });
    await flush();
    expect(r.b.state.end).toEqual({ reason: 'server', line: 'Transfer aborted — idle timeout exceeded.' });
  });
  it('dispose stops the capture, the upload and the status stream, and sends no more events', async () => {
    const r = rig();
    await goLive(r);
    const seen = vi.fn();
    r.b.subscribe(seen);
    r.b.dispose();
    await flush();
    expect(r.streams[0]!.all.every((t) => t.stopped)).toBe(true);
    expect(r.progress[0]!.closed).toBe(true);
    expect(FakeRecorder.last?.state).toBe('inactive');
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('Broadcaster: stops, timeouts, revokes and link extensions', () => {
  it('a stop or dispose while the capture is being narrowed stops its tracks at once', async () => {
    for (const how of ['stop', 'dispose'] as const) {
      const r = rig();
      const hold = deferred<unknown>();
      const s = fakeStream();
      s.video!.restrictTo = () => hold.p as Promise<void>;
      (r.deps.getDisplayMedia as ReturnType<typeof vi.fn>).mockResolvedValueOnce(s.stream);
      const g = globalThis as unknown as Record<string, unknown>;
      const old = g.RestrictionTarget;
      g.RestrictionTarget = { fromElement: async () => 'target' };
      try {
        void r.b.start(computer, { audio: false, area: {} as Element });
        await flush();
        expect(s.all.some((t) => t.stopped)).toBe(false);
        if (how === 'stop') r.b.stop(); else r.b.dispose();
        expect(s.all.every((t) => t.stopped)).toBe(true);
        hold.resolve(undefined);
        await flush();
        expect(r.uploads.length).toBe(0);
      } finally { g.RestrictionTarget = old; }
    }
  });
  it('a recorder that fails at once ends the broadcast; waitEnded resolves and nothing is left running', async () => {
    const r = rig();
    const Boom = class { static isTypeSupported() { return true; } constructor() { throw new Error('no'); } };
    (r.deps as { MediaRecorder: unknown }).MediaRecorder = Boom;
    void r.b.start(computer, { audio: false, area: null });
    await flush();
    expect(r.b.state).toMatchObject({ phase: 'ended', end: { reason: 'recorder' } });
    expect(r.b.running).toBe(false);
    r.b.revoke();
    await expect(r.b.waitEnded()).resolves.toBeUndefined();
    expect(r.b.state.phase).toBe('ended');
  });
  it('no answer in time: stopping at once, and a late live event makes no link', async () => {
    const r = rig();
    void r.b.start(computer, { audio: false, area: null });
    await flush();
    r.fire(ACCEPT_MS);
    expect(r.b.state.phase).toBe('stopping');
    r.progress[0]!.cb.onEvent('state', live(1));
    await flush();
    expect(r.creates.length).toBe(0);
    expect(r.b.state.phase).toBe('stopping');
  });
  it('a Stop before the accept timeout keeps its reason (stopped, not no-answer)', async () => {
    const r = rig();
    void r.b.start(computer, { audio: false, area: null });
    await flush();
    r.b.stop();
    r.fire(ACCEPT_MS);
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.b.state.end?.reason).toBe('stopped');
  });
  it('a revoke while the remove is in flight joins it: no second send, never failed', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) });
    await flush();
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.b.state.linkState).toBe('removing');
    r.b.revoke();
    await flush();
    expect(r.removes.length).toBe(1);
    expect(r.b.state.linkState).toBe('removing');
  });
  it('settled waits for a late create and its remove', async () => {
    const r = rig();
    await goLive(r);
    r.b.revoke();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.b.settled).toBe(false);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) });
    await flush();
    expect(r.b.state.linkState).toBe('removing');
    expect(r.b.settled).toBe(false);
    r.removes[0]!.d.resolve({ outcome: 'done' });
    await flush();
    expect(r.b.settled).toBe(true);
  });
  it('a revoke while live removes nothing until the stream has ended', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) });
    await flush();
    r.b.revoke();
    await flush();
    expect(r.b.state.phase).toBe('stopping');
    expect(r.removes.length).toBe(0);
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.removes.length).toBe(1);
  });
  it('settled is never true in between a late create landing and its remove starting', async () => {
    const r = rig();
    await goLive(r);
    r.b.revoke();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    const seen: boolean[] = [];
    r.b.subscribe(() => seen.push(r.b.settled));
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) });
    await flush();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((x) => !x)).toBe(true);
  });
});

describe('Broadcaster link renewal (short expiry, extended while live)', () => {
  async function ready() {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!, { expiresAt: '2026-10-24T08:00:00.000Z' }) });
    await flush();
    expect(r.b.state).toMatchObject({ linkState: 'ready', linkUntil: '2026-10-24T08:00:00.000Z', renew: 'ok' });
    return r;
  }
  it('extends the live link every RENEW_EVERY_MS to LINK_TTL_MS ahead, one at a time', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS);
    await flush();
    expect(r.renews.length).toBe(1);
    const until = new Date(1_000_000 + LINK_TTL_MS).toISOString();
    expect(r.renews[0]!.v).toEqual({ computer: 'c1', alias: 'al1', until });
    r.fire(RENEW_EVERY_MS);
    await flush();
    expect(r.renews.length).toBe(1);
    r.renews[0]!.d.resolve({ outcome: 'done' });
    await flush();
    expect(r.b.state).toMatchObject({ linkUntil: until, renew: 'ok' });
    r.fire(RENEW_EVERY_MS);
    await flush();
    expect(r.renews.length).toBe(2);
  });
  it('an unknown extension is read back before the next one; unproved, nothing is sent and the shown expiry stays', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.renews[0]!.d.resolve({ outcome: 'pending' }); await flush();
    expect(r.b.state).toMatchObject({ renew: 'unknown', linkUntil: '2026-10-24T08:00:00.000Z' });
    vi.mocked(r.deps.checkRenew).mockResolvedValueOnce(false);
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.deps.checkRenew).toHaveBeenCalledTimes(1);
    expect(r.renews.length).toBe(1);
    vi.mocked(r.deps.findLink).mockResolvedValueOnce(alias(r.b.state.name!, { expiresAt: '2026-10-24T08:05:00.000Z' }));
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(2);
    expect(r.b.state.renew).toBe('ok');
  });
  it('a refused extension is failed and the next tick sends a new one', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.renews[0]!.d.resolve({ outcome: 'failed' }); await flush();
    expect(r.b.state.renew).toBe('failed');
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(2);
  });
  it('Stop while an extension is in flight: the remove waits for it, then goes once', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.b.state.phase).toBe('ended');
    expect(r.removes.length).toBe(0);
    expect(r.b.settled).toBe(false);
    r.renews[0]!.d.resolve({ outcome: 'done' }); await flush();
    expect(r.removes.length).toBe(1);
    r.removes[0]!.d.resolve({ outcome: 'done' }); await flush();
    expect(r.b.state.linkState).toBe('removed');
    expect(r.b.settled).toBe(true);
  });
  it('Stop after an unknown extension: read back first; unproved, nothing is sent and Try again reads it back again', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.renews[0]!.d.resolve({ outcome: 'pending' }); await flush();
    vi.mocked(r.deps.checkRenew).mockResolvedValueOnce(false);
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.removes.length).toBe(0);
    expect(r.b.state.linkState).toBe('removal-failed');
    r.b.retryRemove(); await flush();
    expect(r.removes.length).toBe(1);
  });
  it('no extension after the stream ended', async () => {
    const r = await ready();
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(0);
  });
});

describe('Broadcaster: dispose and unknown creates', () => {
  it('dispose with a ready link removes it once, without waiting', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) });
    await flush();
    r.b.dispose();
    expect(r.removes.map((x) => x.v)).toEqual([{ computer: 'c1', alias: 'al1' }]);
    expect(r.uploads[0]!.signal.aborted).toBe(true);
  });
  it('dispose while the create is in flight: the link it makes is removed when it answers', async () => {
    const r = rig();
    await goLive(r);
    const name = r.b.state.name!;
    r.b.dispose();
    expect(r.removes.length).toBe(0);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(name, { id: 'al9' }) });
    await flush();
    expect(r.removes.map((x) => x.v)).toEqual([{ computer: 'c1', alias: 'al9' }]);
  });
  it('an unknown create stays unknown (and Start waits) until core proves it, whatever the list shows', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'pending' });
    await flush();
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    vi.mocked(r.deps.checkCreate).mockResolvedValueOnce(false);
    await r.b.checkLink();
    expect(r.deps.findLink).not.toHaveBeenCalled();
    expect(r.b.state.linkState).toBe('unknown');
    void r.b.start(computer, { audio: false, area: null });
    expect(r.b.state.startError).toBe('busy');
    expect(r.deps.getDisplayMedia).toHaveBeenCalledTimes(1);
    await r.b.checkLink();
    expect(r.b.state.linkState).toBe('not-found');
  });
  it('no link retry once Stop began, even while the pipe still reports live', async () => {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'failed' });
    await flush();
    r.b.stop();
    expect(r.b.state.status.live).toBe(true);
    r.b.retryLink();
    await flush();
    expect(r.creates.length).toBe(1);
  });
  it('holdsComputer: while a stream runs or a link may exist, never once the link is off', () => {
    expect(holdsComputer(IDLE_STATE)).toBe(false);
    expect(holdsComputer({ ...IDLE_STATE, phase: 'live' })).toBe(true);
    for (const ls of ['making', 'ready', 'unknown', 'removing', 'removal-unknown', 'removal-failed'] as const) expect(holdsComputer({ ...IDLE_STATE, phase: 'ended', linkState: ls })).toBe(true);
    for (const ls of ['none', 'removed', 'not-found', 'failed'] as const) expect(holdsComputer({ ...IDLE_STATE, phase: 'ended', linkState: ls })).toBe(false);
  });
});

describe('Broadcaster: a realm switch', () => {
  async function ready() {
    const r = rig();
    await goLive(r);
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!, { expiresAt: '2026-10-24T08:00:00.000Z' }) });
    await flush();
    return r;
  }
  it('after a realm switch, dispose sends no remove (it would reach the wrong realm)', async () => {
    const r = await ready();
    r.switchRealm();
    r.b.dispose();
    await flush();
    expect(r.removes.length).toBe(0);
  });
  it('a create that answers after a realm switch and dispose is not removed in the new realm', async () => {
    const r = rig();
    await goLive(r);
    r.switchRealm();
    r.b.dispose();
    r.creates[0]!.d.resolve({ outcome: 'done', data: alias(r.b.state.name!) });
    await flush();
    expect(r.removes.length).toBe(0);
  });
  it('no link is made, extended or removed once the context is gone', async () => {
    const r = await ready();
    r.switchRealm();
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(0);
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.removes.length).toBe(0);
    expect(r.b.state.linkState).toBe('removal-failed');
  });
  it('dispose during an extension in flight removes once the extension settled', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.b.dispose();
    await flush();
    expect(r.removes.length).toBe(0);
    r.renews[0]!.d.resolve({ outcome: 'done' }); await flush();
    expect(r.removes.length).toBe(1);
    expect(r.removes[0]!.v).toEqual({ computer: 'c1', alias: 'al1' });
  });
  it('dispose after an extension came back unknown reads it back, then removes once', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.b.dispose();
    r.renews[0]!.d.resolve({ outcome: 'pending' }); await flush();
    expect(r.deps.checkRenew).toHaveBeenCalledTimes(1);
    expect(r.removes.length).toBe(1);
  });
  it('Stop, then dispose while the remove waits for an extension: the remove still goes, once', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.b.stop();
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.b.state.linkState).toBe('removing');
    r.b.dispose();
    r.renews[0]!.d.resolve({ outcome: 'done' }); await flush();
    expect(r.removes.length).toBe(1);
  });
  it('Stop cancels the next extension; none is sent while stopping', async () => {
    const r = await ready();
    r.b.stop();
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(0);
  });
  it('an extension waiting on its read-back sends nothing after dispose', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.renews[0]!.d.resolve({ outcome: 'pending' }); await flush();
    const back = deferred<boolean>();
    vi.mocked(r.deps.checkRenew).mockReturnValueOnce(back.p);
    vi.mocked(r.deps.findLink).mockResolvedValueOnce(alias(r.b.state.name!, { expiresAt: '2026-10-24T08:05:00.000Z' }));
    r.fire(RENEW_EVERY_MS); await flush();
    r.b.dispose();
    back.resolve(true); await flush();
    expect(r.renews.length).toBe(1);
  });
  it('after the pipe says done, or the browser stops sharing, no extension is sent', async () => {
    const r = await ready();
    r.progress[0]!.cb.onEvent('done', JSON.stringify({ state: 'complete', transferId: r.uploads[0]!.transfer }));
    await flush();
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(0);
    const s = await ready();
    s.streams[0]!.video!.end();
    await flush();
    s.fire(RENEW_EVERY_MS); await flush();
    expect(s.renews.length).toBe(0);
  });
  it('a proved read-back of an unknown extension shows the expiry the fresh list has', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.renews[0]!.d.resolve({ outcome: 'pending' }); await flush();
    vi.mocked(r.deps.findLink).mockResolvedValueOnce(alias(r.b.state.name!, { expiresAt: '2026-10-24T08:05:00.000Z' }));
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.b.state).toMatchObject({ renew: 'ok', linkUntil: '2026-10-24T08:05:00.000Z' });
    r.renews[1]!.d.resolve({ outcome: 'failed' }); await flush();
    expect(r.b.state).toMatchObject({ renew: 'failed', linkUntil: '2026-10-24T08:05:00.000Z' });
  });
  it('an unread list after a proved read-back keeps the extension unknown and sends nothing until a fresh list says when it stops', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.renews[0]!.d.resolve({ outcome: 'pending' }); await flush();
    vi.mocked(r.deps.findLink).mockRejectedValueOnce(new Error('unread'));
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(1);
    expect(r.b.state).toMatchObject({ renew: 'unknown', linkUntil: '2026-10-24T08:00:00.000Z' });
    vi.mocked(r.deps.findLink).mockResolvedValueOnce(alias(r.b.state.name!, { expiresAt: '2026-10-24T08:05:00.000Z' }));
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(2);
    expect(r.b.state).toMatchObject({ renew: 'ok', linkUntil: '2026-10-24T08:05:00.000Z' });
  });
  it('a fresh list without an expiry, or naming another link, reconciles nothing and sends nothing', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.renews[0]!.d.resolve({ outcome: 'pending' }); await flush();
    vi.mocked(r.deps.findLink).mockResolvedValueOnce(alias(r.b.state.name!, { expiresAt: '' }));
    r.fire(RENEW_EVERY_MS); await flush();
    vi.mocked(r.deps.findLink).mockResolvedValueOnce(alias(r.b.state.name!, { id: 'al9', expiresAt: '2026-10-24T08:05:00.000Z' }));
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(1);
    expect(r.b.state.renew).toBe('unknown');
  });
  it('a fresh list with no working link stops extending and says no working link was found', async () => {
    const r = await ready();
    r.fire(RENEW_EVERY_MS); await flush();
    r.renews[0]!.d.resolve({ outcome: 'pending' }); await flush();
    vi.mocked(r.deps.findLink).mockResolvedValueOnce(null);
    r.fire(RENEW_EVERY_MS); await flush();
    r.fire(RENEW_EVERY_MS); await flush();
    expect(r.renews.length).toBe(1);
    expect(r.b.state).toMatchObject({ linkState: 'not-found', linkUntil: null, renew: 'ok' });
  });
});
