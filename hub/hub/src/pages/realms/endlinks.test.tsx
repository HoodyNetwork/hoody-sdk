// New realm's way on. The end links ask the shell for the new realm with ?open_realm=
// (shell/realmParam.tsx OPEN_REALM; ?realm= is only the Computers page's filter, so the shell never switched and the
// computer from "Get a computer" landed in no realm). A run that ends fully done (the name saved, every picked
// computer saved, nothing unknown) goes on to the new realm's Computers at once; any other end stays on the results.
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { realmSends, resetRealmsWorld } from './fixtures';
import { OPEN_REALM_KEY } from './links';

// The shell's key, spelled out (pages cannot import the shell); shell/realmParam.test.tsx pins OPEN_REALM_KEY to OPEN_REALM.
const OPEN_REALM = 'open_realm';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const [ATLAS] = fixtureWorld.computers;
if (!ATLAS) throw new Error('fixture computers');
const nameOf = (body: unknown) => JSON.parse((body as { value: string }).value) as Record<string, string>;
const madeId = () => {
  const put = realmSends.find((s) => s.method === 'PUT' && s.path.includes('/vault/keys/'));
  return Object.entries(nameOf(put?.body)).find(([, n]) => n === 'Studio')?.[0] ?? '';
};

async function named(name: string) {
  const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
  await waitFor(() => expect(screen.getByRole('button', { name: strings.next })).toBeEnabled(), { timeout: T });
  await userEvent.type(field, name);
  await userEvent.click(screen.getByRole('button', { name: strings.next }));
}
// The row is looked up afresh until the name shows inside one, never held: the table may draw again (a new render, or
// table -> list once it is measured) and a node found before that can be gone.
const pick = async (name: string) => {
  const row = await waitFor(() => {
    const r = screen.getByText(name).closest<HTMLElement>('[data-row-id]');
    expect(r, name).not.toBeNull();
    return r as HTMLElement;
  }, { timeout: T });
  await userEvent.click(within(row).getByRole('checkbox'));
};
const create = async () => {
  await userEvent.click(screen.getByRole('button', { name: strings.next }));
  await userEvent.click(await screen.findByRole('button', { name: strings.create }));
};

// A stay is a non-event: give a navigation the time a go-on takes here (the lazy Computers route) before reading it.
const settle = () => new Promise((r) => setTimeout(r, 2000));

beforeEach(() => resetRealmsWorld());

describe('New realm goes on in the new realm', () => {
  it('the page links by the shell\'s realm-link key', () => {
    expect(OPEN_REALM_KEY).toBe(OPEN_REALM);
  });

  it('fully done (name saved, every computer saved): straight to the new realm\'s Computers, by the shell\'s key', async () => {
    const { router } = await renderPage(page, { path: '/realms/new' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'), { timeout: T });
    const id = madeId();
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    const q = router.state.location.search as Record<string, unknown>;
    expect(q[OPEN_REALM]).toBe(id);
    expect(q.realm).toBeUndefined();
  });

  it('an empty realm made in full also goes on to it', async () => {
    const { router } = await renderPage(page, { path: '/realms/new' });
    await named('Studio');
    await create();
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'), { timeout: T });
    expect((router.state.location.search as Record<string, unknown>)[OPEN_REALM]).toBe(madeId());
  });

  it('a partial run stays on the results; Open and Get a computer link by the shell\'s key, never ?realm=', async () => {
    const { router } = await renderPage(page, { path: '/realms/new', state: 'computerRefused' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    const get = await screen.findByRole('button', { name: strings.get }, { timeout: T });
    expect(router.state.location.pathname).toBe('/realms/new');
    const id = madeId();
    await userEvent.click(get);
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    const q = router.state.location.search as Record<string, unknown>;
    expect(q[OPEN_REALM]).toBe(id);
    expect(String(q.get)).toBe('1');
    expect(q.realm).toBeUndefined();
  });

  it('a computer whose lost answer is read back as added and settled is made in full: it goes on too', async () => {
    const { router } = await renderPage(page, { path: '/realms/new', state: 'computerLanded' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'), { timeout: T });
    expect((router.state.location.search as Record<string, unknown>)[OPEN_REALM]).toBe(madeId());
  });

  it('a computer saved while its lost send is still held (read back with another realm too) stays on the results', async () => {
    const { router } = await renderPage(page, { path: '/realms/new', state: 'computerHeld' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    // Every computer reads saved, but the lost send is still out: only this page can check or free it.
    await screen.findByRole('button', { name: /check again/i }, { timeout: T });
    expect(screen.getByRole('button', { name: strings.open })).toBeInTheDocument();
    await settle();
    expect(router.state.location.pathname).toBe('/realms/new');
    // Not even tried: a go-on here would only meet the page's leave question.
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('the partial run\'s Open goes to the new realm too', async () => {
    const { router } = await renderPage(page, { path: '/realms/new', state: 'computerRefused' });
    await named('Studio');
    await pick(ATLAS.name);
    await create();
    await userEvent.click(await screen.findByRole('button', { name: strings.open }, { timeout: T }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    const q = router.state.location.search as Record<string, unknown>;
    expect(q[OPEN_REALM]).toBe(madeId());
    expect(q.realm).toBeUndefined();
  });
});
