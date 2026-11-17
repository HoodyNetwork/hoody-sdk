// The project permissions drawer's Computers tab. The
// owner sees the project's computers as the API lists them (the first 100, expired and deleting ones too), each with
// whether it keeps rules of its own (that state first) and how its addresses are decided ("—" unless both facts are
// certain), counted only "of the computers shown". A failed read is an error with Try again, never "no computers". A
// member reads the same list (the API's member view, without proxy documents; mocked here, since the API copy
// the tests run against has no member view yet), with "Gets in by" from the member's own rules read, and a refused read is an error.
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers, projectListQueries, projectListReads, removeSends, resetAccess } from './fixtures';
import { bucket } from './logic';
import page from './page';
import strings from './strings.en.json';
import accStrings from './parts/AccessDrawer.strings.en.json';
import { permissionsTesting } from './permissions.testing';

const { landedOnPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const first = fixtureWorld.projects[0]!;
const SLOW = { timeout: 8000 };
const fill = (k: keyof typeof strings, v: Record<string, string | number> = {}) => Object.entries(v).reduce<string>((s, [n, x]) => s.split(`{{${n}}}`).join(String(x)), strings[k]);
const mine = computers.filter((c) => c.project_id === first.id);
// One fact of the tab's glance: the value beside its label (the counts are of the rows shown, never the API's total).
const factOf = (d: HTMLElement, k: keyof typeof strings) => within(d).getByText(strings[k], { selector: 'dt' }).nextElementSibling?.textContent;
const expectCounts = (d: HTMLElement, shown: string, full: number, own: number, unknown: number) => {
  expect(factOf(d, 'pp.cx.fact.shown')).toBe(shown);
  expect(factOf(d, 'pp.cx.fact.full')).toBe(String(full));
  expect(factOf(d, 'pp.cx.fact.own')).toBe(String(own));
  expect(factOf(d, 'pp.cx.fact.unknown')).toBe(String(unknown));
};

beforeEach(() => {
  resetAccess();
  projectListReads.length = 0;
  projectListQueries.length = 0;
  removeSends.length = 0;
});

async function openTab(state: string, realm?: string) {
  const d = await openDrawer(state, realm);
  await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.computers'] }));
  return d;
}
async function openDrawer(state: string, realm?: string) {
  await renderPage(page, { path: '/computers/projects', state, ...(realm ? { realm } : {}) });
  // The file's first render loads the page cold (well past SLOW on a loaded machine); later ones are warm.
  const row = (await screen.findByText(first.name, { selector: 'strong' }, { timeout: 30000 })).closest('[data-row-id]') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
  return screen.findByRole('dialog', { name: fill('pp.title', { name: first.name }) }, SLOW);
}
const listOf = (d: HTMLElement) => within(d).findByRole('table', { name: fill('pp.cx.title', { name: first.name }) }, SLOW);
// The table's body rows, one per computer (the header row carries no row id).
const rowsOf = async (d: HTMLElement) => within(await listOf(d)).getAllByRole('row').filter((r) => r.hasAttribute('data-row-id'));
// The labels in a row's ⋯ menu (none when the row has no menu); the menu is closed again.
async function menuOf(row: HTMLElement): Promise<string[]> {
  const more = within(row).queryByRole('button', { name: 'Row actions' });
  if (!more) return [];
  await userEvent.click(more);
  const names = within(await screen.findByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent ?? '');
  await userEvent.keyboard('{Escape}');
  return names;
}
// Delete of an expired computer sits in its row's menu, after Access.
async function pressDelete(row: HTMLElement, name: string) {
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(`^${fill('pp.cx.deleteOf', { name })}`) }));
}

describe('the Overview count of computers', () => {
  it('reads no list itself: it points at the Computers tab until that tab has read, then counts the rows read', async () => {
    const d = await openDrawer('rulesChange');
    await waitFor(() => expect(factOf(d, 'pp.ov.fact.computers')).toBe(strings['pp.ov.cx.inTab']), SLOW);
    expect(projectListReads).toHaveLength(0);
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.computers'] }));
    expect(await rowsOf(d)).toHaveLength(mine.length);
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.overview'] }));
    await waitFor(() => expect(factOf(d, 'pp.ov.fact.computers')).toBe(`${mine.length} computers`), SLOW);
    expect(projectListReads).toHaveLength(1);
  }, 60000);
});

