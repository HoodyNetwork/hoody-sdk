// Vitest: four account gaps on the page (fixture transport).
//   - The password drawer and the two-step set-up drawer of such an account ask for no current password: their fields
//     are off and they carry the same action; a server that refuses by name brings the same.
//   - An account with no password (GitHub or Google sign-up) is offered "Set a password": one press asks for the reset
//     mail, the row then says where to look and offers no second mail; too many asks says the wait. The email drawer
//     says the same before anything is typed and carries the same action. A profile that does not report has_password
//     (an older API) keeps Change password.
//   - An unverified address offers its verification mail on the email row and in the security checklist (one ask shared
//     by both), and Change email waits with its reason.
//   - "Support replies" is a switch in its own Emails section, shown only where the profile reports the setting; an
//     unknown outcome locks it with Check again.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { bootFixtureCore } from '@core';
import { bump, setRealm } from '@core/ctx';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetMailAsks } from './data';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

const MASKED = 'a•••@';
const said = (key: 'mail.sentReset' | 'mail.sentVerify'): string => strings[key].split('{{email}}')[0]!.trim();

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
  resetMailAsks();
});

const section = async (id: string): Promise<HTMLElement> =>
  waitFor(
    () => {
      const el = document.querySelector<HTMLElement>(`[data-section="${id}"]`);
      if (!el) throw new Error(`no section ${id}`);
      return el;
    },
    { timeout: 8000 },
  );

