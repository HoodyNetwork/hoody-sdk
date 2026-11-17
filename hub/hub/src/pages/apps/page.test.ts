// Vitest: the apps page's logic and interaction in every fixture state.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { type Candidate, type Find, type Starter, classify, findNote, findView, kindOf, newFind, options, runnableOf, tierOf, openMatches, rowView, unresolved, view } from './logic';
import { ops } from './parts/ops';
import { kept } from './data';
import { harness as page } from './launch/harness';
import strings from './strings.en.json';

const cand = (c: Partial<Candidate> & { title: string; provider: Candidate['provider'] }): Candidate => ({
  app: 'q', setId: 's', candidateId: c.title, description: '', kind: 'any', source: '', version: '', attr: '', path: '', tags: [], ...c,
});
const done = (rows: Candidate[]): Find[keyof Find] => ({ state: 'done', rows: rows.map(classify), partial: false, warming: false });
const all = (o: Partial<Find> = {}): Find => ({ ...Object.fromEntries((['system', 'registry', 'nix', 'pkgx', 'appimage', 'oci'] as const).map((k) => [k, done([])])), ...o }) as Find;
// A variable value's label names its row (kit EnvRows: "Variable 1 value").
const valueLabel = new RegExp(`^${strings['opt.envValue.n'].replace('{{n}}', '\\d+')}$`);
const jl: Starter = { id: 'jupyterlab', name: 'JupyterLab', description: '', opensIn: 'web', available: true, shares: false };

describe('apps logic: where it opens and whether it is an app', () => {
  it('trusts the server kind, then known programs, then one-sided wording', () => {
    expect(kindOf(cand({ title: 'x', provider: 'nix', kind: 'gui' }))).toEqual({ opensIn: 'screen', by: 'server' });
    expect(kindOf(cand({ title: 'htop', provider: 'system' }))).toEqual({ opensIn: 'terminal', by: 'known' });
    expect(kindOf(cand({ title: 'foo', provider: 'nix', description: 'A GTK image viewer' }))).toEqual({ opensIn: 'screen', by: 'text' });
    expect(kindOf(cand({ title: 'foo', provider: 'nix', description: 'Nothing useful' })).opensIn).toBe('unknown');
    expect(kindOf(cand({ title: 'img', provider: 'oci' })).opensIn).toBe('terminal');
  });
  it('withdraws libraries and plugins, keeps tools, and says "not sure" for language packages', () => {
    expect(runnableOf(cand({ title: 'vimplugin-x', provider: 'nix', attr: 'vimPlugins.x' }))).toBe(false);
    expect(runnableOf(cand({ title: 'libfoo', provider: 'nix', description: 'A library for parsing' }))).toBe(false);
    expect(runnableOf(cand({ title: 'foo', provider: 'nix', description: 'A command-line tool and library' }))).toBe(true);
    expect(runnableOf(cand({ title: 'foo', provider: 'nix', attr: 'python3Packages.foo', description: 'Does things' }))).toBeNull();
    expect(runnableOf(cand({ title: 'foo', provider: 'registry' }))).toBe(true);
  });
});

