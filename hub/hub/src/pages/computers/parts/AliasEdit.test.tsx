// Edit an alias (Ports & addresses > Aliases > row menu > Edit): the drawer starts from the alias as listed, sends one
// PATCH with only what changed ({alias}, {port} or both), says why Save is off, shows a refusal in the form, and holds
// a send whose answer was lost (never sent again; Check again only reads). A program alias has no port field.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import { aliasRoutes } from '@core';
import type * as Core from '@core';
import page from '../page';
import { routes } from '../routes';
import pageStrings from '../strings.en.json';
import strings from './AliasEdit.strings.en.json';
import { editChange, editPort } from './AliasEdit';

interface WireAlias { id: string; alias: string; url: string; index: number; program: string; created_at: string }
// The fake API: the alias list as it stands, every edit as it was sent, and how the next edit is answered.
// `edit`: the page's route object, set before each render (a rule matches its route by identity).
const api = vi.hoisted(() => ({
  rows: [] as WireAlias[],
  sends: [] as { id: string; body: unknown }[],
  mode: 'ok' as 'ok' | 'taken' | 'lost',
  lists: 0,
  edit: null as unknown,
}));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    bootFixtureCore: (o: Parameters<typeof real.bootFixtureCore>[0] = {}) => {
      const list = real.reply(real.aliasRoutes.list, () => (api.lists++, real.answers.ok({ data: { aliases: api.rows.map((r) => ({ ...r })) } })));
      const edit = real.reply(api.edit as Parameters<typeof real.reply>[0], (r) => {
        const id = decodeURIComponent(r.path.split('/').pop() ?? '');
        api.sends.push({ id, body: r.body });
        if (api.mode === 'taken') return real.answers.refused(409, 'ALIAS_IN_USE');
        // 'lost': a gateway error, and the change did not land (the test lands it later by hand).
        if (api.mode === 'lost') return real.answers.pending5xx();
        const b = (r.body ?? {}) as { alias?: string; port?: number };
        api.rows = api.rows.map((x) => (x.id === id ? { ...x, ...(b.alias !== undefined ? { alias: b.alias, url: `https://${b.alias}.example.test` } : {}), ...(b.port !== undefined ? { index: b.port } : {}) } : x));
        return real.answers.ok({ data: api.rows.find((x) => x.id === id) });
      });
      return real.bootFixtureCore({ ...o, rules: [list, edit, ...(o.rules ?? [])] });
    },
  };
});

const PORTS = '/computers?sel=atlas.00a1&tab=ports';
const SHOP: WireAlias = { id: 'al1', alias: 'shop', url: 'https://shop.example.test', index: 3000, program: 'http', created_at: '2026-10-20T10:00:00Z' };
const TERM: WireAlias = { id: 'al7', alias: 'my-term', url: 'https://my-term.example.test', index: 1, program: 'terminal', created_at: '2026-10-20T10:00:00Z' };

const rowOf = (table: HTMLElement, cell: string) => {
  const row = within(table).getByText(cell, { selector: 'td, td *' }).closest('tr');
  if (!row) throw new Error(`no row ${cell}`);
  return row as HTMLElement;
};
const aliasTable = () => screen.findByRole('table', { name: pageStrings['alias.title'] }, { timeout: 8000 });
/** Opens Edit from the alias's row menu and returns the drawer. */
const openEdit = async (name: string) => {
  await renderPage(page, { path: PORTS });
  const table = await aliasTable();
  await waitFor(() => expect(within(table).getByText(name)).toBeInTheDocument());
  await userEvent.click(within(rowOf(table, name)).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: `${strings['edit.menu']}…` }));
  return screen.findByRole('dialog', { name: interpolate(strings['edit.title'], { name }) });
};
const nameBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['edit.name'] }) as HTMLInputElement;
const portBox = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['edit.port'] }) as HTMLInputElement;
const save = (d: HTMLElement) => within(d).getByRole('button', { name: strings['edit.go'] });
const retype = async (box: HTMLInputElement, text: string) => {
  await userEvent.clear(box);
  await userEvent.type(box, text);
};

