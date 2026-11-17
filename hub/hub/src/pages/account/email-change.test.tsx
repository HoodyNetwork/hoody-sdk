// Vitest: the email change drawer and the waiting change on the profile, in the page's fixture states.
import { bootFixtureCore, fixtureWorld } from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { formatDate, interpolate } from '@kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailCancelProves, emailStartProves, profileOf } from './data';
import { emailErrorKey, emailProblem } from './logic';
import { checkTarget } from './parts/EmailSheet';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Another mount or tab's send of the op now has an unknown outcome (the page lock is shared). */
function holdOp(op: 'email' | 'emailCancel' | 'name') {
  act(() => {
    const ep = locks.sent(op);
    locks.settle(op, true, ep);
  });
}

async function openDialog(): Promise<HTMLElement> {
  return waitFor(() => {
    const d = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    if (!d) throw new Error('no open dialog');
    return d;
  });
}

async function fill(dialog: HTMLElement, o: { email?: string; password?: string }) {
  if (o.email !== undefined) await userEvent.type(within(dialog).getByLabelText(strings['e.new']), o.email);
  if (o.password !== undefined) await userEvent.type(within(dialog).getByLabelText(strings['e.password']), o.password);
}
const send = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole('button', { name: strings['e.send'] }));

describe('email change: rules before sending', () => {
  it('judges the new address: empty, not an address and the current one (any case) are refused', () => {
    expect(emailProblem('', 'ada@example.com')).toBe('empty');
    expect(emailProblem('  ', 'ada@example.com')).toBe('empty');
    expect(emailProblem('ada', 'ada@example.com')).toBe('invalid');
    expect(emailProblem('ada@example', 'ada@example.com')).toBe('invalid');
    expect(emailProblem('a b@example.com', 'ada@example.com')).toBe('invalid');
    expect(emailProblem(`${'x'.repeat(250)}@e.co`, 'ada@example.com')).toBe('invalid');
    expect(emailProblem(' ADA@Example.com ', 'ada@example.com')).toBe('same');
    expect(emailProblem('ada.new@example.com', 'ada@example.com')).toBeNull();
    // What the API's email format refuses is refused here, at the field; what it takes is taken.
    for (const bad of ['adä@example.com', 'ada..new@example.com', '.ada@example.com', 'ada@exa_mple.com', 'ada@-example.com', 'ada@example.com.']) expect(emailProblem(bad, 'ada@example.com'), bad).toBe('invalid');
    for (const ok of ['ada+tag@example.com', 'a_b-c@mail.example.co', "o'neil@example.com", 'ADA.NEW@Example.COM']) expect(emailProblem(ok, 'ada@example.com'), ok).toBeNull();
  });

  it('names each refusal the API gives, and falls back to the shared sentences', () => {
    expect(emailErrorKey({ code: 'EMAIL_UNCHANGED', status: 400 })).toBe('e.same');
    expect(emailErrorKey({ code: 'EMAIL_DOMAIN_NOT_ACCEPTED', status: 400 })).toBe('e.domain');
    expect(emailErrorKey({ code: 'PASSWORD_NOT_SET', status: 400 })).toBe('e.noPassword');
    expect(emailErrorKey({ code: 'EMAIL_CHANGE_LOCKED', status: 409 })).toBe('e.locked');
    expect(emailErrorKey({ code: 'EMAIL_CHANGE_NOT_ALLOWED', status: 403 })).toBe('e.notAllowed');
    expect(emailErrorKey({ code: 'OTP_REQUIRED', status: 400 })).toBe('e.codeNeeded');
    expect(emailErrorKey({ code: 'CURRENT_PASSWORD_INCORRECT', status: 401 })).toBe('err.password');
    expect(emailErrorKey({ code: 'ACCOUNT_CHANGED', status: 409 })).toBe('err.changed');
    // A bare 401 can only be the password: a wrong code is refused by name.
    expect(emailErrorKey({ status: 401 })).toBe('err.password');
    expect(emailErrorKey({ status: 429 })).toBe('err.tooMany');
  });

  it('only a profile waiting on the asked address proves a start; only nothing waiting proves a cancel', () => {
    const p = (pendingEmail: string | null) => [[{ ...profileOf({ id: 'u', email: 'a@b.co' }), pendingEmail }]];
    expect(emailStartProves({ email: 'n@b.co' }, p('N@b.co'))).toBe('applied');
    expect(emailStartProves({ email: 'n@b.co' }, p('other@b.co'))).toBeUndefined();
    expect(emailStartProves({ email: 'n@b.co' }, p(null))).toBeUndefined();
    expect(emailStartProves({ email: 'n@b.co' }, [])).toBeUndefined();
    expect(emailCancelProves(undefined, p(null))).toBe('applied');
    expect(emailCancelProves(undefined, p('n@b.co'))).toBeUndefined();
    expect(emailCancelProves(undefined, [])).toBeUndefined();
  });

  it('a profile that left the email change fields out (the API could not read them) proves no cancel and no start', () => {
    const omitted = [[profileOf({ id: 'u', email: 'a@b.co' })]];
    expect(emailCancelProves(undefined, omitted)).toBeUndefined();
    expect(emailStartProves({ email: 'n@b.co' }, omitted)).toBeUndefined();
  });

  it('reads the waiting change and the undo period from the profile answer', () => {
    const p = profileOf({ id: 'u', email: 'a@b.co', pending_email: 'n@b.co', pending_email_expires_at: '2026-10-24T03:00:00Z', email_change_undo_until: null });
    expect(p).toMatchObject({ pendingEmail: 'n@b.co', pendingUntil: '2026-10-24T03:00:00Z', undoUntil: null });
    const none = profileOf({ id: 'u', pending_email: null, pending_email_expires_at: null, email_change_undo_until: null });
    expect(none).toMatchObject({ pendingEmail: null, pendingUntil: null, undoUntil: null });
    // Left out = not known, never "nothing waiting"; another shape reads the same.
    const omitted = profileOf({ id: 'u' });
    expect(omitted.pendingEmail).toBeUndefined();
    expect(omitted.pendingUntil).toBeUndefined();
    expect(omitted.undoUntil).toBeUndefined();
    expect(profileOf({ id: 'u', pending_email: 42 }).pendingEmail).toBeUndefined();
  });
});

