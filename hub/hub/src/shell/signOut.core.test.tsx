// The warned sign-out on the real core: real attempt records in the shared
// change store, core's own hold list (signOutHolds), signOutForgetting, forgetAccountChanges,
// logout and the real shared.js purge. Nothing of core is mocked. The shown set (signOutHolds) goes to
// signOutForgetting(account, shown); a hold core finds under its lock that the dialog did not show answers 'changed'; one already stored at the
// press is caught by the press's own clean read (signOutHolds) and re-shown before core is asked. The
// scripts writer's stored asks (real script-asks) are warned about and dropped by signOutForgettingAsks.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdAttempt } from '../core/attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY } from '../core/change-store';
import { guarded } from '../core/changes';
import { setIdentity } from '../core/ctx';
import { configureLifecycle, initLive } from '../core/lifecycle';
import { putScriptAsk, SCRIPT_ASKS_KEY, type ScriptAsk } from '../core/script-asks';
import { shared } from '../core/session';
import { boot, OTHER, R1, settle, UID } from '../core/test/env';
import { installTestLocks, removeTestLocks } from '../core/test/locks';
import { requestSignOut, SignOutConfirm, useSendsKeptAtSignOut } from './signOut';

const stored = (): string[] => (JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]') as Array<{ id: string }>).map((r) => r.id);

/** A booted, signed-in live page whose navigation is recorded, and every purge with what storage held then. */
function tab() {
  boot({ realm: R1 });
  const navs: string[] = [];
  configureLifecycle({ navigate: (u) => navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
  const purges: Array<{ reason: unknown; storedThen: string[] }> = [];
  const s = shared();
  const purge = s.purgeOutgoingSession.bind(s);
  vi.spyOn(s, 'purgeOutgoingSession').mockImplementation((o, info) => {
    purges.push({ reason: (info as { reason?: unknown } | undefined)?.reason, storedThen: stored() });
    return purge(o, info);
  });
  return { navs, purges };
}

/** An attempt held for `base`. By default its request was answered (sent(): the sending stamp ends, the outcome is
 *  unknown, so it may have gone through and a sign-out forgets it). `live`: the request is still out (a live sending
 *  stamp): core flags it `sending` and the sign-out keeps it stored. */
const hold = async (base = 'keys:create', o: { live?: boolean } = {}): Promise<string> => {
  const r = await holdAttempt(base, { by: base });
  if (!r.ok) throw new Error('not held: ' + r.code);
  if (!o.live) r.hold.sent();
  return r.hold.id;
};

/** Another tab's attempt record for this account, as it would sit in the shared store. `sendingAt`: its request is
 *  still out per that tab's stamp (stale when old, live when recent). */
const sibling = (sendingAt?: number) => ({ id: ATTEMPT_PREFIX + UID + '\u0001keys:delete\u0000' + 'd'.repeat(32), pending: true, key: 'hub-d', at: Date.now(), t: Date.now(), meta: { base: 'keys:delete', target: null, realm: null, identity: null, by: 'keys:delete' }, ...(sendingAt === undefined ? {} : { sending: { tab: 'other-tab', at: sendingAt } }) });
const write = (r: { id: string }) => {
  const list = (JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]') as Array<{ id: string }>).filter((x) => x.id !== r.id);
  localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...list, r]));
};

/** What a page that stays after the sign-out (the purge-failed panel) reads. */
function Kept() {
  return <output aria-label="kept">{useSendsKeptAtSignOut()}</output>;
}

const ask = async () => {
  await act(async () => requestSignOut());
  return screen.findByRole('alertdialog', { name: 'Sign out with unconfirmed changes?' });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  installTestLocks();
  delete (window as { HubBootToken?: unknown }).HubBootToken;
});