describe('the Computers tab (owner)', () => {
  it('lists each computer with its state, its own rules and how it is reached, counted of the shown', async () => {
    // rulesIp: the project has rules. Own: missing (none), applied (yes), unknown (could not check).
    const d = await openTab('rulesChange');
    const rows = await rowsOf(d);
    expect(rows).toHaveLength(mine.length);
    const [a, b, c] = rows as [HTMLElement, HTMLElement, HTMLElement];
    expect(a).toHaveTextContent(mine[0]!.name);
    expect(a).toHaveTextContent(strings[`state.${bucket(mine[0]!.status)}` as keyof typeof strings]);
    // One Who gets in column: the source says whether it has rules of its own (none: the project's; yes: both).
    expect(a).toHaveTextContent(strings['pp.cx.by.project']);
    expect(b).toHaveTextContent(strings['pp.cx.by.both']);
    expect(c).toHaveTextContent(strings['pp.cx.own.failed']);
    // Not certain: no "gets in by" guess.
    for (const k of ['pp.cx.by.project', 'pp.cx.by.both', 'pp.cx.by.own', 'pp.cx.by.open'] as const) expect(c).not.toHaveTextContent(strings[k]);
    expectCounts(d, '3', 1, 1, 1);
    expect(within(d).queryByText(strings['pp.cx.empty'])).toBeNull();
    expect(within(d).queryByText(fill('pp.cx.more', { count: 3 }))).toBeNull();
  }, 40000);

  it('counts zero as zero, never leaving a fact out', async () => {
    // memberComputersNoState: 0 / 0 / 3 of 3.
    const d = await openTab('memberComputersNoState');
    await rowsOf(d);
    expectCounts(d, '3', 0, 0, 3);
  }, 40000);

  it('reads the first 100, expired and deleting ones too', async () => {
    const d = await openTab('rulesChange');
    await rowsOf(d);
    expect(projectListReads).toContain(first.id);
    expect(projectListQueries.at(-1)).toMatchObject({ limit: '100', include_expired: 'true', include_deleting: 'true' });
  }, 40000);

  it('a project with no rules of its own: a computer with none is reached by anyone with the address', async () => {
    const d = await openTab('rulesChangeOpen');
    const [a, b] = (await rowsOf(d)) as [HTMLElement, HTMLElement];
    expect(a).toHaveTextContent(strings['pp.cx.by.open']);
    expect(b).toHaveTextContent(strings['pp.cx.by.own']);
  }, 40000);

  it('a scope that cannot tell says Not known, with the note on how to find out', async () => {
    const d = await openTab('rulesChangeNoState');
    const [a] = (await rowsOf(d)) as [HTMLElement];
    expect(a).toHaveTextContent(strings['pp.cx.own.unknown']);
    expect(d).toHaveTextContent(strings['pp.cx.unknownNote']);
  }, 40000);

  it('more computers than shown: says so, and the counts stay of the shown', async () => {
    const d = await openTab('projectComputersMore');
    await rowsOf(d);
    expect(d).toHaveTextContent(fill('pp.cx.more', { count: mine.length }));
    // The API's total (140) is said only as "of", never as the count: the counts are of the rows shown.
    expectCounts(d, `${mine.length} of 140`, 1, 1, 1);
  }, 40000);

  it('a failed read is an error with Try again, never an empty project', async () => {
    const d = await openTab('rulesChangeListFails');
    // The kit's own failed state: its error line and Try again where the table goes.
    expect(await within(d).findByRole('button', { name: /try again/i }, SLOW)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(within(d).queryByRole('table', { name: fill('pp.cx.title', { name: first.name }) })).toBeNull();
    expect(within(d).queryByText(strings['pp.cx.empty'])).toBeNull();
  }, 40000);

  for (const state of ['rulesChangeListBadRow', 'rulesChangeListBadStatus', 'rulesChangeListNoTotal']) {
    it(`a malformed answer (${state}) is an error with Try again, never counts or an empty project`, async () => {
      const d = await openTab(state);
      // The kit's own failed state: its error line and Try again where the table goes.
    expect(await within(d).findByRole('button', { name: /try again/i }, SLOW)).toBeInTheDocument();
      expect(within(d).getByRole('button', { name: /try again/i })).toBeInTheDocument();
      expect(within(d).queryByRole('table', { name: fill('pp.cx.title', { name: first.name }) })).toBeNull();
      expect(within(d).queryByText(strings['pp.cx.empty'])).toBeNull();
      expect(within(d).queryByText(strings['pp.cx.fact.shown'], { selector: 'dt' })).toBeNull();
    }, 40000);
  }

  it("Access lands on that computer's Permissions tab, and the project drawer closes", async () => {
    const d = await openTab('rulesChange');
    const [a] = (await rowsOf(d)) as [HTMLElement];
    await userEvent.click(within(a).getByRole('button', { name: fill('pp.cx.accessOf', { name: mine[0]!.name }) }));
    await landedOnPermissions(strings, accStrings['perm.who.title']);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }, 40000);
});

describe('the Computers tab: Access on a computer this page cannot show', () => {
  it('an expired computer keeps a drawer: its rules show, the reason is said, and nothing can be changed', async () => {
    const d = await openTab('projectExpired');
    const row = (await rowsOf(d)).find((r) => r.textContent?.includes('cedar')) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: fill('pp.cx.accessOf', { name: 'cedar' }) }));
    const a = await screen.findByRole('dialog', { name: accStrings['acc.title'].replace('{{name}}', 'cedar') }, SLOW);
    await within(a).findByText(accStrings['perm.reinstalled'].replace('{{name}}', 'cedar'), undefined, SLOW);
    // Its rules still read (the fixture's project has rules, so they show as set outside the Hub).
    await within(a).findByText(accStrings['acc.now.advanced'], undefined, SLOW);
    for (const r of within(a).queryAllByRole('radio')) expect(r).toBeDisabled();
    expect(within(a).queryByRole('button', { name: accStrings['acc.save'] })).toBeNull();
    expect(within(a).queryByRole('button', { name: accStrings['acc.proj.use.go'] })).toBeNull();
    // The project's drawer is still there under it.
    expect(screen.getByRole('dialog', { name: fill('pp.title', { name: first.name }), hidden: true })).toBeInTheDocument();
  }, 40000);
});

