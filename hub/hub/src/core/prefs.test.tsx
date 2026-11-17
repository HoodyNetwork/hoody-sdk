// prefs.test.tsx: account preferences and browser settings over the real shared.js registry.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryVault } from './crypt/memory-vault';
import { cryptIdleForTests, cryptReady, forgetThisBrowser, pendingPrefWrites, resetCryptForTests, VALUE_MAX } from './cryptStore';
import { startLoggingOut } from './ctx';
import { setIdentity } from './ctx';
import { configureLifecycle, initLive, logout } from './lifecycle';
import { resetRealm } from './realm';
import { ACCOUNT_PREF_KEYS, accountPref, localSetting, resetPrefs, useAccountPref, useLocalSetting } from './prefs';
import { clearAuthTokens } from './session';
import { boot, OTHER, UID } from './test/env';

// Fail-closed parsers: the default for anything that is not exactly the shape.
const DOORS = ['claude', 'codex', 'cursor'] as const;
type Guide = { cl: string; hid: 0 | 1 };
const parseGuide = (v: unknown): Guide => {
  const o = v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return { cl: typeof o.cl === 'string' && (DOORS as readonly string[]).includes(o.cl) ? o.cl : '', hid: o.hid === 1 ? 1 : 0 };
};
const parseList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 10) : []);

function show(id: string | null): void { setIdentity(id === null ? null : { id, banned: false }); }
let unblock: (() => void) | null = null;
function blockWrites(): () => void {
  const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  unblock = () => { spy.mockRestore(); unblock = null; };
  return unblock;
}
// A test's background writes finish inside it: none lands in the next test's fresh storage.
afterEach(async () => { unblock?.(); await cryptIdleForTests(); });
/** The stored document (account preferences hold sealed values: only its layout is readable). */
const stored = (key: string) => JSON.parse(localStorage.getItem(key)!) as { v: 1; a: Record<string, unknown> };
/** Shows an account and waits until it is open (account preferences are encrypted: they open asynchronously). */
async function showOpen(id: string): Promise<void> { show(id); await cryptReady(); await cryptIdleForTests(); }

beforeEach(async () => { boot(); resetPrefs(); await showOpen(UID); });

describe('declaring: registered keys only, with their registered sign-out rule', () => {
  it('an unregistered key, or a kept key declared as purged (and the reverse), is refused', () => {
    expect(() => accountPref('hub_not_registered_v1', parseList)).toThrow('STORE_UNREGISTERED');
    expect(() => accountPref('hub_guide_v1', parseGuide)).toThrow('STORE_UNREGISTERED');
    expect(() => accountPref('hub_qcmd_v1', parseList, { scope: 'account+computer', keepAtSignOut: true })).toThrow('STORE_UNREGISTERED');
    expect(() => localSetting('hub_boot_token_ttl_days')).toThrow('STORE_UNREGISTERED');
    expect(() => localSetting('hub_notify:{uid}:alerts', { keepAtSignOut: true })).toThrow('STORE_UNREGISTERED');
    expect(() => localSetting('hub_notify:x:alerts', { account: true, keepAtSignOut: true })).toThrow('STORE_UNREGISTERED');
    expect(() => accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true })).not.toThrow();
    expect(() => localSetting('hub_boot_token_ttl_days', { keepAtSignOut: true })).not.toThrow();
  });
});

