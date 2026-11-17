// core/host-locks-memory.ts: the in-process lock manager (the terminal's HostEnv.locks, and navigator.locks in tests).
import { describe, expect, it } from 'vitest';
import { createMemoryLocks } from './host-locks-memory';

const tick = () => new Promise<void>((r) => { setTimeout(r, 5); });
type Req = (name: string, o: object, cb: (lock: unknown) => unknown) => Promise<unknown>;

describe('memory locks', () => {
  it('grants exclusive requests one at a time, first come first served, asynchronously', async () => {
    const m = createMemoryLocks();
    const req = m.locks.request as unknown as Req;
    const log: string[] = [];
    let release!: () => void;
    const a = req('x', {}, () => { log.push('a'); return new Promise<void>((r) => { release = r; }); });
    const b = req('x', {}, () => { log.push('b'); });
    expect(log).toEqual([]);
    await tick();
    expect(log).toEqual(['a']);
    release();
    await a; await b;
    expect(log).toEqual(['a', 'b']);
  });

  it('shared holders coexist and an exclusive request waits for them', async () => {
    const m = createMemoryLocks();
    const req = m.locks.request as unknown as Req;
    const log: string[] = [];
    let r1!: () => void, r2!: () => void;
    void req('x', { mode: 'shared' }, () => { log.push('s1'); return new Promise<void>((r) => { r1 = r; }); });
    void req('x', { mode: 'shared' }, () => { log.push('s2'); return new Promise<void>((r) => { r2 = r; }); });
    const e = req('x', {}, () => { log.push('e'); });
    await tick();
    expect(log).toEqual(['s1', 's2']);
    r1(); await tick();
    expect(log).toEqual(['s1', 's2']);
    r2(); await e;
    expect(log).toEqual(['s1', 's2', 'e']);
  });

  it('ifAvailable answers null at once when taken and runs when free', async () => {
    const m = createMemoryLocks();
    const req = m.locks.request as unknown as Req;
    let release!: () => void;
    void req('x', {}, () => new Promise<void>((r) => { release = r; }));
    await tick();
    expect(await req('x', { ifAvailable: true }, (l) => (l === null ? 'busy' : 'ran'))).toBe('busy');
    release(); await tick();
    expect(await req('x', { ifAvailable: true }, (l) => (l === null ? 'busy' : 'ran'))).toBe('ran');
  });

  it('an abort signal drops a waiting request with an AbortError, and a request already aborted never runs', async () => {
    const m = createMemoryLocks();
    const req = m.locks.request as unknown as Req;
    let release!: () => void;
    void req('x', {}, () => new Promise<void>((r) => { release = r; }));
    await tick();
    const ac = new AbortController();
    let ran = false;
    const w = req('x', { signal: ac.signal }, () => { ran = true; });
    ac.abort();
    await expect(w).rejects.toMatchObject({ name: 'AbortError' });
    const done = new AbortController(); done.abort();
    await expect(req('y', { signal: done.signal }, () => { ran = true; })).rejects.toMatchObject({ name: 'AbortError' });
    release(); await tick();
    expect(ran).toBe(false);
    expect(await m.locks.query!()).toEqual({ held: [], pending: [] });
  });

  it('query() lists what is held and what waits, by client; closing a client releases and drops its requests', async () => {
    const m = createMemoryLocks();
    const req = m.locks.request as unknown as Req;
    m.asClient('tabA', () => { void req('x', {}, () => new Promise<void>(() => {})); });
    m.asClient('tabB', () => { void req('x', {}, () => undefined); });
    await tick();
    expect(await m.locks.query!()).toEqual({
      held: [{ name: 'x', mode: 'exclusive', clientId: 'tabA' }],
      pending: [{ name: 'x', mode: 'exclusive', clientId: 'tabB' }],
    });
    m.closeClient('tabA');
    await tick(); await tick();
    expect(await m.locks.query!()).toEqual({ held: [], pending: [] });
  });

  it('noQuery leaves query absent', () => {
    expect(createMemoryLocks({ noQuery: true }).locks.query).toBeUndefined();
    expect(typeof createMemoryLocks().locks.query).toBe('function');
  });

  it('two managers share nothing: a new mount session starts with an empty table', async () => {
    const a = createMemoryLocks(), b = createMemoryLocks();
    void (a.locks.request as unknown as Req)('x', {}, () => new Promise<void>(() => {}));
    await tick();
    expect(await (b.locks.request as unknown as Req)('x', { ifAvailable: true }, (l) => (l === null ? 'busy' : 'ran'))).toBe('ran');
  });
});

describe('memory locks: abort', () => {
  it('aborting a queued writer lets the compatible reader behind it run while the first reader still holds', async () => {
    const m = createMemoryLocks();
    const req = m.locks.request as unknown as Req;
    const ran: string[] = [];
    let release!: () => void;
    const holder = req('x', { mode: 'shared' }, () => new Promise<void>((r) => { release = r; }));
    await tick();
    const ac = new AbortController();
    const writer = req('x', { mode: 'exclusive', signal: ac.signal }, () => { ran.push('writer'); });
    const reader = req('x', { mode: 'shared' }, () => { ran.push('reader'); });
    await tick();
    expect(ran).toEqual([]);
    ac.abort();
    await expect(writer).rejects.toMatchObject({ name: 'AbortError' });
    await reader;
    expect(ran).toEqual(['reader']);
    release();
    await holder;
  });
});

