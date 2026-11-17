// Vitest: the way out of an encrypted entry's password row. While the row is open the field's
// eye and Copy wait, and Cancel is always there, also after Show encrypted form; Cancel drops everything read and goes
// back to the unread field. Once opened, the value shows at once and the eye hides it (which drops it).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import { FIXTURE_PASSWORD, requestLog, resetFixtureVaults } from './fixtures';
import { resetChanges } from '@core/changes';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: vi.fn() }));

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  vi.stubGlobal('isSecureContext', true);
});

const eye = () => screen.queryByRole('button', { name: strings['value.showEye'] });
const hide = () => screen.queryByRole('button', { name: strings['value.hideEye'] });
const copy = () => screen.queryByRole('button', { name: strings['value.copy'] });
const cancel = () => screen.queryByRole('button', { name: strings['value.cancel'] });
const reads = () => requestLog.filter((r) => r.method === 'GET' && r.path.startsWith('/vault/keys/'));

async function showEncrypted(): Promise<void> {
  await renderPage(page, { path: '/vault?sel=db-password' });
  await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
  await screen.findByLabelText(strings['value.password']);
}

describe('encrypted entry, password row open', () => {
  it('the eye and Copy wait; Cancel goes back to the unread field and the eye reads again', async () => {
    await showEncrypted();
    expect(eye()).toBeDisabled();
    expect(copy()).toBeDisabled();
    expect(hide()).toBeNull();
    await userEvent.click(cancel()!);
    expect(screen.queryByLabelText(strings['value.password'])).toBeNull();
    expect(eye()).toBeEnabled();
    await userEvent.click(eye()!);
    await screen.findByLabelText(strings['value.password']);
    expect(reads()).toHaveLength(2);
  });

  it('Cancel stays after Show encrypted form, and drops the envelope too', async () => {
    await showEncrypted();
    await userEvent.click(screen.getByRole('button', { name: strings['value.copyEnvelope'] }));
    expect(await screen.findByText(strings['value.envelopeDesc'])).toBeInTheDocument();
    expect(cancel()).toBeInTheDocument();
    await userEvent.click(cancel()!);
    expect(screen.queryByText(strings['value.envelopeDesc'])).toBeNull();
    expect(eye()).toBeEnabled();
  });

  it('after Open the value shows at once: the eye hides it, no Cancel', async () => {
    await showEncrypted();
    await userEvent.type(screen.getByLabelText(strings['value.password']), FIXTURE_PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: strings['value.open'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    expect(cancel()).toBeNull();
    await userEvent.click(hide()!);
    expect(eye()).toBeEnabled();
    expect(screen.queryByLabelText(strings['value.password'])).toBeNull();
  });
});

describe('plain entry', () => {
  it('the eye shows its value at once, with no Cancel', async () => {
    await renderPage(page, { path: '/vault?sel=github-token' });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    expect(cancel()).toBeNull();
  });
});
