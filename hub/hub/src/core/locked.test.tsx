// locked.test.tsx: useLockedChange, the C9 lock for a page's own change call.
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { bump, capture, setIdentity, setRealm, setTarget, snapshot } from './ctx';
import { useLockedChange, type LockedChange, type LockedResult } from './locked';
import { defineMutation, defineQuery, prefix, queryClient } from './query';
import { defineRoute } from './routes';
import { heldChanges, lockBase, pendingOf } from './changes';
import { boot, calls, deferred, onFetch, settle, TARGET, microFlush } from './test/env';
import type { Target } from './ctx';

const list = defineRoute<{ data: string[] }>({ method: 'GET', path: '/computers', scope: 'realm' });
const rename = defineRoute<unknown, { name: string }>({ method: 'PATCH', path: '/computers/:id', scope: 'realm', body: ['name'] });
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const KEY = (): readonly unknown[] => [...prefix(snapshot()), 'test', 'list'];
const isList = (k: readonly unknown[]): boolean => k[4] === 'test' && k[5] === 'list';
// A read-back that proves the change did not apply: frees it with its key kept (a plain read frees nothing).
const notApplied = () => 'not_applied' as const;

function harness(run: (v: { name: string }, idem: string) => Promise<unknown>, extra: { quietCancel?: boolean; secret?: boolean } = {}): { cur: () => LockedChange<{ name: string }, unknown> } {
  let last!: LockedChange<{ name: string }, unknown>;
  function Probe() {
    useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
    last = useLockedChange(run, [isList], 'test.harness', { proves: notApplied, ...extra });
    return null;
  }
  render(<Probe />, { wrapper: wrap });
  return { cur: () => last };
}
const send = (v: { name: string }) => api(rename, { params: { id: 'c1' }, body: { name: v.name }, ctx: capture() });

