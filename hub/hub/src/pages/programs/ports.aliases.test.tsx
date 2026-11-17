// A program's ports and their aliases. The list's Ports cell of a single-port program opens its address; the
// inspector's Ports table lists each port's existing proxy aliases as links in its Alias column (Create alias is in the
// row's menu). The aliases come from the proxy's
// alias list (core's alias read), joined to a program by port: only aliases that point at a port (http, https, or no
// program from an older API), and never on a system program. Each link is the alias record's own url, as given.
import * as core from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { aliasHold, aliasReads, aliasRows, many } from './fixtures';
import * as logic from './logic';
import page from './page';

type Rows = readonly { id: string; port: number; program?: string; url: string }[];
// The pure helpers this set adds (core's alias parse, the page's join), read through their modules so a missing one is
// an assertion that names it.
const parse = (raw: unknown): Rows => {
  expect(core, 'core exports the alias list parse').toHaveProperty('aliasRowsOf');
  return (core as unknown as { aliasRowsOf: (r: unknown) => Rows }).aliasRowsOf(raw);
};
const join = (row: logic.Row, rows: Rows): ReadonlyMap<number, Rows> => {
  expect(logic, 'logic exports the alias join').toHaveProperty('programAliases');
  return (logic as unknown as { programAliases: (r: logic.Row, a: Rows) => ReadonlyMap<number, Rows> }).programAliases(row, rows);
};
const wire = { data: { aliases: aliasRows } };
const rowOf = (key: string): logic.Row => {
  const r = core.programModel(many)?.rows.find((x) => x.key === key);
  if (!r) throw new Error(`no fixture row ${key}`);
  return r;
};
const ids = (m: ReadonlyMap<number, Rows>, port: number) => (m.get(port) ?? []).map((a) => a.id);

describe('the alias join', () => {
  it('parses the proxy answer, keeping each alias record\'s url exactly as the proxy gave it', () => {
    const rows = parse(wire);
    expect(rows.map((a) => a.url)).toEqual(aliasRows.map((a) => a.url));
    expect(rows.find((a) => a.id === 'al-api')).toMatchObject({ port: 8001, program: 'https', url: 'https://api-two.custom-domain.example.test/v1' });
    expect(parse({ data: {} })).toEqual([]);
    expect(parse(null)).toEqual([]);
  });

  it('joins a single-port program by its port, leaving out an alias of another program (terminal) with the same number', () => {
    const m = join(rowOf('prog:1'), parse(wire));
    expect(ids(m, 3000)).toEqual(['al-web']);
    expect([...m.keys()]).toEqual([3000]);
  });

  it('joins a range by its ports: a running part and a configured port with no part yet (no program: an older API)', () => {
    const m = join(rowOf('prog:2'), parse(wire));
    expect(ids(m, 8001)).toEqual(['al-api']);
    expect(ids(m, 8003)).toEqual(['al-old']);
    expect(ids(m, 8000)).toEqual([]);
  });

  it('gives a system program no aliases, even one on its port', () => {
    const sys = rowOf('prog:100');
    expect(sys.scope).toBe('system');
    expect(sys.port).toBe(15000);
    expect(join(sys, parse(wire)).size).toBe(0);
  });

  it('gives a program without a port none', () => {
    expect(join(rowOf('prog:3'), parse(wire)).size).toBe(0);
  });
});

describe('the list: a single-port program\'s Ports cell opens its address', () => {
  afterEach(() => vi.restoreAllMocks());

  it('web\'s 3000 opens its port address in a new tab and leaves the row unselected', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const r = await renderPage(page, { state: 'many' });
    const row = (await screen.findAllByText('web')).map((n) => n.closest('tr')).find(Boolean) as HTMLElement;
    const link = await within(row).findByRole('button', { name: /^3000 \(opens in a new tab\)$/ });
    expect(link).toHaveTextContent('3000');
    await act(async () => link.click());
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/[^/]*-3000\./), '_blank', 'noopener');
    expect((r.router.state.location.search as Record<string, unknown>).sel).toBeUndefined();
  });

  it('a range keeps its up/n text, with no address link', async () => {
    await renderPage(page, { state: 'many' });
    const row = (await screen.findAllByText('api')).map((n) => n.closest('tr')).find(Boolean) as HTMLElement;
    expect(row.textContent).toContain('8000-8003 · 2/4 up');
    expect(within(row).queryByRole('button', { name: /opens in a new tab/ })).toBeNull();
    expect(within(row).queryByRole('link', { name: /opens in a new tab/ })).toBeNull();
  });
});

