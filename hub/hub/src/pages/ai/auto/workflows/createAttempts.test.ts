// A workflow create's record: owned by its target (account, computer, realm, name), never sent twice while live,
// settled by its own answer only while its context lives, Check again only reading under a fresh capture, and ended only by
// an answer, a proof or Stop tracking.
import { beforeEach, describe, expect, it } from 'vitest';
import { capture, queryClient, type Ctx } from '@core';
import { bump, setRealm, setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, R2, TARGET } from '@core/test/env';
import { checkAgain, createCreateAttempts, scopeOf, sendCreate, type CreateAttempts } from './createAttempts';
import type { Settled, WorkflowCreateApi } from './sourceApi';

const DEF = { entry_point: 'a', steps: { a: { type: 'bash', command: 'true' } } };
const STORED = JSON.stringify({ name: 'mine', entry_point: { id: 'a' }, steps: { a: { type: 'bash', command: 'true' } }, created_at: 't', updated_at: 't' });
const LOST: Settled = { ok: false, err: { kind: 'pending', code: '', status: 0, notApplied: false } };
const OK: Settled = { ok: true, body: { output: 'created', is_error: false } };

/** A fake api whose create resolves when told, counting what was sent. */
function fake(createAnswer: () => Promise<Settled>, getAnswer: () => Settled = () => LOST) {
  const sent = { create: 0, get: 0 };
  const make = (): WorkflowCreateApi => ({
    create: () => { sent.create++; return createAnswer(); },
    get: async () => { sent.get++; return getAnswer(); },
  });
  return { sent, make };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => { resolve = r; });
  return { p, resolve };
}

/** A realm switch as realm.ts makes it: the selection, then the generation moves (every earlier context dies). */
const switchRealm = (r: string) => { setRealm(r); bump('switch'); };
/** A stale realm a caller might still pass: checkAgain takes none, so it must ignore this one. */
const staleShown = (o: object): Parameters<typeof checkAgain>[2] => o as Parameters<typeof checkAgain>[2];

let store: CreateAttempts;
beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); store = createCreateAttempts(); });

describe('a create is owned by its target', () => {
  it('the key is account|project|container|realm|name, with no generation', () => {
    const ctx = capture();
    expect(scopeOf(ctx, R1)).toBe(`${ctx.account ?? ''}|${TARGET.project.id}|${TARGET.container.id}|${R1}`);
    expect(scopeOf({ ...ctx, target: null } as Ctx, R1)).toBeNull();
  });
  it('while it is sending or unknown, nothing creates that name again', async () => {
    const d = deferred<Settled>();
    const f = fake(() => d.p);
    const first = sendCreate(store, 'mine', R1, DEF, { makeApi: f.make });
    const second = sendCreate(store, 'mine', R1, DEF, { makeApi: f.make });
    // Asserted before the first answer comes, so a second create shows as a count, never as a wait.
    expect(f.sent.create).toBe(1);
    d.resolve(LOST);
    expect(await second).toMatchObject({ k: 'held' });
    const r = await first;
    expect(r.k === 'sent' && r.attempt.phase).toBe('unknown');
    expect(await sendCreate(store, 'mine', R1, DEF, { makeApi: f.make })).toMatchObject({ k: 'held' });
    expect(f.sent.create).toBe(1);
  });
  it('the original answer ends it: created is done, a refusal failed with its outcome', async () => {
    const ok = await sendCreate(store, 'a', R1, DEF, { makeApi: fake(async () => OK).make });
    expect(ok.k === 'sent' && ok.attempt.phase).toBe('done');
    const no = await sendCreate(store, 'b', R1, DEF, { makeApi: fake(async () => ({ ok: false, err: { kind: 'failed', code: 'already_exists', status: 200, notApplied: true } })).make });
    expect(no.k === 'sent' && no.attempt).toMatchObject({ phase: 'failed', outcome: { k: 'exists' } });
    expect(store.list(scopeOf(capture(), R1)!)).toEqual([]);
  });
  it('a 2xx without the affirmative envelope keeps it unknown and held', async () => {
    const f = fake(async () => ({ ok: true, body: {} }));
    const r = await sendCreate(store, 'mine', R1, DEF, { makeApi: f.make });
    expect(r.k === 'sent' && r.attempt.phase).toBe('unknown');
    expect(await sendCreate(store, 'mine', R1, DEF, { makeApi: f.make })).toMatchObject({ k: 'held' });
    expect(f.sent.create).toBe(1);
  });
  it('a name with a problem is refused before any record or request', async () => {
    const f = fake(async () => OK);
    expect(await sendCreate(store, 'runs', R1, DEF, { makeApi: f.make })).toEqual({ k: 'badName', problem: 'reserved' });
    expect(await sendCreate(store, 'a/b', R1, DEF, { makeApi: f.make })).toEqual({ k: 'badName', problem: 'chars' });
    expect(f.sent.create).toBe(0);
    expect(store.list(scopeOf(capture(), R1)!)).toEqual([]);
  });
  it('a late settle of a replaced attempt does nothing', async () => {
    const d = deferred<Settled>();
    const r = sendCreate(store, 'mine', R1, DEF, { makeApi: fake(() => d.p).make });
    const old = store.list(scopeOf(capture(), R1)!)[0]!;
    store.stop(old);
    void sendCreate(store, 'mine', R1, DEF, { makeApi: fake(() => new Promise<Settled>(() => undefined)).make });
    const next = store.get(old.key);
    expect(next).not.toBe(old);
    d.resolve(OK);
    await r;
    expect(next?.phase).toBe('sending');
    expect(store.get(old.key)).toBe(next);
  });
});