describe('useLockedChange', () => {
  it('pending locks: presses are refused and send nothing until a fresh read-back answered', async () => {
    boot();
    queryClient.clear();
    let readOk = true;
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : readOk ? { status: 200, body: { data: [] } } : { status: 500, body: {} }));
    const h = harness(send);
    await act(flush);
    readOk = false;
    let r!: LockedResult<unknown>;
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(h.cur().state).toBe('pending');
    // The read-back failed: still locked; a press sends nothing.
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(h.cur().state).toBe('pending');
    // An authoritative read answers: unlocked.
    readOk = true;
    let ok = false;
    await act(async () => { ok = await h.cur().readBack(); await flush(); });
    expect(ok).toBe(true);
    expect(h.cur().state).toBe('free');
  });

  it('the person\'s Cancel of the 2FA prompt is not_sent + cancelled, never failed; the lock is free', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { data: [] } }));
    const keys: string[] = [];
    let n = 0;
    // What api() rejects with when the prompt was cancelled while the context lives.
    const h = harness(async (_v, idem) => { keys.push(idem); n++; if (n === 1) throw { status: 400, code: 'OTP_REQUIRED', cancelled: true }; return { ok: 1 }; }, { quietCancel: true });
    await act(flush);
    let r!: LockedResult<unknown>;
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', cancelled: true });
    expect(h.cur().state).toBe('free');
    expect(h.cur().last).toEqual({ outcome: 'not_sent', cancelled: true });
    // The next press is a new request with a new key.
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('done');
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('a cancelled prompt on a replay of a kept key stays pending (C9)', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { data: [] } }));
    const keys: string[] = [];
    let n = 0;
    const h = harness(async (_v, idem) => {
      keys.push(idem);
      n++;
      if (n === 1) throw { kind: 'pending', pending: true };
      if (n === 2) throw { status: 400, code: 'OTP_REQUIRED', cancelled: true };
      return { ok: 1 };
    }, { quietCancel: true });
    await act(flush);
    let r!: LockedResult<unknown>;
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    // The replay's cancel proves nothing about the first send: pending again, same key, not cancelled.
    expect(r.outcome).toBe('pending');
    expect(r.cancelled).toBeUndefined();
    expect(keys[1]).toBe(keys[0]);
  });

  it('without quietCancel a cancelled 2FA prompt answers failed, as it always did (Account, Home and every other page)', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { data: [] } }));
    const h = harness(async () => { throw { status: 400, code: 'OTP_REQUIRED', cancelled: true }; });
    await act(flush);
    let r!: LockedResult<unknown>;
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('failed');
    expect(r.code).toBe('OTP_REQUIRED');
    expect(r.status).toBe(400);
    expect(r.cancelled).toBeUndefined();
    expect(h.cur().last?.outcome).toBe('failed');
    expect(h.cur().state).toBe('free');
  });

  it('secret: the answer reaches the caller through run() only, never through last; without it last keeps the data', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { data: [] } }));
    const answer = { secret: 'hbk_TEST_secret_000000000000' };
    // The control: a change without the option keeps its answer in last.
    const kept = harness(async () => answer);
    const secret = harness(async () => answer, { secret: true });
    await act(flush);
    let r!: LockedResult<unknown>;
    await act(async () => { r = await kept.cur().run({ name: 'a' }); await flush(); });
    expect(r.data).toBe(answer);
    expect(kept.cur().last?.data).toBe(answer);
    await act(async () => { r = await secret.cur().run({ name: 'b' }); await flush(); });
    expect(r.outcome).toBe('done');
    expect(r.data).toBe(answer);
    expect(secret.cur().last?.outcome).toBe('done');
    expect(secret.cur().last).not.toHaveProperty('data');
  });

  it('a second press while one runs is BUSY and sends nothing', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { data: [] } }));
    let release!: () => void;
    const h = harness(() => new Promise((res) => { release = () => res({ ok: 1 }); }));
    let first!: Promise<LockedResult<unknown>>, second!: LockedResult<unknown>;
    await act(async () => { first = h.cur().run({ name: 'a' }); second = await h.cur().run({ name: 'a' }); });
    expect(second).toEqual({ outcome: 'not_sent', code: 'BUSY' });
    await act(async () => { await release(); await first; await flush(); });
    expect((await first).outcome).toBe('done');
    expect(h.cur().state).toBe('free');
  });

  it('after pending and a read-back, the same change reuses its idempotency key; a different one gets a new key', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const keys: string[] = [];
    let fail = true;
    const h = harness(async (v, idem) => { keys.push(idem); if (fail) { fail = false; return send(v); } return { ok: v.name }; });
    await act(flush);
    await act(async () => { await h.cur().run({ name: 'a' }); await flush(); });
    expect(h.cur().state).toBe('free'); // the read-back answered fresh
    await act(async () => { await h.cur().run({ name: 'a' }); await flush(); });
    await act(async () => { await h.cur().run({ name: 'b' }); await flush(); });
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('no release without proves: a fresh read-back keeps it locked; dismiss() frees only this id\'s change, key kept', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const keys: string[] = [];
    const run = (v: { name: string }, idem: string) => { keys.push(idem); return send(v); };
    let mine!: LockedChange<{ name: string }, unknown>, other!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
      mine = useLockedChange(run, [isList], 'test.held.mine', { lock: 'test.held.shared', lockKey: () => ({}) });
      other = useLockedChange(run, [isList], 'test.held.other', { lock: 'test.held.shared', lockKey: () => ({}) });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    await act(async () => { await mine.run({ name: 'a' }); await flush(); });
    let ok = true;
    await act(async () => { ok = await mine.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(mine.state).toBe('pending');
    // The other page sharing the lock sees it held and cannot dismiss it.
    expect(other.state).toBe('pending');
    await act(async () => { other.dismiss(); await microFlush(); });
    expect(mine.state).toBe('pending');
    await act(async () => { mine.dismiss(); await microFlush(); });
    expect(mine.state).toBe('free');
    await act(async () => { await mine.run({ name: 'a' }); await flush(); });
    expect(keys[1]).toBe(keys[0]);
  });

  it('proves frees the change: applied drops the key, the answers are the read\'s fresh data', async () => {
    boot();
    queryClient.clear();
    let applied = false;
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: applied ? ['a'] : [] } }));
    const keys: string[] = [];
    const run = (v: { name: string }, idem: string) => { keys.push(idem); return send(v); };
    const seen: unknown[] = [];
    let last!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
      last = useLockedChange(run, [isList], 'test.proves', {
        lockKey: (v) => ({ name: v.name }),
        proves: (id, answers) => {
          seen.push(id);
          const names = (answers[0] || []).flatMap((d) => (d as { data?: string[] })?.data || []);
          return names.includes((id as { name: string }).name) ? 'applied' : undefined;
        },
      });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    await act(async () => { await last.run({ name: 'a' }); await flush(); });
    expect(last.state).toBe('pending');
    applied = true;
    let ok = false;
    await act(async () => { ok = await last.readBack(); await flush(); });
    expect(ok).toBe(true);
    expect(last.state).toBe('free');
    expect(seen).toContainEqual({ name: 'a' });
    onFetch((c) => (c.method === 'PATCH' ? { status: 200, body: {} } : { status: 200, body: { data: ['a'] } }));
    await act(async () => { await last.run({ name: 'a' }); await flush(); });
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('no reads declared: a pending change stays locked', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    let last!: LockedChange<{ name: string }, unknown>;
    function Probe() { last = useLockedChange(send, [], 'test.noreads'); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await last.run({ name: 'a' }); await flush(); });
    let ok = true;
    await act(async () => { ok = await last.readBack(); });
    expect(ok).toBe(false);
    expect(last.state).toBe('pending');
  });

  it('a replay that fails keeps the original key', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 200, body: { data: [] } }));
    const keys: string[] = [];
    let n = 0;
    const h = harness(async (_v, idem) => {
      keys.push(idem);
      n++;
      if (n === 1) throw { kind: 'pending', pending: true };
      if (n === 2) throw { status: 429, code: 'RATE_LIMITED' };
      return { ok: 1 };
    });
    await act(flush);
    let r!: LockedResult<unknown>;
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(h.cur().state).toBe('free'); // the read-back answered fresh
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    // A refused replay proves nothing about the first send: pending again, same key.
    expect(r.outcome).toBe('pending');
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
  });

  it('a pending change keeps a digest of its variables, never the variables (a password)', async () => {
    boot();
    queryClient.clear();
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');
    let readOk = false;
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : readOk ? { status: 200, body: { data: [] } } : { status: 500, body: {} }));
    const keys: string[] = [];
    const h = harness((v, idem) => { keys.push(idem); return send(v); });
    await act(flush);
    try {
      await act(async () => { await h.cur().run({ name: 'hunter2-secret' }); await flush(); });
      const seen = digest.mock.calls.map((c) => new TextDecoder().decode(c[1] as ArrayBuffer));
      expect(seen.some((t) => t.includes('hunter2-secret'))).toBe(true);
      readOk = true;
      await act(async () => { await h.cur().readBack(); await flush(); });
      await act(async () => { await h.cur().run({ name: 'hunter2-secret' }); await flush(); });
      expect(keys[1]).toBe(keys[0]);
    } finally { digest.mockRestore(); }
  });

  it('a pending change keeps its lock and key across a remount (same id)', async () => {
    boot();
    queryClient.clear();
    let readOk = true;
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : readOk ? { status: 200, body: { data: [] } } : { status: 500, body: {} }));
    const keys: string[] = [];
    const run = (v: { name: string }, idem: string) => { keys.push(idem); return send(v); };
    let last!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
      last = useLockedChange(run, [isList], 'test.rename', { proves: notApplied });
      return null;
    }
    const first = render(<Probe />, { wrapper: wrap });
    await act(flush);
    readOk = false;
    await act(async () => { await last.run({ name: 'a' }); await flush(); });
    first.unmount();
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    expect(last.state).toBe('pending');
    let r!: LockedResult<unknown>;
    await act(async () => { r = await last.run({ name: 'a' }); await flush(); });
    expect(r.code).toBe('READ_BACK_FIRST');
    readOk = true;
    await act(async () => { await last.readBack(); await flush(); });
    await act(async () => { await last.run({ name: 'a' }); await flush(); });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('realm rule: a realm switch keeps the lock; {realm: true} files it under its realm, the default is account-wide', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 500, body: {} }));
    const A = snapshot().realm;
    let acct!: LockedChange<{ name: string }, unknown>;
    let inRealm!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      acct = useLockedChange(send, [isList], 'test.realm.acct');
      inRealm = useLockedChange(send, [isList], 'test.realm.own', { realm: true });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    let r!: LockedResult<unknown>;
    await act(async () => { await acct.run({ name: 'a' }); await inRealm.run({ name: 'a' }); await flush(); });
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);
    await act(async () => { setRealm('bbbbbbbbbbbbbbbbbbbbbbb2'); bump('switch'); await flush(); });
    await act(async () => { r = await acct.run({ name: 'a' }); await flush(); });
    expect(r.code).toBe('READ_BACK_FIRST');
    expect(inRealm.state).toBe('free');
    await act(async () => { r = await inRealm.run({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(3);
    await act(async () => { setRealm(A); bump('switch'); await flush(); });
    expect(inRealm.state).toBe('pending');
    await act(async () => { r = await inRealm.run({ name: 'a' }); await flush(); });
    expect(r.code).toBe('READ_BACK_FIRST');
    // Another account shown: neither lock is its (the stored holds stay with the account that sent them).
    await act(async () => { setIdentity({ id: 'someone-else', banned: false }); bump('account'); await flush(); });
    expect(acct.state).toBe('free');
    expect(inRealm.state).toBe('free');
  });

  it('the press files its lock under the realm shown at the press, not after the digest', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 500, body: {} }));
    const A = snapshot().realm;
    let ch!: LockedChange<{ name: string }, unknown>;
    function Probe() { ch = useLockedChange(send, [isList], 'test.realm.press', { realm: true }); return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: LockedResult<unknown>;
    await act(async () => {
      const p = ch.run({ name: 'a' });
      setRealm('bbbbbbbbbbbbbbbbbbbbbbb2'); bump('switch');
      r = await p;
      await flush();
    });
    // The context moved during the digest, so the press is stale and nothing is sent or locked in
    // either realm.
    expect(r.outcome).toBe('stale');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    expect(ch.state).toBe('free');
    await act(async () => { setRealm(A); bump('switch'); await flush(); });
    expect(ch.state).toBe('free');
  });

  it('lockKey locks a create by its identity, not its label; a new label after release gets a new key', async () => {
    boot();
    queryClient.clear();
    let readOk = false;
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : readOk ? { status: 200, body: { data: [] } } : { status: 500, body: {} }));
    const keys: string[] = [];
    const run = (v: { bot: string; name: string }, idem: string) => { keys.push(idem); return api(rename, { params: { id: v.bot }, body: { name: v.name }, ctx: capture() }); };
    let ch!: LockedChange<{ bot: string; name: string }, unknown>;
    function Probe() {
      useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
      ch = useLockedChange(run, [isList], 'test.lockkey', { lockKey: (v) => ({ bot: v.bot }), proves: notApplied });
      return null;
    }
    const first = render(<Probe />, { wrapper: wrap });
    let r!: LockedResult<unknown>;
    await act(async () => { r = await ch.run({ bot: 'b1', name: 'x' }); await flush(); });
    expect(r.outcome).toBe('pending');
    first.unmount();
    render(<Probe />, { wrapper: wrap });
    await act(async () => { r = await ch.run({ bot: 'b1', name: 'y' }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(ch.state).toBe('pending');
    // Another identity is its own change.
    await act(async () => { r = await ch.run({ bot: 'b2', name: 'x' }); await flush(); });
    expect(r.outcome).toBe('pending');
    readOk = true;
    await act(async () => { await ch.readBack(); await flush(); });
    expect(ch.state).toBe('free');
    readOk = false;
    // Released: other bytes under the same identity are a new request (new key); the same bytes replay.
    await act(async () => { r = await ch.run({ bot: 'b1', name: 'y' }); await flush(); });
    expect(keys[2]).not.toBe(keys[0]);
    readOk = true;
    await act(async () => { await ch.readBack(); await flush(); });
    readOk = false;
    await act(async () => { r = await ch.run({ bot: 'b1', name: 'y' }); await flush(); });
    expect(keys[3]).toBe(keys[2]);
  });

  it('run gets the press context; a switch during the digest sends nothing (stale), never in the new context', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 200, body: {} }));
    const A = snapshot().realm;
    const seen: string[] = [];
    let ch!: LockedChange<{ name: string }, unknown>;
    function Probe() { ch = useLockedChange((v: { name: string }, _idem: string, ctx?: { realm: string }) => { seen.push(ctx?.realm ?? '-'); return Promise.resolve(v); }, [isList], 'test.ctx', { realm: true }); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => {
      const p = ch.run({ name: 'a' });
      setRealm('bbbbbbbbbbbbbbbbbbbbbbb2'); bump('switch');
      expect((await p).outcome).toBe('stale');
      await flush();
    });
    expect(seen).toEqual([]);
    let r!: LockedResult<unknown>;
    await act(async () => { r = await ch.run({ name: 'b' }); await flush(); });
    expect(r.outcome).toBe('done');
    expect(seen).toEqual(['bbbbbbbbbbbbbbbbbbbbbbb2']);
    expect(A).not.toBe('bbbbbbbbbbbbbbbbbbbbbbb2');
  });

  it('an adapter\'s own refresh() proves nothing (it could hand back the cache)', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    let last!: LockedChange<{ name: string }, unknown>;
    function Probe() { last = useLockedChange(send, [{ refresh: async () => true }], 'test.adapter'); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await last.run({ name: 'a' }); await flush(); });
    let ok = true;
    await act(async () => { ok = await last.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(last.state).toBe('pending');
  });
  it('a BUSY second press leaves the first press running', async () => {
    boot();
    queryClient.clear();
    let release!: () => void;
    let last!: LockedChange<{ name: string }, unknown>;
    const slow = () => new Promise((res) => { release = () => res({ ok: 1 }); });
    function Probe() { last = useLockedChange(slow, [], 'test.busy2'); return null; }
    render(<Probe />, { wrapper: wrap });
    let first!: Promise<LockedResult<unknown>>;
    await act(async () => { first = last.run({ name: 'a' }); await flush(); });
    expect(last.state).toBe('running');
    let r!: LockedResult<unknown>;
    await act(async () => { r = await last.run({ name: 'a' }); await flush(); });
    expect(r.code).toBe('BUSY');
    expect(last.state).toBe('running');
    await act(async () => { await release(); await first; await flush(); });
    expect(last.state).toBe('free');
  });
  it('the HTTP status reaches the caller when the code is blank', async () => {
    boot();
    queryClient.clear();
    let last!: LockedChange<{ name: string }, unknown>;
    const refuse = () => Promise.reject({ kind: 'http', status: 429, code: null });
    function Probe() { last = useLockedChange(refuse, [], 'test.status'); return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: LockedResult<unknown>;
    await act(async () => { r = await last.run({ name: 'a' }); await flush(); });
    expect(r.status).toBe(429);
  });
});


