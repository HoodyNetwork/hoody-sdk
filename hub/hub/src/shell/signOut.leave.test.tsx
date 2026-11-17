// Work running from this tab joins the one sign-out warning (signOut.tsx), on the real core. Running work
// opens the dialog; a press that finds more running than the dialog said re-shows it and signs nothing out.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askLeave, holdLeave } from '../core/leave';
import { holdAttempt } from '../core/attempts';
import { bump } from '../core/ctx';
import { configureLifecycle, initLive } from '../core/lifecycle';
import { shared } from '../core/session';
import { boot, R1 } from '../core/test/env';
import { installTestLocks } from '../core/test/locks';
import { interpolate } from '@kit';
import strings from './strings.en.json';
import { requestSignOut, SignOutConfirm } from './signOut';
import { LeaveConfirm } from './LeaveConfirm';

function tab() {
  boot({ realm: R1 });
  configureLifecycle({ navigate: () => undefined, loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
  const purges: unknown[] = [];
  const s = shared();
  const purge = s.purgeOutgoingSession.bind(s);
  vi.spyOn(s, 'purgeOutgoingSession').mockImplementation((o, info) => { purges.push(info); return purge(o, info); });
  return { purges };
}
const releases: Array<() => void> = [];
afterEach(() => {
  while (releases.length) releases.pop()!();
  cleanup();
  vi.restoreAllMocks();
  installTestLocks();
  delete (window as { HubBootToken?: unknown }).HubBootToken;
});

describe('sign-out warns about work running from this tab', () => {
  it('running work alone opens the one dialog; Cancel signs nothing out', async () => {
    const w = tab();
    render(<SignOutConfirm />);
    releases.push(holdLeave('upload'));
    await act(async () => requestSignOut());
    const d = await screen.findByRole('alertdialog', { name: strings['leave.title'] });
    expect(d).toHaveTextContent(interpolate(strings['leave.body_one'], { count: 1 }));
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    await act(async () => { fireEvent.keyDown(d, { key: 'Escape', code: 'Escape' }); });
    expect(w.purges).toEqual([]);
  });

  it('work that starts while the dialog is open: the press re-shows the warning and signs nothing out', async () => {
    const w = tab();
    render(<SignOutConfirm />);
    const r = await holdAttempt('keys:create', { by: 'keys:create' });
    if (!r.ok) throw new Error('not held');
    r.hold.sent();
    await act(async () => requestSignOut());
    const d = await screen.findByRole('alertdialog');
    expect(d).not.toHaveTextContent(interpolate(strings['leave.body_one'], { count: 1 }));
    releases.push(holdLeave('upload'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['signout.confirm'] })); });
    expect(w.purges).toEqual([]);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(interpolate(strings['leave.body_one'], { count: 1 }));
  });

  it('running work and Sign out: signs out (the work is cut by the sign-out)', async () => {
    const w = tab();
    render(<SignOutConfirm />);
    releases.push(holdLeave('upload'));
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog', { name: strings['leave.title'] });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['signout.confirm'] })); await new Promise((r) => setTimeout(r, 50)); });
    expect(w.purges.length).toBeGreaterThan(0);
  });

  it("a realm switch's leave question while the sign-out confirm is up waits: one dialog, then it shows", async () => {
    tab();
    render(<><SignOutConfirm /><LeaveConfirm /></>);
    releases.push(holdLeave('upload'));
    await act(async () => requestSignOut());
    const d = await screen.findByRole('alertdialog');
    let answered: boolean | null = null;
    // The switch's probe ends while the sign-out confirm is up: core asks (realm.ts beginSwitch).
    await act(async () => { void askLeave().then((ok) => { answered = ok; }); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(within(d).getByRole('button', { name: strings['signout.confirm'] })).toBeTruthy();
    await act(async () => { fireEvent.keyDown(d, { key: 'Escape', code: 'Escape' }); await new Promise((r) => setTimeout(r, 20)); });
    const q = await screen.findByRole('alertdialog');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    await act(async () => { fireEvent.click(within(q).getByRole('button', { name: strings['leave.stay'] })); await new Promise((r) => setTimeout(r, 20)); });
    expect(answered).toBe(false);
  });
});

describe('sign-out: work that starts while core forgets', () => {
  it('the store lock held, work starts after the press: no sign-out, the warning comes back with the new count', async () => {
    const w = tab();
    render(<SignOutConfirm />);
    releases.push(holdLeave('upload'));
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog', { name: strings['leave.title'] });
    let unlock: () => void = () => undefined;
    const held = new Promise<void>((r) => { unlock = r; });
    void (navigator as unknown as { locks: { request: (n: string, cb: () => Promise<void>) => Promise<void> } }).locks.request('hub_changes', () => held);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['signout.confirm'] })); await new Promise((r) => setTimeout(r, 20)); });
    releases.push(holdLeave('upload'));
    await act(async () => { unlock(); await new Promise((r) => setTimeout(r, 50)); });
    expect(w.purges).toEqual([]);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(interpolate(strings['leave.body_other'], { count: 2 }));
  });
});