/** The Ports table's row of a port, once it shows. */
const findPortRow = async (port: number): Promise<HTMLElement> =>
  waitFor(() => {
    const row = screen.getAllByRole('row').find((r) => r.querySelector('td')?.textContent?.trim() === String(port));
    if (!row) throw new Error(`no Ports row for ${port}`);
    return row;
  });
/** A port row's ⋯ menu item names, opened and closed here. */
async function menuNames(port: number): Promise<string[]> {
  await userEvent.click(within(await findPortRow(port)).getByRole('button', { name: 'Row actions' }));
  // An item that opens something ends in its ellipsis ("Create alias for port 3000…"); the names are without it.
  const names = within(await screen.findByRole('menu')).getAllByRole('menuitem').map((m) => (m.textContent ?? '').replace(/…$/, ''));
  await userEvent.keyboard('{Escape}');
  return names;
}
const READING = "Reading this computer's aliases";

describe('the inspector: each port\'s aliases', () => {
  const links = () => screen.queryAllByRole('link').map((a) => a.getAttribute('href') ?? '');

  it('a single port lists its alias beside Create alias, linking the alias url as given; the terminal alias is not there', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A1' });
    const a = await screen.findByRole('link', { name: /alias of port 3000/ });
    expect(a).toHaveAttribute('href', 'https://shop-front.custom-domain.example.test/');
    // In the port's own row; Create alias is that row's menu's.
    expect((await findPortRow(3000)).contains(a)).toBe(true);
    expect(await menuNames(3000)).toContain('Create alias for port 3000');
    expect(links().filter((h) => h.includes('term-desk'))).toEqual([]);
  });

  it('a range lists each port\'s aliases in its row', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A2' });
    expect(await screen.findByRole('link', { name: /alias of port 8001/ })).toHaveAttribute('href', 'https://api-two.custom-domain.example.test/v1');
    expect(screen.getByRole('link', { name: /alias of port 8003/ })).toHaveAttribute('href', 'https://api-four.custom-domain.example.test/');
    expect((await findPortRow(8001)).contains(screen.getByRole('link', { name: /alias of port 8001/ }))).toBe(true);
    expect(screen.queryByRole('link', { name: /alias of port 8000/ })).toBeNull();
  });

  it('a system program shows no alias, with the alias list already read', async () => {
    const r = await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A1' });
    await screen.findByRole('link', { name: /alias of port 3000/ });
    await act(async () => { await r.router.navigate({ href: '/programs?sel=prog%3A100' } as never); });
    await findPortRow(15000);
    await waitFor(() => expect(screen.queryByRole('link', { name: /alias of port 3000/ })).toBeNull());
    expect(screen.queryByRole('link', { name: /alias of port 15000/ })).toBeNull();
    expect(links().filter((h) => h.includes('agent-door'))).toEqual([]);
  });
});