describe('a definite refusal keeps its details (gate decide 409: request_id, decision)', () => {
  it('a 4xx passes code, status and a copy of its details through; an unknown outcome carries none', async () => {
    boot();
    queryClient.clear();
    const details = { request_id: 'r-1', decision: 'approved' };
    let fail: unknown = { status: 409, code: 'GATE_ALREADY_DECIDED', details };
    const h = harness(async () => { throw fail; });
    let r!: LockedResult<unknown>;
    await act(async () => { r = await h.cur().run({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'failed', code: 'GATE_ALREADY_DECIDED', status: 409, details });
    expect(r.details).not.toBe(details);
    expect(Object.isFrozen(r.details)).toBe(true);
    fail = { status: 409, code: 'X', details: 'not an object' };
    await act(async () => { r = await h.cur().run({ name: 'b' }); await flush(); });
    expect(r).toEqual({ outcome: 'failed', code: 'X', status: 409 });
    fail = { status: 502, kind: 'pending', code: 'BAD_GATEWAY', details };
    await act(async () => { r = await h.cur().run({ name: 'c' }); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(r.details).toBeUndefined();
  });
});

describe('changes with no proves: heldBy, await discard(), predicate reads filtered by computer, answers from the flight', () => {
  it('heldBy: self for the sender, other for a page sharing the lock (no useful Dismiss there), undefined when free', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    let mine!: LockedChange<{ name: string }, unknown>, other!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
      mine = useLockedChange(send, [isList], 'test.hb.mine', { lock: 'test.hb.shared', lockKey: () => ({}) });
      other = useLockedChange(send, [isList], 'test.hb.other', { lock: 'test.hb.shared', lockKey: () => ({}) });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    expect(mine.heldBy).toBeUndefined();
    await act(async () => { await mine.run({ name: 'a' }); await flush(); });
    expect(mine.heldBy).toBe('self');
    expect(other.heldBy).toBe('other');
    await act(async () => { mine.dismiss(); await microFlush(); });
    expect(mine.heldBy).toBeUndefined();
    expect(other.heldBy).toBeUndefined();
  });
  it('await discard(): the page proved its own change not applied: lock and key go (the next run is a new key); another page\'s stays', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: [] } }));
    const keys: string[] = [];
    const run = (v: { name: string }, idem: string) => { keys.push(idem); return send(v); };
    let mine!: LockedChange<{ name: string }, unknown>, other!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      mine = useLockedChange(run, [isList], 'test.dc.mine', { lock: 'test.dc.shared', lockKey: () => ({}) });
      other = useLockedChange(run, [isList], 'test.dc.other', { lock: 'test.dc.shared', lockKey: () => ({}) });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await mine.run({ name: 'a' }); await flush(); });
    await act(async () => { other.discard(); await microFlush(); });
    expect(mine.state).toBe('pending');
    await act(async () => { mine.discard(); await microFlush(); });
    expect(mine.state).toBe('free');
    await act(async () => { await mine.run({ name: 'a' }); await flush(); });
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });
  it('a change on a computer is judged only by predicate answers whose key names that computer', async () => {
    boot();
    queryClient.clear();
    const agentRoute = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/np4/set', scope: 'agent', body: ['name'] });
    onFetch((c) => (c.method === 'PATCH' ? { status: 502, body: {} } : { status: 200, body: { data: ['a'] } }));
    const seen: unknown[][] = [];
    let ch!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      // A query whose key names no computer: it says nothing about a change on one.
      useQuery({ queryKey: KEY(), queryFn: () => api(list, { ctx: capture() }), retry: false });
      ch = useLockedChange(send, [isList], 'test.np4', {
        lock: 'test.np4', lockKey: () => ({}), route: agentRoute,
        proves: (_id, answers) => { seen.push([...(answers[0] || [])]); return answers[0]!.length ? 'applied' : undefined; },
      });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    await act(async () => { await ch.run({ name: 'a' }); await flush(); });
    let ok = true;
    await act(async () => { ok = await ch.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(ch.state).toBe('pending');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((a) => a.length === 0)).toBe(true);
  });
});