beforeEach(() => {
  api.rows = [{ ...SHOP }];
  api.sends.length = 0;
  api.mode = 'ok';
  api.lists = 0;
  api.edit = routes.aliasEdit;
});

describe('computers: alias edit, what is sent (pure)', () => {
  it('only the values that differ are sent; nothing differs = nothing to send', () => {
    const row = { name: 'shop', port: 3000, program: 'http' };
    expect(editChange(row, 'shop', 3000)).toBeNull();
    expect(editChange(row, 'shop-two', 3000)).toEqual({ name: 'shop-two' });
    expect(editChange(row, 'shop', 8080)).toEqual({ port: 8080 });
    expect(editChange(row, 'shop-two', 8080)).toEqual({ name: 'shop-two', port: 8080 });
    // An unreadable port is never sent.
    expect(editChange(row, 'shop', null)).toBeNull();
  });
  it('a program alias never sends a port', () => {
    expect(editChange({ name: 'my-term', port: 1, program: 'terminal' }, 'my-term', 2)).toBeNull();
    expect(editChange({ name: 'my-term', port: 1, program: 'terminal' }, 'term-two', 2)).toEqual({ name: 'term-two' });
  });
  it('a port is digits only, 1 to 65535', () => {
    expect(editPort('8080')).toBe(8080);
    expect(editPort('65535')).toBe(65535);
    for (const bad of ['', '0', '65536', '80a', ' 80', '-1', '8.0']) expect(editPort(bad), bad).toBeNull();
  });
  it('the route is core\'s alias edit (one route for the endpoint), a PATCH of the alias', () => {
    expect(routes.aliasEdit).toBe(aliasRoutes.edit);
    expect(routes.aliasEdit.method).toBe('PATCH');
    expect(routes.aliasEdit.path).toBe('/proxy/aliases/:id');
  });
});

