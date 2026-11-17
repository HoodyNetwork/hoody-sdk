// Vitest: what the page says about two-step sign-in when it cannot tell, and when the account has no password.
// A status that could not be read is unknown: its help never says on or off. An account with no password is never
// told that a password alone signs in.
import { bootFixtureCore } from '@core';
import { renderPage, screen, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  bootFixtureCore();
});

const summary = (): Promise<HTMLElement> => screen.findByRole('list', { name: strings['sum.railTitle'] }, { timeout: 8000 });

describe('two-step sign-in words', () => {
  it('an unreadable status claims neither on nor off', async () => {
    await renderPage(page, { state: 'twofa-unreadable' });
    const help = await screen.findByText(strings['2fa.unreadHelp'], {}, { timeout: 8000 });
    expect(help.textContent).not.toMatch(/\b(is|are) (not )?(on|off)\b(?! or )/i);
    expect(help.textContent).toMatch(/could not tell/i);
  });

  it('an account with no password is not told that a password alone signs in', async () => {
    await renderPage(page, { state: 'no-password' });
    const list = await summary();
    expect(await within(list).findByText(strings['sum.twofaOffNoPassword'])).toBeInTheDocument();
    expect(list).not.toHaveTextContent(/password alone/i);
  });

  it('an account with a password and two-step sign-in off keeps the full line', async () => {
    await renderPage(page, { state: 'twofa-off' });
    expect(await within(await summary()).findByText(strings['sum.twofaOff'])).toBeInTheDocument();
  });
});
