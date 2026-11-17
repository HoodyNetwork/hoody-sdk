// notifications.test.ts: the summary poller and the bounded unread read (since()).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, setIdentity } from './ctx';
import {
  noteAllNotificationsRead, noteNotificationsRead, notificationPollerState, notificationRow, notificationSummary,
  onNotificationSummary, readUnreadSince, refreshNotificationSummary, type NotificationSummary,
} from './notifications';
import { endAccount, switchTo } from './realm';
import { boot, calls, onFetch, OTHER, R1, R2, sessionToken, settle, signIn, UID } from './test/env';
import { installTransport } from './transport';

const SUM = `hub_notif:${UID}:summary`, ATT = `hub_notif:${UID}:attempt`;
const summaryCalls = () => calls.filter((c) => c.url.includes('/notifications/summary'));
const answer = (n: number, extra: Record<string, unknown> = {}) => ({ status: 200, body: { data: { unread_count: n, is_capped: false, latest_id: 'n' + n, latest_created_at: '2026-10-23T08:00:00Z', ...extra } } });
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
function visibility(v: 'visible' | 'hidden'): void { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(Date.parse('2026-10-23T09:00:00Z'));
  visibility('visible');
});
afterEach(() => { vi.useRealTimers(); });

describe('polling the summary', () => {
  it('the first listener starts it: one GET on the base host, painted and cached under the account', async () => {
    boot({ realm: R1 });
    onFetch(() => answer(3));
    const seen: (NotificationSummary | null)[] = [];
    onNotificationSummary((s) => seen.push(s));
    await flush();
    expect(summaryCalls()).toHaveLength(1);
    expect(summaryCalls()[0]!.url).not.toContain(R1);
    expect(notificationSummary()).toMatchObject({ uid: UID, unread_count: 3, latest_id: 'n3' });
    expect(seen.at(-1)?.unread_count).toBe(3);
    expect(JSON.parse(localStorage.getItem(SUM)!)).toMatchObject({ user_id: UID, unread_count: 3, poll_interval_seconds: 300 });
    expect(Number(localStorage.getItem(ATT))).toBe(Date.now());
  });
  it('polls again only when the period is due; ticks between cost nothing; the server period is clamped', async () => {
    boot();
    onFetch(() => answer(1, { poll_interval_seconds: 5 }));
    onNotificationSummary(() => {});
    await flush();
    expect(notificationPollerState().periodMs).toBe(60_000);
    vi.advanceTimersByTime(30_000); await flush();
    expect(summaryCalls()).toHaveLength(1);
    vi.advanceTimersByTime(30_000); await flush();
    expect(summaryCalls()).toHaveLength(2);
  });
  it('a hidden tab sends nothing; becoming visible checks at once when due', async () => {
    boot();
    visibility('hidden');
    onFetch(() => answer(1));
    onNotificationSummary(() => {});
    await flush();
    expect(summaryCalls()).toHaveLength(0);
    visibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(summaryCalls()).toHaveLength(1);
  });
  it('another tab polled recently: hydrate from its cache and do not poll', async () => {
    boot({ storage: { [SUM]: JSON.stringify({ user_id: UID, unread_count: 7, is_capped: true, poll_interval_seconds: 600 }), [ATT]: String(Date.parse('2026-10-23T08:59:00Z')) } });
    onNotificationSummary(() => {});
    await flush();
    expect(summaryCalls()).toHaveLength(0);
    expect(notificationSummary()).toMatchObject({ unread_count: 7, is_capped: true });
    expect(notificationPollerState().periodMs).toBe(600_000);
  });
  it("a cache naming another account is never painted; another account's keys are removed at start", async () => {
    boot({ storage: { [SUM]: JSON.stringify({ user_id: OTHER, unread_count: 9 }), [`hub_notif:${OTHER}:summary`]: '{}', 'hub_notif:junk': '1' } });
    onFetch(() => ({ status: 503, body: {} }));
    onNotificationSummary(() => {});
    await flush();
    expect(notificationSummary()).toBeNull();
    expect(localStorage.getItem(`hub_notif:${OTHER}:summary`)).toBeNull();
    expect(localStorage.getItem('hub_notif:junk')).toBeNull();
  });
  it('failures back off exponentially in ticks; refresh does not bypass it; success resets it', async () => {
    boot();
    let fail = true;
    onFetch(() => (fail ? { status: 503, body: {} } : answer(2)));
    onNotificationSummary(() => {});
    await flush();
    expect(notificationPollerState()).toMatchObject({ backoffLevel: 1, backoffTicks: 1 });
    refreshNotificationSummary(); await flush();
    expect(summaryCalls()).toHaveLength(1);
    refreshNotificationSummary(); await flush();
    expect(summaryCalls()).toHaveLength(2);
    expect(notificationPollerState()).toMatchObject({ backoffLevel: 2, backoffTicks: 2 });
    fail = false;
    refreshNotificationSummary(); refreshNotificationSummary(); refreshNotificationSummary(); await flush();
    expect(summaryCalls()).toHaveLength(3);
    expect(notificationPollerState()).toMatchObject({ backoffLevel: 0, backoffTicks: 0 });
  });
  it('404 waits the longest backoff at once; a 403 stops it; an explicit refresh restarts it', async () => {
    boot();
    onFetch(() => ({ status: 404, body: {} }));
    onNotificationSummary(() => {});
    await flush();
    expect(notificationPollerState().backoffTicks).toBe(20);
    boot();
    onFetch(() => ({ status: 403, body: { error: 'FORBIDDEN' } }));
    onNotificationSummary(() => {});
    await flush();
    expect(notificationPollerState().stopped).toBe(true);
    vi.advanceTimersByTime(3_600_000); await flush();
    expect(summaryCalls()).toHaveLength(1);
    onFetch(() => answer(4));
    refreshNotificationSummary(); await flush();
    expect(summaryCalls()).toHaveLength(2);
    expect(notificationSummary()?.unread_count).toBe(4);
  });
});