describe('warned sign-out on the real core', () => {
  it('a held change and Sign out: the account\'s records are forgotten first, then logout purges as a sign-out', async () => {
    const w = tab();
    const id = await hold();
    expect(stored()).toEqual([id]);
    render(<SignOutConfirm />);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/1 change may have gone through/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(w.purges).toEqual([{ reason: 'signout', storedThen: [] }]); // forgotten before the purge ran
    expect(stored()).toEqual([]);
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('a forget that answers false keeps the session and the hold; Cancel, then Sign out asks again and forgets again', async () => {
    const w = tab();
    const id = await hold();
    render(<SignOutConfirm />);
    await ask();
    removeTestLocks(); // tabs cannot coordinate: forgetAccountChanges answers false
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("couldn't stop tracking these changes, so you're still signed in"));
    await settle();
    expect(w.navs).toEqual([]);
    expect(w.purges).toEqual([]);
    expect(stored()).toEqual([id]);
    expect(localStorage.getItem('access_token')).not.toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(stored()).toEqual([id]);
    // The hold is still counted (core keeps it on a failed forget), so the next sign-out asks again.
    installTestLocks();
    const again = await ask();
    expect(again.textContent).toMatch(/1 change may have gone through/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(w.purges).toEqual([{ reason: 'signout', storedThen: [] }]);
    expect(stored()).toEqual([]);
  });

  it('a hold taken while the dialog is open shows in it at once (core\'s attempt notice), before any press', async () => {
    tab();
    await hold();
    render(<SignOutConfirm />);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/1 change may have gone through/);
    await act(async () => { await hold('keys:delete'); });
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/2 changes may have gone through/));
    expect(stored()).toHaveLength(2);
  });

  it('another tab\'s hold written after the press read, before core\'s lock: core answers changed, nothing is forgotten; the next press finishes', async () => {
    const w = tab();
    const mine = await hold();
    render(<SignOutConfirm />);
    await ask();
    // Another tab of the same account admits an attempt after this press read the warning, before the forget's lock
    // runs: storage only (no storage event reaches this tab). Core's locked check must find it and answer 'changed'.
    const theirs = sibling();
    const locks = (navigator as unknown as { locks: { request: (...a: unknown[]) => Promise<unknown> } }).locks;
    const request = locks.request;
    let injected = false;
    locks.request = (...a: unknown[]) => {
      if (!injected) { injected = true; write(theirs); }
      return request(...a);
    };
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/));
    await settle();
    expect(injected).toBe(true);
    expect(w.navs).toEqual([]);
    expect(w.purges).toEqual([]);
    expect(stored().sort()).toEqual([mine, theirs.id].sort());
    expect(localStorage.getItem('access_token')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // The warning re-read storage: both holds show. Pressing for what is shown now finishes.
    expect(screen.getByRole('alertdialog').textContent).toMatch(/2 changes may have gone through/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(w.purges).toEqual([{ reason: 'signout', storedThen: [] }]);
    expect(stored()).toEqual([]);
  });

  it('another tab\'s hold already stored at the press: the press re-shows the warning with the neutral line and forgets nothing', async () => {
    const w = tab();
    const mine = await hold();
    render(<SignOutConfirm />);
    await ask();
    const theirs = sibling();
    write(theirs);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/));
    await settle();
    expect(screen.getByRole('alertdialog').textContent).toMatch(/2 changes may have gone through/);
    expect(w.navs).toEqual([]);
    expect(w.purges).toEqual([]);
    expect(stored().sort()).toEqual([mine, theirs.id].sort());
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });

  // A request still out (a live sending stamp) is kept by the sign-out; the warning
  // names it before the press. Never "removed" or "failed".
  it('a live attempt send is named in the warning before the press; done signs out and leaves it stored', async () => {
    const w = tab();
    const gone = await hold('keys:create');
    const live = await hold('keys:delete', { live: true });
    render(<SignOutConfirm />);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/2 changes may have gone through/);
    expect(dialog.textContent).toMatch(/1 change is still being sent\. Signing out doesn't stop it: it stays on this browser and keeps the same change blocked until its answer comes back\./);
    expect(dialog.textContent).not.toMatch(/removed|failed/i);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(w.purges).toEqual([{ reason: 'signout', storedThen: [live] }]); // the answered one forgotten, the live one kept
    expect(stored()).toEqual([live]);
    expect(stored()).not.toContain(gone);
  });

  it('an answered (stale-stamp) attempt gets no still-being-sent line', async () => {
    tab();
    await hold();
    render(<SignOutConfirm />);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/1 change may have gone through/);
    expect(dialog.textContent).not.toMatch(/still being sent/);
  });

  it('a live change send (this tab\'s, still out) is named too; done forgets the answered change and keeps the live one', async () => {
    const w = tab();
    const META = { base: 'lock:signout.r8', target: null, realm: R1, by: 'q:signout@signout.r8' };
    await guarded('s', 'c1', async () => ({ outcome: 'pending' as const, idem: 'K1' }), META); // answered: may have gone through
    let answer!: (v: { outcome: 'pending'; idem: string }) => void;
    const going = guarded('s', 'c2', () => new Promise<{ outcome: 'pending'; idem: string }>((r) => { answer = r; }), META); // still out
    await settle();
    const ids = stored();
    const live = ids.find((id) => id.endsWith('\u0000c2'));
    expect(ids).toHaveLength(2);
    expect(live).toBeDefined();
    render(<SignOutConfirm />);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/2 changes may have gone through/);
    expect(dialog.textContent).toMatch(/1 change is still being sent/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(w.purges).toEqual([{ reason: 'signout', storedThen: [live] }]);
    expect(stored()).toEqual([live]);
    answer({ outcome: 'pending', idem: 'K2' });
    await act(async () => { await going; });
  });

  // Another tab's stale stamp renewed (same record, same token) before the press.
  it('a shown hold whose other tab renews its stamp before the press: re-shown as still being sent, nothing forgotten', async () => {
    const w = tab();
    const mine = await hold();
    const stale = sibling(1); // its tab stopped beating: shown, not a send still out
    write(stale);
    render(<SignOutConfirm />);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/2 changes may have gone through/);
    expect(dialog.textContent).not.toMatch(/still being sent/);
    write(sibling(Date.now())); // the heartbeat comes back: storage only, no notice here
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/1 change is still being sent/));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/);
    expect(screen.getByRole('alertdialog').textContent).toMatch(/stops tracking 1 of them/);
    await settle();
    expect(w.navs).toEqual([]);
    expect(w.purges).toEqual([]);
    expect(stored().sort()).toEqual([mine, stale.id].sort());
  });
  // A shown send still out whose answer comes back before the press (same record, its stamp
  // ends, no notice here): core forgets it with the rest, and no page says it stays.
  it('a shown live send that settles before the press is forgotten by done and not counted as kept', async () => {
    const w = tab();
    const live = sibling(Date.now());
    write(live);
    render(<><SignOutConfirm /><Kept /></>);
    const dialog = await ask();
    expect(dialog.textContent).toMatch(/1 change is still being sent/);
    const settled = { ...live, sending: { tab: 'other-tab', at: 1 } }; // its tab answered and stopped beating
    write(settled); // storage only, no notice here
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(w.purges).toEqual([{ reason: 'signout', storedThen: [] }]);
    expect(stored()).toEqual([]);
    expect(screen.getByLabelText('kept').textContent).toBe('0');
  });
});

