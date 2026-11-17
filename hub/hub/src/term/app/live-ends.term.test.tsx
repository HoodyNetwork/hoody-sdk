// The live entry on a fake client (no real API, no credential): a mount that BOOTED ends on the client's auth-ended
// notice for both identity kinds, and the receipt keeps where the end came from.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Account mount, the client says signed-out: the mount ends at once, receipt reason signed-out, ok, the notice listener is unsubscribed | 'account sign-out notice' |
// | 2 | Token mount (core's purge follower skips token sessions), the client says revoked: the mount still ends, reason expired; signed-out on a token mount reads signed-out | 'token notices end the mount' |
// | 3 | Account mount, a request after boot ANSWERED 401 with no notice at all: the adapter purges ('expiry'), the mount ends expired (never signed-out), the notice listener is unsubscribed, and nothing reaches the client after the end | 'account expiry' |
// | 4 | A notice for another sid changes nothing | 'other sid' |
// | 6 | Strict globals on (the live default), a computer page with no agent routing (the seam names no proxy domain): the page shows its couldn't-load state, nothing reads `document`, the mount quits ok with no trap (F11) | 'no agent routing, no trap' |
// | 5 | Account mount started on a realm, GET /realms answering late: a list that names the realm keeps it selected and the page's realm calls go to that realm's host; a list WITHOUT it falls back to all realms, as on the web (never to another realm); no call ever goes to another realm's host. A token mount stays pinned and asks for no realm list | 'account realm, late realm list' |
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import { api } from '../../core/api';
import { realm as selectedRealm } from '../../core/ctx';
import { defineRoute } from '../../core/routes';
import { currentTermSession } from '../env/session';
import { mountTerminalHub } from '../entry';
import type { ClientCallControls, HoodyClient, HubTermOptions, Receipt } from '../host-types';
import { hoodyAttempt } from '../../../scripts/term/live-fake-api';
import { UNSTYLED_FOR_TESTS } from './styles';

setDefaultTimeout(60_000);
// A failed test must not leave its mount open for the next.
afterEach(() => { currentTermSession()?.end(); });

const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
type Notice = { sid: string; reason: 'expired' | 'signed-out' | 'revoked' };

/** A fake Hoody API by path: answers boot, refuses everything else as a 404; honours beforeWire like the CLI must. */
function fakeClient(kind: 'account' | 'token', o: { realms?: () => Promise<unknown>; computers?: unknown[] } = {}) {
  const calls: Array<{ path: string; base: string | undefined }> = [];
  const listeners = new Set<(e: Notice) => void>();
  let fail401 = false;
  let wired = 0;
  const answers: Record<string, unknown> = {
    'GET /users/auth/me': { data: { id: '64f0ada00000000000000001', username: 'ada', email: 'ada@example.com' } },
    'GET /auth/tokens/me': { data: { token: { id: 'tok1', alias: 'cli', realm_ids: [REALM], allow_no_realm: false, permissions: { computers: { read: true }, projects: { read: true } }, expires_at: null } } },
    'GET /realms': { data: { realm_ids: [REALM] } },
    // The session's computer list, when a test names one: the host's place becomes the target only once it is listed.
    ...(o.computers ? { 'GET /computers': { data: { computers: o.computers, pagination: { totalPages: 1, total: o.computers.length } } } } : {}),
  };
  const client: HoodyClient = {
    identity: kind === 'token' ? { kind, uid: '64f0ada00000000000000001', sid: 'sid-1', realm: REALM } : { kind, uid: '64f0ada00000000000000001', sid: 'sid-1' },
    apiOrigin: 'https://api.example.invalid',
    realmApiDomain: 'realm.invalid',
    request: async (method: string, path: string, b: unknown, o2: ClientCallControls) => {
      if (!o2.beforeWire(hoodyAttempt(method, path, b, (o2 as { base?: string }).base))) throw { status: 0, notSent: true };
      wired++;
      if (fail401) throw { status: 401, code: 'UNAUTHORIZED' };
      calls.push({ path, base: (o2 as { base?: string }).base });
      if (o.realms && path.split('?')[0] === '/realms') return o.realms();
      const a = answers[`${method} ${path.split('?')[0]}`];
      if (a === undefined) throw { status: 404, code: 'NOT_FOUND' };
      return structuredClone(a);
    },
    fetch: async () => { throw { status: 0, notSent: true }; },
    onAuthEnded: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };
  return { client, calls, listeners, notify: (e: Notice) => { for (const l of [...listeners]) l(e); }, set401: () => { fail401 = true; }, wired: () => wired };
}