describe('a token refresh that fails or runs past the bound is transient, never a stop', () => {
  const refreshPath = (u: string) => /\/users\/auth\/refresh/.test(u);
  const fresh = (): { status: number; body: unknown } => ({
    status: 200,
    body: { data: { token: sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 3600 }), refreshToken: sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 86400 }), expires_at: new Date(Date.now() + 3_600_000).toISOString() } },
  });
  const expiring = () => localStorage.setItem('access_token_expires_at', new Date(Date.now() + 10_000).toISOString());
  it('a refresh that answers after the bound: the poll backs off (nothing sent late), and polling goes on once refreshes work', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: Date.parse('2026-10-23T09:00:00Z') });
    boot();
    expiring();
    let release!: () => void;
    const hung = new Promise<{ status: number; body: unknown }>((res) => { release = () => res(fresh()); });
    onFetch((c) => (refreshPath(c.url) ? hung : answer(5)));
    onNotificationSummary(() => {});
    await vi.advanceTimersByTimeAsync(25_100);
    expect(notificationPollerState()).toMatchObject({ stopped: false, backoffLevel: 1 });
    expect(summaryCalls()).toHaveLength(0);
    // The refresh completes with a valid session: the bounded call does not leave late.
    release();
    await vi.advanceTimersByTimeAsync(10);
    expect(summaryCalls()).toHaveLength(0);
    expect(localStorage.getItem('refresh_token')).toContain('.');
    // The backoff tick passes, then the period: the next poll goes out and paints.
    await vi.advanceTimersByTimeAsync(400_000);
    expect(summaryCalls()).toHaveLength(1);
    expect(notificationSummary()?.unread_count).toBe(5);
    expect(notificationPollerState()).toMatchObject({ stopped: false, backoffLevel: 0 });
  });
  for (const [name, reply] of [['a network failure', { status: 0, network: true }], ['a 503', { status: 503, body: {} }]] as const) {
    it(`another tab of the same session rotates the token while this refresh fails (${name}): the retry adopts its pair, polling goes on`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: Date.parse('2026-10-23T09:00:00Z') });
      boot();
      expiring();
      let refreshed = 0;
      onFetch((c) => {
        if (!refreshPath(c.url)) return answer(4);
        if (refreshed++ === 0) {
          // The other tab's rotation lands first: same account, same session, a new refresh token.
          localStorage.setItem('refresh_token', sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 86400, n: 3 }));
          localStorage.setItem('access_token', sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 3600, n: 3 }));
          localStorage.setItem('access_token_expires_at', new Date(Date.now() + 3_600_000).toISOString());
          return reply;
        }
        return fresh();
      });
      onNotificationSummary(() => {});
      // shared.js waits 1 s before it would send again; storage moved meanwhile, so it adopts the rotation instead.
      await vi.advanceTimersByTimeAsync(1_100);
      expect(refreshed).toBe(1);
      expect(summaryCalls()).toHaveLength(1);
      expect(notificationSummary()?.unread_count).toBe(4);
      expect(notificationPollerState()).toMatchObject({ stopped: false, backoffLevel: 0 });
    });
  }
  it('a refresh that reaches no verdict (REFRESH_UNAVAILABLE, the session kept): the poll backs off, polling goes on', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: Date.parse('2026-10-23T09:00:00Z') });
    boot();
    expiring();
    let down = true;
    onFetch((c) => (!refreshPath(c.url) ? answer(6) : down ? { status: 503, body: {} } : fresh()));
    onNotificationSummary(() => {});
    await vi.advanceTimersByTimeAsync(12_000); // the first send and its retries inside the reuse grace
    expect(summaryCalls()).toHaveLength(0);
    expect(localStorage.getItem('refresh_token')).not.toBeNull();
    expect(notificationPollerState()).toMatchObject({ stopped: false, backoffLevel: 1 });
    down = false;
    await vi.advanceTimersByTimeAsync(400_000);
    expect(summaryCalls()).toHaveLength(1);
    expect(notificationSummary()?.unread_count).toBe(6);
  });
  it('a refresh that fails because another account signed in here stops (the account changed, never retried)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], now: Date.parse('2026-10-23T09:00:00Z') });
    boot();
    expiring();
    onFetch((c) => {
      if (!refreshPath(c.url)) return answer(4);
      localStorage.setItem('refresh_token', sessionToken(OTHER, { sid: 'sid0000000000009', exp: Math.floor(Date.now() / 1000) + 86400 }));
      localStorage.setItem('access_token', sessionToken(OTHER, { sid: 'sid0000000000009', exp: Math.floor(Date.now() / 1000) + 3600 }));
      return { status: 503, body: {} };
    });
    onNotificationSummary(() => {});
    await vi.advanceTimersByTimeAsync(1_100); // shared.js's retry wait finds storage changed hands: superseded, never resent
    // Not taken as a failed poll (no backoff): the next tick finds the session gone and stops; nothing is sent.
    expect(notificationPollerState().backoffLevel).toBe(0);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(summaryCalls()).toHaveLength(0);
    expect(notificationPollerState().stopped).toBe(true);
  });
  it('a summary poll whose send was refused (it names its code) still stops: only the TIMEOUT bound is transient', async () => {
    boot();
    let tries = 0;
    installTransport({ hoody: async () => { tries++; throw { status: 0, code: 'BAD_API_BASE' }; }, fetch: () => Promise.reject(new Error('unused')) });
    try {
      onNotificationSummary(() => {});
      await flush();
      expect(tries).toBe(1);
      expect(notificationPollerState().stopped).toBe(true);
    } finally { installTransport(null); }
  });
});