describe('email change drawer', () => {
  it('the email row opens the drawer, kept in the URL; it asks no code of its own (core\'s prompt does, with 2FA on)', async () => {
    const { router } = await renderPage(page);
    await userEvent.click(await screen.findByRole('button', { name: strings['e.change'] }, { timeout: 8000 }));
    const dialog = await openDialog();
    expect(router.state.location.search).toMatchObject({ sheet: 'email' });
    expect(within(dialog).getByLabelText(strings['e.new'])).toHaveValue('');
    expect(within(dialog).queryByLabelText(/code/i)).not.toBeInTheDocument();
  });

  it('refuses missing fields under each field and sends nothing', async () => {
    await renderPage(page, { state: 'email-pending', path: '/account?sheet=email' });
    const dialog = await openDialog();
    await send(dialog);
    expect(await within(dialog).findByText(strings['e.eEmpty'])).toBeInTheDocument();
    expect(within(dialog).getByText(strings['e.ePassword'])).toBeInTheDocument();
    // Nothing went out: the pending fixture would have locked the drawer.
    expect(within(dialog).queryByRole('button', { name: strings['check.again'] })).not.toBeInTheDocument();
  });

  it('refuses the current address before sending', async () => {
    await renderPage(page, { state: 'email-pending', path: '/account?sheet=email' });
    const dialog = await openDialog();
    await fill(dialog, { email: 'ADA@example.com', password: 'pw' });
    await send(dialog);
    expect(await within(dialog).findByText(strings['e.eSame'])).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['check.again'] })).not.toBeInTheDocument();
  });

  it('a sent link closes the drawer and names the address to check', async () => {
    const { router } = await renderPage(page, { path: '/account?sheet=email' });
    const dialog = await openDialog();
    await fill(dialog, { email: 'Ada.New@example.com', password: 'pw' });
    await send(dialog);
    expect(await screen.findByText(interpolate(strings['e.sent'], { email: 'ada.new@example.com' }))).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toMatchObject({ sheet: 'email' }));
  });

  it('an unknown outcome locks the drawer to Check again and keeps no password (C9: never sent twice)', async () => {
    await renderPage(page, { state: 'email-pending', path: '/account?sheet=email' });
    const dialog = await openDialog();
    await fill(dialog, { email: 'ada.new@example.com', password: 'secret-pw' });
    await send(dialog);
    expect(await within(dialog).findByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['e.send'] })).not.toBeInTheDocument();
    expect(within(dialog).getByText(strings['err.pending'])).toBeInTheDocument();
    expect(within(dialog).getByLabelText(strings['e.password'])).toHaveValue('');
  });

  it('Check again proves the send only when the profile waits on the asked address', async () => {
    await renderPage(page, { state: 'email-pending-mine', path: '/account?sheet=email' });
    const dialog = await openDialog();
    await fill(dialog, { email: 'Ada.New@example.com', password: 'pw' });
    await send(dialog);
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['check.again'] }));
    expect(await screen.findByText(interpolate(strings['e.sent'], { email: 'ada.new@example.com' }))).toBeInTheDocument();
  });

  it('Check again never reports another device\'s waiting address as this send', async () => {
    await renderPage(page, { state: 'email-pending-other', path: '/account?sheet=email' });
    const dialog = await openDialog();
    await fill(dialog, { email: 'ada.new@example.com', password: 'pw' });
    await send(dialog);
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['check.again'] }));
    expect(await within(dialog).findByText(new RegExp(esc(strings['check.unknown'].slice(0, 30))))).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings['e.sent'], { email: 'someone.else@example.com' }))).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
  });

  it('a tab announces only its own request; a hold another tab put in its place is read as theirs, never as this send', () => {
    const b = [{ identity: { email: 'b@example.com' } }];
    const a = [{ identity: { email: 'a@example.com' } }];
    // Own send out, core still holds it: this tab's address.
    expect(checkTarget(true, 'a@example.com', a)).toEqual({ email: 'a@example.com', other: false });
    // Own send out, no hold left (settled elsewhere): still only this tab's address can prove it.
    expect(checkTarget(true, 'a@example.com', [])).toEqual({ email: 'a@example.com', other: false });
    // Own send out, another tab's hold replaced it: their address, marked as theirs.
    expect(checkTarget(true, 'a@example.com', b)).toEqual({ email: 'b@example.com', other: true });
    // No send of this tab's (after a reload): core's hold.
    expect(checkTarget(false, null, b)).toEqual({ email: 'b@example.com', other: false });
    expect(checkTarget(false, null, [])).toEqual({ email: null, other: false });
  });


  it('a password typed before another tab\'s send locked the drawer is wiped, and Start over leaves it empty', async () => {
    await renderPage(page, { state: 'email-pending', path: '/account?sheet=email' });
    const dialog = await openDialog();
    await fill(dialog, { email: 'ada.new@example.com', password: 'typed-before' });
    holdOp('email');
    await waitFor(() => expect(within(dialog).getByLabelText(strings['e.password'])).toHaveValue(''));
    await userEvent.click(within(dialog).getByRole('button', { name: strings['check.again'] }));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['check.startOver'] }));
    await waitFor(() => expect(within(dialog).getByLabelText(strings['e.password'])).not.toBeDisabled());
    expect(within(dialog).getByLabelText(strings['e.password'])).toHaveValue('');
  });

  it('a wrong password says so, keeps the drawer open and clears the password', async () => {
    await renderPage(page, { state: 'email-wrong', path: '/account?sheet=email' });
    const dialog = await openDialog();
    await fill(dialog, { email: 'ada.new@example.com', password: 'nope' });
    await send(dialog);
    expect(await within(dialog).findByText(strings['err.password'])).toBeInTheDocument();
    expect(within(dialog).getByLabelText(strings['e.new'])).toHaveValue('ada.new@example.com');
    expect(within(dialog).getByLabelText(strings['e.password'])).toHaveValue('');
  });

  it('a refused domain and a locked account each get their own sentence', async () => {
    await renderPage(page, { state: 'email-domain', path: '/account?sheet=email' });
    let dialog = await openDialog();
    await fill(dialog, { email: 'ada@throwaway.example', password: 'pw' });
    await send(dialog);
    expect(await within(dialog).findByText(strings['e.domain'])).toBeInTheDocument();

    bootFixtureCore();
    locks.clear();
    document.body.innerHTML = '';
    await renderPage(page, { state: 'email-locked', path: '/account?sheet=email' });
    dialog = await openDialog();
    await fill(dialog, { email: 'ada.new@example.com', password: 'pw' });
    await send(dialog);
    expect(await within(dialog).findByText(strings['e.lockedNoDate'])).toBeInTheDocument();
  });

  it('a sign-in that cannot answer the two-step prompt says so, and the password is gone', async () => {
    await renderPage(page, { state: 'email-code-needed', path: '/account?sheet=email' });
    const dialog = await openDialog();
    await fill(dialog, { email: 'ada.new@example.com', password: 'pw' });
    await send(dialog);
    expect(await within(dialog).findByText(strings['e.codeNeeded'])).toBeInTheDocument();
    expect(within(dialog).getByLabelText(strings['e.password'])).toHaveValue('');
  });
});

