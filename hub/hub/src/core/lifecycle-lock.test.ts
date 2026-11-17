// lifecycle.ts, the passcode's exits (Sign-out, Forget navigation, Terminal):
// - logout() posts the lock-only broadcast for the shown account first, then signs out as before; records stay.
// - forgetHere(): `leaving` is set before shared.js forgetBrowser() runs, so the purge hook does not navigate; the page
//   leaves once, after the answer: 'purged' → sign-in (`?error=locked_out` on the terminal path); 'failed' → it stays.
import { afterEach, describe, expect, it } from 'vitest';
import sharedSource from '../../../public/auth/shared.js?raw';
import { configureLifecycle, forgetHere, initLive, logout, onLifecycle, superseded, type LifecycleEvent } from './lifecycle';
import { bootGate, resetAppLock } from './applock';
import { resetRealm } from './realm';
import { installShared, shared, type Shared } from './session';
import { boot, env, R1, settle, UID } from './test/env';

const REC = '{"v":1,"rec":"mine"}';
const OTHER_REC = '{"v":1,"rec":"other"}';
const OTHER_UID = '64f0c0ffee0000000000beef';

const NAMES = [
  'storedSession', 'holdsIdentity', 'holdsSession', 'sessionTokenUid', 'sessionTokenSid', 'apiCall', 'isFramedPage',
  'framedSensitiveRoute', 'framedRefusedError', 'supersededAuthError', 'isSupersededAuthError', 'realmApiDomain',
  'clearAuthTokens', 'purgeOutgoingSession', 'endOutgoingSession', 'onBeforeAuthPurge', 'authStorageEntry',
  'authSessionSuperseded', 'adoptReissuedSession', 'postHubLock', 'forgetBrowser',
];
/** The real shared.js with its passcode members (test/env's loader returns only the required ones). */
function loadFullShared(): Shared {
  const src = sharedSource.replace(/^'use strict';/, '');
  const tail = `\n;isFramedPage = function () { return __env.framed; };\nreturn { ${NAMES.map((n) => `${n}: ${n}`).join(', ')} };`;
  return (new Function('__env', src + tail) as (e: typeof env) => Shared)(env);
}

type Win = { navs: string[]; events: LifecycleEvent[]; posted: Array<{ name: string; m: unknown }> };
const offs: Array<() => void> = [];
const realBC = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
afterEach(() => {
  while (offs.length) offs.pop()!();
  undoRemove?.();
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = realBC;
  delete (window as { HubBootToken?: unknown }).HubBootToken;
});