describe('the Computers tab (member)', () => {
  it('lists the member view rows with how each is reached, and asks for no proxy documents', async () => {
    const d = await openTab('memberComputers');
    const rows = await rowsOf(d);
    expect(rows).toHaveLength(mine.length);
    const [a, b, c] = rows as [HTMLElement, HTMLElement, HTMLElement];
    expect(a).toHaveTextContent(mine[0]!.name);
    // One Who gets in column: the source says whether it has rules of its own (none: the project's; yes: both).
    expect(a).toHaveTextContent(strings['pp.cx.by.project']);
    expect(b).toHaveTextContent(strings['pp.cx.by.both']);
    expect(c).toHaveTextContent(strings['pp.cx.own.failed']);
    expectCounts(d, '3', 1, 1, 1);
    expect(projectListReads).toEqual([first.id]);
    expect(projectListQueries[0]).toMatchObject({ page: '1', limit: '100', include_expired: 'true', include_deleting: 'true' });
    expect(projectListQueries[0]!.include_proxy_permissions).toBeUndefined();
    // The member view holds no proxy documents: no Access button that could only fail.
    expect(within(a).queryByRole('button', { name: fill('pp.cx.accessOf', { name: mine[0]!.name }) })).toBeNull();
  }, 40000);

  it("shows only what is known of each computer's own rules when the member's rules read fails, never a source", async () => {
    const d = await openTab('memberComputersRulesFail');
    const rows = await rowsOf(d);
    expect(rows).toHaveLength(mine.length);
    const [a, b, c] = rows as [HTMLElement, HTMLElement, HTMLElement];
    expect(a).toHaveTextContent(strings['pp.cx.by.noOwn']);
    expect(b).toHaveTextContent(strings['pp.cx.by.hasOwn']);
    expect(c).toHaveTextContent(strings['pp.cx.own.failed']);
    for (const r of rows) for (const k of ['pp.cx.by.project', 'pp.cx.by.both', 'pp.cx.by.own', 'pp.cx.by.open'] as const) expect(r).not.toHaveTextContent(strings[k]);
  }, 40000);

  it("explains 'Not known' without pointing a member at an Access they do not get", async () => {
    const d = await openTab('memberComputersNoState');
    const rows = await rowsOf(d);
    for (const r of rows) expect(r).toHaveTextContent(strings['pp.cx.own.unknown']);
    expect(d).toHaveTextContent(strings['pp.cx.unknownNoteMember']);
    expect(d).not.toHaveTextContent(strings['pp.cx.unknownNote']);
  }, 40000);

  it('a refused member read (403) is an error with Try again, never an empty list', async () => {
    const d = await openTab('memberComputersRefused');
    // The kit's own failed state: its error line and Try again where the table goes.
    expect(await within(d).findByRole('button', { name: /try again/i }, SLOW)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(within(d).queryByText(strings['pp.cx.empty'])).toBeNull();
    expect(within(d).queryByRole('table', { name: fill('pp.cx.title', { name: first.name }) })).toBeNull();
    expect(within(d).queryByText(strings['pp.cx.fact.shown'], { selector: 'dt' })).toBeNull();
  }, 40000);
});

// host_reinstalled: an expired computer of the project (its server ended or was reinstalled) shows in the
// tab with its state, a reinstalled one with what happened, and its owner deletes it there: through the page's one delete
// dialog, on the base host, proved only by the computer's own 404 (no list shows an expired computer). The fixture's
// first project holds atlas (live), cedar (host_reinstalled, the default computer, in no realm) and fjord (rental ended).
describe('host_reinstalled: expired computers in the Computers tab', () => {
  const byName = (rows: HTMLElement[], name: string) => rows.find((r) => within(r).queryByText(name, { exact: true })) as HTMLElement;
  const cedar = computers.find((c) => c.name === 'cedar')!;
  const fjord = computers.find((c) => c.name === 'fjord')!;
  const deleteOf = (name: string) => fill('pp.cx.deleteOf', { name });
  const confirmDelete = async (name: string) => {
    const d = await screen.findByRole('alertdialog', { name: fill('delete.title', { name }) }, SLOW);
    await userEvent.type(within(d).getByLabelText(`Type ${name} to confirm`), name);
    await userEvent.click(within(d).getByRole('button', { name: strings['delete.go'] }));
    return d;
  };

  it('(a)(f) a reinstalled computer shows Host reinstalled and the note; a rental-expired one its state, no note', async () => {
    const d = await openTab('projectExpired');
    const rows = await rowsOf(d);
    expect(rows).toHaveLength(3);
    const c = byName(rows, 'cedar'), f = byName(rows, 'fjord');
    expect(c).toHaveTextContent(strings['state.reinstalled']);
    // What happened is a band above the table, whole (a table cell is one cut line); the row's Who gets in is a dash.
    expect(c).toHaveTextContent(strings['pp.cx.by.none']);
    expect(d).toHaveTextContent(fill('pp.cx.reinstalledOf', { name: 'cedar' }));
    expect(f).toHaveTextContent(strings['state.stopped']);
    expect(d).not.toHaveTextContent(fill('pp.cx.reinstalledOf', { name: 'fjord' }));
    expect(f).not.toHaveTextContent(strings['pp.cx.by.none']);
  }, 40000);

  it('(b) Delete only on the expired rows, for the owner; the live row keeps Access only', async () => {
    const d = await openTab('projectExpired');
    const rows = await rowsOf(d);
    const a = byName(rows, 'atlas');
    expect(await menuOf(a)).toEqual([]);
    expect(within(a).getByRole('button', { name: fill('pp.cx.accessOf', { name: 'atlas' }) })).toBeInTheDocument();
    for (const n of ['cedar', 'fjord']) {
      const r = byName(rows, n);
      // The owner's Access stays on the row; Delete is in its menu.
      expect(within(r).getByRole('button', { name: fill('pp.cx.accessOf', { name: n }) })).toBeInTheDocument();
      expect((await menuOf(r)).some((x) => x.startsWith(deleteOf(n)))).toBe(true);
    }
  }, 40000);

  it('(b) a member gets no Delete, not even on an expired row', async () => {
    const d = await openTab('projectExpiredMember');
    const rows = await rowsOf(d);
    for (const n of ['atlas', 'cedar', 'fjord']) expect((await menuOf(byName(rows, n))).some((x) => x.startsWith(deleteOf(n)))).toBe(false);
  }, 40000);

  it('(c)(e)(h) Delete opens the page\'s one delete dialog, sends one base-host DELETE, and the tab reads again without it', async () => {
    // cedar is the default computer and in no realm: neither stops its delete.
    const d = await openTab('projectExpired');
    const reads = projectListReads.length;
    await pressDelete(byName(await rowsOf(d), 'cedar'), 'cedar');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    await confirmDelete('cedar');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), SLOW);
    expect(removeSends).toEqual([{ scope: 'base', id: cedar.id }]);
    await waitFor(() => expect(projectListReads.length).toBeGreaterThan(reads), SLOW);
    await waitFor(async () => expect((await rowsOf(d)).map((r) => r.textContent)).not.toEqual(expect.arrayContaining([expect.stringContaining('cedar')])), SLOW);
  }, 40000);

  it('(f) a rental-expired computer is deleted the same way', async () => {
    const d = await openTab('projectExpired');
    await pressDelete(byName(await rowsOf(d), 'fjord'), 'fjord');
    await confirmDelete('fjord');
    await waitFor(() => expect(removeSends).toEqual([{ scope: 'base', id: fjord.id }]), SLOW);
  }, 40000);

  it('(g) with another realm shown, the delete still goes to the base host and succeeds', async () => {
    const d = await openTab('projectExpired', fixtureWorld.realms[1]!.id);
    await pressDelete(byName(await rowsOf(d), 'cedar'), 'cedar');
    await confirmDelete('cedar');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), SLOW);
    expect(removeSends).toEqual([{ scope: 'base', id: cedar.id }]);
  }, 40000);

  // (d) A lost answer: held until the computer's own read (base host) answers 404. The realm's list never shows an
  // expired computer, so it must never decide; a computer still there, or a read that fails, keeps it held. Nothing is
  // sent again.
  const lost = async (state: string) => {
    const d = await openTab(state);
    await pressDelete(byName(await rowsOf(d), 'cedar'), 'cedar');
    const dlg = await confirmDelete('cedar');
    expect(await within(dlg).findByText(fill('held.remove', { name: 'cedar' }), {}, SLOW)).toBeInTheDocument();
    return dlg;
  };
  const checkAgain = async (dlg: HTMLElement) => {
    // The held band carries the one Check again; it reads the computer.
    const buttons = within(dlg).getAllByRole('button', { name: strings['held.check'] });
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      if (!dlg.isConnected) break;
      await userEvent.click(b);
    }
  };

  for (const state of ['projectExpiredLostThere', 'projectExpiredLostDown']) {
    it(`(d) ${state}: Check again keeps it held (the computer is still there, or its read failed); nothing is resent`, async () => {
      const dlg = await lost(state);
      await checkAgain(dlg);
      await new Promise((done) => setTimeout(done, 300));
      expect(screen.getByRole('alertdialog', { name: fill('delete.title', { name: 'cedar' }) })).toBeInTheDocument();
      expect(within(dlg).getByText(fill('held.remove', { name: 'cedar' }))).toBeInTheDocument();
      expect(removeSends).toHaveLength(1);
    }, 40000);
  }

  it('(d) a held delete says it once: one pending line, one Check again (the held band; the dialog draws no outcome line beside it)', async () => {
    const dlg = await lost('projectExpiredLostThere');
    expect(within(dlg).getAllByText(fill('held.remove', { name: 'cedar' }))).toHaveLength(1);
    expect(within(dlg).getAllByRole('button', { name: strings['held.check'] })).toHaveLength(1);
  }, 40000);

  it('(d) a lost answer, then the computer reads 404: Check again frees it and closes the dialog', async () => {
    const dlg = await lost('projectExpiredLost');
    // A fresh realm-list read alone proves nothing here.
    await new Promise((done) => setTimeout(done, 300));
    expect(within(dlg).getByText(fill('held.remove', { name: 'cedar' }))).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), SLOW);
    expect(removeSends).toEqual([{ scope: 'base', id: cedar.id }]);
  }, 40000);
});