describe('a locked read-back proves only with what it fetched, for the change\'s own computer', () => {
  const progsR = defineRoute<{ data: string[] }>({ method: 'GET', path: '/api/v1/daemon/core2-programs', scope: 'kit', kit: 'daemon', index: 1 });
  const startR = defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/api/v1/daemon/core2-programs/web/start', scope: 'kit', kit: 'daemon', index: 1, body: [] });
  const progs = defineQuery(progsR, { input: (t: Target) => ({ target: t }) });
  const isProgs = (k: readonly unknown[]): boolean => k[4] === progsR.id;
  const C2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
  const running = (_id: unknown, a: readonly (readonly unknown[])[]) => ((a[0] || []).some((d) => ((d as { data?: string[] })?.data || []).includes('running')) ? 'applied' as const : undefined);
  it('a predicate read of another computer never proves this computer\'s change', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { data: c.url.includes('-c2-') ? ['running'] : ['stopped'] } }));
    let ch!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      progs.use(TARGET);
      progs.use(C2);
      ch = useLockedChange((_v, _idem, ctx) => api(startR, { body: {}, ctx }), [isProgs], 'core2.locked.pred', { route: startR, lock: 'core2.locked.pred', lockKey: () => ({}), proves: running });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    expect(calls.some((c) => c.url.includes('-c2-'))).toBe(true);
    await act(async () => { await ch.run({ name: 'a' }); await flush(); });
    let ok = true;
    await act(async () => { ok = await ch.readBack(); await flush(); });
    expect(ok).toBe(false);
    expect(ch.state).toBe('pending');
  });
  it('a cache write after the recovery request landed proves nothing (proves gets the fetched answers)', async () => {
    boot();
    queryClient.clear();
    let gate: { p: Promise<void>; res: (v: void) => void } | null = null, armed = false;
    onFetch(async (c) => {
      if (c.method === 'PATCH') return { status: 502, body: {} };
      if (armed && c.url.includes('two')) { const g = deferred(); gate = g; await g.p; }
      return { status: 200, body: { data: [] } };
    });
    const twoR = defineRoute<{ data: string[] }>({ method: 'GET', path: '/core2-two', scope: 'realm' });
    let ch!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      useQuery({ queryKey: [...KEY(), 1], queryFn: () => api(list, { ctx: capture() }), retry: false });
      useQuery({ queryKey: [...KEY(), 2], queryFn: () => api(twoR, { ctx: capture() }), retry: false });
      ch = useLockedChange(send, [isList], 'core2.locked.fetched', { proves: (_id, a) => ((a[0] || []).some((d) => ((d as { data?: string[] })?.data || []).includes('a')) ? 'applied' : undefined) });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    await act(async () => { await ch.run({ name: 'a' }); await flush(); });
    armed = true;
    let ok: boolean | null = null;
    const rb = act(async () => { ok = await ch.readBack(); });
    await act(async () => { for (let i = 0; i < 50 && !gate; i++) await settle(1); await flush(); });
    expect(gate).not.toBeNull();
    queryClient.setQueryData([...KEY(), 1], { data: ['a'] });
    gate!.res();
    await rb;
    expect(ok).toBe(false);
    expect(ch.state).toBe('pending');
  });
});

