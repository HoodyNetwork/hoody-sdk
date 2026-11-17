// Vitest: an encrypted entry's password row. Enter in the password field opens the value, the same as Open, and
// "Show encrypted form" shows the encrypted form with that one press.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import { FIXTURE_PASSWORD, requestLog, resetFixtureVaults } from './fixtures';
import { resetChanges } from '@core/changes';

// copyWhenRead is wrapped so a test can keep what a Copy press handed it (its reader and its still-wanted check).
const copies: { read: () => Promise<string | null>; ok: () => boolean }[] = [];
vi.mock('@kit', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const cwr = real.copyWhenRead as (read: () => Promise<string | null>, ok: () => boolean) => unknown;
  return {
    ...real,
    showToast: vi.fn(),
    copyWhenRead: (read: () => Promise<string | null>, ok: () => boolean) => {
      copies.push({ read, ok });
      return cwr(read, ok);
    },
  };
});

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  copies.length = 0;
  vi.stubGlobal('isSecureContext', true);
});

async function showEncrypted(): Promise<void> {
  await renderPage(page, { path: '/vault?sel=db-password' });
  await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
  await screen.findByLabelText(strings['value.password']);
}

describe('encrypted entry, password row', () => {
  it('Enter in the password field opens the value, as Open does', async () => {
    await showEncrypted();
    await userEvent.type(screen.getByLabelText(strings['value.password']), `${FIXTURE_PASSWORD}{Enter}`);
    expect(await screen.findByRole('button', { name: strings['value.hideEye'] }, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);

  it('one press of Show encrypted form shows the encrypted form', async () => {
    await showEncrypted();
    await userEvent.click(screen.getByRole('button', { name: strings['value.copyEnvelope'] }));
    // Shown: the field now offers to hide it, with no second Show press.
    expect(screen.queryByRole('button', { name: strings['value.copyEnvelope'] })).toBeNull();
    // The kit field's own Hide (the encrypted form is shown), not a second Show to press.
    expect(await screen.findByRole('button', { name: /^Hide$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Show$/ })).toBeNull();
  }, 30000);

  it('the encrypted form\'s Copy, read after Cancel dropped it, copies nothing', async () => {
    await showEncrypted();
    await userEvent.click(screen.getByRole('button', { name: /^Copy$/ }));
    const c = copies.at(-1)!;
    expect(c).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: strings['value.cancel'] }));
    expect(await c.read()).toBeNull();
    expect(c.ok()).toBe(false);
  }, 30000);
});