describe('accountPref', () => {
  it('reads an older stored value of hub_guide_v1 for the shown account only, member by member, fail-closed', async () => {
    localStorage.setItem('hub_guide_v1', JSON.stringify({ v: 1, a: { [UID]: { cl: 'codex', hid: 1, seen: 1 }, [OTHER]: { cl: 'claude', hid: 0 } } }));
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    expect(g.get()).toEqual({ cl: 'codex', hid: 1 });
    await showOpen(OTHER);
    expect(g.get()).toEqual({ cl: 'claude', hid: 0 });
    await cryptIdleForTests(); // migrated (sealed in place): plaintext under it is not read again
    localStorage.setItem('hub_guide_v1', JSON.stringify({ v: 1, a: { [OTHER]: { cl: 'evil', hid: 'yes' } } }));
    expect(g.get()).toEqual({ cl: '', hid: 0 });
  });
  it('a foreign document shape reads as the default and is kept (a read never deletes); a throwing parser reads as parse(null)', () => {
    localStorage.setItem('hub_guide_v1', '{"v":2}');
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    expect(g.get()).toEqual({ cl: '', hid: 0 });
    expect(localStorage.getItem('hub_guide_v1')).toBe('{"v":2}');
    const t = accountPref('hub_guide_v1', (v) => { if (v !== null) throw new Error('bad'); return 'default'; }, { keepAtSignOut: true });
    g.set({ cl: 'codex', hid: 0 });
    expect(t.get()).toBe('default');
  });
  it('set writes this account only, sealed; another account sees its own default', async () => {
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    expect(g.set({ cl: 'cursor', hid: 0 })).toBe(true);
    await cryptIdleForTests();
    expect(Object.keys(stored('hub_guide_v1').a)).toEqual([UID]);
    expect(localStorage.getItem('hub_guide_v1')).not.toContain('cursor');
    show(OTHER);
    expect(g.get()).toEqual({ cl: '', hid: 0 });
  });
  it('no shown account: get is the default, set stores nothing', () => {
    boot({ signedIn: false });
    resetPrefs();
    show(null);
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    expect(g.get()).toEqual({ cl: '', hid: 0 });
    expect(g.set({ cl: 'codex', hid: 0 })).toBe(false);
    expect(localStorage.getItem('hub_guide_v1')).toBeNull();
  });
  it('scoped per computer: one value per part; a missing or malformed part stores nothing', () => {
    const h = accountPref('hub_qcmd_v1', parseList, { scope: 'account+computer' });
    expect(h.set(['ls'], 'c1')).toBe(true);
    expect(h.set(['pwd'], 'c2')).toBe(true);
    expect(h.get('c1')).toEqual(['ls']);
    expect(h.get('c2')).toEqual(['pwd']);
    expect(h.set(['x'])).toBe(false);
    expect(h.set(['x'], '../bad part')).toBe(false);
    expect(h.get()).toEqual([]);
  });
  it('the browser refused: status unsaved, the value lives for this page (wins over the older stored one) until stored', async () => {
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    g.set({ cl: 'claude', hid: 0 });
    await cryptIdleForTests();
    const undo = blockWrites();
    expect(g.set({ cl: 'codex', hid: 1 })).toBe(true); // accepted; the browser's refusal comes after sealing
    await cryptIdleForTests();
    expect(g.status()).toBe('unsaved');
    expect(g.get()).toEqual({ cl: 'codex', hid: 1 });
    show(OTHER);
    expect(g.get()).toEqual({ cl: '', hid: 0 });
    undo();
    await showOpen(UID);
    expect(g.set({ cl: 'cursor', hid: 0 })).toBe(true);
    expect(g.get()).toEqual({ cl: 'cursor', hid: 0 });
    await cryptIdleForTests();
    expect(g.status()).toBe('ok');
  });
  it('sign-out removes purge keys (clearAuthTokens) and their page-only values; kept keys stay', async () => {
    const h = accountPref('hub_qcmd_v1', parseList, { scope: 'account+computer' });
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    h.set(['ls'], 'c1');
    g.set({ cl: 'codex', hid: 0 });
    await cryptIdleForTests();
    const undo = blockWrites();
    h.set(['secret-free'], 'c2');
    await cryptIdleForTests();
    undo();
    clearAuthTokens();
    expect(localStorage.getItem('hub_qcmd_v1')).toBeNull();
    expect(localStorage.getItem('hub_guide_v1')).not.toBeNull();
    resetRealm(); // the purge ended the account in this page: signing back in is a new page
    await showOpen(UID); // the same person signing back in
    expect(h.get('c1')).toEqual([]);
    expect(h.get('c2')).toEqual([]);
    expect(g.get()).toEqual({ cl: 'codex', hid: 0 });
  });
  it('the same stored value gives the same object (stable for React)', () => {
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    g.set({ cl: 'codex', hid: 0 });
    expect(g.get()).toBe(g.get());
  });
});