describe('the context decides only whether the original answer may settle it', () => {
  it('an answer that arrives after the context died makes it unknown, never done or failed', async () => {
    for (const answer of [OK, { ok: false, err: { kind: 'failed', code: 'already_exists', status: 200, notApplied: true } } as Settled]) {
      store = createCreateAttempts();
      switchRealm(R1);
      const d = deferred<Settled>();
      const r = sendCreate(store, 'mine', R1, DEF, { makeApi: fake(() => d.p).make });
      switchRealm(R2);
      d.resolve(answer);
      const out = await r;
      expect(out.k === 'sent' && out.attempt.phase).toBe('unknown');
    }
  });
  it('core\'s own word that nothing went out still ends it', async () => {
    const r = await sendCreate(store, 'mine', R1, DEF, { makeApi: fake(async () => ({ ok: false, err: { kind: 'stale', code: '', status: 0, notApplied: false } })).make });
    expect(r.k === 'sent' && r.attempt).toMatchObject({ phase: 'failed', outcome: { k: 'refused', code: 'stale' } });
  });
  it('it survives a realm switch and the way back, under the same key', async () => {
    const r = await sendCreate(store, 'mine', R1, DEF, { makeApi: fake(async () => LOST).make });
    const a = r.k === 'sent' ? r.attempt : null;
    switchRealm(R2);
    expect(store.get(a!.key)).toBe(a);
    switchRealm(R1);
    expect(store.get(a!.key)).toBe(a);
    expect(store.list(a!.scope)).toEqual([a]);
  });
  it('a new create of that name after a realm switch and back is still held: the key has no generation', async () => {
    const f = fake(async () => LOST);
    await sendCreate(store, 'mine', R1, DEF, { makeApi: f.make });
    switchRealm(R2);
    switchRealm(R1);
    expect(await sendCreate(store, 'mine', R1, DEF, { makeApi: f.make })).toMatchObject({ k: 'held' });
    expect(f.sent.create).toBe(1);
  });
});