describe('after a refused sign-out, and a question waiting behind it', () => {
  it('confirmed changes forgotten, then refused for new work: never "everything is confirmed", even once the work ends', async () => {
    tab();
    render(<SignOutConfirm />);
    const r = await holdAttempt('keys:create', { by: 'keys:create' });
    if (!r.ok) throw new Error('not held');
    r.hold.sent();
    const first = holdLeave('upload');
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog', { name: strings['signout.title'] });
    let unlock: () => void = () => undefined;
    const held = new Promise<void>((res) => { unlock = res; });
    void (navigator as unknown as { locks: { request: (n: string, cb: () => Promise<void>) => Promise<void> } }).locks.request('hub_changes', () => held);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['signout.confirm'] })); await new Promise((res) => setTimeout(res, 20)); });
    const second = holdLeave('upload');
    await act(async () => { unlock(); await new Promise((res) => setTimeout(res, 50)); });
    const d = await screen.findByRole('alertdialog');
    expect(d).toHaveTextContent(strings['signout.changed']);
    expect(d).toHaveTextContent(strings['signout.mayForgot']);
    await act(async () => { first(); second(); await new Promise((res) => setTimeout(res, 1100)); });
    const after = screen.getByRole('alertdialog');
    expect(after).not.toHaveTextContent(strings['signout.plainBody']);
    expect(after).toHaveTextContent(strings['signout.mayForgot']);
  });

  it('a question waiting behind the sign-out confirm answers Stay when the sign-out starts, and never shows', async () => {
    const w = tab();
    render(<><SignOutConfirm /><LeaveConfirm /></>);
    releases.push(holdLeave('upload'));
    await act(async () => requestSignOut());
    const d = await screen.findByRole('alertdialog');
    let answered: boolean | null = null;
    await act(async () => { void askLeave().then((ok) => { answered = ok; }); await new Promise((res) => setTimeout(res, 20)); });
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: strings['signout.confirm'] })); await new Promise((res) => setTimeout(res, 50)); });
    expect(w.purges.length).toBeGreaterThan(0);
    expect(answered).toBe(false);
    expect(screen.queryByRole('button', { name: strings['leave.confirm'] })).not.toBeInTheDocument();
  });
});

describe('core says what it forgot; a question ends with its context', () => {
  it('a hold shown as sending that settles while core forgets, then refused: "may already have forgotten", never "confirmed"', async () => {
    tab();
    render(<SignOutConfirm />);
    const r = await holdAttempt('keys:create', { by: 'keys:create' });
    if (!r.ok) throw new Error('not held');
    const first = holdLeave('upload');
    await act(async () => requestSignOut());
    const d0 = await screen.findByRole('alertdialog');
    expect(d0).toHaveTextContent(interpolate(strings['signout.sending_one'], { count: 1 }));
    let unlock: () => void = () => undefined;
    const held = new Promise<void>((res) => { unlock = res; });
    void (navigator as unknown as { locks: { request: (n: string, cb: () => Promise<void>) => Promise<void> } }).locks.request('hub_changes', () => held);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['signout.confirm'] })); await new Promise((res) => setTimeout(res, 20)); });
    const second = holdLeave('upload');
    r.hold.sent();
    await act(async () => { unlock(); await new Promise((res) => setTimeout(res, 50)); });
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(strings['signout.mayForgot']);
    await act(async () => { first(); second(); await new Promise((res) => setTimeout(res, 1100)); });
    const after = screen.getByRole('alertdialog');
    expect(after).not.toHaveTextContent(strings['signout.plainBody']);
    expect(after).toHaveTextContent(strings['signout.mayForgot']);
  });

  it('a question hidden behind the sign-out confirm answers Stay when its context dies (another tab signed out), and never shows', async () => {
    tab();
    render(<><SignOutConfirm /><LeaveConfirm /></>);
    releases.push(holdLeave('upload'));
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog');
    let answered: boolean | null = null;
    await act(async () => { void askLeave().then((ok) => { answered = ok; }); await new Promise((res) => setTimeout(res, 20)); });
    await act(async () => { bump('test'); await new Promise((res) => setTimeout(res, 20)); });
    expect(answered).toBe(false);
    expect(screen.queryByRole('button', { name: strings['leave.confirm'] })).not.toBeInTheDocument();
  });

  it('a context that dies before the dialog first renders still ends the question (captured when asked)', async () => {
    tab();
    render(<LeaveConfirm />);
    releases.push(holdLeave('upload'));
    let answered: boolean | null = null;
    await act(async () => {
      void askLeave().then((ok) => { answered = ok; });
      bump('test');
      await new Promise((res) => setTimeout(res, 20));
    });
    expect(answered).toBe(false);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('"may have forgotten" only when core removed a shown hold', () => {
  it('every shown hold a send still out (kept, not forgotten), then refused for new work: no "may have forgotten"', async () => {
    tab();
    render(<SignOutConfirm />);
    const r = await holdAttempt('keys:create', { by: 'keys:create' });
    if (!r.ok) throw new Error('not held');
    const first = holdLeave('upload');
    await act(async () => requestSignOut());
    const d0 = await screen.findByRole('alertdialog');
    expect(d0).toHaveTextContent(interpolate(strings['signout.sending_one'], { count: 1 }));
    let unlock: () => void = () => undefined;
    const held = new Promise<void>((res) => { unlock = res; });
    void (navigator as unknown as { locks: { request: (n: string, cb: () => Promise<void>) => Promise<void> } }).locks.request('hub_changes', () => held);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['signout.confirm'] })); await new Promise((res) => setTimeout(res, 20)); });
    const second = holdLeave('upload');
    // The send stays out: core keeps its record, so nothing the person confirmed is forgotten.
    await act(async () => { unlock(); await new Promise((res) => setTimeout(res, 50)); });
    const d = await screen.findByRole('alertdialog');
    expect(d).toHaveTextContent(interpolate(strings['leave.body_other'], { count: 2 }));
    expect(d).not.toHaveTextContent(strings['signout.mayForgot']);
    r.hold.sent();
    await act(async () => { first(); second(); await new Promise((res) => setTimeout(res, 1100)); });
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent(strings['signout.mayForgot']);
  });
});