describe('apps logic: the merged search list', () => {
  it('ranks exact, installed, prefix, substring', () => {
    expect(tierOf('jupyter', false, 'Jupyter')).toBe(0);
    expect(tierOf('x', true, 'jupyter')).toBe(1);
    expect(tierOf('jupyterlab', false, 'jupyter')).toBe(2);
    expect(tierOf('a-jupyter', false, 'jupyter')).toBe(3);
  });
  it('shows one row per package and folds an installed program into its Nix twin', () => {
    const f = all({
      system: done([cand({ title: 'jupyter', provider: 'system', path: '/usr/bin/jupyter' })]),
      nix: done([cand({ title: 'jupyter', provider: 'nix', attr: 'jupyter' }), cand({ title: 'jupyter', provider: 'nix', attr: 'jupyter' })]),
    });
    const v = findView('jupyter', [], f);
    expect(v.list).toHaveLength(1);
    expect(v.list[0]?.installed).toBe(true);
    expect(v.list[0]?.also).toEqual(['nix']);
  });
  it('makes the catalogue entry the one row when a registry result is the same starter', () => {
    const f = all({ registry: done([cand({ title: 'JupyterLab', provider: 'registry', starterId: 'jupyterlab', starterOpens: 'web' })]) });
    const v = findView('jupyter', [jl], f);
    expect(v.list).toHaveLength(1);
    expect(v.list[0]?.type).toBe('starter');
  });
  it('hides what cannot be opened and counts it, unless asked', () => {
    const f = all({ nix: done([cand({ title: 'jupytext-nvim', provider: 'nix', attr: 'vimPlugins.jupytext-nvim' })]) });
    expect(findView('jupyt', [], f).hidden).toBe(1);
    expect(findView('jupyt', [], f).list).toHaveLength(0);
    expect(findView('jupyt', [], f, { all: true }).list).toHaveLength(1);
  });
  it('says nothing is ready only after every source answered', () => {
    expect(findView('zz', [], newFind()).noneReady).toBe(false);
    expect(findView('zz', [], all()).noneReady).toBe(true);
    expect(findView('zz', [], all(), { pending: true }).noneReady).toBe(false);
  });
  it('never says "nothing found" for a source that did not answer', () => {
    const f = all({ nix: { state: 'failed', rows: [], partial: false, warming: false } });
    expect(findNote(findView('zz', [], f))).toEqual({ key: 'sourcesDown', primary: 'retry' });
    expect(findNote(findView('zz', [], all()))).toEqual({ key: 'none', primary: 'starters' });
    expect(findNote(findView('zz', [], newFind()))).toBeNull();
  });
});

describe('apps logic: options', () => {
  it('drops blank lines and keeps valid settings', () => {
    expect(options('--a\n\n--b', [{ name: 'MODE', value: 'x' }])).toEqual({ args: ['--a', '--b'], env: { MODE: 'x' } });
  });
  it('refuses bad, reserved and repeated names without echoing a value', () => {
    const r = options('', [{ name: '1x', value: 'secret' }, { name: 'HOODY_X', value: 's' }, { name: 'JUPYTER_TOKEN', value: 's' }, { name: 'A', value: '1' }, { name: 'A', value: '2' }]);
    expect('errors' in r && r.errors.map((e) => e.key)).toEqual(['nameBad', 'reserved', 'reserved', 'nameTwice']);
    expect(JSON.stringify(r)).not.toContain('secret');
  });
  it('keeps a variable named like an Object member as a variable of its own', () => {
    const r = options('', [{ name: '__proto__', value: 'p' }, { name: 'constructor', value: 'c' }, { name: 'toString', value: 't' }]);
    const env = 'env' in r ? r.env : {};
    expect(Object.keys(env)).toEqual(['__proto__', 'constructor', 'toString']);
    expect(Object.getOwnPropertyDescriptor(env, '__proto__')?.value).toBe('p');
    expect(JSON.stringify(env)).toBe('{"__proto__":"p","constructor":"c","toString":"t"}');
    expect('errors' in options('', [{ name: 'constructor', value: '1' }, { name: 'constructor', value: '2' }])).toBe(true);
  });
  it('limits the number and size of lines', () => {
    expect('errors' in options('x'.repeat(5000), [])).toBe(true);
    expect('errors' in options(Array.from({ length: 65 }, () => 'a').join('\n'), [])).toBe(true);
  });
});

