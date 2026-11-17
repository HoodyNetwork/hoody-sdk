// Every live send of a Start carries that Start's own sender key (memory only), the viewer link is made
// only after the pipe shows the keyed stream live, and a pipe that refuses the name (403/409) or is full (429) ends
// the broadcast with its own sentence. Nothing is ever sent again on its own, and never without the key.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SENDER_KEY, newSenderKey } from './name';
import { flush } from './test/fakes';
import { computer, goLive, live, rig } from './test/rig';
import { pipeRoutes } from '@core';
import { sendLive } from './useBroadcast';

afterEach(() => { vi.restoreAllMocks(); });

const connect = async (r: ReturnType<typeof rig>) => { void r.b.start(computer, { audio: false, area: null }); await flush(); };

describe('sender key', () => {
  it('newSenderKey: 32 symbols of the pipe key alphabet, fresh each call', () => {
    const a = newSenderKey(), b = newSenderKey();
    expect(a).toMatch(SENDER_KEY);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });
  it('the live upload carries a well-formed key, not the name or the transfer id', async () => {
    const r = rig();
    await connect(r);
    const u = r.uploads[0]!;
    expect(u.key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(u.name).not.toContain(u.key);
    expect(u.transfer).not.toContain(u.key);
  });
  it('a new Start sends a new name and a new key', async () => {
    const r = rig();
    await connect(r);
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.b.state.phase).toBe('ended');
    await connect(r);
    expect(r.uploads.length).toBe(2);
    expect(r.uploads[1]!.name).not.toBe(r.uploads[0]!.name);
    expect(r.uploads[1]!.key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(r.uploads[1]!.key).not.toBe(r.uploads[0]!.key);
  });
  it('the key never reaches the state, storage or the console', async () => {
    // Whatever the test environment has, both storages are recording fakes here.
    const set = vi.fn();
    const fakeStore = () => ({ setItem: set, getItem: () => null, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 });
    vi.stubGlobal('localStorage', fakeStore());
    vi.stubGlobal('sessionStorage', fakeStore());
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const idb = vi.fn();
    vi.stubGlobal('indexedDB', { open: idb });
    try {
      const r = rig();
      const seen: string[] = [];
      r.b.subscribe(() => { seen.push(JSON.stringify(r.b.state)); });
      await goLive(r);
      r.uploads[0]!.answer({ status: 403, text: '[ERROR] held\n' });
      await flush();
      const key = r.uploads[0]!.key;
      seen.push(JSON.stringify(r.b.state));
      for (const s of seen) expect(s).not.toContain(key);
      for (const c of set.mock.calls) expect(JSON.stringify(c)).not.toContain(key);
      for (const l of logs) for (const c of l.mock.calls) expect(String(c)).not.toContain(key);
      expect(idb).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('viewer link order', () => {
  it('no link is made while the keyed send is not yet live, even after the pipe answers it', async () => {
    const r = rig();
    await connect(r);
    expect(r.creates.length).toBe(0);
    r.uploads[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(r.creates.length).toBe(0);
  });
  it('a status event that does not say live makes no link', async () => {
    const r = rig();
    await connect(r);
    r.progress[0]!.cb.onEvent('state', JSON.stringify({ state: 'waiting', hasSender: true, activeReceivers: 1, live: false }));
    await flush();
    expect(r.b.state.phase).toBe('connecting');
    expect(r.creates.length).toBe(0);
  });
  it('the link is made once the pipe shows the stream live', async () => {
    const r = rig();
    await connect(r);
    r.progress[0]!.cb.onEvent('state', live(1));
    await flush();
    expect(r.creates.length).toBe(1);
    expect(r.creates[0]!.v.name).toBe(r.uploads[0]!.name);
  });
});

describe('refusals (no keyless retry, no retry at all)', () => {
  const cases: Array<[number, string]> = [[403, 'taken'], [409, 'taken'], [429, 'busy'], [400, 'refused'], [500, 'refused']];
  for (const [status, reason] of cases) {
    it(`${status} before live ends as ${reason}, makes no link and sends nothing more`, async () => {
      const r = rig();
      await connect(r);
      r.uploads[0]!.answer({ status, text: '[ERROR] X-Hoody-Pipe-Sender-Key mismatch\n' });
      await flush();
      r.fire(60_000);
      await flush();
      expect(r.b.state.phase).toBe('ended');
      expect(r.b.state.end?.reason).toBe(reason);
      expect(r.creates.length).toBe(0);
      expect(r.uploads.length).toBe(1);
    });
  }
  it('a taken or busy end shows no pipe line (it may name internals); other refusals keep it', async () => {
    for (const [status, line] of [[403, ''], [429, ''], [400, 'bad']] as const) {
      const r = rig();
      await connect(r);
      r.uploads[0]!.answer({ status, text: '[ERROR] bad\n' });
      await flush();
      expect(r.b.state.end?.line).toBe(line);
    }
  });
  it('a 403 after live ends the broadcast as taken and removes the link, with no new send', async () => {
    const r = rig();
    await goLive(r);
    r.uploads[0]!.answer({ status: 403, text: '' });
    await flush();
    expect(r.b.state.end?.reason).toBe('taken');
    expect(r.uploads.length).toBe(1);
  });
});

describe('the page wiring', () => {
  it('sendLive sends through the keyed live route with the Start\'s key', async () => {
    const up = vi.fn(async () => ({ status: 200, text: '' }));
    const body = new ReadableStream<Uint8Array>();
    const sig = new AbortController().signal;
    const t = { project: { id: 'p1' }, container: { id: 'c1' } };
    await sendLive(up as never)(t as never, 'bc-n', 'bc-t', 'K'.repeat(32), body, 'video/webm', sig);
    expect(up).toHaveBeenCalledTimes(1);
    expect(up.mock.calls[0]).toEqual([pipeRoutes.live, { target: t, params: { name: 'bc-n' }, query: { live: 1, transfer: 'bc-t' }, senderKey: 'K'.repeat(32), body, contentType: 'video/webm', signal: sig }]);
    expect(pipeRoutes.live.senderKey).toBe(true);
  });
});