describe('an account with no password', () => {
  it('offers Set a password in place of Change password, and one press asks for the mail once', async () => {
    await renderPage(page, { state: 'no-password' });
    const pw = await section('password');
    const set = await within(pw).findByRole('button', { name: strings['pw.set'] }, { timeout: 8000 });
    expect(within(pw).queryByRole('button', { name: strings['pw.change'] })).toBeNull();
    expect(pw).toHaveTextContent(strings['pw.noneHelp']);
    await userEvent.click(set);
    await waitFor(() => expect(pw).toHaveTextContent(said('mail.sentReset')));
    expect(pw).toHaveTextContent(MASKED);
    // No second mail from here: the action is gone once Hoody took the request.
    expect(within(pw).queryByRole('button', { name: strings['pw.set'] })).toBeNull();
  });

  it('too many asks says the wait in minutes and keeps the action', async () => {
    await renderPage(page, { state: 'no-password-rate' });
    const pw = await section('password');
    await userEvent.click(await within(pw).findByRole('button', { name: strings['pw.set'] }, { timeout: 8000 }));
    await waitFor(() => expect(pw).toHaveTextContent(strings['err.tooManyWait_other'].replace('{{count}}', '30')));
    expect(within(pw).getByRole('button', { name: strings['pw.set'] })).toBeInTheDocument();
    expect(pw).not.toHaveTextContent(said('mail.sentReset'));
  });

  it('a realm switch while the ask is out keeps its answer: the row says where to look and offers no second mail', async () => {
    await renderPage(page, { state: 'no-password', latency: 'normal' });
    const set = await within(await section('password')).findByRole('button', { name: strings['pw.set'] }, { timeout: 8000 });
    await userEvent.click(set);
    // The same account in another realm: the ask is the account's, so its answer still lands.
    await act(() => {
      setRealm('all');
      bump('switch');
    });
    await waitFor(() => expect(document.querySelector('[data-section="password"]')).toHaveTextContent(said('mail.sentReset')), { timeout: 8000 });
    expect(within(await section('password')).queryByRole('button', { name: strings['pw.set'] })).toBeNull();
  });

  it('no answer is said as unknown, never as sent or failed', async () => {
    await renderPage(page, { state: 'no-password-unsure' });
    const pw = await section('password');
    await userEvent.click(await within(pw).findByRole('button', { name: strings['pw.set'] }, { timeout: 8000 }));
    await waitFor(() => expect(pw).toHaveTextContent(strings['mail.unsure']));
    expect(pw).not.toHaveTextContent(strings['err.generic']);
    // Not known is not asked for twice from here.
    expect(within(pw).queryByRole('button', { name: strings['pw.set'] })).toBeNull();
  });

  it('the email drawer says so before anything is typed, keeps its form off and carries the same action', async () => {
    await renderPage(page, { state: 'no-password', path: '/account?sheet=email' });
    const d = await screen.findByRole('dialog', { name: strings['e.title'] }, { timeout: 8000 });
    expect(d).toHaveTextContent(strings['e.noPasswordTitle']);
    expect(d).toHaveTextContent(strings['e.noPasswordBody']);
    expect(within(d).getByLabelText(strings['e.new'])).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: strings['pw.set'] }));
    await waitFor(() => expect(d).toHaveTextContent(said('mail.sentReset')));
    expect(within(d).queryByRole('button', { name: strings['pw.set'] })).toBeNull();
    // The same ask as the password row's: it shows there too, with no action left.
    const pw = await section('password');
    expect(pw).toHaveTextContent(said('mail.sentReset'));
    expect(within(pw).queryByRole('button', { name: strings['pw.set'] })).toBeNull();
  });

  it('the password drawer has no field to type a current password into, and carries the same action', async () => {
    await renderPage(page, { state: 'no-password', path: '/account?sheet=password' });
    const d = await screen.findByRole('dialog', { name: strings['pw.title'] }, { timeout: 8000 });
    await waitFor(() => expect(d).toHaveTextContent(strings['pw.noneBody']), { timeout: 8000 });
    expect(d).toHaveTextContent(strings['e.noPasswordTitle']);
    for (const label of [strings['pw.current'], strings['pw.new'], strings['pw.again']]) expect(within(d).getByLabelText(label)).toBeDisabled();
    expect(within(d).getByRole('button', { name: strings['pw.save'] })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(within(d).getByRole('button', { name: strings['pw.set'] }));
    await waitFor(() => expect(d).toHaveTextContent(said('mail.sentReset')));
    expect(within(d).queryByRole('button', { name: strings['pw.set'] })).toBeNull();
  });

  it('the two-step set-up drawer asks for no password either: field off, the action there', async () => {
    await renderPage(page, { state: 'no-password', path: '/account?sheet=setup' });
    const d = await screen.findByRole('dialog', { name: strings['2fa.setupTitle'] }, { timeout: 8000 });
    await waitFor(() => expect(d).toHaveTextContent(strings['2fa.noPasswordBody']), { timeout: 8000 });
    expect(within(d).getByLabelText(strings['pw.current'])).toBeDisabled();
    expect(within(d).getByRole('button', { name: strings['2fa.next'] })).toHaveAttribute('aria-disabled', 'true');
    expect(within(d).getByRole('button', { name: strings['pw.set'] })).toBeInTheDocument();
  });

  it('an API that does not report it: the set-up refused by name turns into the same banner, not the general sentence', async () => {
    await renderPage(page, { state: 'setup-no-password', path: '/account?sheet=setup' });
    const d = await screen.findByRole('dialog', { name: strings['2fa.setupTitle'] }, { timeout: 8000 });
    const field = within(d).getByLabelText(strings['pw.current']);
    expect(field).not.toBeDisabled();
    expect(d).not.toHaveTextContent(strings['2fa.noPasswordBody']);
    await userEvent.type(field, 'a-long-enough-password');
    await userEvent.click(within(d).getByRole('button', { name: strings['2fa.next'] }));
    await waitFor(() => expect(d).toHaveTextContent(strings['2fa.noPasswordBody']), { timeout: 8000 });
    expect(d).not.toHaveTextContent(strings['err.generic']);
    expect(d).not.toHaveTextContent(strings['err.noPassword']);
    expect(within(d).getByLabelText(strings['pw.current'])).toBeDisabled();
    expect(within(d).getByRole('button', { name: strings['pw.set'] })).toBeInTheDocument();
  });

  it('an API that does not report it: a password change refused by name turns the drawer into the same banner', async () => {
    await renderPage(page, { state: 'setup-no-password', path: '/account?sheet=password' });
    const d = await screen.findByRole('dialog', { name: strings['pw.title'] }, { timeout: 8000 });
    expect(d).not.toHaveTextContent(strings['pw.noneBody']);
    await userEvent.type(within(d).getByLabelText(strings['pw.current']), 'an-old-Password-1');
    await userEvent.type(within(d).getByLabelText(strings['pw.new']), 'a-new-Password-22');
    await userEvent.type(within(d).getByLabelText(strings['pw.again']), 'a-new-Password-22');
    await userEvent.click(within(d).getByRole('button', { name: strings['pw.save'] }));
    await waitFor(() => expect(d).toHaveTextContent(strings['pw.noneBody']), { timeout: 8000 });
    expect(within(d).getByLabelText(strings['pw.current'])).toBeDisabled();
    expect(within(d).getByLabelText(strings['pw.current'])).toHaveValue('');
    expect(within(d).getByRole('button', { name: strings['pw.set'] })).toBeInTheDocument();
  });

  it('a profile that does not report has_password keeps Change password, and has no Emails section', async () => {
    await renderPage(page, { state: 'profile-older' });
    const pw = await section('password');
    expect(await within(pw).findByRole('button', { name: strings['pw.change'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(within(pw).queryByRole('button', { name: strings['pw.set'] })).toBeNull();
    // The section is there while the profile loads and leaves once it answered without the setting.
    await waitFor(() => expect(document.querySelector('[data-section="emails"]')).toBeNull());
  });
});

describe('an address that is not verified', () => {
  it('offers the verification mail on the email row; once asked, Change email waits there with its reason', async () => {
    await renderPage(page, { state: 'email-unverified' });
    const profile = await section('profile');
    const resend = await within(profile).findByRole('button', { name: strings['p.resend'] }, { timeout: 8000 });
    // One action at a time: no Change email beside it (an unverified address cannot be changed).
    expect(within(profile).queryByRole('button', { name: strings['e.change'] })).toBeNull();
    expect(profile).toHaveTextContent(strings['p.unverifiedHelp']);
    await userEvent.click(resend);
    await waitFor(() => expect(profile).toHaveTextContent(said('mail.sentVerify')));
    expect(within(profile).queryByRole('button', { name: strings['p.resend'] })).toBeNull();
    const change = within(profile).getByRole('button', { name: strings['e.change'] });
    expect(change).toHaveAttribute('aria-disabled', 'true');
    // One ask for the page: the security checklist offers no second mail either.
    expect(screen.queryByRole('button', { name: strings['p.resend'] })).toBeNull();
  });

  it('the security checklist offers it too', async () => {
    await renderPage(page, { state: 'email-unverified' });
    await section('profile');
    await waitFor(() => expect(screen.getAllByRole('button', { name: strings['p.resend'] }).length).toBe(2), { timeout: 8000 });
  });

  it('the hourly limit is said with its wait', async () => {
    await renderPage(page, { state: 'email-unverified-rate' });
    const profile = await section('profile');
    await userEvent.click(await within(profile).findByRole('button', { name: strings['p.resend'] }, { timeout: 8000 }));
    await waitFor(() => expect(profile).toHaveTextContent(strings['err.tooManyWait_other'].replace('{{count}}', '40')));
    // The row keeps its action for after the wait; the checklist says the wait and offers none (a press would be refused).
    expect(within(profile).getByRole('button', { name: strings['p.resend'] })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['p.resend'] })).toHaveLength(1);
  });

  it('a verified address offers neither', async () => {
    await renderPage(page, {});
    const profile = await section('profile');
    const change = await within(profile).findByRole('button', { name: strings['e.change'] }, { timeout: 8000 });
    expect(change).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: strings['p.resend'] })).toBeNull();
  });
});