describe('apps logic: what a launch looks like', () => {
  it('gives one primary action per state', () => {
    expect(view({ state: 'ready' })).toMatchObject({ tone: 'ok', primary: 'open', more: ['stop'] });
    expect(view({ state: 'running', opensIn: 'screen' }).primary).toBe('screen');
    expect(view({ state: 'exited', exitCode: 1 }).tone).toBe('bad');
    expect(view({ state: 'exited', exitCode: 0 }).tone).toBe('off');
    expect(view({ state: 'unknown', code: 'start_unconfirmed' })).toMatchObject({ tone: 'warn', primary: 'check' });
    expect(view({ code: 'port_in_use', twin: true }).primary).toBe('switch');
    expect(view({ code: 'port_in_use' }).primary).toBe('apps');
    expect(view({ code: 'nonsense' }).key).toBe('fail.generic');
  });
  it('a folder the computer cannot open and an unsupported shell read as themselves, not "couldn\'t start"', () => {
    expect(view({ code: 'folder_refused' })).toMatchObject({ tone: 'bad', key: 'fail.folder', primary: null });
    expect(view({ code: 'shell_unsupported' })).toMatchObject({ tone: 'bad', key: 'fail.shell', primary: 'retry' });
    expect(strings['fail.folder' as keyof typeof strings]).toMatch(/another folder/);
    expect(strings['fail.shell' as keyof typeof strings]).toMatch(/bash or zsh/);
  });
  it('never offers a second copy over an unread one', () => {
    const rows = [{ key: 'a', state: 'unknown', catalogId: 'jupyterlab' }, { key: 'b', state: 'ready', catalogId: 'jupyterlab' }] as never;
    expect(unresolved(rows, { catalogId: 'jupyterlab' }).map((r) => r.key)).toEqual(['a']);
    const opening = [{ key: 'c', state: 'starting', app: 'htop' }, { key: 'd', state: 'stopped', app: 'htop' }] as never;
    expect(unresolved(opening, { app: 'htop' }).map((r) => r.key)).toEqual(['c']);
  });
});