describe('warned sign-out on the real core: questions to the assistant', () => {
  const askRec = (askId: string, o: Partial<ScriptAsk> = {}): ScriptAsk => ({
    askId, compId: 'comp-1', path: 'scripts/a.ts', realm: R1, owner: null, sessionId: null, turnId: null,
    phase: 'create', sentAt: 1000, createKey: 'hub-ck-' + askId, turnKey: 'hub-tk-' + askId, ...o,
  });
  const asksStored = () => (JSON.parse(localStorage.getItem(SCRIPT_ASKS_KEY) ?? 'null') as { accounts: Record<string, ScriptAsk[]> } | null)?.accounts ?? {};
  const askDialog = async () => {
    await act(async () => requestSignOut());
    return screen.findByRole('alertdialog', { name: 'Sign out while the assistant may still answer?' });
  };

  it("a stored ask and Sign out: this account's asks are dropped, then logout purges as a sign-out; another account's stay", async () => {
    const w = tab();
    await settle();
    setIdentity({ id: OTHER, banned: false });
    expect(await putScriptAsk(askRec('o1'), null)).toBe('ok');
    setIdentity({ id: UID, banned: false });
    expect(await putScriptAsk(askRec('a1'), null)).toBe('ok');
    render(<SignOutConfirm />);
    const dialog = await askDialog();
    expect(dialog.textContent).toMatch(/1 question to the assistant may still be answered/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(w.purges.map((p) => p.reason)).toEqual(['signout']);
    expect(asksStored()[UID] ?? []).toEqual([]);
    expect(asksStored()[OTHER]).toEqual([askRec('o1')]);
  });

  it('an ask another tab stored after the warning (storage only): the press shows it, drops nothing; the next press drops both', async () => {
    const w = tab();
    await settle();
    expect(await putScriptAsk(askRec('a1'), null)).toBe('ok');
    render(<SignOutConfirm />);
    await askDialog();
    // Another tab's write: storage only, no storage event reaches this tab.
    const v = JSON.parse(localStorage.getItem(SCRIPT_ASKS_KEY)!) as { v: 1; accounts: Record<string, ScriptAsk[]> };
    v.accounts[UID] = [...v.accounts[UID]!, askRec('a2', { sentAt: 2000 })];
    localStorage.setItem(SCRIPT_ASKS_KEY, JSON.stringify(v));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toMatch(/2 questions to the assistant/));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Something changed on this browser while you were deciding/);
    await settle();
    expect(w.navs).toEqual([]);
    expect(asksStored()[UID]).toHaveLength(2);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(asksStored()[UID] ?? []).toEqual([]);
  });
});
