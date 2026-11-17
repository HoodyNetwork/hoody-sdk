// Programs shows the computer's open ports (each web port with its address and Create
// alias) and its aliases, each with its address (the host name a person's own domain points at), on a Ports & aliases tab. Every state:
// ready, loading, failed, empty, and a token session without the alias permission.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Core from '@core';
import page from './page';
import strings from './strings.en.json';

const caps = vi.hoisted(() => ({ aliases: true }));
vi.mock('@core', async (orig) => {
  const core = await orig<typeof Core>();
  return { ...core, useCan: (cap: string) => (cap === 'resources.proxy_aliases' ? caps.aliases : core.useCan(cap)) };
});

const PATH = '/programs?tab=ports';
const portsTable = () => screen.findByRole('table', { name: strings['pa.ports.title'] });
const aliasesTable = () => screen.findByRole('table', { name: strings['pa.aliases.title'] });
const rowOf = (table: HTMLElement, text: string) => {
  const row = within(table).getAllByRole('row').find((r) => r.querySelector('td') && within(r).queryAllByText(text, { exact: false }).length > 0);
  if (!row) throw new Error(`no row with ${text}`);
  return row;
};
/** A row's action names: its buttons, and the entries of its Row actions menu (opened, read, closed). */
const rowEntries = async (row: HTMLElement): Promise<string[]> => {
  const names = within(row).queryAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
  const more = within(row).queryByRole('button', { name: /Row actions/ });
  if (!more) return names;
  await userEvent.click(more);
  const menu = await screen.findByRole('menu');
  names.push(...within(menu).getAllByRole('menuitem').map((m) => m.getAttribute('aria-label') ?? m.textContent ?? ''));
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  return names;
};
const createOffers = () => screen.queryAllByRole('button', { name: /^Create alias for port/ }).map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');