describe('apps page', () => {
  beforeEach(() => ops.reset());

  it('lists what was opened, with state and one action per row', async () => {
    await renderPage(page);
    const table = await screen.findByRole('table', { name: strings['tab.open'] }, { timeout: 4000 });
    const row = await within(table).findByRole('row', { name: /JupyterLab/ }, { timeout: 4000 });
    expect(within(row).getByText('Ready')).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /btop/ })).toHaveTextContent('Error');
    expect(within(table).getByRole('row', { name: /sqlite-web/ })).toHaveTextContent('Check needed');
  });

  it('opens the inspector of a deep-linked app, its command coloured as shell', async () => {
    await renderPage(page, { path: '/apps?appsel=a1b2c3' });
    // Colour splits the command into pieces; the code block (its region, named by the Command label) still reads
    // exactly the command, and the command and its flags carry the kit's shell token classes. (A page may not import
    // the kit's CSS module, hub/page-boundaries, so the class is matched by its module name, as the kit's own
    // CodeBlock tests do.)
    const cmd = 'jupyter lab --no-browser --port 18888';
    const pre = await screen.findByRole('region', { name: strings['insp.command'] });
    expect(pre.textContent).toBe(cmd);
    const kinds = (sel: string) => [...pre.querySelectorAll(sel)].map((e) => e.textContent);
    expect(kinds('[class*="sh_cmd"]')).toEqual(['jupyter']);
    expect(kinds('[class*="sh_flag"]')).toEqual(['--no-browser', '--port']);
  });

  it('says when an app was not read back and offers Check, never a second copy', async () => {
    await renderPage(page, { path: '/apps?appsel=a7b8c9' });
    expect(await screen.findByText(strings['outcome.launch.title'].replace('{{name}}', 'sqlite-web'))).toBeInTheDocument();
    expect(screen.queryByText(strings['outcome.act.title'].replace('{{name}}', 'sqlite-web'))).toBeNull();
    expect(screen.getAllByRole('button', { name: strings['act.check'] }).length).toBeGreaterThan(0);
  });

  it('a lost Open says it may have gone through', async () => {
    await renderPage(page, { path: '/apps?launch=1', state: 'launch-pending' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    const row = await within(table).findByRole('row', { name: /htop/ });
    await userEvent.click(within(row).getByRole('button', { name: strings['act.open'] }));
    expect(await screen.findByText(strings['outcome.launch.title'].replace('{{name}}', 'htop'), {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('an unconfirmed Stop says the stop may have gone through', async () => {
    await renderPage(page, { path: '/apps?appsel=a1b2c3', state: 'stop-pending' });
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    const row = await within(table).findByRole('row', { name: /JupyterLab/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.stop'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['stop.confirm'] }));
    expect(await screen.findByText(strings['outcome.stop.title'].replace('{{name}}', 'JupyterLab'), {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('a row being read back after a reload shows no "may have" banner', async () => {
    await renderPage(page, { path: '/apps?appsel=c9d0e1', state: 'reading' });
    expect(await screen.findByText(strings['st.checking'].replace('{{name}}', 'Gitea'))).toBeInTheDocument();
    for (const k of ['outcome.act.title', 'outcome.launch.title', 'outcome.stop.title'] as const) expect(screen.queryByText(strings[k].replace('{{name}}', 'Gitea'))).toBeNull();
  });

  it('with nothing opened, the empty list says so and its Launch an app opens Find', async () => {
    const { router } = await renderPage(page, { path: '/apps', state: 'no-open' });
    const empty = (await screen.findByText(strings['empty.open.title'])).closest('div') as HTMLElement;
    expect(empty).not.toBeNull();
    const launch = await screen.findAllByRole('button', { name: strings['launch.action'] });
    await userEvent.click(launch[launch.length - 1] as HTMLElement);
    expect(await screen.findByRole('table', { name: strings['tab.find'] })).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ launch: '1' });
  });

  it('lists the starters with Open and flags unavailable ones', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    expect(await within(table).findByRole('row', { name: /JupyterLab/ })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Open WebUI/ })).toHaveTextContent(strings['row.unavailable']);
    expect(within(table).getByRole('row', { name: /Shared folder/ })).toHaveTextContent(strings['chip.shares']);
  });

  it('fills the search in as sources answer, with a Not an app row hidden by default', async () => {
    await renderPage(page, { path: '/apps?launch=1&launchq=jupyter' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    await within(table).findByText('jupyter/base-notebook');
    expect(within(table).queryByText('jupytext-nvim')).toBeNull();
    expect(screen.getByRole('button', { name: /Show \d+ hidden/ })).toBeInTheDocument();
  });

  it('lists libraries and plugins as Not an app when asked', async () => {
    await renderPage(page, { path: '/apps?launch=1&launchq=jupyter' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    await within(table).findByText('jupyter/base-notebook');
    await userEvent.click(screen.getByRole('button', { name: /Show \d+ hidden/ }));
    expect(within(table).getByText('jupytext-nvim')).toBeInTheDocument();
    expect(within(table).getAllByText(strings['row.notApp']).length).toBe(2);
  });

  it('shows a source that did not answer and offers Try again', async () => {
    await renderPage(page, { path: '/apps?launch=1&launchq=jupyter', state: 'search-mixed' });
    expect((await screen.findAllByText(new RegExp(`: ${strings['src.state.failed']}$`))).length).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: strings['src.retry'] })).toBeInTheDocument();
  });

  it('asks before the first Open of a starter that shares files', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    const row = await within(table).findByRole('row', { name: /Shared folder/ });
    await userEvent.click(within(row).getByRole('button', { name: strings['act.open'] }));
    expect(await screen.findByText(/Before you open Shared folder/)).toBeInTheDocument();
  });

  it('opens an app and lists it first: Find closes and the new row is selected', async () => {
    const { router } = await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    const row = await within(table).findByRole('row', { name: /htop/ });
    await userEvent.click(within(row).getByRole('button', { name: strings['act.open'] }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('launch'));
    const key = (router.state.location.search as Record<string, unknown>).appsel;
    expect(typeof key).toBe('string');
    expect(ops.get().launches.find((l) => l.key === key)?.app).toBe('htop');
    expect(screen.queryByRole('table', { name: strings['tab.find'] })).toBeNull();
  });

  it('shows the error and empty states of the catalogue', async () => {
    const a = await renderPage(page, { path: '/apps?launch=1', state: 'catalog-failed' });
    expect(await screen.findByText(strings['error.catalog.title'])).toBeInTheDocument();
    a.unmount();
    await renderPage(page, { path: '/apps?launch=1', state: 'catalog-empty' });
    // The title in the Find drawer: the empty Open list behind it has a "Find an app" button with the same words. Both
    // are on screen once loaded; a page-wide lookup passed only while the list was still loading (a timing change broke it).
    const drawer = await screen.findByRole('dialog', { name: strings['launch.title'] });
    expect(await within(drawer).findByText(strings['empty.catalog.title'], { selector: 'p, h1, h2, h3' })).toBeInTheDocument();
  });
});

describe('Launch an app: what it is and where the search looks', () => {
  beforeEach(() => ops.reset());
  /** The row's Found in cell (by the header's place, so a chip elsewhere in the row does not count). */
  const foundIn = (table: HTMLElement, row: HTMLElement): HTMLElement => {
    const heads = within(table).getAllByRole('columnheader');
    const at = heads.findIndex((h) => h.textContent?.trim() === 'Found in');
    expect(at).toBeGreaterThanOrEqual(0);
    return (row as HTMLTableRowElement).cells[at] as HTMLElement;
  };
  const chip = (cell: HTMLElement, word: string): HTMLElement => {
    const el = within(cell).getByText(word);
    // A chip (the kit's StatusPill), not plain column text.
    expect(el.closest('[class*="pill" i]')).not.toBeNull();
    return el;
  };

  it('one subtitle naming the computer, then the mode (Find an app | From GitHub); no lead, no three ways', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const drawer = await screen.findByRole('dialog', { name: strings['launch.title'] });
    // A subtitle that promises no lifetime (a program may finish or fail on its own).
    expect(within(drawer).getByText(/^Start a program on .+\. It opens in a window, a terminal or a browser tab\.$/)).toBeInTheDocument();
    expect(within(drawer).queryByText(/until you stop it/)).toBeNull();
    const mode = within(drawer).getByRole('radiogroup', { name: strings['launch.mode'] });
    expect(within(mode).getAllByRole('radio')).toHaveLength(2);
    expect(within(mode).getByRole('radio', { name: strings['launch.mode.find'] })).toBeChecked();
    expect(within(mode).getByRole('radio', { name: strings['gh.tab'] })).not.toBeChecked();
    expect(within(drawer).queryByRole('list', { name: 'Three ways to start one' })).toBeNull();
    expect(within(drawer).queryByText(/An app is a program/)).toBeNull();
    expect(within(drawer).queryByText(/Pick one and press Open/)).toBeNull();
  });

  it('never says "ready to open": the mode says Find an app, and a program only listed carries no Ready chip', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const drawer = await screen.findByRole('dialog', { name: strings['launch.title'] });
    expect(within(drawer).getByRole('radio', { name: strings['launch.mode.find'] })).toBeChecked();
    const table = await within(drawer).findByRole('table', { name: strings['tab.find'] });
    const row = await within(table).findByRole('row', { name: /JupyterLab/ });
    expect(within(row).queryByText('Ready')).toBeNull();
    expect(drawer.textContent ?? '').not.toMatch(/ready to open/i);
  });

  it('marks every result with a chip naming where it was found', async () => {
    await renderPage(page, { path: '/apps?launch=1&launchq=jupyter' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    await within(table).findByText('jupyter/base-notebook');
    const where: [RegExp, string][] = [
      [/jupyter\/base-notebook/, 'Docker'],
      [/jupyter-notebook/, 'On this computer'],
      [/^JupyterLab/, 'Ready to install'],
    ];
    for (const [name, word] of where) expect(chip(foundIn(table, within(table).getByRole('row', { name })), word)).toBeInTheDocument();
    // Two rows are named jupyter: one found in Nix, one in pkgx.
    for (const word of ['Nix', 'pkgx']) {
      const row = within(table).getAllByRole('row', { name: /^jupyter\b/ }).find((r) => within(foundIn(table, r)).queryByText(word));
      expect(row, word).toBeDefined();
      expect(chip(foundIn(table, row as HTMLElement), word)).toBeInTheDocument();
    }
    // Every result row carries one (the group headers are not result rows).
    const rows = within(table).getAllByRole('row').filter((r) => r.hasAttribute('data-row-id'));
    for (const r of rows) expect(foundIn(table, r).textContent?.trim()).not.toBe('');
  });

  it('says where it looked when nothing matches, once', async () => {
    await renderPage(page, { path: '/apps?launch=1&launchq=zzqq', state: 'search-none' });
    expect(await screen.findByText('Nothing found for “zzqq”')).toBeInTheDocument();
    expect(screen.getAllByText(/We looked in programs ready to install, the program index, this computer, Nix, pkgx, AppImage and Docker\. Try another name/).length).toBe(1);
  });

  it('a one-letter search says only the programs ready to install were asked, and how many letters search the rest', async () => {
    await renderPage(page, { path: '/apps?launch=1&launchq=q', state: 'search-none' });
    expect(await screen.findByText('No program ready to install matches “q”')).toBeInTheDocument();
    expect(screen.getByText('Type 2 or more letters to search the other places too.')).toBeInTheDocument();
    expect(screen.queryByText(/We looked in/)).toBeNull();
  });

  it('with no program ready to install listed, says to find one, and where it will look', async () => {
    await renderPage(page, { path: '/apps?launch=1', state: 'catalog-empty' });
    // The title in the Find drawer: the empty Open list behind it has a "Find an app" button with the same words. Both
    // are on screen once loaded; a page-wide lookup passed only while the list was still loading (a timing change broke it).
    const drawer = await screen.findByRole('dialog', { name: strings['launch.title'] });
    expect(await within(drawer).findByText('Find an app', { selector: 'p, h1, h2, h3' })).toBeInTheDocument();
    expect(within(drawer).getByText(/Type an app's name\. We look in programs ready to install, the program index, this computer, Nix, pkgx, AppImage and Docker/)).toBeInTheDocument();
  });
});

describe('apps: hidden values and warming sources', () => {
  beforeEach(() => ops.reset());

  it('removing a setting row never shows the next row\'s hidden value (rows keep their own id)', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    const row = await within(table).findByRole('row', { name: /JupyterLab/ });
    // Options is an item of the row's ⋯ menu (the standard row actions).
    await userEvent.click(within(row).getByRole('button', { name: /^(Row actions|More actions for )/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['act.options']}`) }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['opt.add'] }));
    await userEvent.click(within(drawer).getByRole('button', { name: strings['opt.add'] }));
    const values = within(drawer).getAllByLabelText(valueLabel);
    await userEvent.type(values[0] as HTMLElement, 'first-secret');
    await userEvent.type(values[1] as HTMLElement, 'second-secret');
    // Show the first row's value, then remove that row: the second row's value must stay hidden.
    await userEvent.click(within(drawer).getAllByRole('button', { name: 'Show what you typed' })[0] as HTMLElement);
    await userEvent.click(within(drawer).getByRole('button', { name: strings['opt.removeRow'].replace('{{n}}', '1') }));
    const left = within(drawer).getAllByLabelText(valueLabel);
    expect(left).toHaveLength(1);
    expect((left[0] as HTMLInputElement).type).toBe('password');
  });

  it('a source still warming is "Getting ready", not Failed, and does not need attention', () => {
    const r = { key: 'w', name: 'x', app: 'x', opensIn: 'web' as const, state: 'not_started' as const, code: 'source_warming', terminal: null, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 0 };
    expect(rowView(r).key).toBe('find.warming');
    expect(strings['short.find.warming']).toBe('Getting ready');
    expect(openMatches(r, 'attention')).toBe(false);
    expect(rowView({ ...r, code: 'replaced' })).toMatchObject({ tone: 'off', key: 'fail.replaced' });
  });
});

describe('apps: secrets, bad names and live answers', () => {
  beforeEach(() => ops.reset());

  it('the same search candidate found by "jupy" and then "jupyter" is one app: the second Open is held', async () => {
    await renderPage(page, { path: '/apps?launch=1&launchq=jupy', state: 'launch-pending' });
    let table = await screen.findByRole('table', { name: strings['tab.find'] });
    await userEvent.click(within(await within(table).findByRole('row', { name: /jupyter\/base-notebook/ })).getByRole('button', { name: strings['act.open'] }));
    await screen.findAllByText(strings['outcome.launch.title'].replace('{{name}}', 'jupyter/base-notebook'), {}, { timeout: 5000 });
    const before = ops.get().launches.length;
    // The Open closed Find; Launch an app opens it again for the second search.
    await userEvent.click((await screen.findAllByRole('button', { name: strings['launch.action'] }))[0] as HTMLElement);
    table = await screen.findByRole('table', { name: strings['tab.find'] });
    const search = within(await screen.findByRole('dialog')).getByRole('searchbox');
    await userEvent.clear(search);
    await userEvent.type(search, 'jupyter');
    // From FIND_MIN letters the results are their own grouped table (the ready-to-install table goes).
    table = await screen.findByRole('table', { name: strings['tab.find'] });
    await userEvent.click(within(await within(table).findByRole('row', { name: /jupyter\/base-notebook/ })).getByRole('button', { name: strings['act.open'] }));
    expect((await screen.findAllByText(strings['note.held'])).length).toBeGreaterThan(0);
    expect(ops.get().launches.length).toBe(before);
  });

  it('a revealed Options value stays inside the secret boundary', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    // Options is an item of the row's ⋯ menu (the standard row actions).
    await userEvent.click(within(await within(table).findByRole('row', { name: /JupyterLab/ })).getByRole('button', { name: /^(Row actions|More actions for )/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['act.options']}`) }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['opt.add'] }));
    expect(within(drawer).getByLabelText(valueLabel).closest('[data-secret]')).not.toBeNull();
  });

  it('a bad setting name is said once under the rows, naming its row, as an alert', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    await userEvent.click(within(await within(table).findByRole('row', { name: /JupyterLab/ })).getByRole('button', { name: /^(Row actions|More actions for )/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['act.options']}`) }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['opt.add'] }));
    await userEvent.type(within(drawer).getByLabelText(strings['opt.envName.n'].replace('{{n}}', '1')), '1bad');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['opt.open'] }));
    const said = strings['opt.envErrAt'].replace('{{n}}', '1').replace('{{why}}', strings['opt.nameBad']);
    expect(within(drawer).getByRole('alert')).toHaveTextContent(said);
    expect(within(drawer).getAllByText(strings['opt.nameBad'], { exact: false })).toHaveLength(1);
  });
});

describe('apps: search answers, a failed Stop, a gone selection, QR', () => {
  beforeEach(() => ops.reset());

  it('a live search answer is trusted as is: a tag-only match stays; fixtures are narrowed', () => {
    const tagged = cand({ title: 'lab', provider: 'nix', tags: ['jupyter'] });
    expect(kept(tagged, 'jupyter', true)).toBe(true);
    expect(kept(tagged, 'jupyter', false)).toBe(false);
  });

  it('a Stop that definitely failed leaves the row as it was, with a note, and no "may have" banner', async () => {
    await renderPage(page, { path: '/apps?appsel=a1b2c3', state: 'stop-failed' });
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    const row = await within(table).findByRole('row', { name: /JupyterLab/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.stop'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['stop.confirm'] }));
    expect((await screen.findAllByText(strings['note.stopFailed'], {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['outcome.stop.title'].replace('{{name}}', 'JupyterLab'))).toBeNull();
  });

  it('a selected app that is no longer listed says so', async () => {
    await renderPage(page, { path: '/apps?appsel=ffffff' });
    expect(await screen.findByText(strings['detail.notFound'])).toBeInTheDocument();
  });

  it('the web address has a QR code button beside it', async () => {
    await renderPage(page, { path: '/apps?appsel=a1b2c3' });
    await screen.findByText(strings['insp.address']);
    expect(screen.getAllByRole('button', { name: /QR/i }).length).toBeGreaterThan(0);
  });
});

describe('the Find table and the Options secrets', () => {
  beforeEach(() => ops.reset());

  it('the Find header sort orders the rows (server mode sorts nothing itself)', async () => {
    await renderPage(page, { path: '/apps?launch=1&findsort=-name' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    await within(table).findByRole('row', { name: /JupyterLab/ });
    // The programs ready to install are grouped by category; the header sort orders the rows inside each group.
    const runs: string[][] = [[]];
    for (const r of within(table).getAllByRole('row').slice(1)) {
      if (r.hasAttribute('data-row-id')) runs[runs.length - 1]!.push(r.textContent ?? '');
      else runs.push([]);
    }
    const groups = runs.filter((g) => g.length > 0);
    expect(groups.flat().length).toBeGreaterThan(2);
    expect(groups.some((g) => g.length > 1)).toBe(true);
    for (const g of groups) expect(g).toEqual([...g].sort((a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' })));
  });

  it('Options drops its hidden values when the page is hidden: each SecretInput wipes through onChange', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    // Options is an item of the row's ⋯ menu (the standard row actions).
    await userEvent.click(within(await within(table).findByRole('row', { name: /JupyterLab/ })).getByRole('button', { name: /^(Row actions|More actions for )/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['act.options']}`) }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['opt.add'] }));
    const value = within(drawer).getByLabelText(valueLabel) as HTMLInputElement;
    await userEvent.type(value, 's3cret');
    expect(value.value).toBe('s3cret');
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => expect((within(drawer).getByLabelText(valueLabel) as HTMLInputElement).value).toBe(''));
  });
  it('a page hide wipes every hidden value, not only the last row edited', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    await userEvent.click(within(await within(table).findByRole('row', { name: /JupyterLab/ })).getByRole('button', { name: /^(Row actions|More actions for )/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['act.options']}`) }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: strings['opt.add'] }));
    await userEvent.click(within(drawer).getByRole('button', { name: strings['opt.add'] }));
    const values = within(drawer).getAllByLabelText(valueLabel) as HTMLInputElement[];
    await userEvent.type(values[0] as HTMLInputElement, 'one-secret');
    await userEvent.type(values[1] as HTMLInputElement, 'two-secret');
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => expect((within(drawer).getAllByLabelText(valueLabel) as HTMLInputElement[]).map((v) => v.value)).toEqual(['', '']));
  });
});

describe('apps C9: a held Open is dismissed, never quietly forgotten', () => {
  beforeEach(() => ops.reset());

  it('an Open that may have gone through offers Dismiss with a warning; Cancel keeps it, Dismiss removes it', async () => {
    await renderPage(page, { path: '/apps?appsel=a1b2c3', state: 'held' });
    await screen.findByRole('heading', { name: 'JupyterLab' });
    expect(screen.queryByRole('button', { name: strings['act.forget'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['act.dismiss'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText(strings['dismiss.body'])).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'JupyterLab' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['act.dismiss'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['dismiss.confirm'] }));
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    await waitFor(() => expect(within(table).queryByRole('row', { name: /JupyterLab/ })).toBeNull());
  });

  it('the row menu says Dismiss on a held row and Remove from this list on a settled one', async () => {
    await renderPage(page, { path: '/apps', state: 'held' });
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    await userEvent.click(within(await within(table).findByRole('row', { name: /JupyterLab/ })).getByRole('button', { name: 'Row actions' }));
    expect(await screen.findByRole('menuitem', { name: strings['menu.dismiss'] })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(await within(table).findByRole('row', { name: /Shared folder/ })).getByRole('button', { name: 'Row actions' }));
    expect(await screen.findByRole('menuitem', { name: strings['menu.forget'] })).toBeInTheDocument();
  });
});
