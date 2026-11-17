// Vitest: three vault rows. Open on an encrypted entry is never disabled without a
// reason: pressed with no password it says so in the field and puts the caret there. The new-value hint
// does not deny the eye button beside it. The storage tile shows its percentage once.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import { requestLog, resetFixtureVaults } from './fixtures';
import { resetChanges } from '@core/changes';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});

describe('Open on an encrypted entry', () => {
  it('stays enabled; pressed with no password it asks for one in the field and focuses it', async () => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    const pw = (await screen.findByLabelText(strings['value.password'])) as HTMLInputElement;
    const open = screen.getByRole('button', { name: strings['value.open'] });
    expect(open).toBeEnabled();
    await userEvent.click(open);
    expect(await screen.findByText(strings['value.passwordFirst'])).toBeInTheDocument();
    expect(document.activeElement).toBe(pw);
    expect(screen.queryByText(strings['crypto.decrypt-failed'])).toBeNull();
    // Typing clears the request.
    await userEvent.type(pw, 'x');
    expect(screen.queryByText(strings['value.passwordFirst'])).toBeNull();
  });

  it('an empty Open after a wrong password replaces the old error with the request', async () => {
    await renderPage(page, { path: '/vault?sel=db-password' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await userEvent.type(await screen.findByLabelText(strings['value.password']), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    await screen.findByText(strings['crypto.decrypt-failed']);
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    expect(await screen.findByText(strings['value.passwordFirst'])).toBeInTheDocument();
    expect(screen.queryByText(strings['crypto.decrypt-failed'])).toBeNull();
  });
});

describe('words', () => {
  it('the new-value hint does not say the value is never shown (the field has an eye button)', () => {
    expect(strings['edit.valueDesc']).not.toMatch(/never shown/i);
    expect(strings['edit.valueDesc']).toMatch(/eye/i);
  });

  it('the storage tile shows its percentage once', async () => {
    await renderPage(page, { path: '/vault' });
    // The tile is the dt (label) and its dd (number and detail).
    const term = await screen.findByText(strings['stats.used']);
    const used = term.nextElementSibling?.textContent ?? '';
    expect(used).toMatch(/\d+\s*%/);
    expect(used.match(/\d+\s*%/g) ?? []).toHaveLength(1);
    expect(used).toMatch(/of \d+ MB/);
  });
});
