// A page's unsaved work (core switch-guard.ts) in the shell's two questions, on the real core.
// The realm switch's leave question (LeaveConfirm) and the sign-out warning (signOut.tsx) show each guard's sentence;
// a guard answering null adds no dialog, and an unregistered one is never shown.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askLeave, holdLeave } from '../core/leave';
import { realm as selected } from '../core/ctx';
import { switchTo } from '../core/realm';
import { registerSwitchGuard } from '../core/switch-guard';
import { configureLifecycle, initLive } from '../core/lifecycle';
import { shared } from '../core/session';
import { boot, onFetch, R1, R2 } from '../core/test/env';
import { installTestLocks } from '../core/test/locks';
import strings from './strings.en.json';
import { requestSignOut, SignOutConfirm } from './signOut';
import { LeaveConfirm } from './LeaveConfirm';

const LOSS = "Leave New script? Your changes here aren't kept: what you typed.";
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
const offs: Array<() => void> = [];
const releases: Array<() => void> = [];
afterEach(() => {
  while (releases.length) releases.pop()!();
  while (offs.length) offs.pop()!();
  cleanup();
  vi.restoreAllMocks();
  installTestLocks();
  delete (window as { HubBootToken?: unknown }).HubBootToken;
});

describe('the realm switch question names unsaved work', () => {
  it('a dirty draft, nothing running: the question shows its sentence; Stay answers false', async () => {
    tab();
    render(<LeaveConfirm />);
    offs.push(registerSwitchGuard(() => LOSS));
    let answer: Promise<boolean> = Promise.resolve(true);
    await act(async () => { answer = askLeave(); });
    const d = await screen.findByRole('alertdialog', { name: strings['leave.unsavedTitle'] });
    expect(d).toHaveTextContent(LOSS);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['leave.stay'] })); });
    expect(await answer).toBe(false);
  });

  it('Go on anyway answers true', async () => {
    tab();
    render(<LeaveConfirm />);
    offs.push(registerSwitchGuard(() => LOSS));
    let answer: Promise<boolean> = Promise.resolve(false);
    await act(async () => { answer = askLeave(); });
    await screen.findByRole('alertdialog', { name: strings['leave.unsavedTitle'] });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['leave.confirm'] })); });
    expect(await answer).toBe(true);
  });

  it('a guard answering null: no dialog, the switch goes on', async () => {
    tab();
    render(<LeaveConfirm />);
    offs.push(registerSwitchGuard(() => null));
    let ok = false;
    await act(async () => { ok = await askLeave(); });
    expect(ok).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

// Through a real realm switch: Go on anyway confirms only what was shown, and a question
// whose last loss goes away settles instead of waiting with nothing shown.
describe('the realm switch question follows the guards while it waits', () => {
  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  function switching() {
    tab();
    onFetch(() => ({ status: 200, body: {} }));
    let done: boolean | null = null;
    return { start: () => { void switchTo(R2).then((ok) => { done = ok; }); }, done: () => done };
  }

  it('running work shown, a loss named after the dialog opened: the press shows it and does not switch; a second press does', async () => {
    const sw = switching();
    render(<LeaveConfirm />);
    releases.push(holdLeave('upload'));
    let said: string | null = null;
    offs.push(registerSwitchGuard(() => said));
    await act(async () => { sw.start(); await wait(); });
    const d = await screen.findByRole('alertdialog', { name: strings['leave.title'] });
    expect(d).not.toHaveTextContent(LOSS);
    said = LOSS;
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: strings['leave.confirm'] })); await wait(); });
    expect(sw.done()).toBeNull();
    expect(selected()).toBe(R1);
    const again = await screen.findByRole('alertdialog');
    expect(again).toHaveTextContent(LOSS);
    await act(async () => { fireEvent.click(within(again).getByRole('button', { name: strings['leave.confirm'] })); await wait(); });
    expect(sw.done()).toBe(true);
    expect(selected()).toBe(R2);
  });

  it('the dialog itself answers nothing for a loss it never showed (askLeave alone, no switch re-check behind it)', async () => {
    tab();
    render(<LeaveConfirm />);
    releases.push(holdLeave('upload'));
    let said: string | null = null;
    offs.push(registerSwitchGuard(() => said));
    let answered: boolean | null = null;
    await act(async () => { void askLeave().then((ok) => { answered = ok; }); await wait(); });
    const d = await screen.findByRole('alertdialog', { name: strings['leave.title'] });
    said = LOSS;
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: strings['leave.confirm'] })); await wait(); });
    expect(answered).toBeNull();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(LOSS);
  });

  it('a caller that stopped wanting its answer gets Stay, not go on, when the last loss goes', async () => {
    tab();
    render(<LeaveConfirm />);
    const off = registerSwitchGuard(() => LOSS);
    let wanted = true;
    let answered: boolean | null = null;
    await act(async () => { void askLeave(() => wanted).then((ok) => { answered = ok; }); await wait(); });
    await screen.findByRole('alertdialog', { name: strings['leave.unsavedTitle'] });
    wanted = false;
    await act(async () => { off(); await wait(); });
    expect(answered).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a loss-only question whose guard unregisters (the page unmounted): the switch goes on, no dialog left', async () => {
    const sw = switching();
    render(<LeaveConfirm />);
    const off = registerSwitchGuard(() => LOSS);
    await act(async () => { sw.start(); await wait(); });
    await screen.findByRole('alertdialog', { name: strings['leave.unsavedTitle'] });
    await act(async () => { off(); await wait(); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sw.done()).toBe(true);
    expect(selected()).toBe(R2);
  });

  it('a loss that clears while its question waits behind the sign-out confirm: once that closes, the switch goes on', async () => {
    const sw = switching();
    render(<><SignOutConfirm /><LeaveConfirm /></>);
    let said: string | null = LOSS;
    offs.push(registerSwitchGuard(() => said));
    await act(async () => requestSignOut());
    const so = await screen.findByRole('alertdialog');
    await act(async () => { sw.start(); await wait(); });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    said = null;
    await act(async () => { fireEvent.keyDown(so, { key: 'Escape', code: 'Escape' }); await wait(); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sw.done()).toBe(true);
    expect(selected()).toBe(R2);
  });
});

