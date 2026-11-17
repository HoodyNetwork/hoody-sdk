// dispose.ts: disposeCoreSession ends the session and leaves core reusable.
import { describe, expect, it } from 'vitest';
import { identity, onBump, page, realm as selected, setIdentity, setTarget, target } from './ctx';
import { disposeCoreSession } from './dispose';
import { askLeave, holdLeave, leaveCount, setLeaveAsker } from './leave';
import { accountEnded, hookPurge, onAuthPurge, onTeardown, pin, pinnedRealm } from './realm';
import { installShared, shared } from './session';
import { boot, R1, settle, TARGET, UID } from './test/env';

// Subscribed once at module load, as the real modules do; never unsubscribed, never subscribed again.
const teardowns: string[] = [];
const purges: unknown[] = [];
onTeardown((reason) => { teardowns.push(reason); });
onAuthPurge((info) => { purges.push(info); });

describe('disposeCoreSession', () => {
  it('runs the purge a sign-out runs: the purge listeners see it once, then the teardown listeners see the reason', async () => {
    boot();
    teardowns.length = 0; purges.length = 0;
    setIdentity({ id: UID, banned: false });
    const shownAtTeardown: unknown[] = [];
    const off = onTeardown(() => { shownAtTeardown.push(identity()); });
    await disposeCoreSession('term-quit');
    off();
    expect(purges).toEqual([undefined]);
    expect(teardowns).toEqual(['term-quit']);
    expect(shownAtTeardown).toEqual([{ id: UID, banned: false }]); // the purge runs before the resets: listeners see the session
  });
  it('names each reason to the teardown listeners', async () => {
    for (const reason of ['term-quit', 'term-abort', 'term-error'] as const) {
      boot();
      teardowns.length = 0;
      await disposeCoreSession(reason);
      expect(teardowns).toEqual([reason]);
    }
  });
  it('leaves core reusable: the account is no longer ended and a realm pins again', async () => {
    boot();
    expect(pin(R1)).toBe(true);
    await disposeCoreSession('term-quit');
    expect(accountEnded()).toBe(false);
    expect(pinnedRealm()).toBeNull();
    expect(pin(R1)).toBe(true);
  });
  it('returns the context to its boot state', async () => {
    boot();
    setIdentity({ id: UID, banned: false });
    setTarget(TARGET);
    await disposeCoreSession('term-quit');
    expect([page(), identity(), target(), selected()]).toEqual([null, null, null, 'all']);
  });
  it('module-load subscribers survive: the second mount is served by the same ones, once each', async () => {
    boot();
    teardowns.length = 0; purges.length = 0;
    await disposeCoreSession('term-quit');
    boot(); // mount B
    await disposeCoreSession('term-abort');
    expect(teardowns).toEqual(['term-quit', 'term-abort']);
    expect(purges).toEqual([undefined, undefined]);
  });
  it('arms nothing itself: the next mount hooks its own Shared, and a sign-out there reaches each listener once', async () => {
    boot();
    const outgoing = shared();
    await disposeCoreSession('term-quit');
    boot(); // mount B: a new Shared, hookPurge on it
    expect(shared()).not.toBe(outgoing);
    purges.length = 0;
    shared().clearAuthTokens();
    await settle();
    expect(purges).toHaveLength(1);
  });
  it('a disposal does not latch the purge hook: hookPurge on the next Shared still attaches', async () => {
    boot();
    await disposeCoreSession('term-quit');
    const hooks: Array<(info?: unknown) => void> = [];
    const next = { ...shared(), onBeforeAuthPurge: (fn: (info?: unknown) => void) => { hooks.push(fn); } };
    installShared(next as never);
    hookPurge();
    expect(hooks).toHaveLength(1);
  });
  it('bump listeners (module-level) are not cleared', async () => {
    const seen: string[] = [];
    onBump((r) => { seen.push(r); });
    boot();
    seen.length = 0;
    await disposeCoreSession('term-quit');
    expect(seen).toContain('term-quit');
    boot();
    seen.length = 0;
    await disposeCoreSession('term-quit');
    expect(seen).toContain('term-quit');
  });
  it('work cut off by a forced close leaves no hold behind: the next session counts none, arms no prompt and asks nobody', async () => {
    boot();
    const stale = holdLeave('upload');
    const asked: number[] = [];
    setLeaveAsker(async (n) => { asked.push(n); return false; });
    await disposeCoreSession('term-abort');
    expect(leaveCount()).toBe(0);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    await expect(askLeave()).resolves.toBe(true);
    const next = holdLeave('copy'); // the next session's own hold
    await expect(askLeave()).resolves.toBe(false); // no asker of the dead session answers for the new one: nobody can be asked
    expect(asked).toEqual([]);
    stale(); // the dead session's release changes nothing
    expect(leaveCount()).toBe(1);
    next();
    expect(leaveCount()).toBe(0);
  });
  it('a disposal does not navigate: lifecycle is not asked to leave the page', async () => {
    const { configureLifecycle } = await import('./lifecycle');
    const urls: string[] = [];
    configureLifecycle({ navigate: (u) => { urls.push(u); } });
    boot();
    await disposeCoreSession('term-quit');
    await settle();
    expect(urls).toEqual([]);
  });
});
