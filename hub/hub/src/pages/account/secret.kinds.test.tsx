// Vitest: which kind of SecretInput each account field is. An existing password asked again ("current password") says
// current-password and carries no password-manager opt-out, so a saved password still fills and the browser offers no generator;
// a new password says new-password and carries no opt-out, so a manager may offer to save or generate one. (The Hub passcode sheet, LockSheet, keeps the default kind.)
import { bootFixtureCore } from '@core';
import { renderPage, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

const OPT_OUTS = ['data-1p-ignore', 'data-lpignore', 'data-bwignore', 'data-form-type'] as const;

async function openDialog(): Promise<HTMLElement> {
  return waitFor(() => {
    const d = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    if (!d) throw new Error('no open dialog');
    return d;
  });
}

function expectCurrentPassword(el: HTMLElement) {
  expect(el.getAttribute('autocomplete')).toBe('current-password');
  for (const k of OPT_OUTS) expect(el.hasAttribute(k), k).toBe(false);
}

function expectNewPassword(el: HTMLElement) {
  expect(el.getAttribute('autocomplete')).toBe('new-password');
  for (const k of OPT_OUTS) expect(el.hasAttribute(k), k).toBe(false);
}

describe('account fields: the kind of each SecretInput', () => {
  it('change password: the current one is current-password, the new ones are new-password with no opt-out', async () => {
    await renderPage(page, { path: '/account?sheet=password' });
    const d = within(await openDialog());
    expectCurrentPassword(await d.findByLabelText(strings['pw.current']));
    expectNewPassword(d.getByLabelText(strings['pw.new']));
    expectNewPassword(d.getByLabelText(strings['pw.again']));
  });

  it('two-step setup: the password it asks again is current-password', async () => {
    await renderPage(page, { state: 'twofa-off', path: '/account?sheet=setup' });
    expectCurrentPassword(await within(await openDialog()).findByLabelText(strings['pw.current']));
  });

  it('backup codes: the password it asks again is current-password', async () => {
    await renderPage(page, { path: '/account?sheet=codes' });
    expectCurrentPassword(await within(await openDialog()).findByLabelText(strings['pw.current']));
  });

  it('change email: the password it asks again is current-password', async () => {
    await renderPage(page, { path: '/account?sheet=email' });
    expectCurrentPassword(await within(await openDialog()).findByLabelText(strings['e.password']));
  });
});
