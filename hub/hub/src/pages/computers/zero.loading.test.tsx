// Vitest: two Computers zero-state gaps. While the first setup read is out the page shows
// a loading placeholder, never a blank area and never "being prepared". A held create seen by a login that may not
// create has no Check on it; its body says who can check it and where, instead of asking this login to check.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const mock = vi.hoisted(() => ({ held: false }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const heldOf = core.heldChanges as (lock: string, o?: unknown) => unknown[];
  return {
    ...core,
    // held: this browser's computer create came back unknown and is held (a sender and an identity).
    heldChanges: (lock: string, o?: unknown) => (mock.held && lock === 'computer.create' ? [{ key: 'k', identity: { project: 'p1', name: 'atlas' }, target: null, realm: R1, at: 1, by: 'q:create@computer.create', from: null, persisted: true, hold: 'h', seq: 1 }] : heldOf(lock, o)),
  };
});

describe('computers zero state: loading, and a held create without the create permission', () => {
  it('while the first setup read is out, a loading placeholder shows (not blank, not "being prepared")', async () => {
    mock.held = false;
    await renderPage(page, { state: 'emptySetupSlow', realm: R1 });
    await screen.findByRole('heading', { level: 1 }, { timeout: 8000 });
    await vi.waitFor(() => expect(document.querySelector('.zeroWrap [data-skeleton]')).not.toBeNull(), { timeout: 8000 });
    expect(screen.queryByText(strings['zero.provisioning.title'])).toBeNull();
  }, 30000);

  it('once the setup read answers, the placeholder goes', async () => {
    mock.held = false;
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    await screen.findByText(strings['zero.empty.title'], undefined, { timeout: 8000 });
    expect(document.querySelector('.zeroWrap [data-skeleton]')).toBeNull();
  }, 30000);

  it('a held create on a login that may not create says who can check it and where, with no Check on it', async () => {
    mock.held = true;
    await renderPage(page, { state: 'emptyLimited', realm: R1 });
    await screen.findByText(strings['zero.provisioning.title'], undefined, { timeout: 8000 });
    expect(screen.getByText(strings['zero.provisioning.heldNoCreate'])).toBeInTheDocument();
    expect(screen.queryByText(strings['zero.provisioning.heldBody'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['zero.provisioning.check'] })).toBeNull();
    mock.held = false;
  }, 30000);

  it('a held create on a login that may create keeps Check on it and its body', async () => {
    mock.held = true;
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    expect(await screen.findByRole('button', { name: strings['zero.provisioning.check'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(strings['zero.provisioning.heldBody'])).toBeInTheDocument();
    mock.held = false;
  }, 30000);
});