describe('the inspector: the alias read', () => {
  it('a failed read says so with Try again, never as no aliases; Try again reads it again and lists the alias', async () => {
    aliasReads.n = 0;
    await renderPage(page, { state: 'aliases-fail-once', path: '/programs?sel=prog%3A1' });
    const line = await screen.findByText("Couldn't load this computer's aliases");
    expect(screen.queryByRole('link', { name: /alias of port 3000/ })).toBeNull();
    const failed = line.closest('[data-outcome]') as HTMLElement;
    expect(failed).toHaveAttribute('data-outcome', 'failed');
    await act(async () => { within(failed).getByRole('button', { name: 'Try again' }).click(); });
    expect(await screen.findByRole('link', { name: /alias of port 3000/ })).toHaveAttribute('href', 'https://shop-front.custom-domain.example.test/');
    await waitFor(() => expect(screen.queryByText("Couldn't load this computer's aliases")).toBeNull());
    expect(aliasReads.n).toBe(2);
  });

  it('core\'s alias list read again (what Computers\' alias create and remove do once proved) reads Programs\' list again', async () => {
    aliasReads.n = 1;
    await renderPage(page, { state: 'aliases-fail-once', path: '/programs?sel=prog%3A1' });
    await screen.findByRole('link', { name: /alias of port 3000/ });
    const before = aliasReads.n;
    await act(async () => { await core.aliasList.invalidate(); });
    await waitFor(() => expect(aliasReads.n).toBe(before + 1));
  });
});

// Until the first alias list read answers, the Ports section says the
// aliases are being read, so a slow read never looks like "no aliases". Quiet: one line in the section's notices (
// once for the whole table, not per port), only for the first read (a read again over a
// shown answer keeps the answer), never on a system program.
describe('the inspector: the first alias read still out', () => {
  afterEach(() => aliasHold.release());
  const reading = () => screen.queryByText(READING);

  it('a single port: the Ports section says the aliases are being read, then lists them once the read answers', async () => {
    await renderPage(page, { state: 'aliases-held', path: '/programs?sel=prog%3A1' });
    const line = await screen.findByText(READING);
    // In the Ports section, whose row still offers Create alias.
    expect((await findPortRow(3000)).closest('section')?.contains(line)).toBe(true);
    expect(await menuNames(3000)).toContain('Create alias for port 3000');
    expect(aliasHold.out).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /alias of port 3000/ })).toBeNull();
    expect(screen.queryByText("Couldn't load this computer's aliases")).toBeNull();
    await act(async () => aliasHold.release());
    expect(await screen.findByRole('link', { name: /alias of port 3000/ })).toHaveAttribute('href', 'https://shop-front.custom-domain.example.test/');
    expect(reading()).toBeNull();
  });

  it('a range says it once for every port shown', async () => {
    await renderPage(page, { state: 'aliases-held', path: '/programs?sel=prog%3A2' });
    await findPortRow(8003);
    expect(await screen.findAllByText(READING)).toHaveLength(1);
  });

  it('a system program, which shows no aliases, says nothing: its single port, and every port of its range', async () => {
    const r = await renderPage(page, { state: 'aliases-held', path: '/programs?sel=prog%3A100' });
    await findPortRow(15000);
    expect(aliasHold.out).toBeGreaterThan(0);
    expect(reading()).toBeNull();
    await act(async () => { await r.router.navigate({ href: '/programs?sel=prog%3A130' } as never); });
    await findPortRow(16000);
    expect(aliasHold.out).toBeGreaterThan(0);
    expect(reading()).toBeNull();
  });

  it('a read again over an answer already shown keeps the aliases and says nothing', async () => {
    await renderPage(page, { state: 'aliases-held', path: '/programs?sel=prog%3A1' });
    await screen.findByText(READING);
    await act(async () => aliasHold.release());
    await screen.findByRole('link', { name: /alias of port 3000/ });
    await act(async () => { void core.aliasList.invalidate(); });
    await waitFor(() => expect(aliasHold.out).toBe(1));
    expect(reading()).toBeNull();
    expect(screen.getByRole('link', { name: /alias of port 3000/ })).toBeInTheDocument();
  });

  it('a failed first read shows its failure line, not the reading one', async () => {
    aliasReads.n = 0;
    await renderPage(page, { state: 'aliases-fail-once', path: '/programs?sel=prog%3A1' });
    await screen.findByText("Couldn't load this computer's aliases");
    expect(reading()).toBeNull();
  });
});
