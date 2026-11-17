import { describe, expect, it, vi } from 'vitest';
import { acquireTabLock, lockName, TAKEOVER_WAIT_MS, type LockEnv } from './tabLock';

function makeEnv(held: { value: boolean }) {
  const posted: unknown[] = [];
  const chans: { cb: ((m: unknown) => void) | null; closed: boolean }[] = [];
  const timers: { ms: number; fn: () => void; off: boolean }[] = [];
  let waiter: (() => void) | null = null;
  const env: LockEnv = {
    locks: {
      request: ((_n: string, opts: { ifAvailable?: boolean; signal?: AbortSignal }, cb: (l: unknown) => Promise<unknown>) => {
        if (held.value && opts.ifAvailable) return cb(null);
        if (held.value) {
          return new Promise((res, rej) => {
            waiter = () => { held.value = true; cb({}).then(res, rej); };
            opts.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
          });
        }
        held.value = true;
        return cb({}).finally(() => { held.value = false; });
      }) as never,
    },
    channel: () => {
      const c = { cb: null as ((m: unknown) => void) | null, closed: false, post: (m: unknown) => { posted.push(m); }, onMessage(f: (m: unknown) => void) { c.cb = f; return () => { c.cb = null; }; }, close: () => { c.closed = true; } };
      chans.push(c);
      return c;
    },
    timer(ms, fn) {
      const t = { ms, fn, off: false };
      timers.push(t);
      return () => { t.off = true; };
    },
  };
  return { env, posted, chans, timers, free: () => waiter?.() };
}

describe('the one-tab lock', () => {
  it('is named for the computer, realm and Bot', () => {
    expect(lockName({ computer: 'c', realm: 'r', bot: 'b' })).toBe('hoody-bot-voice:c:r:b');
  });
  it('answers a release while free, and null while another tab holds it, without waiting', async () => {
    const free = makeEnv({ value: false });
    const rel = await acquireTabLock(free.env, 'n', false, vi.fn());
    expect(rel).toBeTypeOf('function');
    const busy = makeEnv({ value: true });
    const asked = acquireTabLock(busy.env, 'n', false, vi.fn());
    const waited = new Promise<'waited'>((r) => { setTimeout(() => r('waited'), 100); });
    expect(await Promise.race([asked, waited])).toBeNull();
    expect(busy.posted).toEqual([]);
  });
  it('a browser without Web Locks answers a release that does nothing', async () => {
    const m = makeEnv({ value: true });
    const rel = await acquireTabLock({ ...m.env, locks: null }, 'n', false, vi.fn());
    expect(() => { rel!(); rel!(); }).not.toThrow();
  });
  it('tells its holder when another tab asks it to end, until release, and frees the lock once', async () => {
    const held = { value: false };
    const m = makeEnv(held);
    const asked = vi.fn();
    const rel = (await acquireTabLock(m.env, 'n', false, asked))!;
    m.chans[0]!.cb!('other');
    expect(asked).not.toHaveBeenCalled();
    m.chans[0]!.cb!('end');
    expect(asked).toHaveBeenCalledTimes(1);
    rel();
    rel();
    await Promise.resolve();
    await Promise.resolve();
    expect(held.value).toBe(false);
    expect(m.chans[0]!.closed).toBe(true);
    expect(m.chans[0]!.cb).toBeNull();
  });
  it('a take over asks the holder to end, then waits for the lock', async () => {
    const held = { value: true };
    const m = makeEnv(held);
    const p = acquireTabLock(m.env, 'n', true, vi.fn());
    await Promise.resolve();
    expect(m.posted).toEqual(['end']);
    expect(m.timers.map((t) => t.ms)).toEqual([TAKEOVER_WAIT_MS]);
    m.free();
    const rel = await p;
    expect(rel).toBeTypeOf('function');
    expect(m.timers[0]!.off).toBe(true);
  });
  it('a take over the holder does not answer gives up at the wait, with null', async () => {
    const m = makeEnv({ value: true });
    const p = acquireTabLock(m.env, 'n', true, vi.fn());
    await Promise.resolve();
    expect(m.timers.map((t) => t.ms)).toEqual([TAKEOVER_WAIT_MS]);
    m.timers[0]!.fn();
    expect(await p).toBeNull();
  });
});

describe('the release says when the lock is free', () => {
  it('its promise settles after the request has let go and a task has passed, and twice is the same promise', async () => {
    const order: string[] = [];
    let letGo: (() => void) | null = null;
    const env: LockEnv = {
      locks: { request: ((_n: string, _o: unknown, cb: (l: unknown) => Promise<unknown>) => new Promise((res) => { void cb({}).then((v) => { letGo = () => { order.push('free'); res(v); }; }); })) as never } as never,
      channel: () => null,
      timer(_ms, fn) { order.push('timer'); fn(); return () => undefined; },
    };
    const rel = (await acquireTabLock(env, 'n', false, () => undefined))!;
    const a = rel();
    expect(rel()).toBe(a);
    void a.then(() => order.push('landed'));
    await new Promise((r) => { setTimeout(r, 0); });
    expect(order).toEqual([]);
    letGo!();
    await a;
    expect(order).toEqual(['free', 'timer', 'landed']);
  });
  it('no Web Locks: a release that is free at once', async () => {
    const rel = (await acquireTabLock({ locks: null, channel: () => null, timer: () => () => undefined }, 'n', false, () => undefined))!;
    await expect(rel()).resolves.toBeUndefined();
  });
});