describe('useAccountPref', () => {
  it('renders the value, re-renders on set, on another tab’s write and on an account change', async () => {
    const seen: Guide[] = [];
    let setter: ((v: Guide) => boolean) | null = null;
    function Probe() { const [v, set] = useAccountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true }); seen.push(v); setter = set; return null; }
    render(<Probe />);
    expect(seen.at(-1)).toEqual({ cl: '', hid: 0 });
    // Another tab's sealed value: made here first, then replayed as that tab's write.
    act(() => { setter!({ cl: 'claude', hid: 1 }); });
    await act(() => cryptIdleForTests());
    const tab2 = localStorage.getItem('hub_guide_v1')!;
    act(() => { setter!({ cl: 'codex', hid: 0 }); });
    expect(seen.at(-1)).toEqual({ cl: 'codex', hid: 0 });
    await act(() => cryptIdleForTests());
    await act(async () => {
      localStorage.setItem('hub_guide_v1', tab2);
      window.dispatchEvent(new StorageEvent('storage', { key: 'hub_guide_v1', storageArea: localStorage }));
      await cryptIdleForTests();
    });
    expect(seen.at(-1)).toEqual({ cl: 'claude', hid: 1 });
    await act(() => showOpen(OTHER));
    expect(seen.at(-1)).toEqual({ cl: '', hid: 0 });
  });
});

describe('a deferred write lands only in the account it was made under', () => {
  it('the setter binds the account it rendered under: after a switch it writes nothing and says moved, not unsaved', async () => {
    let setter: ((v: Guide) => boolean) | null = null;
    let writer: ((v: Guide) => string) | null = null;
    function Probe() { const [, set, write] = useAccountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true }); setter = set; writer = write; return null; }
    render(<Probe />);
    const heldSet = setter!, heldWrite = writer!;
    act(() => { show(OTHER); });
    // A debounced or unmount flush of the old account's change, after the switch.
    let r!: boolean, w!: string;
    act(() => { r = heldSet({ cl: 'codex', hid: 1 }); w = heldWrite({ cl: 'codex', hid: 1 }); });
    expect(r).toBe(true);
    expect(w).toBe('moved');
    expect(localStorage.getItem('hub_guide_v1')).toBeNull();
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    expect(g.get()).toEqual({ cl: '', hid: 0 });
    show(UID);
    expect(g.get()).toEqual({ cl: '', hid: 0 });
    // The setter of the new render writes the account it shows (once it is open).
    await act(() => showOpen(OTHER));
    act(() => { w = writer!({ cl: 'cursor', hid: 0 }); });
    expect(w).toBe('stored');
    await act(() => cryptIdleForTests());
    expect(Object.keys(stored('hub_guide_v1').a)).toEqual([OTHER]);
    expect(localStorage.getItem('hub_guide_v1')).not.toContain('cursor');
  });
  it('quota stays distinct: the refusal arrives after sealing, as status unsaved (moved stays silent)', async () => {
    let writer: ((v: Guide) => string) | null = null;
    function Probe() { const [, , write] = useAccountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true }); writer = write; return null; }
    render(<Probe />);
    const undo = blockWrites();
    let w!: string;
    act(() => { w = writer!({ cl: 'claude', hid: 0 }); });
    await act(() => cryptIdleForTests());
    undo();
    expect(w).toBe('stored');
    expect(accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true }).status()).toBe('unsaved');
  });
  it('signed out: a setter rendered with no account refuses; one rendered under an account says moved', () => {
    boot({ signedIn: false });
    resetPrefs();
    show(null);
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    expect(g.write(null, { cl: 'claude', hid: 0 })).toBe('refused');
    expect(g.write(UID, { cl: 'claude', hid: 0 })).toBe('moved');
    expect(localStorage.getItem('hub_guide_v1')).toBeNull();
  });
});

