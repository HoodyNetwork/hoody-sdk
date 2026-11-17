// Vitest: the vault follows the top bar's realm (no picker of its own). A realm shows that
// realm's entries; "All realms" shows the Global entries with a pointer to the top bar; an old ?in= link is
// dropped, never obeyed; a realm switch closes the open entry and the drawer as a partition change always did.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { queryClient } from '@core';
import { bump, setRealm } from '@core/ctx';
import { resetChanges } from '@core/changes';
import page from './page';
import strings from './strings.en.json';
import { REALM_A, REALM_B, requestLog, resetFixtureVaults } from './fixtures';
import { ALIAS_KEY } from './logic';
import type * as CryptoModule from './crypto';
import type * as DataModule from './data';

// Two seams to hold a save while it is being prepared: the page's own savePut (kept, so a test can read what it
// answered) and the encrypt step it calls (held while `held.crypto` is set). Both delegate to the real thing.
const held = vi.hoisted(() => ({ saves: [] as Array<Promise<unknown>>, crypto: null as Promise<void> | null, encrypted: 0 }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof DataModule>();
  return { ...real, savePut: (r: Parameters<typeof real.savePut>[0]) => { const p = real.savePut(r); held.saves.push(p); return p; } };
});
vi.mock('./crypto', async (orig) => {
  const real = await orig<typeof CryptoModule>();
  return { ...real, encrypt: async (...a: Parameters<typeof real.encrypt>) => { held.encrypted++; if (held.crypto) await held.crypto; return real.encrypt(...a); } };
});

