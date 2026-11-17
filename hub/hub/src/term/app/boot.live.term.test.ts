// The live boot's send gate (boot.live.ts), on a fake client: no real API, no credential.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 2 | A call past its own timeoutMs settles TIMEOUT for core at the fence, before core's own bound, and the client's answer that comes after is wiped at the boundary | 'late answer after timeout is wiped' |
// | 3 | A held FIRST send released after the call's timeout (through core's api, a declared change): beforeWire false, its signal aborted, never sent, the outcome is not pending and no open change is left; a held RETRY of a sent change released after the timeout is refused too and adds no open change after core settled it | 'held send after timeout never leaves' |
// | 4 | onSend that closes the mount's gate: the same beforeWire answers false (signal rechecked after onSend) | 'gate closed in onSend' |
// | 5 | A late answer the fence could not wipe whole (a frozen object) is reported at dispose as TERM_WIPE_INCOMPLETE, counts only | 'incomplete wipe reported' |
// | 6 | Kit/fetch leg: the caller's own signal (kit timeout, upload cancel, stream-open timeout) is part of the client's controls: a held first send released after the caller aborted sees beforeWire false and its signal aborted; the call settles with the caller's reason; a caller already aborted reaches no client | 'caller abort ends the fetch controls' |
// | 7 | The cancellation holds through the body: a streaming Response handed to the caller stops (reads reject) and the client's body is cancelled once the caller aborts | 'caller abort ends the body' |
// | 8 | A late answer AFTER dispose began: dispose drains within DRAIN_MS; a frozen answer arriving during the drain is reported, and a call still unresolved at the end is reported as unresolved (never a clean end) | 'late answer after disposal' |
// | 10 | Core teardown THROWS (a crypt-settle timeout) while a frozen answer comes late and another call never answers: the drain still runs, and dispose fails with BOTH, the teardown error and TERM_WIPE_INCOMPLETE, as one AggregateError (the mount splits it into one record each), no content; the unresolved call's answer delivered AFTER dispose returned is still wiped | 'teardown error still drains' |
// | 12 | The host's place is checked at ingress: a project or computer id that is not exactly 24 lower-case hex (a token-shaped canary, upper case, too short or long, empty, not a string) refuses the boot TERM_CONTEXT_INVALID before anything is sent and never becomes the target; a valid id does | 'place ids checked at ingress' |
// | 15 | Realm by session kind: an ACCOUNT session is never pinned: the host's realm is its starting selection, the realm list and names load (GET /realms, the alias vault key) and the person can switch; an unlisted selection falls back to all realms. A TOKEN session stays pinned to its realm and another realm asked for it refuses the boot TERM_REALM_REFUSED | 'realm by session kind' |
// | 11 | The deadline is an ELAPSED time taken before the client starts: with the fence clock past it and the timer not yet run (timer delivery delayed), a held first send's wire check refuses and the call settles TIMEOUT; a sent call's retry check refuses the same way | 'elapsed deadline before the timer' |
// | 9 | Hoody leg, caller cancelled AFTER the send (the documented rule in client-shared.ts): the caller's signal is not an abort there; core's success check is alive(ctx), so with the context alive api() resolves the answer; the same cancel BEFORE the send is refused at the wire check and nothing is sent | 'cancel after send still answers' |
// | 13 | The client's places refuse the boot before anything is installed or sent: a missing or non-https API origin (http, user info, path, query), a realm API or proxy domain that is not a bare host, or a proxy domain nested with the API host or the realm API domain: SeamRefusal TERM_API_ORIGIN / TERM_REALM_DOMAIN / TERM_PROXY_DOMAIN, no request, no fetch, no transport installed | 'client places checked at boot' |
// | 14 | The proxy domain is the client's: with one, a kit call and an agent call reach `client.fetch` at the computer's own address (`<project>-<computer>-<program>-<n>.<server>.<proxy domain>`) with the plan's headers and nothing else (no Authorization, no cookie); with none, no address is built and no fetch is made (NO_KIT_URL); after dispose no address is left | 'proxy domain addresses computers' |
// | 1 | closeGate trips the fence at once: a request the client holds sees beforeWire() false and its signal aborted; a call made after it never reaches the client (refused unsent) | 'gate closes at once' |
import { afterEach, expect, test } from 'bun:test';
import { api, openMutations } from '../../core/api';
import { target } from '../../core/ctx';
import { __disposeCoreSeams } from '../../core/dispose';
import { defineRoute } from '../../core/routes';
import { transport } from '../../core/transport';
import { agentBaseFor, buildPortUrl } from '../../core/hosts';
import { beginTermSession } from '../env/session';
import type { ClientCallControls, HoodyClient } from '../host-types';
import { DRAIN_MS, liveBoot } from './boot.live';
import { aliases, list, pinnedRealm } from '../../core/realm';
import { realm as selectedRealm } from '../../core/ctx';
import { setFenceClockForTests } from './fence';
import { SeamRefusal } from './live-seam';

