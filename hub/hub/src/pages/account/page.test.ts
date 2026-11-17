// Vitest: the account page in every fixture state: what shows, and that a change whose outcome is unknown is
// never sent twice.
import { bootFixtureCore } from '@core';
import { act } from '@testing-library/react';
import { bump } from '@core/ctx';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorKey } from './logic';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

/** The one open sheet or dialog (closed <dialog>s stay in the tree). */
async function openDialog(): Promise<HTMLElement> {
  return waitFor(() => {
    const d = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    if (!d) throw new Error('no open dialog');
    return d;
  });
}

describe('account page', () => {
  it('shows the profile with the account id masked', async () => {
    await renderPage(page);
    expect(await screen.findByText('ada@example.com', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('64f0…0001')).toBeInTheDocument();
    expect(screen.queryByText('64f0ada00000000000000001')).not.toBeInTheDocument();
    expect(screen.getByText(strings['p.verified'])).toBeInTheDocument();
  });

  it('says two-step sign-in is on with the backup codes left', async () => {
    await renderPage(page);
    expect(await screen.findByText('Backup codes left: 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['2fa.turnOff'] })).toBeInTheDocument();
  });

  it('offers to turn it on when it is off', async () => {
    await renderPage(page, { state: 'twofa-off' });
    const section = (await screen.findAllByRole('button', { name: strings['2fa.turnOn'] }))[0];
    expect(section).toBeDefined();
    expect(screen.queryByText('Backup codes left: 8')).not.toBeInTheDocument();
  });

  it('never guesses "off" when the status could not be read', async () => {
    await renderPage(page, { state: 'twofa-unreadable' });
    expect(await screen.findAllByText(strings['2fa.unreadLine'])).not.toHaveLength(0);
    expect(screen.queryByText(strings['2fa.off'])).not.toBeInTheDocument();
  });

  it('lists active sessions, marks this browser and offers End only for the others', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['s.title'] });
    // The rows arrive after the table: wait for them, not for the header row alone.
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(5));
    // this browser's row is the one marked row (the look is pinned in sessions.table.spec.ts).
    within(table).getByText(strings['s.this']);
    expect([...table.querySelectorAll<HTMLElement>('[data-mark]')].map((r) => r.dataset.mark)).toEqual(['acc']);
    const ends = within(table).getAllByRole('button', { name: /^End the session on/ });
    expect(ends).toHaveLength(11);
  });

  it('asks before ending a session and the dialog is in the URL', async () => {
    const { router } = await renderPage(page, { path: '/account?end=others' });
    const dialog = await openDialog();
    expect(within(dialog).getByText(strings['s.endOthersTitle'])).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ end: 'others' });
  });

  it('shows only the sessions when the account is suspended', async () => {
    await renderPage(page, { state: 'suspended' });
    expect(await screen.findByText(strings['suspended.title'])).toBeInTheDocument();
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: strings['s.title'] })).toBeInTheDocument();
  });

  it('shows the profile load failure with a retry while other sections still render', async () => {
    await renderPage(page, { state: 'error' });
    expect((await screen.findAllByText(strings.loadFailed)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: strings['pw.change'] })).toBeInTheDocument();
  });

  it('refuses a weak new password before sending and shows the field error', async () => {
    await renderPage(page, { path: '/account?sheet=password' });
    const dialog = await openDialog();
    const fields = within(dialog).getAllByLabelText(/password/i, { selector: 'input' });
    await userEvent.type(fields[0] as HTMLElement, 'old');
    await userEvent.type(fields[1] as HTMLElement, 'weak');
    await userEvent.type(fields[2] as HTMLElement, 'weak');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['pw.save'] }));
    expect(await within(dialog).findByText(strings['pw.eWeak'])).toBeInTheDocument();
  });

  it('says the current password is wrong after a 401, with the fields cleared', async () => {
    await renderPage(page, { state: 'pw-wrong', path: '/account?sheet=password' });
    const dialog = await openDialog();
    const fields = within(dialog).getAllByLabelText(/password/i, { selector: 'input' });
    await userEvent.type(fields[0] as HTMLElement, 'old');
    await userEvent.type(fields[1] as HTMLElement, 'Another-Pass-22');
    await userEvent.type(fields[2] as HTMLElement, 'Another-Pass-22');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['pw.save'] }));
    expect(await within(dialog).findByText(strings['err.password'])).toBeInTheDocument();
    for (const f of within(dialog).getAllByLabelText(/password/i, { selector: 'input' })) expect(f).toHaveValue('');
  });

  it('after a password change whose outcome is unknown, locks the drawer to Check again', async () => {
    await renderPage(page, { state: 'pw-pending', path: '/account?sheet=password' });
    const dialog = await openDialog();
    const fields = within(dialog).getAllByLabelText(/password/i, { selector: 'input' });
    await userEvent.type(fields[0] as HTMLElement, 'old');
    await userEvent.type(fields[1] as HTMLElement, 'Another-Pass-22');
    await userEvent.type(fields[2] as HTMLElement, 'Another-Pass-22');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['pw.save'] }));
    expect(await within(dialog).findByText('This may have gone through')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['pw.save'] })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
  });

  it('walks two-step setup: secrets are masked until Show, and confirming needs the saved tick', async () => {
    await renderPage(page, { state: 'twofa-off', path: '/account?sheet=setup' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.next'] }));
    expect(await within(dialog).findByRole('img', { name: strings['2fa.qrAlt'] })).toBeInTheDocument();
    expect(within(dialog).queryByText('JBSW Y3DP EHPK 3PXP')).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/4k7p-9xqa/)).not.toBeInTheDocument();
    // Each press flips its button to Hide, so the next Show is always the first one left.
    await userEvent.click((await within(dialog).findAllByRole('button', { name: /^Show/ }))[0]!);
    await userEvent.click((await within(dialog).findAllByRole('button', { name: /^Show/ }))[0]!);
    expect(await within(dialog).findByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    expect(within(dialog).getByText(/4k7p-9xqa/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.code']), '123456');
    // Off until the tick: the button stays reachable and says why (in the foot too), and a press sends nothing.
    const off = within(dialog).getByRole('button', { name: strings['2fa.confirm'] });
    expect(off).toHaveAttribute('aria-disabled', 'true');
    expect(off).toHaveAccessibleDescription(strings['2fa.reason.saved']);
    expect(dialog.querySelector('[data-drawer-reason]')).toHaveTextContent(strings['2fa.reason.saved']);
    await userEvent.click(off);
    expect(within(dialog).getByLabelText(strings['2fa.code'])).toHaveValue('123456');
    expect(screen.queryByText(strings['2fa.nowOn'])).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: strings['2fa.iSaved'] }));
    const confirm = within(dialog).getByRole('button', { name: strings['2fa.confirm'] });
    expect(confirm).toBeEnabled();
    expect(confirm).not.toHaveAttribute('aria-disabled');
    expect(dialog.querySelector('[data-drawer-reason]')).toBeNull();
  });

  it('two-step setup: Enter in the code field does nothing while Turn on is off (the typed code is kept, nothing is sent)', async () => {
    await renderPage(page, { state: 'twofa-off', path: '/account?sheet=setup' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.next'] }));
    const code = await within(dialog).findByLabelText(strings['2fa.code']);
    await userEvent.type(code, '123456{Enter}');
    // The kit code field wipes itself a task after any submit of its form: wait past it.
    await new Promise((r) => setTimeout(r, 30));
    expect(within(dialog).getByLabelText(strings['2fa.code'])).toHaveValue('123456');
    expect(screen.queryByText(strings['2fa.nowOn'])).not.toBeInTheDocument();
    expect(within(dialog).queryByText(strings['2fa.eFormat'])).not.toBeInTheDocument();
    // With the tick, Turn on sends the code that was kept. (Enter submitting through the footer's form-owned button is
    // the browser's: jsdom's implicit submission only looks inside the form.)
    await userEvent.click(within(dialog).getByRole('checkbox', { name: strings['2fa.iSaved'] }));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.confirm'] }));
    expect(await screen.findByText(strings['2fa.nowOn'])).toBeInTheDocument();
  });

  it('two-step setup is one track of three steps, with the next step named in the first foot', async () => {
    await renderPage(page, { state: 'twofa-off', path: '/account?sheet=setup' });
    const dialog = await openDialog();
    expect(dialog.querySelector('[data-drawer-reason]')).toHaveTextContent(strings['2fa.nextSay']);
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.next'] }));
    const track = await within(dialog).findByRole('list', { name: strings['2fa.steps'] });
    const steps = [...track.querySelectorAll<HTMLElement>(':scope > [data-step]')];
    expect(steps.map((x) => x.dataset.step)).toEqual(['scan', 'codes', 'code']);
    // The QR and the key in the first step, the codes in the second, the code field in the third.
    expect(within(steps[0]!).getByRole('img', { name: strings['2fa.qrAlt'] })).toBeInTheDocument();
    expect(within(steps[0]!).getByText(strings['2fa.manualKey'])).toBeInTheDocument();
    expect(within(steps[1]!).getByRole('checkbox', { name: strings['2fa.iSaved'] })).toBeInTheDocument();
    expect(within(steps[2]!).getByLabelText(strings['2fa.code'])).toBeInTheDocument();
    // The codes step reads done only once the tick says they are saved.
    expect(steps[1]!.dataset.state).toBe('now');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: strings['2fa.iSaved'] }));
    expect(steps[1]!.dataset.state).toBe('done');
  });

  it('turning two-step off with an unknown outcome locks the drawer: no second send, only Check again', async () => {
    await renderPage(page, { state: 'twofa-pending', path: '/account?sheet=off' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.codeOrBackup']), '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.turnOff'] }));
    expect(await within(dialog).findByText('This may have gone through')).toBeInTheDocument();
    expect(locks.get('off')).toBe('pending');
    expect(within(dialog).queryByRole('button', { name: strings['2fa.turnOff'] })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(strings['pw.current'])).toBeDisabled();
  });

  // ── security: Cancel asks, busy refuses, a closed sheet forgets ──

  async function cancelAsks(path: string, state: string | undefined, type: (d: HTMLElement) => Promise<void>) {
    await renderPage(page, { ...(state ? { state } : {}), path });
    const dialog = await openDialog();
    await type(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['action.cancel'] }));
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
  }

  it('Cancel on the password drawer asks before dropping typed passwords', async () => {
    await cancelAsks('/account?sheet=password', undefined, async (d) => {
      await userEvent.type(within(d).getAllByLabelText(/password/i, { selector: 'input' })[0] as HTMLElement, 'old');
    });
  });

  it('Cancel on setup step 1 asks once a password was typed', async () => {
    await cancelAsks('/account?sheet=setup', 'twofa-off', async (d) => {
      await userEvent.type(within(d).getByLabelText(strings['pw.current']), 'pw');
    });
  });

  it('Cancel on the turn-off drawer asks once a code was typed', async () => {
    await cancelAsks('/account?sheet=off', undefined, async (d) => {
      await userEvent.type(within(d).getByLabelText(strings['2fa.codeOrBackup']), '12');
    });
  });

  it('Cancel on the new-codes drawer asks once a password was typed', async () => {
    await cancelAsks('/account?sheet=codes', undefined, async (d) => {
      await userEvent.type(within(d).getByLabelText(strings['pw.current']), 'pw');
    });
  });

  it('a sheet closed through the URL forgets what was typed', async () => {
    const { router } = await renderPage(page, { path: '/account?sheet=password' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getAllByLabelText(/password/i, { selector: 'input' })[0] as HTMLElement, 'old-secret');
    await router.navigate({ to: '/account', search: {} } as never);
    await waitFor(() => expect(document.querySelector('[role="dialog"] input[type="password"]')).toBeNull());
    await router.navigate({ to: '/account', search: { sheet: 'password' } } as never);
    const again = await openDialog();
    for (const f of within(again).getAllByLabelText(/password/i, { selector: 'input' })) expect(f).toHaveValue('');
  });

  it('after Discard the setup secrets are gone from the page: reopening shows step 1 and no QR', async () => {
    const { router } = await renderPage(page, { state: 'twofa-off', path: '/account?sheet=setup' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.next'] }));
    expect(await within(dialog).findByRole('img', { name: strings['2fa.qrAlt'] })).toBeInTheDocument();
    await router.navigate({ to: '/account', search: {} } as never);
    await waitFor(() => expect(screen.queryByRole('img', { name: strings['2fa.qrAlt'] })).not.toBeInTheDocument());
    await router.navigate({ to: '/account', search: { sheet: 'setup' } } as never);
    const again = await openDialog();
    expect(within(again).queryByRole('img', { name: strings['2fa.qrAlt'] })).not.toBeInTheDocument();
    expect(within(again).getByLabelText(strings['pw.current'])).toHaveValue('');
  });

  it('an inconclusive read-back stays "may have gone through" and is never titled as a failure', async () => {
    await renderPage(page, { state: 'twofa-pending-unreadable', path: '/account?sheet=off' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.codeOrBackup']), '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.turnOff'] }));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['check.again'] }));
    expect(await within(dialog).findByText(new RegExp(strings['check.unknown']))).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['check.startOver'] })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['sheet.failedTitle'])).not.toBeInTheDocument();
    expect(within(dialog).getByText('This may have gone through')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
  });

  it('a session revoke whose outcome is unknown says so and offers Check again, never a done notice', async () => {
    await renderPage(page, { state: 'end-pending', path: '/account?end=others' });
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['s.endOthers'] }));
    expect(await screen.findByText(strings['err.pending'])).toBeInTheDocument();
    expect((await screen.findAllByRole('button', { name: /^Check/ }, { timeout: 4000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sessions ended/)).not.toBeInTheDocument();
  });

  it('a switch of account or realm without a remount leaves no lock behind', async () => {
    await renderPage(page);
    await screen.findByText('ada@example.com', {}, { timeout: 8000 });
    locks.sent('password');
    locks.settle('password', true);
    locks.sent('off');
    locks.settle('off', true);
    expect(locks.get('off')).toBe('pending');
    act(() => {
      bump('account');
    });
    await waitFor(() => expect(locks.get('off')).toBeUndefined());
    expect(locks.get('password')).toBeUndefined();
  });

  it('after a password change with an unknown outcome, Check again never claims it was or was not made', async () => {
    await renderPage(page, { state: 'pw-pending', path: '/account?sheet=password' });
    const dialog = await openDialog();
    const fields = within(dialog).getAllByLabelText(/password/i, { selector: 'input' });
    await userEvent.type(fields[0] as HTMLElement, 'old');
    await userEvent.type(fields[1] as HTMLElement, 'Another-Pass-22');
    await userEvent.type(fields[2] as HTMLElement, 'Another-Pass-22');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['pw.save'] }));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['check.again'] }));
    // What we know and what Stop tracking does are separate lines of the banner.
    expect(await within(dialog).findByText(strings['check.unknownPw'])).toBeInTheDocument();
    expect(within(dialog).getByText(strings['check.stopLine'])).toBeInTheDocument();
    // The password check cannot prove the change: its own Check again line says so, never the generic one.
    expect(within(dialog).getByText(strings['check.checkLinePw'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['check.checkLine'])).toBeNull();
    expect(within(dialog).getByRole('button', { name: strings['check.startOver'] })).toHaveTextContent('Stop tracking');
    expect(within(dialog).queryByText(strings['check.same'])).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['pw.signInAgain'] })).toBeInTheDocument();
  });

  it.each([
    ['password', '/account?sheet=password', undefined],
    ['turn-off', '/account?sheet=off', undefined],
    ['new codes', '/account?sheet=codes', undefined],
    ['setup', '/account?sheet=setup', 'twofa-off'],
  ])('the %s drawer closes and forgets when core ends its context', async (_n, path, state) => {
    await renderPage(page, { ...(state ? { state } : {}), path });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getAllByLabelText(/password/i, { selector: 'input' })[0] as HTMLElement, 'typed-secret');
    act(() => {
      bump('account');
    });
    await waitFor(() => expect(document.querySelector('[role="dialog"] input')).toBeNull());
  });

  it('password fields are the kit secret input: masked, never autofilled', async () => {
    await renderPage(page, { path: '/account?sheet=password' });
    const dialog = await openDialog();
    for (const f of within(dialog).getAllByLabelText(/password/i, { selector: 'input' })) expect(f).toHaveAttribute('data-secret-input');
  });

  it('a suspended account cannot open a change sheet by URL', async () => {
    await renderPage(page, { state: 'suspended', path: '/account?sheet=password' });
    await screen.findByText(strings['suspended.title']);
    expect(document.querySelector('[role="dialog"] input')).toBeNull();
  });

  it.each([
    ['the current session', '/account?end=5e55c0ffee00000000000000'],
    ['an unknown id', '/account?end=ffffffffffffffffffffffff'],
  ])('?end= for %s opens no confirmation', async (_n, path) => {
    await renderPage(page, { path });
    await screen.findByRole('table', { name: strings['s.title'] }, { timeout: 8000 });
    expect(screen.queryByText('End this session?')).not.toBeInTheDocument();
    expect(document.querySelector('[role="alertdialog"][open], dialog[open]')).toBeNull();
  });

  it('a pending lock survives leaving the page and coming back', async () => {
    const first = await renderPage(page);
    await screen.findByText('ada@example.com', {}, { timeout: 8000 });
    locks.sent('codes');
    locks.settle('codes', true);
    first.unmount();
    // Nothing but a core account or realm switch (a bump) ends it; a fresh render boots core, so it is not remounted here.
    expect(locks.get('codes')).toBe('pending');
  });

  // ── Security history and sessions: what each row says ──

  it('Sign in again after an unknown password outcome does not claim the password was changed', async () => {
    await renderPage(page, { state: 'pw-pending', path: '/account?sheet=password' });
    const dialog = await openDialog();
    const fields = within(dialog).getAllByLabelText(/password/i, { selector: 'input' });
    await userEvent.type(fields[0] as HTMLElement, 'old');
    await userEvent.type(fields[1] as HTMLElement, 'Another-Pass-22');
    await userEvent.type(fields[2] as HTMLElement, 'Another-Pass-22');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['pw.save'] }));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['check.again'] }));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['pw.signInAgain'] }));
    expect(await screen.findByText(strings['pw.unsure'].replaceAll('\n', ' '))).toBeInTheDocument();
    expect(screen.queryByText(strings['pw.done'])).not.toBeInTheDocument();
  });

  async function makeCodes(state: string) {
    await renderPage(page, { state, path: '/account?sheet=codes' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.code']), '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.makeCodes'] }));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['check.again'] }));
    return dialog;
  }

  it.each(['codes-pending', 'codes-nosecret'])('after an unknown outcome (%s) new codes are made again only after an explicit tick', async (state) => {
    const dialog = await makeCodes(state);
    const tick = await within(dialog).findByRole('checkbox', { name: strings['codes.again'] });
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.code']), '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.makeCodes'] }));
    expect(await within(dialog).findByText(strings['codes.againNeeded'])).toBeInTheDocument();
    expect(locks.get('codes')).toBeUndefined();
    await userEvent.click(tick);
    // The code field wipes after a submit, sent or not: type it again.
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.code']), '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.makeCodes'] }));
    await waitFor(() => expect(locks.get('codes')).toBe('pending'));
  });

  it('a pending lock does not leak to the next account when the page was not mounted at the switch', async () => {
    const first = await renderPage(page);
    await screen.findByText('ada@example.com', {}, { timeout: 8000 });
    locks.sent('codes');
    locks.settle('codes', true);
    first.unmount();
    act(() => {
      bump('account');
    });
    expect(locks.get('codes')).toBeUndefined();
  });

  it('a sent lock refuses a second submit of the same drawer', async () => {
    await renderPage(page, { path: '/account?sheet=off' });
    const dialog = await openDialog();
    locks.sent('off');
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.codeOrBackup']), '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.turnOff'] }));
    expect(within(dialog).getByLabelText(strings['pw.current'])).toHaveValue('pw');
  });

  it('Check again in the 2FA section releases every waiting two-step lock, and leaves the password lock', async () => {
    await renderPage(page);
    await screen.findByText('Backup codes left: 8');
    act(() => {
      locks.sent('codes');
      locks.settle('codes', true);
      locks.sent('gate');
      locks.settle('gate', true);
    });
    act(() => {
      locks.sent('password');
      locks.settle('password', true);
    });
    const section = screen.getByText(strings['2fa.title'], { selector: 'h2, h3' }).closest('section') as HTMLElement;
    await userEvent.click(await within(section).findByRole('button', { name: strings['check.again'] }));
    await waitFor(() => expect(['gate', locks.get('gate'), 'codes', locks.get('codes')]).toEqual(['gate', undefined, 'codes', undefined]));
    expect(locks.get('password')).toBe('pending');
  });

  it('a password change already sent (lock held, e.g. after a remount) is not sent again', async () => {
    await renderPage(page, { path: '/account?sheet=password' });
    const dialog = await openDialog();
    locks.sent('password');
    const fields = within(dialog).getAllByLabelText(/password/i, { selector: 'input' });
    await userEvent.type(fields[0] as HTMLElement, 'old');
    await userEvent.type(fields[1] as HTMLElement, 'Another-Pass-22');
    await userEvent.type(fields[2] as HTMLElement, 'Another-Pass-22');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['pw.save'] }));
    expect(fields[0]).toHaveValue('old');
    expect(locks.get('password')).toBe('sent');
  });

  it('Check again in the new-codes drawer settles only that drawer\'s op', async () => {
    await renderPage(page, { state: 'codes-pending', path: '/account?sheet=codes' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.code']), '123456');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.makeCodes'] }));
    const check = await within(dialog).findByRole('button', { name: strings['check.again'] });
    act(() => {
      locks.sent('gate');
      locks.settle('gate', true);
    });
    await userEvent.click(check);
    await waitFor(() => expect(locks.get('codes')).toBeUndefined());
    expect(locks.get('gate')).toBe('pending');
  });

  it('a refused send that waits on a read-back says so, not "did not work"', async () => {
    expect(errorKey({ code: 'READ_BACK_FIRST' }, 'password')).toBe('err.readFirst');
    expect(errorKey({ code: 'FRAMED_ACTION_REFUSED' }, 'password')).toBe('err.framed');
    expect(errorKey({ status: 429 }, 'password')).toBe('err.tooMany');
  });

  it('a revoke with an unknown outcome keeps its dialog open and locked; Check again closes it once read back', async () => {
    await renderPage(page, { state: 'end-pending', path: '/account?end=others' });
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['s.endOthers'] }));
    const check = await within(dialog).findByRole('button', { name: /^Check/ });
    expect(within(dialog).queryByRole('button', { name: strings['s.endOthers'] })?.hasAttribute('disabled') ?? true).toBe(true);
    await userEvent.click(check);
    await waitFor(() => expect(document.querySelector('[role="alertdialog"][open], [role="dialog"][open]')).toBeNull());
    expect(screen.queryByText(strings['err.generic'])).toBeNull();
  });

  it('a realm switch keeps a pending lock; an account change drops it', () => {
    locks.sent('codes');
    locks.settle('codes', true);
    act(() => {
      bump('switch');
    });
    expect(locks.get('codes')).toBe('pending');
    act(() => {
      bump('account');
    });
    expect(locks.get('codes')).toBeUndefined();
  });

  it('turning the token gate off accepts a backup code, as turning two-step off does', async () => {
    await renderPage(page, { path: '/account?sheet=gate-off' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.codeOrBackup']), 'abcd-efgh');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['2fa.gateOff'] }));
    expect(await screen.findByText(strings['2fa.gateNowOff'])).toBeInTheDocument();
  });

  it('every pending two-step change has Check again in the section, with the drawer closed', async () => {
    for (const op of ['codes', 'off', 'setup'] as const) {
      const { unmount } = await renderPage(page);
      await screen.findByText('Backup codes left: 8');
      act(() => {
        locks.settle(op, true, locks.sent(op));
      });
      const section = (await screen.findByText(strings['2fa.title'], { selector: 'h2, h3' })).closest('section') as HTMLElement;
      expect(within(section).getByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
      unmount();
    }
  });

  it('a gate-off whose Check again proves it is off closes the sheet as done instead of offering the form again', async () => {
    // The status shows the gate already off (this state's gate is off), so the proof says applied.
    await renderPage(page, { state: 'twofa-gate-off', path: '/account?sheet=gate-off' });
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(strings['pw.current']), 'pw');
    await userEvent.type(within(dialog).getByLabelText(strings['2fa.codeOrBackup']), 'abcd-efgh');
    locks.settle('gate', true, locks.sent('gate'));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['check.again'] }));
    await waitFor(() => expect(locks.get('gate')).toBeUndefined());
    // react-aria's dialog is role=dialog: gone from the document when the sheet closed as done.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(strings['2fa.gateNowOff'])).toBeInTheDocument();
  });

  it.each([
    ['rel.keys', '/keys'],
    ['rel.billing', '/billing'],
    ['rel.notifications', '/notifications'],
  ] as const)('the %s link follows the page registry to %s', async (key, to) => {
    const { router, unmount } = await renderPage(page);
    const section = (await screen.findByText(strings['rel.title'], { selector: 'h2, h3' })).closest('section') as HTMLElement;
    await userEvent.click(within(section).getByRole('button', { name: strings['rel.openNamed'].replace('{{name}}', strings[key]) }));
    await waitFor(() => expect(router.state.location.pathname).toBe(to));
    unmount();
  });

  it('a pending two-step change keeps its banner while the status cannot be read', async () => {
    await renderPage(page, { state: 'twofa-unreadable' });
    await screen.findByText(strings['2fa.unreadLine']);
    act(() => {
      locks.settle('off', true, locks.sent('off'));
    });
    const section = screen.getByText(strings['2fa.title'], { selector: 'h2, h3' }).closest('section') as HTMLElement;
    expect(await within(section).findByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
  });

  it('a gate switch pressed while its lock is held sends nothing and shows no failure', async () => {
    await renderPage(page);
    await screen.findByText('Backup codes left: 8');
    act(() => {
      locks.sent('gate');
    });
    const sw = screen.getByRole('switch', { name: strings['2fa.gateSwitch'] });
    expect(sw).toBeDisabled();
  });
});
