// The session detail's controls: Board in the detail's header; Computer visits, Make an alias, a
// rule and Disconnect session in its menu; Access settings and Keys as the web-address section's actions. Each is pressed
// here and goes where it went before (the same links the row menu and the old buttons used), and each shows only where
// it applies.
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { portViewPath } from '../board/links';
import page from './page';
import strings from './strings.en.json';

/** The fixture computer the page shows (atlas, id …00a1): every destination names exactly it. */
const HANDLE = 'atlas.00a1';
/** A content area of `px` (the shell's #hub-main): below 600 px a section head folds its secondaries into its ⋯ menu. */
function contentWidth(px: number) {
  const main = document.createElement('main');
  main.id = 'hub-main';
  Object.defineProperty(main, 'clientWidth', { configurable: true, value: px });
  main.setAttribute('data-test-width', String(px));
  document.body.prepend(main);
}
afterEach(() => {
  for (const m of document.querySelectorAll('main#hub-main[data-test-width]')) m.remove();
});

const table = () => screen.findByRole('table', { name: strings.title });
type Router = Awaited<ReturnType<typeof renderPage>>['router'];
const search = (router: Router) => router.state.location.search as Record<string, unknown>;

/** Opens the row whose text matches `pick` and returns the detail's header and the router. */
async function open(pick: (text: string) => boolean, title: string): Promise<{ router: Router; head: HTMLElement }> {
  const { router } = await renderPage(page);
  const tb = await table();
  await within(tb).findByText('127.0.0.1:5432');
  const row = within(tb).getAllByRole('row').find((r) => pick(r.textContent ?? ''));
  if (!row) throw new Error(`no row for ${title}`);
  await userEvent.click(row);
  const head = (await screen.findByRole('heading', { name: title })).closest('header') as HTMLElement;
  return { router, head };
}
const openWeb = () => open((x) => /\b3000\b/.test(x) && x.includes(strings['kind.expose']), `${strings['kind.expose']} :3000`);
/** The web-address section (its own heading's section). */
const webSection = () => screen.getByRole('heading', { name: strings['kind.expose'] }).closest('section') as HTMLElement;
/** The open menu's rows in order: a menu item's name, or '-' for a rule. */
async function menuRows(head: HTMLElement): Promise<string[]> {
  await userEvent.click(within(head).getByRole('button', { name: /more/i }));
  const menu = await screen.findByRole('menu');
  return [...menu.querySelectorAll('[role="menuitem"],[role="separator"]')].map((el) => (el.getAttribute('role') === 'separator' ? '-' : (el.textContent ?? '')));
}

describe('tunnels detail: its controls', () => {
  it('a web address: the menu is Computer visits, Make an alias, a rule, then Disconnect session last', async () => {
    const { head } = await openWeb();
    const rows = await menuRows(head);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatch(new RegExp(`^${strings['action.visits']}`));
    expect(rows[1]).toMatch(new RegExp(`^${strings['action.alias']}`));
    expect(rows[2]).toBe('-');
    expect(rows[3]).toMatch(new RegExp(`^${strings['disc.menu']}`));
    // It opens the confirm (the kit marks such an item with "…").
    expect(rows[3]).toContain('…');
  });

  it('Access settings and Keys are the web-address section\'s own actions, not loose links elsewhere', async () => {
    await openWeb();
    const web = webSection();
    expect(within(web).getByRole('button', { name: strings['access.settings'] })).toBeInTheDocument();
    expect(within(web).getByRole('button', { name: strings['access.keys'] })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['access.settings'] })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: strings['access.keys'] })).toHaveLength(1);
  });

  it('Put on Board opens that port on the Board', async () => {
    const { router, head } = await openWeb();
    await userEvent.click(within(head).getByRole('button', { name: strings['action.board'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe(portViewPath({ handle: HANDLE, protocol: 'http', port: 3000 })));
  });

  it('Computer visits opens this computer\'s logs', async () => {
    const { router, head } = await openWeb();
    await menuRows(head);
    await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${strings['action.visits']}`) }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/logs'));
    expect(search(router).computer).toBe(HANDLE);
  });

  it('Make an alias opens the alias form for this port', async () => {
    const { router, head } = await openWeb();
    await menuRows(head);
    await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${strings['action.alias']}`) }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    expect(search(router).sel).toBe(HANDLE);
    expect(String(search(router).alias)).toBe('3000');
  });

  it('Access settings opens the computer\'s Ports & addresses tab', async () => {
    const { router } = await openWeb();
    await userEvent.click(within(webSection()).getByRole('button', { name: strings['access.settings'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    expect(search(router).sel).toBe(HANDLE);
    expect(search(router).tab).toBe('ports');
  });

  it('Keys opens Keys', async () => {
    const { router } = await openWeb();
    await userEvent.click(within(webSection()).getByRole('button', { name: strings['access.keys'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/keys'));
  });

  it('at phone width Access settings and Keys fold into the web-address section\'s menu and still go to the same places', async () => {
    contentWidth(390);
    const first = await openWeb();
    const web = webSection();
    expect(within(web).queryByRole('button', { name: strings['access.settings'] })).toBeNull();
    await userEvent.click(within(web).getByRole('button', { name: /more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['access.settings']}`) }));
    await waitFor(() => expect(first.router.state.location.pathname).toBe('/computers'));
    expect(search(first.router).sel).toBe(HANDLE);
    expect(search(first.router).tab).toBe('ports');
  });

  it('at phone width Keys is in the web-address section\'s menu and opens Keys', async () => {
    contentWidth(390);
    const { router } = await openWeb();
    const web = webSection();
    expect(within(web).queryByRole('button', { name: strings['access.keys'] })).toBeNull();
    await userEvent.click(within(web).getByRole('button', { name: /more/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['access.keys']}`) }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/keys'));
  });

  it('a place inside the computer: no Board in the header, and the menu holds only Disconnect session, with no rule', async () => {
    const { head } = await open((x) => x.includes('127.0.0.1:5432'), `${strings['kind.pull']} :5432`);
    expect(within(head).queryByRole('button', { name: strings['action.board'] })).toBeNull();
    const rows = await menuRows(head);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(new RegExp(`^${strings['disc.menu']}`));
  });
});