function fakeIo() {
  let out = '';
  const io: HubTermOptions['io'] = { cells: { write: (s) => { out += s; } }, input: { onData: () => () => {} }, size: () => ({ cols: 100, rows: 30 }), colourTier: 'mono' };
  return { io, text: () => out.replace(/\x1b\[[0-9;]*[ABCDEFGHf]/g, ' ').replace(/\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[@-_]/g, '').replace(/[ \t]+/g, ' '), drawn: async () => { for (let i = 0; i < 400 && !out.includes('HOODY'); i++) await new Promise((r) => setTimeout(r, 25)); return out.includes('HOODY'); } };
}

async function mounted(kind: 'account' | 'token', realmId?: string, o: Parameters<typeof fakeClient>[1] = {}, route: { page: string; path: string } = { page: 'home', path: '/' }, extra: Partial<{ projectId: string; containerId: string }> = {}) {
  const f = fakeClient(kind, o);
  const g = fakeIo();
  const done: Promise<Receipt> = mountTerminalHub({ styles: UNSTYLED_FOR_TESTS, client: f.client, context: { profile: 'test', realmId: realmId ?? (kind === 'token' ? REALM : 'all'), ...extra }, route, io: g.io, onSetDefault: async () => {} });
  let settled = false;
  void done.then(() => { settled = true; });
  expect(await g.drawn()).toBe(true);
  expect(settled).toBe(false);
  expect(f.listeners.size).toBe(1);
  return { f, g, done };
}

test('account sign-out notice', async () => {
  const { f, done } = await mounted('account');
  f.notify({ sid: 'sid-1', reason: 'signed-out' });
  const r = await done;
  expect(r.reason).toBe('signed-out');
  expect(r.ok).toBe(true);
  expect(f.listeners.size).toBe(0);
});

test('token notices end the mount', async () => {
  for (const [reason, want] of [['revoked', 'expired'], ['expired', 'expired'], ['signed-out', 'signed-out']] as const) {
    const { f, done } = await mounted('token');
    f.notify({ sid: 'sid-1', reason });
    const r = await Promise.race([done, new Promise<null>((res) => setTimeout(() => res(null), 5000))]);
    expect(r).not.toBeNull();
    expect(r!.reason).toBe(want);
    expect(f.listeners.size).toBe(0);
  }
});

test('account expiry', async () => {
  const { f, done } = await mounted('account');
  f.set401();
  // A real request after boot, answered 401; no notice is sent.
  const answered = api(defineRoute({ method: 'GET', path: '/notes', scope: 'base' })).catch((e: unknown) => e);
  const r = await done;
  expect(r.reason).toBe('expired');
  expect(await answered).toMatchObject({ status: 401 });
  expect(f.listeners.size).toBe(0);
  const after = f.wired();
  await new Promise((res) => setTimeout(res, 300));
  expect(f.wired()).toBe(after);
});

test('other sid', async () => {
  const { f, done } = await mounted('account');
  f.notify({ sid: 'sid-2', reason: 'signed-out' });
  await new Promise((r) => setTimeout(r, 300));
  let settled = false;
  void done.then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 50));
  expect(settled).toBe(false);
  f.notify({ sid: 'sid-1', reason: 'signed-out' });
  expect((await done).reason).toBe('signed-out');
});

test('account realm, late realm list', async () => {
  const OTHER = 'e2e2e2e2e2e2e2e2e2e2e2e2';
  const realmCalls = (f: ReturnType<typeof fakeClient>) => f.calls.filter((c) => c.base !== undefined && c.base.includes('realm.invalid') && /[0-9a-f]{24}/.test(c.base));
  const settle = async (want: string) => { for (let i = 0; i < 100 && selectedRealm() !== want; i++) await new Promise((r) => setTimeout(r, 10)); };
  for (const [ids, want] of [[[REALM, OTHER], REALM], [[OTHER], 'all']] as const) {
    let answer!: (v: unknown) => void;
    const late = new Promise((r) => { answer = r; });
    const { f, done } = await mounted('account', REALM, { realms: () => late });
    // Not pinned: the realm list is asked for, and until it answers the host's realm is the selection.
    expect(f.calls.some((c) => c.path.split('?')[0] === '/realms')).toBe(true);
    expect(selectedRealm()).toBe(REALM);
    answer({ data: { realm_ids: ids } });
    await settle(want);
    await new Promise((r) => setTimeout(r, 300));
    expect(selectedRealm()).toBe(want);
    if (want === REALM) {
      expect(realmCalls(f).length).toBeGreaterThan(0);
      for (const c of realmCalls(f)) expect(c.base).toContain(REALM);
    }
    expect(f.calls.some((c) => c.base?.includes(OTHER))).toBe(false);
    f.notify({ sid: 'sid-1', reason: 'signed-out' });
    await done;
  }
  // A token mount: pinned to its realm, no realm list at all.
  const { f, done } = await mounted('token');
  expect(selectedRealm()).toBe(REALM);
  expect(f.calls.some((c) => c.path.split('?')[0] === '/realms')).toBe(false);
  f.notify({ sid: 'sid-1', reason: 'signed-out' });
  await done;
});

test('no agent routing, no trap', async () => {
  const place = { projectId: '6a0000000000000000000001', containerId: 'c0a7150000000000000000a1' };
  const listed = [{ id: place.containerId, project_id: place.projectId, name: 'box', status: 'running', realm_ids: [REALM] }];
  const { f, g, done } = await mounted('account', REALM, { computers: listed }, { page: 'schedules', path: '/schedules' }, place);
  await new Promise((r) => setTimeout(r, 1500));
  // The page's own closed state, in place: no address to reach the agent at, nothing sent to one.
  expect(g.text()).toContain("Schedules couldn't load");
  f.notify({ sid: 'sid-1', reason: 'signed-out' });
  const r = await done;
  expect(r.reason).toBe('signed-out');
  expect(r.ok).toBe(true);
  expect(r.problems.filter((p) => p.kind === 'trap')).toEqual([]);
});