describe('sign-out lists unsaved work', () => {
  it('a dirty draft alone opens the warning with its sentence; Cancel signs nothing out', async () => {
    const w = tab();
    render(<SignOutConfirm />);
    offs.push(registerSwitchGuard(() => LOSS));
    await act(async () => requestSignOut());
    const d = await screen.findByRole('alertdialog', { name: strings['leave.unsavedTitle'] });
    expect(d).toHaveTextContent(LOSS);
    expect(d).not.toHaveTextContent(strings['signout.plainBody']);
    await act(async () => { fireEvent.keyDown(d, { key: 'Escape', code: 'Escape' }); });
    expect(w.purges).toEqual([]);
  });

  it('a draft that turns dirty while the warning is open: the press re-shows it and signs nothing out', async () => {
    const w = tab();
    render(<SignOutConfirm />);
    let said: string | null = null;
    offs.push(registerSwitchGuard(() => said));
    offs.push(registerSwitchGuard(() => 'Something else unsaved.'));
    await act(async () => requestSignOut());
    const d = await screen.findByRole('alertdialog');
    expect(d).not.toHaveTextContent(LOSS);
    said = LOSS;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['signout.confirm'] })); });
    expect(w.purges).toEqual([]);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(LOSS);
  });

  // The two late-loss paths, each on its own: the press's own re-read answers at once (core's store lock still held,
  // so core's check cannot have run); core's check catches a loss named while it waits for that lock.
  const holdStore = (): (() => void) => {
    let unlock: () => void = () => undefined;
    const held = new Promise<void>((r) => { unlock = r; });
    void (navigator as unknown as { locks: { request: (n: string, cb: () => Promise<void>) => Promise<void> } }).locks.request('hub_changes', () => held);
    return unlock;
  };

  it('a loss named before the press: the press re-shows the warning at once, without waiting for core', async () => {
    const w = tab();
    render(<SignOutConfirm />);
    let said: string | null = null;
    offs.push(registerSwitchGuard(() => said));
    offs.push(registerSwitchGuard(() => 'Something else unsaved.'));
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog');
    const unlock = holdStore();
    said = LOSS;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['signout.confirm'] })); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole('alertdialog')).toHaveTextContent(LOSS);
    await act(async () => { unlock(); await new Promise((r) => setTimeout(r, 50)); });
    expect(w.purges).toEqual([]);
  });

  it('a loss named while core waits for the store lock after the press: no sign-out, the warning comes back with it', async () => {
    const w = tab();
    render(<SignOutConfirm />);
    let said: string | null = null;
    offs.push(registerSwitchGuard(() => said));
    offs.push(registerSwitchGuard(() => 'Something else unsaved.'));
    await act(async () => requestSignOut());
    await screen.findByRole('alertdialog');
    const unlock = holdStore();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['signout.confirm'] })); await new Promise((r) => setTimeout(r, 20)); });
    said = LOSS;
    await act(async () => { unlock(); await new Promise((r) => setTimeout(r, 50)); });
    expect(w.purges).toEqual([]);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(LOSS);
  });

  it('a guard answering null, and one unregistered before the press: sign-out goes straight through, no dialog', async () => {
    const w = tab();
    render(<SignOutConfirm />);
    offs.push(registerSwitchGuard(() => null));
    const off = registerSwitchGuard(() => LOSS);
    off();
    await act(async () => { requestSignOut(); await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(w.purges.length).toBeGreaterThan(0);
  });
});
