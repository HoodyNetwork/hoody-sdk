// Ports & addresses, a primary tab, third in the strip. At a
// glance says once who can open the web addresses, the ports and the aliases; each port shows what is on it, its kind,
// its address (web only) and its aliases; the aliases list each alias once. The computer's settings are not repeated
// here: they are the header's and the list row's ⋯ menu. ?tab=advanced (old links) opens it.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import { classifyRuntime } from '@core';
import type * as dataModule from './data';
import page from './page';
import strings from './strings.en.json';
import accessStrings from './parts/AccessDrawer.strings.en.json';
import { permissionsTesting } from './permissions.testing';

const { landedOnPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

// One extra alias on a port nothing listens on (9999), beside the fixture's 'shop' on 3000; and one program listening
// on loopback only (6006), which the fixture's runtime does not have. `noListeners` plays a runtime read that came back
// without its listener list (runtime_info {}): no rows, which never proves an alias idle.
let extraAlias = false;
let noListeners = false;
// A terminal's alias whose instance number happens to equal a web port (3000): it is not that port's alias.
let programAlias = false;
// An alias made just now: its address may still be spreading.
let freshAlias = false;
// An alias read that failed before any answer ('first', useAliases maps it to []), or a re-read that failed
// after one ('again', the last answer still cached); and a runtime re-read that failed after an answer.
let aliasFail: false | 'first' | 'again' = false;
let runtimeFailAgain = false;
// Two Hoody kit programs (comm "/hoody/plugins/"), one named by its path; and a runtime read that failed
// before any answer.
let kitRows = false;
let runtimeFailFirst = false;
let runtimePending = false;
// Hoody's own hoody-files binary (it counts as a system port, never the person's), and a held answer being re-read.
let hoodyFilesRow = false;
let runtimeFetching = false;
const NOTE = /may still be spreading/;
vi.mock('./data', async (orig) => {
  const real = await orig<typeof dataModule>();
  return {
    ...real,
    useRuntime: (id: string | undefined, enabled: boolean) => {
      const q = real.useRuntime(id, enabled);
      if (runtimeFailFirst) return { ...q, data: undefined, isError: true, error: new Error('read failed') };
      if (runtimePending) return { ...q, data: undefined, isError: false, isPending: true };
      if (!q.data) return q;
      if (runtimeFetching) return { ...q, isFetching: true };
      if (runtimeFailAgain) return { ...q, isError: true, error: new Error('read failed') };
      if (noListeners) return { ...q, data: { ...q.data, yours: [], system: [] } };
      // The rows the computer reports for them, through the real classifier: comm cut to "/hoody/plugins/", one named by its exe path.
      const kits = kitRows ? classifyRuntime({ network_services: [
        { port: 5601, program: '/hoody/plugins/', protocol: 'tcp', ip: '0.0.0.0', path: '/usr/bin/bun', args: '' },
        { port: 12002, program: '/hoody/plugins/', protocol: 'tcp', ip: '0.0.0.0', path: '/hoody/plugins/hoody-dom/hd', args: '/hoody/plugins/hoody-dom/hd serve' },
      ] }).yours : [];
      const files = hoodyFilesRow ? classifyRuntime({ network_services: [
        { port: 5050, program: 'hoody-files', protocol: 'tcp', ip: '0.0.0.0', path: '/hoody/plugins/hoody-files/bin/hoody-files', args: '/hoody/plugins/hoody-files/bin/hoody-files' },
      ] }).system : [];
      return { ...q, data: { ...q.data, yours: [...q.data.yours, { port: 6006, program: 'tensorboard', kind: 'local' as const }, ...kits], system: [...q.data.system, ...files] } };
    },
    useAliases: (id: string | undefined) => {
      const q = real.useAliases(id);
      if (aliasFail === 'first') return { ...q, data: id ? [] : undefined, isPending: false, isError: true, isSuccess: false, error: new Error('read failed'), dataUpdatedAt: 0 };
      if (aliasFail === 'again' && q.data) return { ...q, isError: true, error: new Error('read failed') };
      if (freshAlias && q.data) return { ...q, data: [...q.data, { id: 'al8', name: 'new-demo', port: 8080, program: 'http', url: 'https://new-demo.example.test', createdAt: new Date().toISOString() }] };
      if (programAlias && q.data) return { ...q, data: [...q.data, { id: 'al7', name: 'my-term', port: 3000, program: 'terminal', url: 'https://my-term.example.test', createdAt: '2026-10-20T10:00:00Z' }] };
      if (!extraAlias || !q.data) return q;
      return { ...q, data: [...q.data, { id: 'al9', name: 'old-demo', port: 9999, url: 'https://old-demo.example.test', createdAt: '2026-10-20T10:00:00Z' }] };
    },
  };
});

const SEL = '/computers?sel=atlas.00a1';
// atlas has access rules of its own in the fixtures: its word says rules apply, never who they let in.
const WORD = strings['access.word.set'];
const rowOf = (table: HTMLElement, cell: string) => {
  const row = within(table).getByText(cell, { selector: 'td, td *' }).closest('tr');
  if (!row) throw new Error(`no row ${cell}`);
  return row as HTMLElement;
};

describe('computers: Ports & addresses tab, failed reads', () => {
  const glanceOf = async () => {
    const h = await screen.findByRole('heading', { name: strings['ports.glance.title'] }, { timeout: 8000 });
    return h.closest('section') as HTMLElement;
  };
  const aliasSection = async () => {
    const h = await screen.findByRole('heading', { name: strings['alias.title'] }, { timeout: 8000 });
    return h.closest('section') as HTMLElement;
  };

  it('an alias read that failed says Can\'t tell and offers Try again, never 0 or No aliases', async () => {
    aliasFail = 'first';
    try {
      await renderPage(page, { path: `${SEL}&tab=ports` });
      const sec = await glanceOf();
      await waitFor(() => expect(sec).toHaveTextContent(interpolate(strings['ports.glance.kinds'], { web: 2, other: 2 })));
      expect(within(sec).getAllByText(strings['ports.glance.cantTell'])).toHaveLength(1);
      const al = await aliasSection();
      expect(await within(al).findByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(al).not.toHaveTextContent(strings['alias.empty']);
      expect(within(al).queryByRole('table')).toBeNull();
    } finally {
      aliasFail = false;
    }
  });

  it('a re-read that failed after an answer says Can\'t tell at a glance, for aliases and for ports', async () => {
    aliasFail = 'again';
    runtimeFailAgain = true;
    try {
      await renderPage(page, { path: `${SEL}&tab=ports` });
      const sec = await glanceOf();
      await waitFor(() => expect(within(sec).getAllByText(strings['ports.glance.cantTell'])).toHaveLength(2));
      expect(sec).not.toHaveTextContent(interpolate(strings['ports.glance.kinds'], { web: 2, other: 2 }));
      // Each section says its read failed and offers Try again, instead of a table it can no longer vouch for.
      const ports = (await screen.findByRole('heading', { name: strings['ports.title'] })).closest('section') as HTMLElement;
      expect(await within(ports).findByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(within(ports).queryByRole('table')).toBeNull();
      const al = await aliasSection();
      expect(await within(al).findByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(within(al).queryByRole('table')).toBeNull();
    } finally {
      aliasFail = false;
      runtimeFailAgain = false;
    }
  });
});

describe('computers: Ports & addresses tab', () => {
  it('is the fourth tab, after Permissions, and no Advanced tab is left', async () => {
    extraAlias = false;
    await renderPage(page, { path: `${SEL}&tab=ports` });
    // The computer's own tabs: the page's view tabs (Computers, Servers, Projects) are another tab list.
    const views = await screen.findByRole('tablist', { name: strings['views.label'] }, { timeout: 8000 });
    const tabs = (await screen.findAllByRole('tab', undefined, { timeout: 8000 })).filter((x) => !views.contains(x));
    const names = tabs.map((x) => x.textContent?.trim());
    expect(names.indexOf(strings['tab.ports'])).toBe(3);
    expect(names.slice(0, 3)).toEqual([strings['tab.overview'], strings['tab.connect'], strings['tab.permissions']]);
    expect(names).not.toContain('Advanced');
    expect(screen.getByRole('tab', { name: strings['tab.ports'] })).toHaveAttribute('aria-selected', 'true');
  });

  it('an old ?tab=advanced link opens Ports & addresses', async () => {
    extraAlias = false;
    const r = await renderPage(page, { path: `${SEL}&tab=advanced` });
    await waitFor(() => expect(screen.getByRole('tab', { name: strings['tab.ports'] })).toHaveAttribute('aria-selected', 'true'), { timeout: 8000 });
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ tab: 'ports' }));
  });

  it('each port row shows what is on it, its address and its aliases; who can open them is said once above', async () => {
    extraAlias = false;
    await renderPage(page, { path: `${SEL}&tab=ports` });
    const table = await screen.findByRole('table', { name: strings['ports.title'] }, { timeout: 8000 });
    await waitFor(() => expect(within(table).getByText('3000')).toBeInTheDocument());
    const web = rowOf(table, '3000');
    expect(web).toHaveTextContent('node');
    expect(web).toHaveTextContent(strings['ports.kind.web']);
    expect(within(web).getByRole('button', { name: `Copy ${strings['ports.col.address']}` })).toBeInTheDocument();
    expect(web).toHaveTextContent('shop');
    expect(within(web).getByRole('button', { name: strings['alias.make'] })).toBeInTheDocument();
    const other = rowOf(table, '8080');
    expect(other).not.toHaveTextContent('shop');
    // Not a web port: no address.
    expect(rowOf(table, '5432')).toHaveTextContent(strings['ports.noAddress']);
    // A local-only port: no address, no alias to make.
    const local = rowOf(table, '6006');
    expect(local).toHaveTextContent(interpolate(strings['ports.localOnly'], { name: 'atlas' }));
    expect(within(local).queryByRole('button', { name: `Copy ${strings['ports.col.address']}` })).toBeNull();
    expect(within(local).queryByRole('button', { name: strings['alias.make'] })).toBeNull();
  });

  it('At a glance says rules apply, never "only you", counts the ports by kind and the aliases; View access rules opens the access drawer', async () => {
    extraAlias = false;
    await renderPage(page, { path: `${SEL}&tab=ports` });
    const glance = await screen.findByRole('heading', { name: strings['ports.glance.title'] }, { timeout: 8000 });
    const sec = glance.closest('section') as HTMLElement;
    await waitFor(() => expect(sec).toHaveTextContent(WORD));
    expect(sec).toHaveTextContent(strings['ports.glance.who']);
    // The fixture's web 3000 and 8080 and other 5432, and the mocked local 6006.
    await waitFor(() => expect(sec).toHaveTextContent(interpolate(strings['ports.glance.kinds'], { web: 2, other: 2 })));
    // The alias count itself (the fixture's one alias, shop), not only its label.
    const aliasLabel = within(sec).getByText(strings['ports.glance.aliases']);
    expect(aliasLabel.tagName).toBe('DT');
    await waitFor(() => expect(aliasLabel.nextElementSibling).toHaveTextContent(/^1$/));
    expect(screen.queryByText(/only you/i)).toBeNull();
    await userEvent.click(within(sec).getByRole('button', { name: strings['ports.whoChange'] }));
    const d = await landedOnPermissions(strings, accessStrings['perm.who.title']);
    expect(await within(d).findByRole('radiogroup', { name: accessStrings['acc.choice'] }, { timeout: 8000 })).toBeInTheDocument();
  });

  it('the help never says the other ports stay inside the computer', async () => {
    extraAlias = false;
    await renderPage(page, { path: `${SEL}&tab=ports` });
    expect(await screen.findByText(strings['ports.help'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(/stay inside/i)).toBeNull();
  });

  it('every alias is listed once with its address; none is called idle, even when the listener list did not come back', async () => {
    extraAlias = true;
    noListeners = true;
    try {
      await renderPage(page, { path: `${SEL}&tab=ports` });
      const table = await screen.findByRole('table', { name: strings['alias.title'] }, { timeout: 8000 });
      await waitFor(() => expect(within(table).getByText('old-demo')).toBeInTheDocument());
      expect(within(table).getAllByRole('button', { name: `Copy ${strings['ports.col.address']}` })).toHaveLength(2);
      expect(screen.queryByText(/nothing listening/i)).toBeNull();
    } finally {
      noListeners = false;
    }
  });

  it('a program alias is never shown as a port\'s alias, and its row names the program', async () => {
    extraAlias = false;
    programAlias = true;
    try {
      await renderPage(page, { path: `${SEL}&tab=ports` });
      const ports = await screen.findByRole('table', { name: strings['ports.title'] }, { timeout: 8000 });
      await waitFor(() => expect(within(ports).getByText('3000')).toBeInTheDocument());
      const aliases = await screen.findByRole('table', { name: strings['alias.title'] });
      await waitFor(() => expect(within(aliases).getByText('my-term')).toBeInTheDocument());
      expect(rowOf(ports, '3000')).toHaveTextContent('shop');
      expect(rowOf(ports, '3000')).not.toHaveTextContent('my-term');
      expect(rowOf(aliases, 'my-term')).toHaveTextContent('terminal');
      expect(rowOf(aliases, 'shop')).toHaveTextContent('3000');
    } finally {
      programAlias = false;
    }
  });

  it('an alias made under a minute ago gets the DNS note with its name; an older one does not', async () => {
    extraAlias = false;
    freshAlias = true;
    try {
      await renderPage(page, { path: `${SEL}&tab=ports` });
      const aliases = await screen.findByRole('table', { name: strings['alias.title'] }, { timeout: 8000 });
      await waitFor(() => expect(within(aliases).getByText('new-demo')).toBeInTheDocument());
      // The kit's row note (kit/widgets/Propagating.strings.en.json "propagating.row").
      const note = await screen.findByText(NOTE);
      const line = note.closest('div') as HTMLElement;
      expect(line).toHaveTextContent('new-demo');
      expect(screen.getAllByText(NOTE)).toHaveLength(1);
    } finally {
      freshAlias = false;
    }
  });

  it('Make an alias opens the alias drawer for that port', async () => {
    extraAlias = false;
    await renderPage(page, { path: `${SEL}&tab=ports` });
    const table = await screen.findByRole('table', { name: strings['ports.title'] }, { timeout: 8000 });
    await waitFor(() => expect(within(table).getByText('3000')).toBeInTheDocument());
    await userEvent.click(within(rowOf(table, '3000')).getByRole('button', { name: strings['alias.make'] }));
    const d = await screen.findByRole('dialog');
    expect(d).toHaveTextContent(interpolate(strings['aliasd.title'], { port: 3000 }));
  });

  it('Remove in an alias row menu asks to remove that alias', async () => {
    extraAlias = false;
    await renderPage(page, { path: `${SEL}&tab=ports` });
    const table = await screen.findByRole('table', { name: strings['alias.title'] }, { timeout: 8000 });
    await waitFor(() => expect(within(table).getByText('shop')).toBeInTheDocument());
    await userEvent.click(within(rowOf(table, 'shop')).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: `${strings['alias.remove']}…` }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(interpolate(strings['aliasr.title'], { name: 'shop' }));
  });

  it('the computer settings are not repeated in the tab: the header menu holds them', async () => {
    extraAlias = false;
    await renderPage(page, { path: `${SEL}&tab=ports` });
    await screen.findByRole('table', { name: strings['ports.title'] }, { timeout: 8000 });
    const panel = screen.getByRole('tabpanel');
    for (const name of [/^Rename$/, /^Change realms$/, /^Make a copy$/, /^Delete$/, /^(Replace key|Add a key)$/]) expect(within(panel).queryByRole('button', { name })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: interpolate(strings['menu.actions'], { name: 'atlas' }) }));
    for (const k of ['menu.rename', 'menu.realms', 'menu.ssh', 'menu.copy', 'menu.delete'] as const) expect(await screen.findByRole('menuitem', { name: strings[k] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: strings['menu.rename'] }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(interpolate(strings['rename.title'], { name: 'atlas' }));
  });

  it('a list row\'s menu has no Settings item: its five settings are items of the same menu', async () => {
    extraAlias = false;
    await renderPage(page, { path: '/computers' });
    const name = await screen.findByText('atlas', { selector: 'td *' }, { timeout: 8000 });
    const row = name.closest('tr') as HTMLElement;
    const menu = within(row).getAllByRole('button').find((b) => b.getAttribute('aria-haspopup'));
    if (!menu) throw new Error('no row menu');
    await userEvent.click(menu);
    for (const k of ['menu.rename', 'menu.realms', 'menu.ssh', 'menu.copy', 'menu.delete'] as const) expect(await screen.findByRole('menuitem', { name: strings[k] })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Settings' })).toBeNull();
  });
});

describe('computers: Ports & addresses tab, Hoody kit programs', () => {
  it('a kit program\'s row says Hoody kit (with its name when known), keeps its kind and address, and offers no alias', async () => {
    kitRows = true;
    try {
      await renderPage(page, { path: `${SEL}&tab=ports` });
      const table = await screen.findByRole('table', { name: strings['ports.title'] }, { timeout: 8000 });
      await waitFor(() => expect(within(table).getByText('5601')).toBeInTheDocument());
      const plain = rowOf(table, '5601');
      expect(plain).toHaveTextContent(strings['ports.kit']);
      expect(plain).not.toHaveTextContent('/hoody/plugins/');
      expect(plain).toHaveTextContent(strings['ports.kind.web']);
      expect(within(plain).getByRole('button', { name: `Copy ${strings['ports.col.address']}` })).toBeInTheDocument();
      expect(within(plain).queryByRole('button', { name: strings['alias.make'] })).toBeNull();
      const named = rowOf(table, '12002');
      expect(named).toHaveTextContent(`${strings['ports.kit']} hoody-dom`);
      expect(within(named).queryByRole('button', { name: strings['alias.make'] })).toBeNull();
      // The person's own web program still offers one.
      expect(within(rowOf(table, '3000')).getByRole('button', { name: strings['alias.make'] })).toBeInTheDocument();
      expect(rowOf(table, '3000')).not.toHaveTextContent(strings['ports.kit']);
    } finally { kitRows = false; }
  });

  it('the alias drawer opened for a kit port (a link from another page) refuses it: no name, nothing to send', async () => {
    kitRows = true;
    try {
      await renderPage(page, { path: `${SEL}&alias=12002` });
      const d = await screen.findByRole('dialog', undefined, { timeout: 8000 });
      await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['aliasd.kit'], { port: 12002 })));
      expect(within(d).queryByRole('textbox', { name: strings['aliasd.name'] })).toBeNull();
      expect(within(d).getByRole('button', { name: strings['aliasd.go'] })).toBeDisabled();
    } finally { kitRows = false; }
  });

  it('the alias drawer allows a port when the computer\'s listeners could not be read', async () => {
    runtimeFailFirst = true;
    try {
      await renderPage(page, { path: `${SEL}&alias=12002` });
      const d = await screen.findByRole('dialog', undefined, { timeout: 8000 });
      expect(await within(d).findByRole('textbox', { name: strings['aliasd.name'] })).toBeInTheDocument();
      expect(d).not.toHaveTextContent(interpolate(strings['aliasd.kit'], { port: 12002 }));
      await waitFor(() => expect(within(d).getByRole('button', { name: strings['aliasd.go'] })).toBeEnabled());
    } finally { runtimeFailFirst = false; }
  });

  it('while the listeners are still being read, the alias drawer sends nothing (a kit port cannot slip through)', async () => {
    runtimePending = true;
    try {
      await renderPage(page, { path: `${SEL}&alias=12002` });
      const d = await screen.findByRole('dialog', undefined, { timeout: 8000 });
      expect(await within(d).findByRole('textbox', { name: strings['aliasd.name'] })).toBeInTheDocument();
      expect(within(d).getByRole('button', { name: strings['aliasd.go'] })).toBeDisabled();
    } finally { runtimePending = false; }
  });

  it('the alias drawer refuses a port of Hoody\'s own (the terminal on 7681), with the same words', async () => {
    await renderPage(page, { path: `${SEL}&alias=7681` });
    const d = await screen.findByRole('dialog', undefined, { timeout: 8000 });
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['aliasd.kit'], { port: 7681 })));
    expect(within(d).queryByRole('textbox', { name: strings['aliasd.name'] })).toBeNull();
    expect(within(d).getByRole('button', { name: strings['aliasd.go'] })).toBeDisabled();
  });

  it('the alias drawer refuses the port of Hoody\'s hoody-files binary (a system port, never listed as yours)', async () => {
    hoodyFilesRow = true;
    try {
      await renderPage(page, { path: `${SEL}&alias=5050` });
      const d = await screen.findByRole('dialog', undefined, { timeout: 8000 });
      await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['aliasd.kit'], { port: 5050 })));
      expect(within(d).queryByRole('textbox', { name: strings['aliasd.name'] })).toBeNull();
      expect(within(d).getByRole('button', { name: strings['aliasd.go'] })).toBeDisabled();
    } finally { hoodyFilesRow = false; }
  });

  it('while a held listener answer is being read again, the alias drawer sends nothing', async () => {
    runtimeFetching = true;
    try {
      await renderPage(page, { path: `${SEL}&alias=12002` });
      const d = await screen.findByRole('dialog', undefined, { timeout: 8000 });
      expect(await within(d).findByRole('textbox', { name: strings['aliasd.name'] })).toBeInTheDocument();
      expect(within(d).getByRole('button', { name: strings['aliasd.go'] })).toBeDisabled();
    } finally { runtimeFetching = false; }
  });

  it('a port that is neither Hoody\'s nor being read again can still get an alias', async () => {
    await renderPage(page, { path: `${SEL}&alias=12002` });
    const d = await screen.findByRole('dialog', undefined, { timeout: 8000 });
    expect(await within(d).findByRole('textbox', { name: strings['aliasd.name'] })).toBeInTheDocument();
    await waitFor(() => expect(within(d).getByRole('button', { name: strings['aliasd.go'] })).toBeEnabled());
  });
});