beforeEach(() => {
  resetChanges();
  resetFixtureVaults();
  requestLog.length = 0;
  held.saves.length = 0;
  held.crypto = null;
  held.encrypted = 0;
  vi.stubGlobal('isSecureContext', true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const table = () => screen.findByRole('table', { name: strings.title });
const lists = () => requestLog.filter((r) => r.path === '/vault/keys');
const switchRealm = (r: string) => act(() => { setRealm(r); bump('switch'); });

describe('the vault follows the top-bar realm', () => {
  it('has no partition picker of its own', async () => {
    await renderPage(page, { path: '/vault' });
    await table();
    expect(screen.queryByText('Show entries of')).toBeNull();
    expect(screen.queryByRole('button', { name: /Show entries of/ })).toBeNull();
  });

  it("a selected realm shows that realm's entries, with the realm line", async () => {
    await renderPage(page, { path: '/vault', realm: REALM_B });
    const tb = await table();
    await within(tb).findByRole('row', { name: /stripe-key/ });
    expect(lists().every((r) => r.query.realm_id === REALM_B)).toBe(true);
    expect(screen.getByText(/These entries belong to/)).toBeInTheDocument();
    expect(screen.queryByText(strings['partition.pickHint'])).toBeNull();
  });

  it('"All realms" shows the Global entries, says they are shared, and points at the top bar', async () => {
    await renderPage(page, { path: '/vault', realm: 'all' });
    const tb = await table();
    await within(tb).findByRole('row', { name: new RegExp(ALIAS_KEY.replace('.', '\\.')) });
    expect(lists().length).toBeGreaterThan(0);
    expect(lists().every((r) => !('realm_id' in r.query))).toBe(true);
    expect(screen.getByText(strings['partition.noteGlobal'])).toBeInTheDocument();
    expect(screen.getByText(strings['partition.pickHint'])).toBeInTheDocument();
  });

  it('beside an open entry the list keeps one line naming whose entries these are, in place of the longer note', async () => {
    await renderPage(page, { path: '/vault?sel=github-token', realm: REALM_A });
    await screen.findByRole('button', { name: strings['value.showEye'] });
    expect(await screen.findByText(strings['partition.lineRealm'].replace('{{name}}', 'Personal'))).toBeVisible();
    expect(screen.queryByText(/These entries belong to/)).toBeNull();
  });

  it('beside an open Global entry the line says Global entries', async () => {
    await renderPage(page, { path: `/vault?sel=${encodeURIComponent(ALIAS_KEY)}`, realm: 'all' });
    expect(await screen.findByText(strings['partition.lineGlobal'])).toBeVisible();
    expect(screen.queryByText(strings['partition.noteGlobal'])).toBeNull();
  });

  it('an old ?in= link is ignored and dropped from the address', async () => {
    const { router } = await renderPage(page, { path: `/vault?in=global&sel=github-token`, realm: REALM_A });
    await table();
    expect(lists().every((r) => r.query.realm_id === REALM_A)).toBe(true);
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('in'));
    // The rest of the address stays: the entry the link opened is still open.
    expect((router.state.location.search as { sel?: string }).sel).toBe('github-token');
  });

  it('a realm switch closes the open entry, forgets its value and closes the drawer', async () => {
    const { router } = await renderPage(page, { path: '/vault?sel=github-token', realm: REALM_A });
    await userEvent.click(await screen.findByRole('button', { name: strings['value.showEye'] }));
    await screen.findByRole('button', { name: strings['value.hideEye'] });
    await switchRealm(REALM_B);
    await waitFor(() => expect(screen.queryByRole('button', { name: strings['value.hideEye'] })).toBeNull());
    expect(router.state.location.search).not.toHaveProperty('sel');
    await within(await table()).findByRole('row', { name: /stripe-key/ });

    await act(async () => {
      await router.navigate({ to: '/vault' as never, search: { edit: 'new' } as never });
    });
    await screen.findByRole('dialog');
    await switchRealm('all');
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('edit'));
    expect(screen.getByText(strings['partition.pickHint'])).toBeInTheDocument();
  });

  it('a 403 shows no picker and points at the top bar for another realm', async () => {
    await renderPage(page, { state: 'forbidden', path: '/vault', realm: REALM_A });
    expect(await screen.findByText(strings['forbidden.title'])).toBeInTheDocument();
    expect(screen.queryByText('Show entries of')).toBeNull();
    expect(screen.getByText(strings['partition.pickOther'])).toBeInTheDocument();
    // The body names no picker that is gone: the top bar line above is the one way to another realm.
    expect(screen.queryByText(/Global above/)).toBeNull();
  });
});

// A save is checked against the realm it began in, after the list read and after the encryption. A
// realm switch while it is being prepared closes the entry and the drawer, and the save then sends nothing.
describe('a save being prepared when the top-bar realm changes', () => {
  const puts = () => requestLog.filter((r) => r.method === 'PUT');
  const fill = async (password?: string) => {
    await userEvent.type(await screen.findByLabelText(strings['edit.name']), 'late-key');
    await userEvent.type(screen.getByLabelText(strings['edit.value']), 'late-value');
    if (password) {
      await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(strings['edit.encrypt']) }));
      await userEvent.type(await screen.findByLabelText(strings['edit.password']), password);
      await userEvent.type(screen.getByLabelText(strings['edit.repeat']), password);
    }
  };
  const save = () => userEvent.click(screen.getByRole('button', { name: strings['edit.save'] }));
  const closed = async () => {
    await waitFor(() => expect(screen.queryByLabelText(strings['edit.value'])).toBeNull());
    expect(screen.queryByDisplayValue('late-value')).toBeNull();
  };
  /** Holds the save's own list read (core's fresh read, not the page's list) until released. */
  const holdListRead = () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = queryClient.fetchQuery.bind(queryClient);
    const spy = vi.spyOn(queryClient, 'fetchQuery').mockImplementation(async (o: Parameters<typeof real>[0]) => {
      await gate;
      return real(o);
    });
    return { release, reads: () => spy.mock.calls.length };
  };

  it.each([
    ['another realm', REALM_B],
    ['All realms', 'all'],
  ])('switched to %s while the list read is out: nothing is sent, and the encryption is never started', async (_n, to) => {
    await renderPage(page, { path: '/vault?edit=new', realm: REALM_A });
    await fill('pw-late');
    const list = holdListRead();
    await save();
    await waitFor(() => expect(list.reads()).toBeGreaterThan(0));
    await switchRealm(to);
    await closed();
    list.release();
    expect(await held.saves[0]).toEqual({ outcome: 'not_sent', why: 'moved' });
    expect(held.encrypted).toBe(0);
    expect(puts()).toEqual([]);
  });

  it('switched while the value is being encrypted: nothing is sent when the encryption finishes', async () => {
    let release!: () => void;
    held.crypto = new Promise<void>((r) => (release = r));
    await renderPage(page, { path: '/vault?edit=new', realm: REALM_A });
    await fill('pw-late');
    await save();
    await waitFor(() => expect(held.encrypted).toBe(1));
    await switchRealm(REALM_B);
    await closed();
    release();
    expect(await held.saves[0]).toEqual({ outcome: 'not_sent', why: 'moved' });
    expect(puts()).toEqual([]);
  });

  it('a link with ?in= and ?edit=new opens a working drawer: the old realm hint is not obeyed, one save sends one PUT to the active realm', async () => {
    await renderPage(page, { path: `/vault?in=${REALM_B}&edit=new`, realm: REALM_A });
    await fill();
    await save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(await held.saves[0]).toMatchObject({ outcome: 'done' });
    expect(puts()[0]!.query.realm_id).toBe(REALM_A);
    expect(puts()).toHaveLength(1);
  });
});
