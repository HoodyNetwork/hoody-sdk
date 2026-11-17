// Vitest: each computer's SSH key, read
// only; the row itself opens that computer's SSH block (no button on every row). Account-level keys do not exist in the
// Hoody API yet (an API issue asks for them).
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keySummary } from './logic';
import { locks } from './parts/locks';
import page from './page';
import strings from './strings.en.json';

beforeEach(() => {
  bootFixtureCore();
  locks.clear();
});

const FULL = 'AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000AcctKey1';

describe('computer SSH keys', () => {
  it('sums a key up by its type, its last characters and its comment, never whole', () => {
    expect(keySummary(`ssh-ed25519 ${FULL} ada@laptop`)).toEqual({ type: 'ED25519', tail: 'AcctKey1', comment: 'ada@laptop' });
    expect(keySummary('ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQRsaTail9')).toEqual({ type: 'RSA', tail: 'RsaTail9', comment: '' });
    expect(keySummary('ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYEcdsaEnd1 me')).toEqual({ type: 'ECDSA', tail: 'cdsaEnd1', comment: 'me' });
    expect(keySummary('')).toBeNull();
    expect(keySummary(null)).toBeNull();
    expect(keySummary('not a key')).toEqual({ type: '', tail: '', comment: '' });
  });

  it('lists each computer with its key or none, never the whole key', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    expect(await within(table).findByText('atlas')).toBeInTheDocument();
    expect(within(table).getByText(/AcctKey1/)).toBeInTheDocument();
    expect(within(table).getAllByText(strings['k.none']).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain(FULL);
  });

  /** The table row whose computer cell reads `name`. */
  const rowOf = (table: HTMLElement, name: string) => within(table).getByText(name, { selector: 'bdi' }).closest('tr') as HTMLElement;

  it('a computer row opens that computer on its Connect tab, where its SSH key is set (a click on the row)', async () => {
    const { router } = await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    await within(table).findByText('atlas');
    await userEvent.click(within(rowOf(table, 'atlas')).getByText('ada@laptop'));
    expect(router.state.location.pathname).toBe('/computers');
    expect(router.state.location.search).toMatchObject({ sel: 'atlas.00a1', tab: 'connect' });
  });

  it('Enter on the focused row opens it the same way', async () => {
    const { router } = await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    await within(table).findByText('cedar');
    rowOf(table, 'cedar').focus();
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/computers');
    expect(router.state.location.search).toMatchObject({ sel: expect.stringMatching(/^cedar\./), tab: 'connect' });
  });

  it('no row draws a button of its own (no button repeated on every row)', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    await within(table).findByText('atlas');
    const rows = ['atlas', 'borealis', 'cedar', 'fjord', 'granite'].map((n) => rowOf(table, n));
    for (const row of rows) {
      expect(within(row).queryAllByRole('button')).toEqual([]);
      expect(row.hasAttribute('data-row-opens')).toBe(true);
    }
    expect(within(table).queryByRole('button', { name: /SSH settings/ })).toBeNull();
  });

  it('a screen reader hears what the focused row opens: its description names the computer', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    await within(table).findByText('atlas');
    expect(rowOf(table, 'atlas')).toHaveAccessibleDescription(strings['k.open'].replace('{{name}}', 'atlas'));
    expect(rowOf(table, 'borealis')).toHaveAccessibleDescription(strings['k.add'].replace('{{name}}', 'borealis'));
  });

  it('a computer with no key opens that computer the same way', async () => {
    const { router } = await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    await within(table).findByText('borealis');
    await userEvent.click(within(rowOf(table, 'borealis')).getByText(strings['k.none']));
    expect(router.state.location.pathname).toBe('/computers');
    expect(router.state.location.search).toMatchObject({ sel: expect.stringMatching(/^borealis\./), tab: 'connect' });
  });

  it('on a touch screen each row shows the kit chevron, named for its computer (Open, or Add key with no key)', async () => {
    const coarse = (q: string) => q.includes('coarse') || q.includes('hover: none');
    vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: coarse(q), media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })));
    try {
      const { router } = await renderPage(page);
      const view = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 }).catch(() => screen.findByRole('list', { name: strings['k.title'] }));
      const atlas = await within(view).findByRole('button', { name: strings['k.open'].replace('{{name}}', 'atlas') });
      expect(within(view).getByRole('button', { name: strings['k.add'].replace('{{name}}', 'borealis') })).toBeTruthy();
      expect(within(view).queryByRole('button', { name: strings['k.add'].replace('{{name}}', 'atlas') })).toBeNull();
      // An icon, never words: nothing visible repeats the computer's name.
      expect((atlas.textContent ?? '').trim()).toBe('');
      await userEvent.click(atlas);
      expect(router.state.location.search).toMatchObject({ sel: 'atlas.00a1', tab: 'connect' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the key cell: type and last characters on line one, the comment on its own muted line', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    const note = await within(table).findByText('ada@laptop');
    const row = note.closest('tr') as HTMLElement;
    const top = within(row).getByText('ED25519').parentElement as HTMLElement;
    expect(top.textContent).toContain('AcctKey1');
    expect(top.contains(note)).toBe(false);
    // The bdi sits in a RowNote (the kit's muted row text), beside line one in the same cell box.
    expect(note.parentElement?.parentElement).toBe(top.parentElement);
  });

  it('no computers says so, naming the realm when one is selected', async () => {
    await renderPage(page, { state: 'keys-empty' });
    expect(await screen.findByText(strings['k.emptyRealm'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['k.realmNoteSwitch'])).not.toBeInTheDocument();
  });

  it('no computers in All realms says so plainly', async () => {
    await renderPage(page, { state: 'keys-empty', realm: 'all' });
    expect(await screen.findByText(strings['k.empty'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['k.emptyRealm'])).not.toBeInTheDocument();
  });

  it('under the list, one realm\'s computers are said to be this realm\'s, with the way to All realms', async () => {
    await renderPage(page);
    await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    expect(await screen.findByText(strings['k.realmNoteSwitch'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['k.realmNote'])).not.toBeInTheDocument();
  });

  it('in All realms no realm note shows', async () => {
    await renderPage(page, { realm: 'all' });
    const table = await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 });
    expect(await within(table).findByText('atlas')).toBeInTheDocument();
    expect(screen.queryByText(strings['k.realmNoteSwitch'])).not.toBeInTheDocument();
    expect(screen.queryByText(strings['k.realmNote'])).not.toBeInTheDocument();
  });

  it('a list that cannot be read offers a retry and the rest of the page still shows', async () => {
    await renderPage(page, { state: 'keys-error' });
    expect(await screen.findByRole('table', { name: strings['k.title'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /try again|retry/i }).length).toBeGreaterThan(0);
  });

  it('a list with more computers than one read says only part of this realm is shown', async () => {
    await renderPage(page, { state: 'keys-partial' });
    expect(await screen.findByText(strings['k.partialRealm'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['k.realmNoteSwitch'])).not.toBeInTheDocument();
  });

  it('in All realms the partial note does not name a realm', async () => {
    await renderPage(page, { state: 'keys-partial', realm: 'all' });
    expect(await screen.findByText(strings['k.partial'], {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('a suspended account does not see the keys section', async () => {
    await renderPage(page, { state: 'suspended' });
    expect(await screen.findByText(strings['suspended.title'])).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: strings['k.title'] })).not.toBeInTheDocument();
  });
});