describe('reads the user made', () => {
  it('noteNotificationsRead lowers the count here and in the cache, then polls; an answer issued before it is dropped', async () => {
    boot();
    onFetch(() => answer(5));
    onNotificationSummary(() => {});
    await flush();
    let release!: () => void;
    onFetch(() => new Promise((r) => { release = () => r(answer(5)); }));
    refreshNotificationSummary(); await flush();
    noteNotificationsRead(2);
    expect(notificationSummary()?.unread_count).toBe(3);
    expect(JSON.parse(localStorage.getItem(SUM)!).unread_count).toBe(3);
    onFetch(() => answer(3));
    release(); await flush();
    expect(notificationSummary()?.unread_count).toBe(3);
    expect(summaryCalls()).toHaveLength(3); // the pre-read answer dropped, then one poll after it
  });
  it('noteAllNotificationsRead clears the count and the cap', async () => {
    boot();
    onFetch(() => answer(500, { is_capped: true }));
    onNotificationSummary(() => {});
    await flush();
    onFetch(() => answer(0));
    noteAllNotificationsRead();
    expect(notificationSummary()).toMatchObject({ unread_count: 0, is_capped: false });
  });
});

describe('bound to the shown account', () => {
  it('storage now holds another session: nothing is sent, the poller stops', async () => {
    boot();
    onFetch(() => answer(1));
    onNotificationSummary(() => {});
    await flush();
    signIn(OTHER);
    window.dispatchEvent(new StorageEvent('storage', { key: 'access_token' }));
    expect(notificationPollerState().stopped).toBe(true);
    vi.advanceTimersByTime(3_600_000); await flush();
    expect(summaryCalls()).toHaveLength(1);
  });
  it('an account change clears the painted count at once and starts for the new account', async () => {
    boot();
    onFetch(() => answer(6));
    const seen: (NotificationSummary | null)[] = [];
    onNotificationSummary((s) => seen.push(s));
    await flush();
    setIdentity({ id: OTHER, banned: false });
    expect(seen.at(-1)).toBeNull();
    expect(notificationPollerState().uid).toBe(OTHER);
  });
  it('sign-out (teardown) stops and forgets; a realm switch keeps it', async () => {
    boot({ realm: R1 });
    onFetch((c) => (c.url.includes('/notifications/summary') ? answer(2) : { status: 200, body: { data: [] } }));
    onNotificationSummary(() => {});
    await flush();
    await switchTo(R2);
    expect(notificationSummary()?.unread_count).toBe(2);
    expect(notificationPollerState().stopped).toBe(false);
    endAccount('logout');
    expect(notificationPollerState()).toMatchObject({ uid: null, stopped: true, armed: false });
  });
  it('another tab wrote the summary: repainted from storage', async () => {
    boot();
    onFetch(() => answer(1));
    onNotificationSummary(() => {});
    await flush();
    localStorage.setItem(SUM, JSON.stringify({ user_id: UID, unread_count: 8 }));
    window.dispatchEvent(new StorageEvent('storage', { key: SUM }));
    expect(notificationSummary()?.unread_count).toBe(8);
  });
});

