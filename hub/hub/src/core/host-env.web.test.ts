// The web default is today's browser path: the leave warning, the restored-page refresh and the tab-lock answers are
// each pinned to what the code did before it read the browser through host-env.ts. The expected values below were
// recorded by running these same cases against the earlier code, not derived.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdLeave } from './leave';
import { notificationSummary, onNotificationSummary } from './notifications';
import { holdTabLock, otherTabs, resetTabLock, tabHeld, WIPE_LOCK, withWipeLock } from './tab-lock';
import { boot, onFetch, R1, settle, UID } from './test/env';
import { installWebLocks, openOtherTab } from './test/web-locks';

const SUM = `hub_notif:${UID}:summary`;
const wire = (n: number) => ({ user_id: UID, unread_count: n, is_capped: false, latest_id: 'n' + n, latest_created_at: '2026-10-23T08:00:00Z', poll_interval_seconds: 300 });

describe('leave warning', () => {
  it('a held leave makes a cancelable beforeunload default-prevented with an empty returnValue; released, it does not', () => {
    const e1 = new Event('beforeunload', { cancelable: true });
    const release = holdLeave('upload');
    window.dispatchEvent(e1);
    expect([e1.defaultPrevented, (e1 as BeforeUnloadEvent).returnValue]).toEqual([true, '']);
    release();
    const e2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });
});

describe('restored page', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] }); vi.setSystemTime(Date.parse('2026-10-23T09:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });
  it('pageshow persisted re-reads the cached summary; not persisted does nothing', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { data: { unread_count: 3, is_capped: false, latest_id: 'n3', latest_created_at: '2026-10-23T08:00:00Z', poll_interval_seconds: 300 } } }));
    onNotificationSummary(() => {});
    for (let i = 0; i < 20; i++) await settle();
    expect(notificationSummary()?.unread_count).toBe(3);
    localStorage.setItem(SUM, JSON.stringify(wire(7)));
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(notificationSummary()?.unread_count).toBe(3);
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(notificationSummary()?.unread_count).toBe(7);
  });
});

describe('local-data removal and the other-tab answer', () => {
  afterEach(() => { resetTabLock(); });
  it('a second holder of the tab lock reads open; a removal runs unless another tab holds the wipe lock', async () => {
    boot({ realm: R1 });
    const locks = installWebLocks();
    holdTabLock();
    await vi.waitFor(() => expect(tabHeld()).toBe(true));
    expect(await otherTabs()).toBe('alone');
    openOtherTab(locks, 'other');
    await vi.waitFor(async () => expect(await otherTabs()).toBe('open'));
    // Both tabs let go of the wipe lock once their tab lock is granted, so a removal runs; another tab holding it makes it busy.
    expect(await withWipeLock(async () => 'ran')).toBe('ran');
    locks.asClient('wiper', () => { void navigator.locks.request(WIPE_LOCK, { mode: 'exclusive' }, () => new Promise<void>(() => {})); });
    await vi.waitFor(() => expect(locks.held().some((h) => h.name === WIPE_LOCK)).toBe(true));
    expect(await withWipeLock(async () => 'ran')).toBe('busy');
  });
  it('without query() the answer is unknown', async () => {
    boot({ realm: R1 });
    installWebLocks({ noQuery: true });
    holdTabLock();
    await vi.waitFor(() => expect(tabHeld()).toBe(true));
    expect(await otherTabs()).toBe('unknown');
  });
});
