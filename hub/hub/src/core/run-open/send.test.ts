// send.ts end to end: the shared machine → runOpenSend → core's api() → fetch → the SDK's FakeKits, so the
// mapping (raw answers, pending → ambiguous, a resolve refusal keeps its code) is proven through real admission.
import { describe, expect, it } from 'vitest';
import { boot, calls, onFetch, PROXY, TARGET, type Reply } from '../test/env';
import { FakeKits } from './fakeKits';
import { createRunOpen } from './index';
import { RUN_OPEN_DECLARED, runOpenSend } from './send';

const HOST = new RegExp(`^https://p1-c1-(run|terminal|display)-(\\d+)\\.sv1\\.${PROXY.replace(/\./g, '\\.')}(/[^?]*)(?:\\?(.*))?$`);

/** fetch → FakeKits: the kit and N from the host, the path and query from the URL. A lost request or reply is a network error. */
function wire(k: FakeKits): void {
  onFetch(async (c): Promise<Reply> => {
    const m = HOST.exec(c.url);
    if (!m) return { status: 599, body: { code: 'UNEXPECTED_HOST' } };
    const query = m[4] ? Object.fromEntries(new URLSearchParams(m[4])) : undefined;
    try {
      const a = await k.send({ kit: m[1] as 'run', index: Number(m[2]) }, c.method, m[3]!, query, c.body ?? undefined);
      return { status: a.status, body: a.body };
    } catch {
      return { status: 0, network: true };
    }
  });
}

function machine(k: FakeKits) {
  return createRunOpen({ send: runOpenSend({ target: TARGET }), now: k.now, sleep: k.sleep, random: k.random });
}

describe('runOpenSend over core api()', () => {
  it('declares one kit route per allowlist row', () => {
    expect(RUN_OPEN_DECLARED).toHaveLength(14);
    for (const d of RUN_OPEN_DECLARED) expect(d.route.path).not.toMatch(/[\\^$()[\]{}]/);
  });

  it('opens an app: every request goes to the computer\'s run, terminal-0 or terminal-N program, credentials omitted', async () => {
    boot();
    const k = new FakeKits();
    wire(k);
    const r = await machine(k).open({ app: 'htop' });
    expect(r.ok).toBe(true);
    expect(r.handle?.terminal_id).toBe(8001);
    const hosts = new Set(calls.map((c) => HOST.exec(c.url)?.slice(1, 3).join('-')));
    expect([...hosts].sort()).toEqual(['run-1', 'terminal-0', 'terminal-8001']);
    expect(calls.every((c) => c.credentials === 'omit')).toBe(true);
  });

  it('a lost execute reply (pending in core) is replayed identically by the machine, once executed', async () => {
    boot();
    const k = new FakeKits();
    k.faults.push((s) => (s.path === '/api/v1/terminal/execute' ? 'drop-reply' : undefined));
    wire(k);
    const r = await machine(k).open({ app: 'htop' });
    const sends = k.of('/api/v1/terminal/execute');
    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
    expect(k.executions).toBe(1);
    expect(r.replayed).toBe(true);
  });

  it('a resolve refusal keeps its code through the secret route: SOURCE_WARMING reads as warming, nothing created', async () => {
    boot();
    const k = new FakeKits();
    k.resolve = { status: 503, body: { error: 'x', code: 'SOURCE_WARMING' } };
    wire(k);
    const r = await machine(k).open({ app: 'htop' });
    expect([r.code, r.notSent]).toEqual(['source_warming', true]);
    expect(k.of('/api/v1/terminal/create')).toHaveLength(0);
  });

  it('close: signal, stopped, then DELETE ?incarnation through the :n route', async () => {
    boot();
    const k = new FakeKits();
    wire(k);
    const m = machine(k);
    const r = await m.open({ app: 'htop' });
    await m.status(r.handle!);
    const c = await m.close(r.handle!);
    expect([c.state, c.code]).toEqual(['stopped', 'stopped']);
    expect(k.deletes).toEqual([{ n: 8001, incarnation: r.handle!.incarnation }]);
    expect(calls.some((x) => x.method === 'DELETE' && x.url.includes(`/api/v1/terminal/8001?incarnation=${r.handle!.incarnation}`))).toBe(true);
  });

  it('an answered 503 with Retry-After in seconds reaches the machine as retryAfterMs, and onRetryAfter hears it', async () => {
    boot();
    onFetch(() => ({ status: 503, body: { code: 'BUSY' }, headers: { 'retry-after': '2' } }));
    const heard: number[] = [];
    const send = runOpenSend({ target: TARGET, onRetryAfter: (ms) => heard.push(ms) });
    const a = await send({ kit: 'run', index: 1 }, 'GET', '/api/v1/run/capabilities', {}, undefined);
    expect([a.status, a.retryAfterMs]).toEqual([503, 2000]);
    expect(heard).toEqual([2000]);
  });

  it('a request outside the allowlist is refused unsent: no fetch', async () => {
    boot();
    const send = runOpenSend({ target: TARGET });
    await expect(send({ kit: 'terminal', index: 1, }, 'POST', '/api/v1/terminal/execute', { terminal_id: 1 }, { command: 'id' })).rejects.toMatchObject({ notSent: true, code: 'ROUTE_REFUSED' });
    await expect(send({ kit: 'terminal', index: 15001 }, 'DELETE', '/api/v1/terminal/15001', {}, undefined)).rejects.toMatchObject({ notSent: true });
    expect(calls).toHaveLength(0);
  });

  it('no computer: nothing is sent and the machine reads it as unreachable, never a state', async () => {
    boot({ target: null });
    const k = new FakeKits();
    wire(k);
    const r = await createRunOpen({ send: runOpenSend({ target: null }), now: k.now, sleep: k.sleep, random: k.random }).open({ app: 'htop' });
    expect(r.ok).toBe(false);
    expect(r.state).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});