/** A conforming client's hold (host-types ClientCallControls): it stops at once when its signal aborts. */
const hang = (o?: ClientCallControls): Promise<never> => new Promise((_, fail) => {
  if (!o) return;
  const stop = () => { fail({ status: 0, notSent: true, stale: true }); };
  if (o.signal.aborted) stop(); else o.signal.addEventListener('abort', stop, { once: true });
});


// Every session and boot a test opens is ended in afterEach as well: a failing assertion before a test's
// own `session.end()` used to leave the session open, and every later file then failed TERM_SESSION_ACTIVE.
const openSessions: Array<ReturnType<typeof beginTermSession>> = [];
const openBoots: Array<ReturnType<typeof liveBoot>> = [];
const beginT = (): ReturnType<typeof beginTermSession> => { const s = beginTermSession(); openSessions.push(s); return s; };
/** A boot whose own test disposed it is not disposed again (a second core teardown is not what the test checked). */
const liveBootT = (...a: Parameters<typeof liveBoot>): ReturnType<typeof liveBoot> => {
  const b = liveBoot(...a);
  const own = b.dispose.bind(b);
  b.dispose = (reason) => { const i = openBoots.indexOf(b); if (i >= 0) openBoots.splice(i, 1); return own(reason); };
  openBoots.push(b);
  return b;
};
afterEach(async () => {
  for (const b of openBoots.splice(0)) await b.dispose('term-abort').catch(() => {});
  for (const s of openSessions.splice(0)) s.end();
  setFenceClockForTests(null);
  __disposeCoreSeams.setCryptIdle(null);
  __disposeCoreSeams.setSettleMs(null);
});
test('gate closes at once', async () => {
  const held: ClientCallControls[] = [];
  let calls = 0;
  const client: HoodyClient = {
    identity: { kind: 'account', uid: '64f0ada00000000000000001', sid: 's1' },
    apiOrigin: 'https://api.example.invalid',
    realmApiDomain: 'realm.invalid',
    request: (_m, _p, _b, o) => { calls++; held.push(o); return hang(o); },
    fetch: (_u, _i, o) => { calls++; if (o) held.push(o); return hang(o); },
  };
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  const started = boot.start(session, () => {}).catch((e: unknown) => e);
  for (let i = 0; i < 200 && held.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  expect(held.length).toBeGreaterThan(0);
  expect(held[0]!.beforeWire()).toBe(true);
  boot.closeGate!();
  expect(held[0]!.beforeWire()).toBe(false);
  expect(held[0]!.signal.aborted).toBe(true);
  const before = calls;
  await expect(transport().fetch('https://agent.realm.invalid/x', {}, {} as never)).rejects.toMatchObject({ status: 0, notSent: true });
  expect(calls).toBe(before);
  expect(await started).toMatchObject({ stale: true });
  await boot.dispose('term-abort');
  session.end();
});

test('late answer after timeout is wiped', async () => {
  let answer!: (v: unknown) => void;
  let n = 0;
  const client: HoodyClient = {
    identity: { kind: 'account', uid: '64f0ada00000000000000001', sid: 's1' },
    apiOrigin: 'https://api.example.invalid',
    realmApiDomain: 'realm.invalid',
    // The boot's own calls hang (nothing to answer); the one under test is the second.
    request: (_m, _p, _b, o) => (++n === 2 ? new Promise((r) => { answer = r; }) : hang(o)),
    fetch: (_u, _i, o) => hang(o),
  };
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  void boot.start(session, () => {}).catch(() => {});
  for (let i = 0; i < 200 && n === 0; i++) await new Promise((r) => setTimeout(r, 10));
  const call = transport().hoody('GET', '/keys', null, { timeoutMs: 40 }, { route: null as never, method: 'GET', path: '/keys', query: {}, body: null } as never);
  for (let i = 0; i < 200 && n < 2; i++) await new Promise((r) => setTimeout(r, 10));
  expect(n).toBe(2);
  await expect(call).rejects.toMatchObject({ status: 0, code: 'TIMEOUT' });
  const body = { data: { secret: 'hbk_CANARY' } };
  const data = body.data;
  answer(body);
  await new Promise((r) => setTimeout(r, 20));
  expect(Reflect.ownKeys(data)).toEqual([]);
  await boot.dispose('term-abort');
  session.end();
});

/** A fake client that answers boot and HOLDS every other request: the test releases it (calls beforeWire) later. A held
 *  call fails when its signal aborts (as a conforming client does) unless `ignoreAbort`: then only the test settles it. */
function holdingClient(ignoreAbort = false, extra: Record<string, unknown> = {}) {
  const onAbort = (o: ClientCallControls | undefined, fail: (e: unknown) => void) => {
    if (ignoreAbort || !o) return;
    const stop = () => { fail({ status: 0, notSent: true, stale: true }); };
    if (o.signal.aborted) stop(); else o.signal.addEventListener('abort', stop, { once: true });
  };
  const held: Array<{ path: string; o: ClientCallControls; fail: (e: unknown) => void; ok: (v: unknown) => void }> = [];
  const fetched: Array<{ url: string; init: RequestInit; o: ClientCallControls; fail: (e: unknown) => void; ok: (v: Response) => void }> = [];
  const answers: Record<string, unknown> = {
    'GET /users/auth/me': { data: { id: '64f0ada00000000000000001', username: 'ada', email: 'ada@example.com' } },
    'GET /realms': { data: { realm_ids: [] } },
    // An account session loads its realm names at boot (realm by session kind): answered, so no test holds it.
    'GET /vault/keys/hoody.realm-aliases': { data: { value: '{}' } },
    ...extra,
  };
  const client: HoodyClient = {
    identity: { kind: 'account', uid: '64f0ada00000000000000001', sid: 's1' },
    apiOrigin: 'https://api.example.invalid',
    realmApiDomain: 'realm.invalid',
    request: (method, path, _b, o) => {
      const a = answers[`${method} ${path.split('?')[0]}`];
      if (a !== undefined) { if (!o.beforeWire()) return Promise.reject({ status: 0, notSent: true }); return Promise.resolve(structuredClone(a)); }
      return new Promise((ok, fail) => { held.push({ path, o, fail, ok }); onAbort(o, fail); });
    },
    fetch: (url, init, o) => new Promise((ok, fail) => { fetched.push({ url, init, o: o!, fail, ok }); onAbort(o, fail); }),
  };
  return { client, held, fetched };
}
const change = defineRoute({ method: 'POST', path: '/notes', scope: 'base', body: [] });

test('held send after timeout never leaves', async () => {
  const { client, held } = holdingClient();
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  await boot.start(session, () => {});
  const before = openMutations().length;
  // 1. First send held by the client until after the timeout.
  const first = api(change, { body: {}, timeoutMs: 40 } as never).catch((e: unknown) => e);
  for (let i = 0; i < 100 && held.length < 1; i++) await new Promise((r) => setTimeout(r, 5));
  const h1 = held[0]!;
  const r1 = await first as { code?: string; kind?: string };
  expect(r1.code).toBe('TIMEOUT');
  expect(r1.kind).not.toBe('pending');
  expect(h1.o.signal.aborted).toBe(true);
  expect(h1.o.beforeWire()).toBe(false);
  h1.fail({ status: 0, notSent: true });
  await new Promise((r) => setTimeout(r, 10));
  expect(openMutations().length).toBe(before);
  // 2. A sent change whose retry is held past the timeout: the retry's wire check fails, and nothing reopens.
  const second = api(change, { body: {}, timeoutMs: 40 } as never).catch((e: unknown) => e);
  for (let i = 0; i < 100 && held.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
  const h2 = held[1]!;
  expect(h2.o.beforeWire()).toBe(true); // the first attempt went out (onSend ran)
  const r2 = await second as { code?: string; kind?: string };
  expect(r2.code).toBe('TIMEOUT');
  const afterSettle = openMutations().length;
  expect(h2.o.beforeWire()).toBe(false); // the retry, released now
  expect(h2.o.signal.aborted).toBe(true);
  h2.fail({ status: 0, notSent: true });
  await new Promise((r) => setTimeout(r, 10));
  expect(openMutations().length).toBe(afterSettle);
  await boot.dispose('term-abort');
  session.end();
});

test('gate closed in onSend', async () => {
  const { client, held } = holdingClient();
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  await boot.start(session, () => {});
  const call = transport().hoody('POST', '/notes', {}, { onSend: () => { boot.closeGate!(); } }, { route: change, method: 'POST', path: '/notes', query: {}, body: {} } as never).catch((e: unknown) => e);
  for (let i = 0; i < 100 && held.length < 1; i++) await new Promise((r) => setTimeout(r, 5));
  expect(held[0]!.o.beforeWire()).toBe(false);
  expect(await call).toMatchObject({ stale: true });
  await boot.dispose('term-abort');
  session.end();
});

test('incomplete wipe reported', async () => {
  const { client, held } = holdingClient(true);
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  await boot.start(session, () => {});
  const call = transport().hoody('GET', '/notes', null, {}, { route: change, method: 'GET', path: '/notes', query: {}, body: null } as never).catch((e: unknown) => e);
  for (let i = 0; i < 100 && held.length < 1; i++) await new Promise((r) => setTimeout(r, 5));
  boot.closeGate!();
  await call;
  held[0]!.ok(Object.freeze({ key: 'hbk_CANARY' }));
  await new Promise((r) => setTimeout(r, 5));
  const e = await boot.dispose('term-abort').then(() => null, (x: unknown) => x as Error);
  expect(e?.message).toMatch(/^TERM_WIPE_INCOMPLETE: 1 /);
  expect(e?.message).not.toContain('CANARY');
  session.end();
});

test('caller abort ends the fetch controls', async () => {
  const { client, fetched } = holdingClient(true);
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  await boot.start(session, () => {});
  const caller = new AbortController();
  const call = transport().fetch('https://kit.realm.invalid/x', { signal: caller.signal }, {} as never).catch((e: unknown) => e);
  expect(fetched.length).toBe(1);
  const h = fetched[0]!;
  expect(h.o.beforeWire()).toBe(true);
  expect(h.o.signal.aborted).toBe(false);
  const why = new Error('kit timeout');
  caller.abort(why);
  // Released now: the client's wire check fails and its signal is aborted, though the mount lives on.
  expect(h.o.beforeWire()).toBe(false);
  expect(h.o.signal.aborted).toBe(true);
  expect(await call).toBe(why);
  // A late Response is wiped (body cancelled), not delivered.
  let cancelled = false;
  h.ok(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 200 }));
  await new Promise((r) => setTimeout(r, 5));
  expect(cancelled).toBe(true);
  // Already aborted: the client is never called.
  const n = fetched.length;
  expect(await transport().fetch('https://kit.realm.invalid/y', { signal: AbortSignal.abort(why) }, {} as never).catch((e: unknown) => e)).toBe(why);
  expect(fetched.length).toBe(n);
  await boot.dispose('term-abort');
  session.end();
});