describe('token sessions and refusals', () => {
  it('a token session stays inert: no poll, no cache read or write', async () => {
    const rec = JSON.stringify({ v: 1, token: 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48), realm: R1, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
    boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: rec, [SUM]: JSON.stringify({ user_id: UID, unread_count: 9 }) } });
    setIdentity({ id: UID, banned: false });
    onFetch(() => answer(1));
    onNotificationSummary(() => {});
    refreshNotificationSummary();
    await flush();
    expect(summaryCalls()).toHaveLength(0);
    expect(notificationSummary()).toBeNull();
    expect(localStorage.getItem(ATT)).toBeNull();
    expect(await readUnreadSince(() => true, capture())).toMatchObject({ state: 'stale' });
  });
});

describe('readUnreadSince', () => {
  const wireRow = (i: number) => ({ id: 'n' + i, title: 't' + i, message: 'm', severity: i % 2 ? 'WARNING' : 'LOUD', created_at: 't', is_read: false });
  it('pages newest first until older(row), deduping rows that moved between pages', async () => {
    boot();
    onFetch((c) => {
      const p = Number(new URL(c.url, 'https://h.invalid').searchParams.get('page'));
      const ids = p === 1 ? [1, 2, 3] : [3, 4, 5];
      return { status: 200, body: { data: ids.map(wireRow), pagination: { total: 30, totalPages: 9 } } };
    });
    const r = await readUnreadSince((row) => row.id === 'n4', capture());
    expect(r).toMatchObject({ state: 'ok', capped: false, total: 30 });
    expect(r.rows.map((x) => x.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    expect(r.rows[1]!.severity).toBe('INFO');
    expect(calls.map((c) => new URL(c.url, 'https://h.invalid').search)).toEqual(['?unread_only=true&limit=20&page=1', '?unread_only=true&limit=20&page=2']);
  });
  it('stops at 5 pages and says capped', async () => {
    boot();
    onFetch((c) => ({ status: 200, body: { data: [wireRow(Number(new URL(c.url, 'https://h.invalid').searchParams.get('page')))], pagination: { total: 200, totalPages: 10 } } }));
    const r = await readUnreadSince(() => false, capture());
    expect(r).toMatchObject({ state: 'ok', capped: true });
    expect(calls).toHaveLength(5);
  });
  it('a dead ctx is stale and sends nothing; a failed read is error', async () => {
    boot();
    const ctx = capture();
    setIdentity({ id: OTHER, banned: false });
    expect(await readUnreadSince(() => true, ctx)).toEqual({ state: 'stale', rows: [], capped: false });
    expect(calls.filter((c) => c.url.includes('/notifications?'))).toHaveLength(0);
    boot();
    onFetch(() => ({ status: 500, body: {} }));
    expect(await readUnreadSince(() => true, capture())).toEqual({ state: 'error', rows: [], capped: false });
  });
  it('notificationRow keeps only known severities and types', () => {
    expect(notificationRow({ id: 'a', severity: 'ERROR', type: 'BILLING', created_at: 'x', is_read: true })).toEqual({ id: 'a', title: '', message: '', severity: 'ERROR', type: 'BILLING', at: 'x', read: true });
    expect(notificationRow({ type: 'SPAM' })).toEqual({ id: '', title: '', message: '', severity: 'INFO', at: null, read: false });
  });
});

describe('a refusal before sending stops the poller', () => {
  it('a not_sent refusal (nothing went out) is never retried on a timer', async () => {
    boot();
    let tries = 0;
    // Refused before onSend: api() marks it not_sent; a status-0 answer that WAS sent would back off and retry.
    installTransport({ hoody: async () => { tries++; throw { status: 0, code: 'REFUSED_HERE' }; }, fetch: () => Promise.reject(new Error('unused')) });
    try {
      onNotificationSummary(() => {});
      await flush();
      expect(tries).toBe(1);
      expect(notificationPollerState().stopped).toBe(true);
      vi.advanceTimersByTime(3_600_000); await flush();
      expect(tries).toBe(1);
    } finally { installTransport(null); }
  });
});