describe('computers: alias edit drawer', () => {
  it('starts from the alias as listed; Save is off and the footer says why', async () => {
    const d = await openEdit('shop');
    expect(nameBox(d)).toHaveValue('shop');
    expect(portBox(d)).toHaveValue('3000');
    expect(save(d)).toBeDisabled();
    expect(d).toHaveTextContent(strings['edit.same']);
    expect(api.sends).toEqual([]);
  }, 40000);

  it('a rename warns that the old address stops, sends exactly {alias}, closes, and the table shows the new name', async () => {
    const d = await openEdit('shop');
    await retype(nameBox(d), 'shop-two');
    expect(d).toHaveTextContent(interpolate(strings['edit.rename'], { old: 'shop' }));
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    await waitFor(() => expect(api.sends).toHaveLength(1));
    expect(api.sends[0]).toEqual({ id: 'al1', body: { alias: 'shop-two' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const table = await aliasTable();
    await waitFor(() => expect(within(table).getByText('shop-two')).toBeInTheDocument());
    expect(api.sends).toHaveLength(1);
  }, 40000);

  it('a port change sends exactly {port}', async () => {
    const d = await openEdit('shop');
    await retype(portBox(d), '8080');
    // No rename: no address warning.
    expect(d).not.toHaveTextContent(interpolate(strings['edit.rename'], { old: 'shop' }));
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    await waitFor(() => expect(api.sends).toHaveLength(1));
    expect(api.sends[0]).toEqual({ id: 'al1', body: { port: 8080 } });
  }, 40000);

  it('name and port changed together are one send with both', async () => {
    const d = await openEdit('shop');
    await retype(nameBox(d), 'shop-two');
    await retype(portBox(d), '8080');
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    await waitFor(() => expect(api.sends).toHaveLength(1));
    expect(api.sends[0]).toEqual({ id: 'al1', body: { alias: 'shop-two', port: 8080 } });
  }, 40000);

  it('a name the API would refuse is said at the field and in the footer; nothing is sent', async () => {
    const d = await openEdit('shop');
    await retype(nameBox(d), 'ab');
    await waitFor(() => expect(d).toHaveTextContent(strings['edit.reason.name']));
    expect(save(d)).toBeDisabled();
    await retype(nameBox(d), 'containers');
    await waitFor(() => expect(d).toHaveTextContent(strings['edit.reserved']));
    expect(save(d)).toBeDisabled();
    expect(api.sends).toEqual([]);
  }, 40000);

  it('a port that is not one, and a port Hoody uses, are refused in the form', async () => {
    const d = await openEdit('shop');
    await retype(portBox(d), '70000');
    await waitFor(() => expect(d).toHaveTextContent(strings['edit.portRule']));
    expect(d).toHaveTextContent(strings['edit.reason.port']);
    expect(save(d)).toBeDisabled();
    // 3999 is one of the ports the Hoody kits are reached on (Firewall.logic KIT_PORTS).
    await retype(portBox(d), '3999');
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['edit.kit'], { port: 3999 })));
    expect(save(d)).toBeDisabled();
    expect(api.sends).toEqual([]);
  }, 40000);

  it('a name already in use: the refusal is said, the form keeps what was typed, and the list is unchanged', async () => {
    api.mode = 'taken';
    const d = await openEdit('shop');
    await retype(nameBox(d), 'shop-two');
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    await waitFor(() => expect(api.sends).toHaveLength(1));
    await waitFor(() => expect(d).toHaveTextContent(strings['edit.taken']));
    expect(nameBox(d)).toHaveValue('shop-two');
    expect(api.rows[0]!.alias).toBe('shop');
    // A definite refusal is not a hold.
    expect(d).not.toHaveTextContent(interpolate(strings['edit.held'], { name: 'shop-two' }));
  }, 40000);

  it('a lost answer is held: never sent again; Check again only reads, and frees it once the list shows what was sent', async () => {
    api.mode = 'lost';
    const d = await openEdit('shop');
    await retype(nameBox(d), 'shop-two');
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    const HELD = interpolate(strings['edit.held'], { name: 'shop-two' });
    await waitFor(() => expect(d).toHaveTextContent(HELD));
    expect(api.sends).toHaveLength(1);
    // Held: the form is gone, and a Save button still drawn cannot send.
    expect(within(d).queryByRole('textbox', { name: strings['edit.name'] })).toBeNull();
    const held = within(d).queryByRole('button', { name: strings['edit.go'] });
    if (held) expect(held).toBeDisabled();
    const checkAgain = () => within(d).queryByRole('button', { name: pageStrings['held.check'] });
    // The list still shows the old name: a read proves nothing, the hold stays.
    const before = api.lists;
    await userEvent.click(checkAgain()!);
    await waitFor(() => expect(api.lists).toBeGreaterThan(before));
    expect(d).toHaveTextContent(HELD);
    expect(api.sends).toHaveLength(1);
    // The change landed after all: a later read shows it and frees the hold. Nothing was sent again. (Pressed until a
    // read made after the landing has answered: a press while an earlier read is still out joins that read.)
    api.rows = [{ ...SHOP, alias: 'shop-two', url: 'https://shop-two.example.test' }];
    await waitFor(async () => {
      const b = checkAgain();
      if (b) await userEvent.click(b);
      expect(d).not.toHaveTextContent(HELD);
    }, { timeout: 10000, interval: 500 });
    expect(api.sends).toHaveLength(1);
  }, 60000);

  it('an alias that goes to a Hoody program: no port field, the name can change', async () => {
    api.rows = [{ ...SHOP }, { ...TERM }];
    const d = await openEdit('my-term');
    expect(nameBox(d)).toHaveValue('my-term');
    expect(within(d).queryByRole('textbox', { name: strings['edit.port'] })).toBeNull();
    expect(d).toHaveTextContent(interpolate(strings['edit.program'], { program: 'terminal' }));
    await retype(nameBox(d), 'term-two');
    await waitFor(() => expect(save(d)).toBeEnabled());
    await userEvent.click(save(d));
    await waitFor(() => expect(api.sends).toHaveLength(1));
    expect(api.sends[0]).toEqual({ id: 'al7', body: { alias: 'term-two' } });
  }, 40000);
});