test('caller abort ends the body', async () => {
  const { client, fetched } = holdingClient();
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  await boot.start(session, () => {});
  const caller = new AbortController();
  const call = transport().fetch('https://kit.realm.invalid/events', { signal: caller.signal }, {} as never);
  let push!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  fetched[0]!.ok(new Response(new ReadableStream<Uint8Array>({ start(c) { push = c; }, cancel() { cancelled = true; } }), { status: 200 }));
  const res = await call;
  const reader = res.body!.getReader();
  push.enqueue(new Uint8Array([7]));
  expect(Array.from((await reader.read()).value!)).toEqual([7]);
  const next = reader.read();
  caller.abort(new Error('stream-open timeout'));
  // Bounded: an unguarded body leaves this read pending for ever (the failure to see), never a hung test.
  await expect(Promise.race([next, new Promise((r) => setTimeout(() => r('still reading'), 500))])).rejects.toThrow('stream-open timeout');
  await new Promise((r) => setTimeout(r, 5));
  expect(cancelled).toBe(true);
  expect(fetched[0]!.o.beforeWire()).toBe(false);
  await boot.dispose('term-abort');
  session.end();
});

test('late answer after disposal', async () => {
  const { client, held } = holdingClient(true);
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  await boot.start(session, () => {});
  const meta = { route: change, method: 'GET', path: '/notes', query: {}, body: null } as never;
  // Two calls the client holds and ignores the abort for (a non-conforming client): one answers DURING the drain,
  // the other never does.
  const one = transport().hoody('GET', '/notes', null, {}, meta).catch((e: unknown) => e);
  const two = transport().hoody('GET', '/notes', null, {}, meta).catch((e: unknown) => e);
  for (let i = 0; i < 100 && held.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
  const t0 = Date.now();
  const ending = boot.dispose('term-abort').then(() => null, (x: unknown) => x as Error);
  await one; await two;
  await new Promise((r) => setTimeout(r, 20));
  held[0]!.ok(Object.freeze({ key: 'hbk_CANARY' }));
  const e = await ending;
  expect(Date.now() - t0).toBeGreaterThanOrEqual(DRAIN_MS - 5);
  expect(e?.message).toMatch(/^TERM_WIPE_INCOMPLETE: 1 late answer\(s\) kept fields .*; 1 call\(s\) unresolved/);
  expect(e?.message).not.toContain('CANARY');
  session.end();
});

test('teardown error still drains', async () => {
  const { client, held } = holdingClient(true);
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  await boot.start(session, () => {});
  __disposeCoreSeams.setCryptIdle(() => new Promise<void>(() => {}));
  __disposeCoreSeams.setSettleMs(30);
  try {
    const meta = { route: change, method: 'GET', path: '/notes', query: {}, body: null } as never;
    const one = transport().hoody('GET', '/notes', null, {}, meta).catch((e: unknown) => e);
    const two = transport().hoody('GET', '/notes', null, {}, meta).catch((e: unknown) => e);
    for (let i = 0; i < 100 && held.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    const ending = boot.dispose('term-abort').then(() => null, (x: unknown) => x);
    await one; await two;
    await new Promise((r) => setTimeout(r, 60));
    held[0]!.ok(Object.freeze({ key: 'hbk_CANARY' }));
    const e = await ending;
    expect(e).toBeInstanceOf(AggregateError);
    const msgs = (e as AggregateError).errors.map((x: Error) => x.message);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatch(/^CRYPT_SETTLE_TIMEOUT/);
    expect(msgs[1]).toMatch(/^TERM_WIPE_INCOMPLETE: 1 late answer\(s\) kept fields .*; 1 call\(s\) unresolved/);
    expect(JSON.stringify(msgs)).not.toContain('CANARY');
    // The never-answered call answers AFTER dispose returned: nothing can report it any more, but its mutable
    // contents are still wiped.
    const late = { key: 'hbk_LATE_CANARY', nested: { token: 'hdy_LATE' } };
    held[1]!.ok(late);
    await new Promise((r) => setTimeout(r, 10));
    expect(JSON.stringify(late)).not.toContain('CANARY');
    expect(JSON.stringify(late)).not.toContain('hdy_LATE');
  } finally {
    __disposeCoreSeams.setCryptIdle(null);
    __disposeCoreSeams.setSettleMs(null);
    session.end();
  }
});

test('elapsed deadline before the timer', async () => {
  let now = 1_000;
  setFenceClockForTests(() => now);
  const { client, held } = holdingClient();
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  try {
    await boot.start(session, () => {});
    // First send: held, then the clock passes the deadline; the 5 s timer has not run.
    const first = api(change, { body: {}, timeoutMs: 5000 } as never).catch((e: unknown) => e);
    for (let i = 0; i < 100 && held.length < 1; i++) await new Promise((r) => setTimeout(r, 5));
    now += 5001;
    expect(held[0]!.o.beforeWire()).toBe(false);
    expect(held[0]!.o.signal.aborted).toBe(true);
    expect(await first).toMatchObject({ code: 'TIMEOUT' });
    // Retry: the first attempt passes inside the deadline, the retry after it refuses.
    const second = api(change, { body: {}, timeoutMs: 5000 } as never).catch((e: unknown) => e);
    for (let i = 0; i < 100 && held.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    expect(held[1]!.o.beforeWire()).toBe(true);
    now += 5001;
    expect(held[1]!.o.beforeWire()).toBe(false);
    expect(await second).toMatchObject({ code: 'TIMEOUT' });
  } finally {
    setFenceClockForTests(null);
    await boot.dispose('term-abort').catch(() => {});
    session.end();
  }
});

test('place ids checked at ingress', async () => {
  const CANARY = 'hdy_reviewcanary';
  const good = '64f0ada00000000000000aaa';
  const bad: unknown[] = [CANARY, 'hdyctrcanaryqz7x4lp9tv0', '64F0ADA00000000000000AAA', '64f0ada0000000000000aaa', '64f0ada00000000000000aaaa', '', 123];
  for (const field of ['containerId', 'projectId'] as const) {
    for (const v of bad) {
      const { client } = holdingClient();
      let sent = 0;
      const counted: HoodyClient = { ...client, request: (...a) => { sent++; return client.request(...a); } };
      const session = beginT();
      const boot = liveBootT(counted, { profile: 'test', realmId: 'all', ...(field === 'projectId' ? { containerId: good } : {}), [field]: v } as never, () => '/');
      await expect(boot.start(session, () => {})).rejects.toThrow('TERM_CONTEXT_INVALID');
      expect(sent).toBe(0);
      expect(JSON.stringify(target() ?? null)).not.toContain(CANARY);
      await boot.dispose('term-abort').catch(() => {});
      session.end();
    }
  }
  // A well-formed place is not taken on its shape alone: with the list unanswered it is held, no target.
  const { client } = holdingClient();
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all', projectId: '64f0ada00000000000000bbb', containerId: good }, () => '/');
  await boot.start(session, () => {});
  expect(target()).toBeNull();
  expect(boot.place()).toBe('unverified');
  await boot.dispose('term-abort');
  expect(target()).toBeNull();
  session.end();
});

// | 13 | Place provenance: a well-formed place enters the target only once the session's own
// computer list holds it (and its project, when named). A valid-shape id no list holds (feedface canary), a project
// mismatch, an unreadable list: no target, ever.
test('place needs membership in the session list', async () => {
  const good = '64f0ada00000000000000aaa';
  const proj = '64f0ada00000000000000bbb';
  const CANARY = 'feedfacefeedfacefeedface';
  const list = (rows: unknown[]) => ({ 'GET /computers': { data: { computers: rows, pagination: { totalPages: 1, total: rows.length } } } });
  const run = async (extra: Record<string, unknown>, ctx: { projectId?: string; containerId: string; realmId?: string }) => {
    const { client } = holdingClient(false, extra);
    const session = beginT();
    const boot = liveBootT(client, { profile: 'test', realmId: 'all', ...ctx }, () => '/');
    await boot.start(session, () => {});
    for (let i = 0; i < 200 && boot.place() === 'unverified'; i++) await new Promise((r) => setTimeout(r, 5));
    const out = { place: boot.place(), target: target() };
    await boot.dispose('term-abort');
    session.end();
    return out;
  };
  const rows = [{ id: good, project_id: proj, name: 'ada-box' }];
  // Listed, but not in the pinned realm (the shell's realm filter): never the target.
  const R = 'f1f1f1f1f1f1f1f1f1f1f1f1';
  const elsewhere = await run(list([{ ...rows[0], realm_ids: ['e2e2e2e2e2e2e2e2e2e2e2e2'] }]), { containerId: good, realmId: R });
  expect(elsewhere.place).toBe('absent');
  expect(elsewhere.target).toBeNull();
  // In the list: the target, with its project.
  const ok = await run(list(rows), { projectId: proj, containerId: good });
  expect(ok.place).toBe('member');
  expect(ok.target?.container?.id).toBe(good);
  expect(ok.target?.project?.id).toBe(proj);
  // No project named: the list's project.
  expect((await run(list(rows), { containerId: good })).target?.project?.id).toBe(proj);
  // Valid shape, in no list: never the target.
  const canary = await run(list(rows), { projectId: proj, containerId: CANARY });
  expect(canary.place).toBe('absent');
  expect(canary.target).toBeNull();
  expect(JSON.stringify(canary)).not.toContain(CANARY);
  // In the list under another project: refused.
  const other = await run(list(rows), { projectId: '64f0ada00000000000000ccc', containerId: good });
  expect(other.place).toBe('absent');
  expect(other.target).toBeNull();
  // Unreadable list: unknown, no target.
  const bad = await run({ 'GET /computers': { data: {} } }, { containerId: good });
  expect(bad.place).toBe('unknown');
  expect(bad.target).toBeNull();
});

test('cancel after send still answers', async () => {
  const { client, held } = holdingClient();
  const session = beginT();
  const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
  await boot.start(session, () => {});
  const read = defineRoute({ method: 'GET', path: '/notes', scope: 'base' });
  // Sent, then cancelled: the answer still reaches the caller.
  const c1 = new AbortController();
  const p1 = api(read, { signal: c1.signal } as never);
  for (let i = 0; i < 100 && held.length < 1; i++) await new Promise((r) => setTimeout(r, 5));
  expect(held[0]!.o.beforeWire()).toBe(true);
  c1.abort();
  expect(held[0]!.o.signal.aborted).toBe(false);
  held[0]!.ok({ data: { n: 1 } });
  expect(await p1).toEqual({ data: { n: 1 } });
  // Cancelled before the send: the wire check refuses and nothing goes out.
  const c2 = new AbortController();
  const p2 = api(read, { signal: c2.signal } as never).catch((e: unknown) => e);
  for (let i = 0; i < 100 && held.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
  c2.abort();
  expect(held[1]!.o.beforeWire()).toBe(false);
  held[1]!.fail({ status: 0, notSent: true, stale: true });
  expect(await p2).toMatchObject({ status: 0 });
  await boot.dispose('term-abort');
  session.end();
});

test('realm by session kind', async () => {
  const A = 'a1a1a1a1a1a1a1a1a1a1a1a1', B = 'b2b2b2b2b2b2b2b2b2b2b2b2', C = 'c3c3c3c3c3c3c3c3c3c3c3c3';
  const realms = {
    'GET /realms': { data: { realm_ids: [A, B] } },
    'GET /vault/keys/hoody.realm-aliases': { data: { value: JSON.stringify({ [A]: 'Work' }) } },
  };
  const settle = async () => { for (let i = 0; i < 200 && list()?.length !== 2; i++) await new Promise((r) => setTimeout(r, 5)); };
  // `until`: what the boot must show before it is read and disposed (a fallback lands after the list does).
  const run = async (realmId: string, kind: 'account' | 'token', until?: () => boolean) => {
    const { client } = holdingClient(false, realms);
    const c: HoodyClient = kind === 'token' ? { ...client, identity: { kind: 'token', uid: '64f0ada00000000000000001', sid: 's1', realm: A } } : client;
    const session = beginT();
    const boot = liveBootT(c, { profile: 'test', realmId }, () => '/');
    const err = await boot.start(session, () => {}).then(() => null, (e: unknown) => (e as Error).message);
    if (kind === 'account') await settle();
    for (let i = 0; i < 200 && until && !until(); i++) await new Promise((r) => setTimeout(r, 5));
    const out = { err, pinned: pinnedRealm(), selected: selectedRealm(), list: list(), aliases: { ...aliases() } };
    await boot.dispose('term-abort').catch(() => {});
    session.end();
    return out;
  };
  // Account, a listed realm: not pinned, that realm selected, list and names read.
  const acct = await run(A, 'account');
  expect(acct.err).toBeNull();
  expect(acct.pinned).toBeNull();
  expect(acct.selected).toBe(A);
  expect(acct.list).toEqual([A, B]);
  expect(acct.aliases).toEqual({ [A]: 'Work' });
  // Account, all realms: not pinned, the list still loads.
  const all = await run('all', 'account');
  expect(all.pinned).toBeNull();
  expect(all.selected).toBe('all');
  expect(all.list).toEqual([A, B]);
  // Account, a realm GET /realms does not list: falls back to all realms (as the web).
  const gone = await run(C, 'account', () => selectedRealm() === 'all');
  expect(gone.err).toBeNull();
  expect(gone.pinned).toBeNull();
  expect(gone.selected).toBe('all');
  // Token: pinned to its realm before its boot reads anything (this fake answers no token boot, so the boot itself
  // stops offline); another realm refuses the boot.
  const tok = await run(A, 'token');
  expect(tok.err).not.toBe('TERM_REALM_REFUSED');
  expect(tok.pinned).toBe(A);
  expect((await run(B, 'token')).err).toBe('TERM_REALM_REFUSED');
}, 30_000);

test('a failed realm list leaves an account session up', async () => {
  // An account session reads GET /realms at boot; its failure must not be an unhandled
  // rejection (run.ts ends the mount on one) and the boot stays up with the list unknown.
  const rejected: unknown[] = [];
  const onRejection = (e: unknown) => { rejected.push(e); };
  process.on('unhandledRejection', onRejection);
  try {
    const { client, held } = holdingClient(false, { 'GET /realms': undefined });
    const session = beginT();
    const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
    const started = boot.start(session, () => {}).then(() => null, (e: unknown) => (e as Error).message);
    let read: (typeof held)[number] | undefined;
    for (let i = 0; i < 400 && !(read = held.find((h) => h.path.startsWith('/realms'))); i++) await new Promise((r) => setTimeout(r, 5));
    expect(read).toBeDefined();
    read!.fail({ status: 503, code: 'service_unavailable' });
    expect(await started).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(rejected).toEqual([]);
    expect(pinnedRealm()).toBeNull();
    expect(selectedRealm()).toBe('all');
    await boot.dispose('term-abort');
    session.end();
  } finally {
    process.off('unhandledRejection', onRejection);
  }
}, 30_000);

test('client places checked at boot', async () => {
  const cases: [Partial<Record<'apiOrigin' | 'realmApiDomain' | 'proxyDomain', unknown>>, SeamRefusal['code']][] = [
    [{ apiOrigin: undefined }, 'TERM_API_ORIGIN'],
    [{ apiOrigin: 'http://api.example.invalid' }, 'TERM_API_ORIGIN'],
    [{ apiOrigin: 'http://127.0.0.1:3000' }, 'TERM_API_ORIGIN'],
    [{ apiOrigin: 'https://u:p@api.example.invalid' }, 'TERM_API_ORIGIN'],
    [{ apiOrigin: 'https://api.example.invalid/api/v1' }, 'TERM_API_ORIGIN'],
    [{ apiOrigin: 'https://api.example.invalid?x=1' }, 'TERM_API_ORIGIN'],
    [{ realmApiDomain: 'https://realm.invalid' }, 'TERM_REALM_DOMAIN'],
    [{ realmApiDomain: 'invalid' }, 'TERM_REALM_DOMAIN'],
    [{ proxyDomain: 'computers.invalid:443' }, 'TERM_PROXY_DOMAIN'],
    [{ proxyDomain: 'example.invalid' }, 'TERM_PROXY_DOMAIN'],
    [{ proxyDomain: 'api.example.invalid' }, 'TERM_PROXY_DOMAIN'],
    [{ proxyDomain: 'x.realm.invalid' }, 'TERM_PROXY_DOMAIN'],
    [{ proxyDomain: 'invalid' }, 'TERM_PROXY_DOMAIN'],
  ];
  for (const [over, code] of cases) {
    let sent = 0;
    const base: HoodyClient = {
      identity: { kind: 'account', uid: '64f0ada00000000000000001', sid: 's1' },
      apiOrigin: 'https://api.example.invalid',
      realmApiDomain: 'realm.invalid',
      request: () => { sent++; return Promise.reject({ status: 0, notSent: true }); },
      fetch: () => { sent++; return Promise.reject({ status: 0, notSent: true }); },
    };
    const client = { ...base, ...over } as HoodyClient;
    const session = beginT();
    const before = transport();
    const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
    const err = await boot.start(session, () => {}).then(() => null, (e: unknown) => e);
    expect(err, JSON.stringify(over)).toBeInstanceOf(SeamRefusal);
    expect((err as SeamRefusal).code, JSON.stringify(over)).toBe(code);
    expect(sent).toBe(0);
    // Nothing was installed: the transport is the one before the boot.
    expect(transport()).toBe(before);
    await boot.dispose('term-abort').catch(() => {});
    session.end();
  }
  // The same client with good places boots past the check (it reaches the client).
  let reached = 0;
  const ok: HoodyClient = {
    identity: { kind: 'account', uid: '64f0ada00000000000000001', sid: 's1' },
    apiOrigin: 'https://api.example.invalid:8443', realmApiDomain: 'realm.invalid', proxyDomain: 'computers.invalid',
    request: () => { reached++; return Promise.reject({ status: 0, notSent: true }); },
    fetch: () => { reached++; return Promise.reject({ status: 0, notSent: true }); },
  };
  const session = beginT();
  const boot = liveBootT(ok, { profile: 'test', realmId: 'all' }, () => '/');
  await boot.start(session, () => {}).catch(() => {});
  expect(reached).toBeGreaterThan(0);
  await boot.dispose('term-abort').catch(() => {});
  session.end();
});

test('proxy domain addresses computers', async () => {
  const P = '6a0000000000000000000001', C = 'c0a7150000000000000000a1';
  const tg = { project: { id: P }, container: { id: C, server_name: 'srv-1' } };
  const list = defineRoute({ method: 'GET', path: '/api/v1/files/*parts', scope: 'kit', kit: 'files', index: 1 });
  const status = defineRoute({ method: 'GET', path: '/hoody/auth/status', scope: 'agent', realm: 'none' });
  // With a proxy domain: both legs go to the computer's own host, as the plan built them.
  {
    const { client, fetched } = holdingClient();
    const session = beginT();
    const boot = liveBootT({ ...client, proxyDomain: 'computers.invalid' }, { profile: 'test', realmId: 'all' }, () => '/');
    await boot.start(session, () => {});
    expect(buildPortUrl(tg.project, tg.container, 'files', 1)).toBe(`https://${P}-${C}-files-1.srv-1.computers.invalid`);
    const kit = api(list, { target: tg, params: { parts: ['home', 'a b'] } } as never);
    for (let i = 0; i < 100 && fetched.length < 1; i++) await new Promise((r) => setTimeout(r, 5));
    expect(fetched[0]!.url).toBe(`https://${P}-${C}-files-1.srv-1.computers.invalid/api/v1/files/home/a%20b`);
    expect(fetched[0]!.init.method).toBe('GET');
    expect(fetched[0]!.init.headers).toEqual({ Accept: 'application/json' });
    expect(fetched[0]!.init.redirect).toBe('manual');
    expect(fetched[0]!.o.beforeWire()).toBe(true);
    fetched[0]!.ok(new Response('{"entries":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    expect(await kit).toEqual({ entries: [] });
    const agent = api(status, { target: tg } as never);
    for (let i = 0; i < 100 && fetched.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    expect(fetched[1]!.url).toBe(`${agentBaseFor(tg.project, tg.container)}/api/v1/agent/hoody/auth/status`);
    expect(fetched[1]!.url.startsWith(`https://${P}-${C}-agent-1.srv-1.computers.invalid/`)).toBe(true);
    expect(fetched[1]!.init.headers).toEqual({ Accept: 'application/json' });
    fetched[1]!.ok(new Response('{"auth_active":false}', { status: 200, headers: { 'content-type': 'application/json' } }));
    expect(await agent).toEqual({ auth_active: false });
    await boot.dispose('term-abort');
    session.end();
    expect(buildPortUrl(tg.project, tg.container, 'files', 1)).toBe('');
  }
  // Without one: no address, so the call is refused before any fetch.
  {
    const { client, fetched } = holdingClient();
    const session = beginT();
    const boot = liveBootT(client, { profile: 'test', realmId: 'all' }, () => '/');
    await boot.start(session, () => {});
    expect(buildPortUrl(tg.project, tg.container, 'files', 1)).toBe('');
    await expect(api(list, { target: tg, params: { parts: ['home'] } } as never)).rejects.toMatchObject({ code: 'NO_KIT_URL' });
    expect(fetched.length).toBe(0);
    await boot.dispose('term-abort');
    session.end();
  }
});
