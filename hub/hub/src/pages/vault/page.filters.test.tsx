// Vitest: the Vault list has two filters, Encryption and Kind. An entry Hoody uses (hoody.*) that is marked encrypted
// shows under Encryption = Encrypted like any other; Kind alone picks Hoody's entries or yours.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import { resetChanges } from '@core/changes';
import page from './page';
import { REALM_A, fixtureAdd, fixtureEntry, resetFixtureVaults } from './fixtures';

const HOODY = 'hoody.fixture-entry';

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  vi.stubGlobal('isSecureContext', true);
  fixtureAdd('import', REALM_A, HOODY, 'fixture-value-hoody');
  fixtureEntry('import', REALM_A, HOODY, { encrypted: true });
});

const shown = async (query: string) => {
  await renderPage(page, { state: 'import', realm: REALM_A, path: `/vault?${query}` });
  await screen.findByText('db-password', {}, { timeout: 10000 });
};

describe('the Vault filters', () => {
  it('Encryption = Encrypted keeps an encrypted hoody.* entry and leaves out the unmarked ones', async () => {
    await shown('lock=encrypted');
    expect(screen.getByText(HOODY)).toBeInTheDocument();
    expect(screen.queryByText('github-token')).toBeNull();
  });
  it('Kind = Used by Hoody shows only hoody.* entries', async () => {
    await renderPage(page, { state: 'import', realm: REALM_A, path: '/vault?whose=hoody' });
    expect(await screen.findByText(HOODY, {}, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByText('db-password')).toBeNull();
    expect(screen.queryByText('github-token')).toBeNull();
  });
});