describe('a waiting or recent email change on the profile', () => {
  it('shows the waiting address with its expiry, and Cancel says it was cancelled', async () => {
    await renderPage(page, { state: 'email-waiting' });
    const text = interpolate(strings['e.waiting'], { email: 'ada.new@example.com', date: formatDate('2026-10-24T03:00:00Z') });
    expect(await screen.findByText(text, {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['e.cancel'] }));
    expect(await screen.findByText(strings['e.cancelled'])).toBeInTheDocument();
  });

  it('a cancel whose outcome is unknown turns into Check again (nothing is sent twice)', async () => {
    await renderPage(page, { state: 'email-cancel-pending' });
    await userEvent.click(await screen.findByRole('button', { name: strings['e.cancel'] }, { timeout: 8000 }));
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['e.cancel'] })).not.toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: strings['check.again'] }).length).toBeGreaterThan(0);
  });

  it('while the last change can be undone, Change email is off and the page says until when', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T03:00:00Z'));
    await renderPage(page, { state: 'email-undo' });
    expect(await screen.findByText(interpolate(strings['e.undoOpen'], { date: formatDate('2026-10-30T03:00:00Z') }), {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['e.change'] })).toBeDisabled();
  });

  it('when the undo window ends on an open page, Change email turns back on without a reload', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-30T02:59:50Z'));
    await renderPage(page, { state: 'email-undo' });
    expect(await screen.findByRole('button', { name: strings['e.change'] }, { timeout: 8000 })).toBeDisabled();
    await act(async () => {
      vi.setSystemTime(new Date('2026-10-30T03:00:01Z'));
      await vi.advanceTimersByTimeAsync(12_000);
    });
    await waitFor(() => expect(screen.getByRole('button', { name: strings['e.change'] })).not.toBeDisabled());
    expect(screen.queryByText(interpolate(strings['e.undoOpen'], { date: formatDate('2026-10-30T03:00:00Z') }))).not.toBeInTheDocument();
  });

  it('a render after the undo deadline turns Change email back on, though no timer fired (a late profile answer)', async () => {
    // Mounted an hour before the deadline: its timer cannot fire during the test, so only a render after the deadline
    // can turn the button on.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T02:00:00Z'));
    await renderPage(page, { state: 'email-undo' });
    expect(await screen.findByRole('button', { name: strings['e.change'] }, { timeout: 8000 })).toBeDisabled();
    vi.setSystemTime(new Date('2026-10-30T03:00:01Z'));
    holdOp('name');
    await waitFor(() => expect(screen.getByRole('button', { name: strings['e.change'] })).not.toBeDisabled());
  });

  it('a cancel whose outcome is unknown keeps its row even when the profile shows nothing waiting, and Check again settles it', async () => {
    await renderPage(page);
    await screen.findByRole('button', { name: strings['e.change'] }, { timeout: 8000 });
    holdOp('emailCancel');
    expect(await screen.findByText(strings['e.cancelUnknown'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['check.again'] }));
    expect(await screen.findByText(strings['e.cancelled'])).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(strings['e.cancelUnknown'])).not.toBeInTheDocument());
  });

  it('an inconclusive cancel check offers a warned Start over, after which Cancel can be pressed again', async () => {
    await renderPage(page, { state: 'email-cancel-pending' });
    await userEvent.click(await screen.findByRole('button', { name: strings['e.cancel'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['check.again'] }));
    expect(await screen.findByText(new RegExp(esc(strings['check.dismissWarn'].slice(0, 30))))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['check.startOver'] }));
    expect(await screen.findByRole('button', { name: strings['e.cancel'] })).toBeInTheDocument();
  });

  it('the profile no longer sends people to support for an email change', async () => {
    await renderPage(page);
    expect(await screen.findByText(strings['p.supportNote'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(strings['p.supportNote']).not.toMatch(/email/i);
  });
});

describe('the email drawer reads banner, current address, form, then its Why', () => {
  const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it('shows the current address as a fact above the form', async () => {
    await renderPage(page, { path: '/account?sheet=email' });
    const dialog = await openDialog();
    const label = await within(dialog).findByText(strings['e.current']);
    expect(within(dialog).getByText(fixtureWorld.account.email)).toBeInTheDocument();
    expect(follows(label, dialog.querySelector('form')!)).toBe(true);
  });

  it('the question about when the email changes sits below the form, closed; open, it answers and ends with the FAQ link', async () => {
    await renderPage(page, { path: '/account?sheet=email' });
    const dialog = await openDialog();
    const why = within(dialog).getByRole('button', { name: strings['e.why.q'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(follows(dialog.querySelector('form')!, why)).toBe(true);
    expect(within(dialog).queryByRole('link', { name: strings['e.more'] })).toBeNull();
    await userEvent.click(why);
    expect(within(dialog).getByText(strings['e.why.a'])).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: strings['e.more'] })).toBeInTheDocument();
  });

  it('a locked drawer puts its pending banner first, before the current address and the form', async () => {
    await renderPage(page, { state: 'email-pending', path: '/account?sheet=email' });
    const dialog = await openDialog();
    await within(dialog).findByText(strings['e.current']);
    holdOp('email');
    const banner = await within(dialog).findByText(strings['err.pending']);
    expect(follows(banner, within(dialog).getByText(strings['e.current']))).toBe(true);
    expect(follows(banner, dialog.querySelector('form')!)).toBe(true);
  });
});