describe('Check again', () => {
  async function lost(): Promise<NonNullable<ReturnType<CreateAttempts['get']>>> {
    const r = await sendCreate(store, 'mine', R1, DEF, { makeApi: fake(async () => LOST).make });
    return (r as { attempt: NonNullable<ReturnType<CreateAttempts['get']>> }).attempt;
  }
  it('reads under a fresh capture and never sends the create', async () => {
    const a = await lost();
    switchRealm(R2);
    switchRealm(R1);
    const seen: Ctx[] = [];
    const f = fake(async () => OK, () => ({ ok: true, body: { output: `revision: r1:ab\n${STORED}`, is_error: false } }));
    const r = await checkAgain(store, a, { makeApi: (_n, _r, ctx) => { seen.push(ctx); return f.make(); } });
    expect(r).toEqual({ k: 'created' });
    expect(f.sent).toEqual({ create: 0, get: 1 });
    expect(seen[0]).not.toBe(a.ctx);
    expect(seen[0]!.gen).not.toBe(a.ctx.gen);
    expect(store.get(a.key)).toBeUndefined();
    expect(a.phase).toBe('done');
  });
  it('a read that does not prove it leaves it unknown with what was seen', async () => {
    const a = await lost();
    const f = fake(async () => LOST, () => ({ ok: false, err: { kind: 'failed', code: 'not_found', status: 404, notApplied: false } }));
    expect(await checkAgain(store, a, { makeApi: f.make })).toEqual({ k: 'unknown', seen: 'none' });
    expect(store.get(a.key)).toBe(a);
    expect(a).toMatchObject({ phase: 'unknown', seen: 'none' });
  });
  it('reads nothing while another realm is shown (judged by the fresh capture); with another computer shown, it still reads the record\'s own computer', async () => {
    const a = await lost();
    const f = fake(async () => LOST);
    switchRealm(R2);
    expect(await checkAgain(store, a, staleShown({ makeApi: f.make, realmShown: R1 }))).toEqual({ k: 'elsewhere' });
    expect(f.sent.get).toBe(0);
    switchRealm(R1);
    setTarget({ project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } });
    const seen: Ctx[] = [];
    await checkAgain(store, a, { makeApi: (_n, _r, ctx) => { seen.push(ctx); return f.make(); } });
    expect(seen[0]!.target).toEqual(TARGET);
  });
  it('proves only what was sent: changing the caller\'s object after the send changes neither the request nor the proof', async () => {
    const def: Record<string, unknown> = structuredClone(DEF);
    const bodies: unknown[] = [];
    const make = (): WorkflowCreateApi => ({ create: async (d) => { bodies.push(structuredClone(d)); return LOST; }, get: async () => LOST });
    const r = await sendCreate(store, 'mine', R1, def, { makeApi: make });
    const a = (r as { attempt: NonNullable<ReturnType<CreateAttempts['get']>> }).attempt;
    def.entry_point = 'b';
    def.steps = { b: { type: 'bash', command: 'true' } };
    expect(bodies).toEqual([DEF]);
    const other = JSON.stringify({ name: 'mine', entry_point: { id: 'b' }, steps: { b: { type: 'bash', command: 'true' } }, created_at: 't', updated_at: 't' });
    const f = fake(async () => LOST, () => ({ ok: true, body: { output: `revision: r1:ab\n${other}`, is_error: false } }));
    expect(await checkAgain(store, a, staleShown({ makeApi: f.make, realmShown: R1 }))).toEqual({ k: 'unknown', seen: 'other' });
    expect(store.get(a.key)).toBe(a);
  });
  it('Stop tracking ends it, sending and reading nothing', async () => {
    const a = await lost();
    const before = calls.length;
    store.stop(a);
    expect(store.get(a.key)).toBeUndefined();
    expect(a.phase).toBe('failed');
    expect(await checkAgain(store, a, { makeApi: fake(async () => LOST).make })).toEqual({ k: 'ended' });
    expect(calls.length).toBe(before);
  });
});

describe('through the real core', () => {
  it('sendCreate sends one PUT, and a lost answer is never sent again', async () => {
    onFetch(() => ({ status: 200, network: true }));
    const r = await sendCreate(store, 'mine', R1, DEF);
    expect(r.k === 'sent' && r.attempt.phase).toBe('unknown');
    expect(await sendCreate(store, 'mine', R1, DEF)).toMatchObject({ k: 'held' });
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ definition: DEF, expected_absent: true });
  });
});