describe('the support reply email', () => {
  const sw = async (): Promise<HTMLElement> => within(await section('emails')).findByRole('switch', { name: strings['mail.support'] }, { timeout: 8000 });

  it('is a switch in the Emails section that shows what the profile says', async () => {
    await renderPage(page, {});
    expect(await sw()).toBeChecked();
    expect(await section('emails')).toHaveTextContent(strings['mail.supportHelp']);
  });

  it('reads off when the profile says off', async () => {
    await renderPage(page, { state: 'support-mail-off' });
    expect(await sw()).not.toBeChecked();
  });

  it('an unknown outcome locks the switch and offers Check again, nothing else', async () => {
    await renderPage(page, { state: 'support-mail-pending' });
    const el = await sw();
    await userEvent.click(el);
    const emails = await section('emails');
    await within(emails).findByRole('button', { name: strings['check.again'] }, { timeout: 8000 });
    expect(await sw()).toBeDisabled();
  });

  it('a refusal is said on the row and the switch stays as the profile reads', async () => {
    await renderPage(page, { state: 'support-mail-failed' });
    await userEvent.click(await sw());
    const emails = await section('emails');
    await waitFor(() => expect(within(emails).getByRole('alert')).toBeInTheDocument(), { timeout: 8000 });
    expect(await sw()).toBeChecked();
    expect(await sw()).not.toBeDisabled();
  });
});