describe('a locked change names another page\'s hold and follows the computer shown', () => {
  const startR = defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/api/v1/daemon/core2fix2/start', scope: 'kit', kit: 'daemon', index: 1, body: [] });
  const C2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
  it('shared locks (b): a press under another page\'s hold answers HELD_BY_OTHER with that page; its own hold carries its page', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    const other = defineMutation<Record<string, never>>(startR, { input: () => ({ body: {} }), lock: 'core2.fix2.locked', lockKey: () => ({}), page: 'computers' });
    let ch!: LockedChange<{ name: string }, unknown>;
    function Probe() { ch = useLockedChange((_v, _i, ctx) => api(startR, { body: {}, ctx }), [], 'core2.fix2.locked', { route: startR, lock: 'core2.fix2.locked', lockKey: () => ({}), page: 'home' }); return null; }
    render(<Probe />, { wrapper: wrap });
    expect((await other.run({})).outcome).toBe('pending');
    let r!: LockedResult<unknown>;
    await act(async () => { r = await ch.run({ name: 'a' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'HELD_BY_OTHER', heldFrom: { page: 'computers', path: '/computers' } });
    expect(ch.heldBy).toBe('other');
  });
  it('state and heldBy follow a computer switch (subscribeScope), not only a lock change', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    let ch!: LockedChange<{ name: string }, unknown>;
    function Probe() { ch = useLockedChange((_v, _i, ctx) => api(startR, { body: {}, ctx }), [], 'core2.fix2.scope', { route: startR }); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(async () => { await ch.run({ name: 'a' }); await flush(); });
    expect(ch.state).toBe('pending');
    act(() => { setTarget(C2); });
    expect(ch.state).toBe('free');
    expect(ch.heldBy).toBeUndefined();
  });
});

describe('a refused discard never looks like a release', () => {
  const startR = defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/api/v1/daemon/core2fix2/view', scope: 'kit', kit: 'daemon', index: 1, body: [] });
  it('page B discards (and completes) A\'s hold by variables: heldChanges, B\'s hook and a locked view on the lock still show it held, as other; A still owns it', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 502, body: {} }));
    const m = defineMutation<Record<string, never>>(startR, { input: () => ({ body: {} }), lock: 'core2.fix2.view', lockKey: () => ({}) });
    let a!: ReturnType<typeof m.use>, b!: ReturnType<typeof m.use>, ch!: LockedChange<{ name: string }, unknown>;
    function A() { a = m.use({ page: 'computers' }); return null; }
    function B() { b = m.use({ page: 'home' }); return null; }
    function L() { ch = useLockedChange((_v, _i, ctx) => api(startR, { body: {}, ctx }), [], 'core2.fix2.view', { route: startR, lock: 'core2.fix2.view', lockKey: () => ({}), page: 'bots' }); return null; }
    render(<><A /><B /><L /></>, { wrapper: wrap });
    await act(async () => { await a.run({}); await flush(); });
    const home = m.forPage('home');
    const ah = heldChanges('core2.fix2.view')[0]!.hold!;
    await act(async () => { expect([await home.discard({}, ah), await home.complete({}, ah), await home.settle({}, ah)]).toEqual([false, false, false]); await flush(); });
    const held = heldChanges('core2.fix2.view');
    expect(held).toHaveLength(1);
    expect(held[0]!.from).toEqual({ page: 'computers', path: '/computers' });
    expect(home.heldBy(held[0]!)).toBe('other');
    expect(m.forPage('computers').heldBy(held[0]!)).toBe('self');
    expect(await home.heldByOther({})).toMatchObject({ code: 'HELD_BY_OTHER', heldFrom: { page: 'computers', path: '/computers' } });
    expect(b.outcome).toBe('pending');
    expect(a.outcome).toBe('pending');
    expect(ch.state).toBe('pending');
    expect(ch.heldBy).toBe('other');
    // A still owns it: its own Dismiss frees it everywhere.
    await act(async () => { a.dismiss(); await microFlush(); });
    await act(async () => { await flush(); });
    expect(heldChanges('core2.fix2.view')).toHaveLength(0);
    expect(ch.state).toBe('free');
  });
});