describe('prefs: a held setter through a real sign-out, and scoped setters across a switch', () => {
  it('a setter rendered signed in, flushed after logout() started, writes nothing (moved), kept key included', async () => {
    configureLifecycle({ navigate: () => {}, loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    let writer: ((v: Guide) => string) | null = null, setter: ((v: Guide) => boolean) | null = null;
    let qw: ((v: string[]) => string) | null = null;
    const seen: Guide[] = [];
    function Probe() {
      const [v, set, write] = useAccountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
      const [, , w2] = useAccountPref('hub_qcmd_v1', parseList, { scope: 'account+computer', part: 'c1' });
      seen.push(v); setter = set; writer = write; qw = w2; return null;
    }
    render(<Probe />);
    act(() => { expect(writer!({ cl: 'claude', hid: 0 })).toBe('stored'); });
    await act(() => cryptIdleForTests());
    const before = localStorage.getItem('hub_guide_v1');
    const heldWrite = writer!, heldSet = setter!, heldQ = qw!;
    act(() => { logout(); });
    // The debounced or unmount flush of the signed-in render, after sign-out began.
    let w!: string, r!: boolean, q!: string;
    act(() => { w = heldWrite({ cl: 'codex', hid: 1 }); r = heldSet({ cl: 'codex', hid: 1 }); q = heldQ(['rm -rf']); });
    expect(w).toBe('moved');
    expect(r).toBe(true);
    expect(q).toBe('moved');
    await act(() => cryptIdleForTests());
    // The kept key still holds only what was stored before sign-out; the purged one never got the late value.
    expect(localStorage.getItem('hub_guide_v1')).toBe(before);
    expect(localStorage.getItem('hub_qcmd_v1') ?? '').not.toContain('rm -rf');
    expect(seen.at(-1)).toEqual({ cl: '', hid: 0 }); // once sign-out starts nothing of the account reads
  });
  it('a scoped (per computer) setter is bound to its account: after an account switch it writes nothing; the new render shows the new account', async () => {
    let writer: ((v: string[]) => string) | null = null;
    const seen: string[][] = [];
    function Probe() { const [v, , write] = useAccountPref('hub_qcmd_v1', parseList, { scope: 'account+computer', part: 'c1' }); seen.push(v); writer = write; return null; }
    render(<Probe />);
    act(() => { expect(writer!(['ls'])).toBe('stored'); });
    expect(seen.at(-1)).toEqual(['ls']);
    const held = writer!;
    await act(() => showOpen(OTHER));
    expect(seen.at(-1)).toEqual([]);
    let w!: string;
    act(() => { w = held(['pwd']); });
    expect(w).toBe('moved');
    expect(seen.at(-1)).toEqual([]);
    act(() => { expect(writer!(['top'])).toBe('stored'); });
    expect(seen.at(-1)).toEqual(['top']);
    await act(() => showOpen(UID)); // the account opens again (decrypted when it opens)
    expect(seen.at(-1)).toEqual(['ls']);
  });
});

describe('a Board layout through accountPref (hub_boards_v1)', () => {
  const parseAny = (v: unknown): unknown => v ?? null;
  it('a foreign stored layout reads as the default with reset foreign, is not deleted, and a write reports replacing it', async () => {
    const evil = JSON.stringify({ not: 'this layout' });
    localStorage.setItem('hub_boards_v1', evil);
    const b = accountPref('hub_boards_v1', parseAny, { scope: 'account+realm', keepAtSignOut: true });
    expect(b.get('r1')).toBeNull();
    expect(b.reset('r1')).toBe('foreign');
    expect(localStorage.getItem('hub_boards_v1')).toBe(evil);
    expect(b.report(UID, { boards: [] }, 'r1')).toEqual({ result: 'stored', evicted: { accounts: 0, parts: 0 }, replacedForeign: true });
    await cryptIdleForTests(); // stored in the background
    expect(b.reset('r1')).toBeNull();
  });
  it('an eviction under the kept caps is reported to the writer', () => {
    const b = accountPref('hub_boards_v1', parseAny, { scope: 'account+realm', keepAtSignOut: true });
    for (let i = 0; i < 64; i++) expect(b.report(UID, i, 'r' + i).evicted.parts).toBe(0);
    expect(b.report(UID, 64, 'r64')).toMatchObject({ result: 'stored', evicted: { accounts: 0, parts: 1 } });
  });
});

describe('localSetting', () => {
  it('a global kept setting: get/set/remove, kept at sign-out', () => {
    const ttl = localSetting('hub_boot_token_ttl_days', { keepAtSignOut: true });
    expect(ttl.get()).toBeNull();
    expect(ttl.set('30')).toBe(true);
    expect(localStorage.getItem('hub_boot_token_ttl_days')).toBe('30');
    clearAuthTokens();
    expect(ttl.get()).toBe('30');
    expect(ttl.set(null)).toBe(true);
    expect(ttl.get()).toBeNull();
  });
  it('account keys use the shown account; none known → null and not stored', () => {
    const alerts = localSetting('hub_notify:{uid}:alerts', { account: true, keepAtSignOut: true });
    expect(alerts.set('on')).toBe(true);
    expect(localStorage.getItem(`hub_notify:${UID}:alerts`)).toBe('on');
    show(OTHER);
    expect(alerts.get()).toBeNull();
    boot({ signedIn: false });
    show(null);
    expect(alerts.get()).toBeNull();
    expect(alerts.set('x')).toBe(false);
  });
  it('purged per-account keys go at sign-out; kept ones stay', () => {
    const seen = localSetting('hub_notify_seen:{uid}', { account: true });
    const hints = localSetting('hub_notify:{uid}:hints', { account: true, keepAtSignOut: true });
    const ctor = localSetting('hub_notify:browser:ctor', { keepAtSignOut: true });
    seen.set('n1'); hints.set('off'); ctor.set('1');
    clearAuthTokens();
    expect(localStorage.getItem(`hub_notify_seen:${UID}`)).toBeNull();
    expect(localStorage.getItem(`hub_notify:${UID}:hints`)).toBe('off');
    expect(localStorage.getItem('hub_notify:browser:ctor')).toBe('1');
  });
  it('refused storage: false, the value lives for this page and wins; a purge key’s page value goes at sign-out', () => {
    const seen = localSetting('hub_notify_seen:{uid}', { account: true });
    const hints = localSetting('hub_notify:{uid}:hints', { account: true, keepAtSignOut: true });
    seen.set('old');
    const undo = blockWrites();
    expect(seen.set('new')).toBe(false);
    expect(hints.set('on')).toBe(false);
    undo();
    expect(seen.get()).toBe('new');
    expect(hints.get()).toBe('on');
    clearAuthTokens();
    expect(hints.get()).toBeNull(); // the account ended in this page: its keys read nothing
    resetRealm(); // signing back in is a new page
    show(UID);
    expect(seen.get()).toBeNull();
    expect(hints.get()).toBe('on');
  });
  it('a non-string value is refused', () => {
    const ttl = localSetting('hub_boot_token_ttl_days', { keepAtSignOut: true });
    expect(ttl.set(7 as unknown as string)).toBe(false);
  });
  it('useLocalSetting re-renders on set, another tab’s write and an account change', () => {
    const alerts = localSetting('hub_notify:{uid}:alerts', { account: true, keepAtSignOut: true });
    localStorage.setItem(`hub_notify:${OTHER}:alerts`, 'other');
    const seen: (string | null)[] = [];
    let setter: ((v: string | null) => boolean) | null = null;
    function Probe() { const [v, set] = useLocalSetting(alerts); seen.push(v); setter = set; return null; }
    render(<Probe />);
    expect(seen.at(-1)).toBeNull();
    act(() => { setter!('on'); });
    expect(seen.at(-1)).toBe('on');
    act(() => {
      localStorage.setItem(`hub_notify:${UID}:alerts`, 'tab2');
      window.dispatchEvent(new StorageEvent('storage', { key: `hub_notify:${UID}:alerts`, storageArea: localStorage }));
    });
    expect(seen.at(-1)).toBe('tab2');
    act(() => { show(OTHER); });
    expect(seen.at(-1)).toBe('other');
  });
});

describe('an account ended by any purge writes nothing; the signed-out default is one stable object', () => {
  it('after endAccount (a 401 purge, another tab): report/put and an account setting write nothing while account() still names it', async () => {
    boot();
    resetPrefs();
    await showOpen(UID);
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    const s = localSetting('hub_bots_hide_tasks');
    expect(g.write(UID, { cl: 'claude', hid: 0 })).toBe('stored');
    await cryptIdleForTests(); // sealed and stored in the background
    const before = localStorage.getItem('hub_guide_v1');
    const { endAccount } = await import('./realm');
    // The account ends without logout() (no loggingOut()); the identity is still shown until the page leaves.
    endAccount('expired');
    show(UID);
    expect(g.write(UID, { cl: 'codex', hid: 1 })).toBe('moved');
    expect(g.set({ cl: 'codex', hid: 1 })).toBe(false);
    expect(localStorage.getItem('hub_guide_v1')).toBe(before);
    expect(s.set('1')).toBe(false);
  });
  it('signed out: get() hands back the same default object every time, and a rendered hook does not loop', () => {
    boot({ signedIn: false });
    resetPrefs();
    show(null);
    const fresh = (raw: unknown): { list: string[] } => ({ list: Array.isArray(raw) ? (raw as string[]) : [] });
    const p = accountPref('hub_guide_v1', fresh, { keepAtSignOut: true });
    expect(p.get()).toBe(p.get());
    const seen: Array<{ list: string[] }> = [];
    function Probe() { const [v] = useAccountPref('hub_guide_v1', fresh, { keepAtSignOut: true }); seen.push(v); return null; }
    expect(() => render(<Probe />)).not.toThrow();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((v) => v === seen[0])).toBe(true);
  });
});

describe('encrypted account preferences', () => {
  it('a write refused while the account opens keeps no page copy: the saved value shows once open, and the next edit starts from it', async () => {
    const v = memoryVault();
    resetCryptForTests(v);
    await showOpen(UID);
    expect(accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true }).set({ cl: 'codex', hid: 1 })).toBe(true);
    await cryptIdleForTests();
    // A new page: the account is still opening when the user edits.
    resetCryptForTests(v);
    resetPrefs();
    const g = accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true });
    expect(g.status()).toBe('loading');
    expect(g.write(UID, { cl: 'cursor', hid: 0 })).toBe('refused');
    expect(g.get()).toEqual({ cl: '', hid: 0 });
    await cryptReady();
    await cryptIdleForTests();
    expect(g.get()).toEqual({ cl: 'codex', hid: 1 }); // the saved value, not a page copy made from the default
    expect(g.set({ ...g.get(), hid: 0 })).toBe(true); // the second edit, after it opened
    await cryptIdleForTests();
    resetCryptForTests(v);
    resetPrefs();
    await showOpen(UID);
    expect(accountPref('hub_guide_v1', parseGuide, { keepAtSignOut: true }).get()).toEqual({ cl: 'codex', hid: 0 });
  });

  it('Forget drops this page\u2019s copies of the account, in this tab and in a tab that hears it, so none is stored again', async () => {
    const parseAny = (x: unknown): unknown => x ?? null;
    const n = accountPref('hub_guide_v1', parseAny, { keepAtSignOut: true });
    for (const via of ['this tab', 'another tab']) {
      expect(n.write(UID, 'x'.repeat(VALUE_MAX + 1))).toBe('page'); // refused whole: a page-only copy
      expect(n.get()).toBe('x'.repeat(VALUE_MAX + 1));
      if (via === 'this tab') expect(await forgetThisBrowser()).toBe(true);
      else {
        const ch = new BroadcastChannel('hoody-hub-crypt');
        ch.postMessage({ type: 'forget', uid: UID });
        ch.close();
        await new Promise((r) => setTimeout(r, 30));
      }
      await cryptReady();
      await cryptIdleForTests();
      expect(n.get()).toBeNull();
    }
  });
});