/** A booted live page of UID with passcode records for UID and another account; shared.js has its passcode members. */
function tab(o: { forget?: boolean } = {}): Win {
  boot({ realm: R1, storage: { ['hub_lock:' + UID]: REC, ['hub_lock:' + OTHER_UID]: OTHER_REC } });
  const full = loadFullShared();
  if (o.forget === false) delete (full as { forgetBrowser?: unknown }).forgetBrowser;
  installShared(full);
  resetRealm(); // the purge hooks go on this shared.js instance (initLive below hooks them again)
  const w: Win = { navs: [], events: [], posted: [] };
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = class {
    constructor(public name: string) {}
    postMessage(m: unknown) { w.posted.push({ name: this.name, m: JSON.parse(JSON.stringify(m)) }); }
    close() {}
  };
  configureLifecycle({ navigate: (u) => w.navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  offs.push(onLifecycle((e) => w.events.push(e)));
  return w;
}
/** localStorage.removeItem through `fn` until the returned undo (or afterEach) puts it back. Defined on the instance:
 *  happy-dom binds Storage methods onto the instance at first use, so a prototype patch may never be reached. */
let undoRemove: (() => void) | null = null;
function onRemove(fn: (k: string, remove: () => void) => void): () => void {
  const ls = globalThis.localStorage;
  const orig = ls.removeItem;
  Object.defineProperty(ls, 'removeItem', { configurable: true, writable: true, value: (k: string) => fn(k, () => orig.call(ls, k)) });
  undoRemove = () => { Object.defineProperty(ls, 'removeItem', { configurable: true, writable: true, value: orig }); undoRemove = null; };
  return undoRemove;
}
const lockKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('hub_lock'));
const leavings = (w: Win) => w.events.filter((e) => e.kind === 'leaving');

describe('logout(): the lock-only broadcast first', () => {
  it('posts {t:"lock", uid} for the shown account before anything is purged; the records stay', async () => {
    const w = tab();
    const atFirstRemoval: number[] = [];
    onRemove((_k, remove) => { atFirstRemoval.push(w.posted.length); remove(); });
    logout();
    expect(w.posted).toEqual([{ name: 'hub-lock', m: { t: 'lock', uid: UID } }]);
    await settle(20);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(w.navs).toEqual(['/auth/login']);
    expect(atFirstRemoval.length).toBeGreaterThan(0);
    expect(atFirstRemoval[0]).toBe(1);
    expect(localStorage.getItem('hub_lock:' + UID)).toBe(REC);
    expect(localStorage.getItem('hub_lock:' + OTHER_UID)).toBe(OTHER_REC);
  });

  it('a second call while the first runs posts nothing more', async () => {
    const w = tab();
    logout();
    logout();
    await settle(20);
    expect(w.posted.length).toBe(1);
  });

  it('Try again of a failed purge (the purge-failed panel) posts nothing more; it then signs out once, records kept', async () => {
    const w = tab();
    let wipes = 0;
    const wipe = async () => ++wipes > 1; // the first wipe fails: the purge-failed panel with its Try again
    logout({ wipe });
    for (let i = 0; i < 50 && !w.events.some((e) => e.kind === 'purge-failed'); i++) await settle(2);
    expect(w.events.filter((e) => e.kind === 'purge-failed')).toHaveLength(1);
    expect(w.navs).toEqual([]);
    logout({ wipe }); // the panel's Try again
    for (let i = 0; i < 50 && !w.navs.length; i++) await settle(2);
    expect(wipes).toBe(2);
    expect(w.navs).toEqual(['/auth/login']);
    expect(w.posted).toEqual([{ name: 'hub-lock', m: { t: 'lock', uid: UID } }]);
    expect(localStorage.getItem('hub_lock:' + UID)).toBe(REC);
    expect(localStorage.getItem('hub_lock:' + OTHER_UID)).toBe(OTHER_REC);
  });

  it('an older shared.js without postHubLock: the sign-out runs as before', async () => {
    const w = tab();
    const s = shared() as { postHubLock?: unknown };
    installShared({ ...shared(), postHubLock: undefined } as Shared);
    expect(s.postHubLock).toBeTypeOf('function');
    logout();
    await settle(20);
    expect(w.posted).toEqual([]);
    expect(w.navs).toEqual(['/auth/login']);
  });
});

describe('forgetHere(): Forget navigation and Terminal', () => {
  it("'purged': every record and the session gone, the page leaves for sign-in once, after the answer", async () => {
    const w = tab();
    let navsAtAnswer = -1;
    const fb = shared().forgetBrowser!;
    installShared({ ...shared(), forgetBrowser: () => { const r = fb(); navsAtAnswer = w.navs.length; return r; } });
    expect(forgetHere()).toBe('purged');
    expect(navsAtAnswer).toBe(0);
    await settle(20);
    expect(w.navs).toEqual(['/auth/login']);
    expect(leavings(w)).toEqual([{ kind: 'leaving', to: 'login' }]);
    expect(lockKeys()).toEqual([]);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(w.posted.map((p) => (p.m as { uid: string }).uid).sort()).toEqual([UID, OTHER_UID].sort());
  });

  it("the terminal path: 'purged' → sign-in with ?error=locked_out", async () => {
    const w = tab();
    expect(forgetHere({ terminal: true })).toBe('purged');
    await settle(20);
    expect(w.navs).toEqual(['/auth/login?error=locked_out']);
  });

  it("'failed' (a credential could not be removed): the page stays, records kept; Try again then leaves", async () => {
    const w = tab();
    const undo = onRemove((k, remove) => { if (k === 'access_token') throw new Error('quota'); remove(); });
    expect(forgetHere({ terminal: true })).toBe('failed');
    await settle(20);
    expect(w.navs).toEqual([]);
    expect(leavings(w)).toEqual([]);
    expect(localStorage.getItem('hub_lock:' + UID)).toBe(REC);
    undo();
    expect(forgetHere({ terminal: true })).toBe('purged');
    await settle(20);
    expect(w.navs).toEqual(['/auth/login?error=locked_out']);
    expect(lockKeys()).toEqual([]);
  });

  it("after a 'failed' answer the page is not left marked as leaving: another tab's session change still leaves", async () => {
    const w = tab();
    const undo = onRemove((k, remove) => { if (k === 'access_token') throw new Error('quota'); remove(); });
    expect(forgetHere()).toBe('failed');
    undo();
    superseded();
    await settle(5);
    expect(w.navs.length).toBe(1);
  });

  it("an older shared.js without forgetBrowser: 'failed', nothing removed, no navigation", async () => {
    const w = tab({ forget: false });
    expect(forgetHere({ terminal: true })).toBe('failed');
    await settle(20);
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('hub_lock:' + UID)).toBe(REC);
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });

  it('the engine\'s terminal path is forgetHere({ terminal: true }) by default: out:true found at load → sign-in with locked_out', async () => {
    const w = tab();
    resetAppLock();
    const b64 = (n: number) => btoa(String.fromCharCode(...new Uint8Array(n).fill(7)));
    localStorage.setItem('hub_lock:' + UID, JSON.stringify({
      v: 1, kdf: 'pbkdf2-sha256', iter: 600_000, salt: b64(16), hash: b64(32), rev: b64(8), digits: true, idleMin: 5, onLeave: false,
      tries: { n: 10, until: 0, pending: null, out: true },
    }));
    expect(bootGate()).toBe(true);
    for (let i = 0; i < 50 && !w.navs.length; i++) await settle(2);
    expect(w.navs).toEqual(['/auth/login?error=locked_out']);
    expect(lockKeys()).toEqual([]);
    resetAppLock();
  });
});