describe('sentIn: an agent change that names its own realm is held in that realm (C9)', () => {
  const R1 = 'a'.repeat(24);
  const R2 = 'b'.repeat(24);
  const setR = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/sentin/set', scope: 'agent', realm: 'realm', body: ['name'] });
  const realmOfUrl = (u: string) => new URL(u).searchParams.get('realm');
  // Each case its own lock id: a held change lives in the module registry past a test's end.
  function mount(id: string, sendIn: string | undefined, sentIn: string | undefined) {
    let ch!: LockedChange<{ name: string }, unknown>;
    function Probe() {
      // No idempotency key goes out: setR declares none, and a key on such a route is refused unsent (IDEMPOTENCY_KEY_INVALID).
      ch = useLockedChange((v, _idem, ctx) => api(setR, { body: v, ctx, ...(sendIn ? { realm: sendIn } : {}) }), [], id, {
        lock: id, lockKey: () => ({}), route: setR, ...(sentIn ? { sentIn } : {}),
      });
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    return () => ch;
  }

  it('under All realms a lost send naming R1 is filed under R1: R1\'s view shows it and a second press sends nothing', async () => {
    boot();
    act(() => { setRealm('all'); });
    queryClient.clear();
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: {} }));
    const ch = mount('test.sentin.a', R1, R1);
    await act(flush);
    let r!: LockedResult<unknown>;
    await act(async () => { r = await ch().run({ name: 'a' }); await flush(); });
    expect(r.outcome).toBe('pending');
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => realmOfUrl(c.url))).toEqual([R1]);
    expect(pendingOf(lockBase('test.sentin.a')).map((c) => c.realm)).toEqual([R1]);
    expect(heldChanges('test.sentin.a', { realm: R1 })).toHaveLength(1);
    // Another realm's view does not show R1's hold.
    expect(heldChanges('test.sentin.a', { realm: R2 })).toHaveLength(0);
    await act(async () => { r = await ch().run({ name: 'a' }); await flush(); });
    expect(r).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('without sentIn (a send in the context\'s realm) the lock records the context\'s realm, as before', async () => {
    boot();
    act(() => { setRealm(R2); });
    queryClient.clear();
    onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: {} }));
    const ch = mount('test.sentin.b', undefined, undefined);
    await act(flush);
    await act(async () => { await ch().run({ name: 'a' }); await flush(); });
    expect(calls.filter((c) => c.method === 'POST').map((c) => realmOfUrl(c.url))).toEqual([R2]);
    expect(pendingOf(lockBase('test.sentin.b')).map((c) => c.realm)).toEqual([R2]);
  });
});