describe('ACCOUNT_PREF_KEYS (the encrypted store learns these keys at load)', () => {
  it('opening an account migrates old plaintext of a listed key before any page asks for it', async () => {
    localStorage.setItem('hub_home_v1', JSON.stringify({ v: 1, a: { [OTHER]: { h: 'plain-home' } } }));
    await showOpen(OTHER); // nothing in this test declares hub_home_v1
    expect(localStorage.getItem('hub_home_v1')).not.toContain('plain-home');
  });
  it('lists every accountPref key the pages use, with the scope and keepAtSignOut they pass, and only those', () => {
    const files = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const used: Record<string, { scope: string; keepAtSignOut: boolean }> = {};
    for (const [f, src] of Object.entries(files)) {
      if (/\.(test|spec)\.tsx?$/.test(f) || f === './prefs.ts' || f.endsWith('/conformance.allow.ts') || f.endsWith('/core/prefs.ts')) continue; // the definitions; allowlist rows quote calls
      const consts = new Map([...src.matchAll(/const ([A-Za-z_$][\w$]*) = (['"])([a-z0-9_]+)\2/g)].map((m) => [m[1], m[3]] as [string, string]));
      // Every call counts: one whose key is not a quoted literal or a string constant of the file fails the check.
      for (const m of src.matchAll(/\b(?:useAccountPref|accountPref|usePrefStatus|usePrefUpdate)(?:<[^>(]*>)?\(([^;]*)/g)) {
        const arg = /^\s*(?:'([a-z0-9_]+)'|"([a-z0-9_]+)"|([A-Za-z_$][\w$]*))\s*[,)]/.exec(m[1] as string);
        const key = arg ? (arg[1] ?? arg[2] ?? consts.get(arg[3] as string)) : undefined;
        expect(key, f + ': an accountPref call whose key the check cannot read: ' + (m[0] as string).slice(0, 80)).toBeTruthy();
        const rest = m[1] as string;
        const opts = { scope: /scope: '([a-z+]+)'/.exec(rest)?.[1] ?? 'account', keepAtSignOut: /keepAtSignOut: true/.test(rest) };
        if (used[key as string]) expect(opts, f).toEqual(used[key as string]);
        used[key as string] = opts;
      }
    }
    expect(Object.keys(used).length).toBeGreaterThan(3); // the scan found the pages
    for (const [key, o] of Object.entries(used)) expect(ACCOUNT_PREF_KEYS[key], key).toEqual(o);
    for (const key of Object.keys(ACCOUNT_PREF_KEYS)) if (key !== 'hub_guide_v1') expect(used[key], key + ' is listed but no page uses it').toBeTruthy();
  });
});

describe('page-only values of kept keys after the account goes', () => {
  // A value this browser will not store (over VALUE_MAX here) lives only in this page: a page-only value.
  const big = () => ({ b: 'x'.repeat(VALUE_MAX) });
  const kept = () => accountPref('hub_boards_v1', (v: unknown) => v, { scope: 'account+realm', keepAtSignOut: true });

  it('counted by pendingPrefWrites() while shown; once sign-out begins it is not read, and the purge drops it', async () => {
    const b = kept();
    expect(b.set(big(), 'r1')).toBe(false);
    expect(b.get('r1')).toEqual(big());
    expect(pendingPrefWrites()).toBe(1);
    startLoggingOut();
    expect(b.get('r1')).toBeNull();
    clearAuthTokens();
    expect(b.get('r1')).toBeNull();
    expect(pendingPrefWrites()).toBe(0);
  });

  it('another account shown: the page-only value of the one before goes (it does not come back with that account)', async () => {
    const b = kept();
    expect(b.set(big(), 'r1')).toBe(false);
    await showOpen(OTHER);
    expect(pendingPrefWrites()).toBe(0);
    await showOpen(UID);
    expect(b.get('r1')).toBeNull();
  });
});

describe('browser settings of the account after sign-out begins', () => {
  it('an account key reads nothing once sign-out begins (the identity still shown)', () => {
    const hints = localSetting('hub_notify:{uid}:hints', { account: true, keepAtSignOut: true });
    expect(hints.set('on')).toBe(true);
    expect(hints.get()).toBe('on');
    startLoggingOut();
    expect(hints.get()).toBeNull();
  });
});

describe('pageCopy() says whether get() shows this page\'s own copy', () => {
  it('true only while a refused write is kept for this page; never after a switch, an accepted write or Forget, and the stored value reads ok again', async () => {
    const h = accountPref('hub_home_v1', (v: unknown) => v);
    expect(h.pageCopy()).toBe(false);
    expect(h.write(UID, { small: 1 })).toBe('stored');
    await cryptIdleForTests();
    expect(h.pageCopy()).toBe(false);
    const big = 'x'.repeat(VALUE_MAX + 1);
    expect(h.write(UID, big)).toBe('page');
    expect(h.pageCopy()).toBe(true);
    expect(h.get()).toBe(big);
    expect(h.status()).toBe('oversized');
    await showOpen(OTHER);
    expect(h.pageCopy()).toBe(false);
    await showOpen(UID);
    expect(h.pageCopy()).toBe(false);
    expect(h.status()).toBe('ok');
    expect(h.get()).toEqual({ small: 1 });
    expect(h.write(UID, big)).toBe('page');
    expect(h.pageCopy()).toBe(true);
    expect(h.write(UID, { small: 2 })).toBe('stored');
    expect(h.pageCopy()).toBe(false);
    await cryptIdleForTests();
    expect(h.write(UID, big)).toBe('page');
    expect(await forgetThisBrowser()).toBe(true);
    expect(h.pageCopy()).toBe(false);
    await cryptReady();
    await cryptIdleForTests();
    expect(h.status()).toBe('locked'); // what Forget leaves, not 'oversized'
    expect(h.get()).toBeNull();
  });
  it('once the account is going (sign-out began), no page copy is shown, as get() reads none', async () => {
    const h = accountPref('hub_home_v1', (v: unknown) => v);
    expect(h.write(UID, 'x'.repeat(VALUE_MAX + 1))).toBe('page');
    expect(h.pageCopy()).toBe(true);
    startLoggingOut();
    expect(h.pageCopy()).toBe(false);
    expect(h.get()).toBeNull();
  });
  it('asks about its own slot only: another part, a missing part and another key have no page copy', () => {
    const q = accountPref('hub_qcmd_v1', parseList, { scope: 'account+computer' });
    const h = accountPref('hub_home_v1', (v: unknown) => v);
    expect(q.write(UID, ['x'.repeat(VALUE_MAX + 1)], 'c1')).toBe('page');
    expect(q.pageCopy('c1')).toBe(true);
    expect(q.pageCopy('c2')).toBe(false);
    expect(q.pageCopy()).toBe(false);
    expect(h.pageCopy()).toBe(false);
    expect(q.write(UID, ['ls'], 'c2')).toBe('stored');
    expect(q.pageCopy('c1')).toBe(true); // another part's accepted write leaves this copy
  });
});