describe('Programs: Ports & aliases tab', () => {
  afterEach(() => {
    caps.aliases = true;
  });

  it('is a tab of the page, beside Running programs and Apps', async () => {
    await renderPage(page, { path: PATH });
    const tab = await screen.findByRole('tab', { name: strings['tab.ports'] });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: strings['tab.running'] })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: strings['tab.apps'] })).toBeInTheDocument();
  });

  it('lists every open port with its address, its aliases, and Create alias on the person\'s own web ports only', async () => {
    await renderPage(page, { path: PATH });
    const table = await portsTable();
    for (const p of ['3000', '8001', '5432', '9229', '4100']) expect(rowOf(table, p)).toBeTruthy();
    // Hoody's own sshd and ttyd are counted, never listed.
    expect(within(table).queryByText('22')).toBeNull();
    expect(screen.getByText('2 ports Hoody uses itself are not shown.')).toBeInTheDocument();
    // Port 3000's alias by name; the debugger only inside the computer; postgres is not a web port, so no address.
    expect(within(rowOf(table, '3000')).getByText('shop-front')).toBeInTheDocument();
    expect(within(rowOf(table, '9229')).getByText(/^Only inside /)).toBeInTheDocument();
    expect(within(rowOf(table, '5432')).getByText(strings['pa.ports.noAddress'])).toBeInTheDocument();
    expect(within(rowOf(table, '4100')).getByText(strings['pa.ports.kit'])).toBeInTheDocument();
    // Web ports of the person's programs only: not the kit plugin's 4100, not 9229 (local) or 5432 (not web).
    expect(createOffers().sort()).toEqual(['Create alias for port 3000', 'Create alias for port 8001']);
  });

  it('Create alias opens Computers\' alias drawer for that port', async () => {
    const { router } = await renderPage(page, { path: PATH });
    await portsTable();
    await userEvent.click(screen.getByRole('button', { name: 'Create alias for port 3000' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/computers'));
    expect(new URLSearchParams(router.state.location.search).get('alias')).toBe('3000');
  });

  it('lists the aliases with where they go and their address: the host name once, as the link, with one Copy of it', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (v: string) => (written.push(v), Promise.resolve()) } });
    await renderPage(page, { path: PATH });
    const table = await aliasesTable();
    // Three columns: the address is not repeated in a second one.
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent).filter((h) => h && !/^Row actions/.test(h))).toEqual([strings['pa.aliases.col.name'], strings['pa.aliases.col.to'], strings['pa.aliases.col.address']]);
    const web = rowOf(table, 'shop-front');
    expect(within(web).getByText('Port 3000')).toBeInTheDocument();
    expect(within(web).getByRole('link', { name: 'shop-front.custom-domain.example.test' })).toHaveAttribute('href', 'https://shop-front.custom-domain.example.test/');
    expect(within(web).getAllByText('shop-front.custom-domain.example.test')).toHaveLength(1);
    // The row's one Copy copies the host name alone (no scheme, no path): the value a CNAME record points at.
    const api = rowOf(table, 'api-two');
    expect(within(api).getByRole('link', { name: 'api-two.custom-domain.example.test' })).toHaveAttribute('href', 'https://api-two.custom-domain.example.test/v1');
    // With a mouse the Copy shows on the hovered row (on touch it is in the row's menu).
    await userEvent.hover(api);
    await userEvent.click(await within(api).findByRole('button', { name: 'Copy the address of api-two' }));
    await waitFor(() => expect(written).toEqual(['api-two.custom-domain.example.test']));
    expect((await rowEntries(web)).filter((n) => /^Copy/.test(n))).toEqual(['Copy the address of shop-front']);
    // A program alias names its program in plain words, not its raw id or a port.
    expect(within(rowOf(table, 'term-desk')).getByText('Terminal 3000')).toBeInTheDocument();
    expect(within(table).queryByText('terminal')).toBeNull();
    expect(within(table).getAllByRole('row').filter((r) => r.querySelector('td'))).toHaveLength(5);
  });

  it('Goes to names exactly what: the script a public link opens (named and linked), a gone script, the instance of a program', async () => {
    await renderPage(page, { state: 'ports-long', path: PATH });
    const table = await aliasesTable();
    // A script's public link: the script as the Scripts page lists it, once its folder's list is read, linked to it there.
    const script = rowOf(table, 'lively-harbor-aik27wtzxcjd0vw3');
    const named = await within(script).findByRole('link', { name: 'Script · Probe ai (/probe-ai)' });
    expect(named.getAttribute('href')).toMatch(/#?\/scripts\?sel=/);
    expect(within(table).queryByText('exec')).toBeNull();
    // A path no listed script answers: said plainly, no raw id, no link.
    const gone = rowOf(table, 'quiet-otter-p2k9d7fh1smq0x');
    expect(within(gone).getByText('Script no longer exists (/old-report)')).toBeInTheDocument();
    expect(within(gone).queryByRole('link', { name: /Script/ })).toBeNull();
    // A program alias: the program by name and its instance; a desktop links to the computer's Desktop tab.
    expect(within(rowOf(table, 'brave-falcon-7tq2m')).getByText('Terminal 2')).toBeInTheDocument();
    expect(within(rowOf(table, 'calm-meadow-z8r1v')).getByRole('link', { name: 'Desktop 1' }).getAttribute('href')).toMatch(/tab=desktop/);
    // A port alias: its port.
    expect(within(rowOf(table, 'humble-robin-h4fg2pflcajyi9md')).getByText('Port 3000')).toBeInTheDocument();
    // A long name: its whole host name is the link.
    const host = 'customer-portal-staging-environment-for-the-spring-release-v2.atlas.computers.example.test';
    expect(within(rowOf(table, 'customer-portal-staging-environment-for-the-spring-release-v2')).getByRole('link', { name: host })).toHaveTextContent(host);
  });

  it('while a script folder cannot be read, a public link says its path and that it could not be checked', async () => {
    await renderPage(page, { state: 'ports-long-noscripts', path: PATH });
    const table = await aliasesTable();
    expect(await within(rowOf(table, 'lively-harbor-aik27wtzxcjd0vw3')).findByText("Script at /probe-ai (couldn't check)")).toBeInTheDocument();
  });

  it('how to use your own domain: a short Why under the table whose link opens the steps, true to how a domain reaches an alias', async () => {
    await renderPage(page, { path: PATH });
    await aliasesTable();
    await userEvent.click(screen.getByRole('button', { name: strings['pa.why.q'] }));
    expect(await screen.findByText(strings['pa.why.a'])).toBeInTheDocument();
    expect(strings['pa.why.a']).toMatch(/CNAME record for a name under your domain, pointing at the alias's address/);
    // It ends with the page question's link (the tab's Questions: portsfaq.test.tsx), which holds the steps.
    expect(screen.getByRole('link', { name: strings['pa.why.more'] })).toBeInTheDocument();
    // Nothing names a column that no longer exists.
    expect(JSON.stringify(strings)).not.toContain('Your domain points to');
  });

  it('a program of the person\'s named agent (a home path) is listed as theirs; only Hoody\'s sshd is counted apart', async () => {
    await renderPage(page, { state: 'ports-own-agent', path: PATH });
    const table = await portsTable();
    expect(within(rowOf(table, '3000')).getByText('agent')).toBeInTheDocument();
    expect(within(table).queryByText('22')).toBeNull();
    expect(screen.getByText('1 port Hoody uses itself is not shown.')).toBeInTheDocument();
  });

  it('the system\'s avahi-daemon ports (5353 and its two random UDP ports) are counted with Hoody\'s own, never listed', async () => {
    await renderPage(page, { state: 'ports-avahi', path: PATH });
    const table = await portsTable();
    expect(rowOf(table, '3000')).toBeTruthy();
    expect(within(table).queryByText('avahi-daemon')).toBeNull();
    for (const p of ['5353', '34135', '39180']) expect(within(table).queryByText(p), p).toBeNull();
    expect(within(table).getAllByRole('row').filter((r) => r.querySelector('td'))).toHaveLength(1);
    expect(screen.getByText('4 ports Hoody uses itself are not shown.')).toBeInTheDocument();
  });

  it('an alias address that is not an absolute http(s) URL is shown as no address: no link, no copy', async () => {
    await renderPage(page, { state: 'ports-odd-urls', path: PATH });
    const table = await aliasesTable();
    for (const name of ['rel-path', 'no-scheme', 'malformed', 'ftp-site', 'script-url']) {
      const row = rowOf(table, name);
      expect(within(row).queryByRole('link'), name).toBeNull();
      expect(within(row).getByText(strings.none), name).toBeInTheDocument();
      expect(await rowEntries(row), name).not.toContain(`Copy the address of ${name}`);
    }
    const good = rowOf(table, 'good-one');
    expect(within(good).getByRole('link', { name: 'good-one.custom-domain.example.test' })).toHaveAttribute('href', 'https://good-one.custom-domain.example.test/');
    expect(await rowEntries(good)).toContain('Copy the address of good-one');
  });

  it('loading: both sections stand in with loading lines, no table yet', async () => {
    await renderPage(page, { state: 'ports-loading', path: PATH });
    expect(await screen.findByRole('heading', { name: strings['pa.ports.title'] })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: strings['pa.aliases.title'] })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: strings['pa.ports.title'] })).toBeNull();
    expect(screen.queryByRole('table', { name: strings['pa.aliases.title'] })).toBeNull();
  });

  it('failed: each section says so with Try again, and no table', async () => {
    await renderPage(page, { state: 'ports-error', path: PATH });
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Try again/ })).toHaveLength(2));
    expect(screen.queryByRole('table', { name: strings['pa.ports.title'] })).toBeNull();
    expect(screen.queryByRole('table', { name: strings['pa.aliases.title'] })).toBeNull();
  });

  it('empty: nothing listening and no alias yet, each said in its section', async () => {
    await renderPage(page, { state: 'ports-empty', path: PATH });
    expect(await screen.findByText(strings['pa.ports.empty'])).toBeInTheDocument();
    expect(await screen.findByText(strings['pa.aliases.empty'])).toBeInTheDocument();
    expect(createOffers()).toEqual([]);
  });

  it('a token without the alias permission: the aliases section says so, and no port offers an alias', async () => {
    caps.aliases = false;
    await renderPage(page, { path: PATH });
    expect(await screen.findByText(strings['pa.aliases.lacks'])).toBeInTheDocument();
    await portsTable();
    expect(screen.queryByRole('table', { name: strings['pa.aliases.title'] })).toBeNull();
    expect(createOffers()).toEqual([]);
  });
});
