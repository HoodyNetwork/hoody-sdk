// The Projects list's Permissions column (the rules fact plus people) and the project's Permissions drawer, read only:
// Overview and People. A shared-access (key) session reads no people at all and says why.
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { memberReads } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const first = fixtureWorld.projects[0]!;
const others = fixtureWorld.projects.slice(1);
const openList = (state: string) => renderPage(page, { path: '/computers/projects', state });
// The People section's table and its body rows (one per person; the header row carries no row id).
const peopleTable = (d: HTMLElement) => within(d).findByRole('table', { name: strings['pp.tab.people'] }, { timeout: 8000 });
const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').filter((r) => r.hasAttribute('data-row-id'));
const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;
const openPerms = async (name: string) => {
  const row = await rowOf(name);
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
  return screen.findByRole('dialog', { name: strings['pp.title'].replace('{{name}}', name) }, { timeout: 8000 });
};

beforeEach(() => {
  memberReads.length = 0;
});

describe('Projects: permissions', () => {
  it('each project shows its people beside its access rules (the Permissions column)', async () => {
    await openList('projectPeople');
    const row = await rowOf(first.name);
    expect(await within(row).findByText('2 people', {}, { timeout: 8000 })).toBeInTheDocument();
    for (const p of others) expect(await within(await rowOf(p.name)).findByText(strings['pp.fact.onlyYou'], {}, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);

  it('a read that fails says Couldn\'t check, never Only you', async () => {
    await openList('projectPeopleFail');
    const row = await rowOf(first.name);
    expect(await within(row).findByText(strings['pp.fact.people.failed'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(row).queryByText(strings['pp.fact.onlyYou'])).toBeNull();
  }, 40000);

  it('when both reads fail, each failure keeps its own details and Try again', async () => {
    await openList('projectPermsBothFail');
    const d = await openPerms(first.name);
    const people = (await within(d).findByText(strings['pp.people.error'], {}, { timeout: 8000 })).closest<HTMLElement>('[role="alert"]')!;
    const rules = within(d).getAllByText(strings['pp.rules.error']).map((e) => e.closest<HTMLElement>('[role="alert"]')).find((b) => b !== null)!;
    expect(people).not.toBeNull();
    expect(rules).not.toBeNull();
    expect(people).not.toBe(rules);
    for (const band of [people, rules]) {
      expect(within(band).getByRole('button', { name: 'Details' })).toBeInTheDocument();
      expect(within(band).getByRole('button', { name: strings['pp.ov.retry'] })).toBeInTheDocument();
    }
  }, 40000);

  it.each(['projectPeopleKey', 'projectPeopleKeyRealm'])('a shared-key session (%s) reads no people: the column and the drawer say why, and no request is sent', async (state) => {
    await openList(state);
    const row = await rowOf(first.name);
    // Both facts (rules and people) say it.
    expect(await within(row).findAllByText(strings['pp.fact.people.key'], {}, { timeout: 8000 })).toHaveLength(2);
    const d = await openPerms(first.name);
    expect(within(d).getAllByText(strings['pp.people.cantRead.key']).length).toBeGreaterThan(0);
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.people'] }));
    expect(within(d).getAllByText(strings['pp.people.cantRead.key']).length).toBeGreaterThan(0);
    expect(memberReads).toEqual([]);
  }, 40000);

  it('the drawer: Overview is one glance of facts (people by level, what passes down) with no buttons that only switch tabs; People is a table with their levels', async () => {
    await openList('projectPeople');
    const d = await openPerms(first.name);
    expect(within(d).getByText(strings['pp.ov.lede'])).toBeInTheDocument();
    expect(within(d).getByRole('heading', { name: strings['pp.ov.glance'] })).toBeInTheDocument();
    expect(await within(d).findByText('2 people: 1 Work on, 1 See', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).getByText(strings['pp.ov.realms.value'])).toBeInTheDocument();
    // The tabs are the way to People and Access rules; no button repeats them.
    expect(within(d).queryByRole('button', { name: /^See /i })).toBeNull();
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.people'] }));
    const rows = bodyRows(await peopleTable(d));
    expect(rows).toHaveLength(2);
    // The owner changes each level and removes each person in projects.people.test.tsx; here the rows read in order.
    for (const [i, [name, level]] of ([['jane_smith', 'edit'], ['bob', 'read']] as const).entries()) {
      expect(rows[i]!).toHaveTextContent(name);
      expect(rows[i]!).toHaveTextContent(strings[`pp.lvl.${level}`]);
      // The level change and Remove sit in the row's menu: the row itself holds no control but that menu.
      expect(within(rows[i]!).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Row actions']);
    }
    expect(within(d).getByText(strings['pp.people.owner'])).toBeInTheDocument();
    // No account id reaches the page.
    expect(d.textContent).not.toMatch(/[0-9a-f]{24}/);
  }, 40000);

  it("the owner's own row shows as Owner and is not counted; an unknown level and a cut list say so", async () => {
    await openList('projectPeopleOdd');
    expect(await within(await rowOf(first.name)).findByText('At least 1 person', {}, { timeout: 8000 })).toBeInTheDocument();
    const d = await openPerms(first.name);
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.people'] }));
    const items = bodyRows(await peopleTable(d));
    expect(items[0]!.textContent).toContain(strings['pp.owner.row']);
    expect(items[0]!.textContent).toContain('ada');
    // The owner's row offers nothing to change.
    expect(within(items[0]!).queryByRole('button', { name: 'Row actions' })).toBeNull();
    expect(items[1]!).toHaveTextContent('jane_smith');
    expect(items[1]!).toHaveTextContent(strings['pp.lvl.edit']);
    expect(within(d).getByText('1 more member has a level the Hub doesn\'t know.')).toBeInTheDocument();
    expect(within(d).getByText('Showing the first 3 of 5.')).toBeInTheDocument();
  }, 40000);

  it("an answer whose rows are all of an unknown level, or without its total, never says there's nobody else", async () => {
    for (const state of ['projectPeopleUnknownOnly', 'projectPeopleNoTotal']) {
      await openList(state);
      const row = await rowOf(first.name);
      expect(await within(row).findByText(strings['pp.fact.people.uncounted'], {}, { timeout: 8000 })).toBeInTheDocument();
      const d = await openPerms(first.name);
      expect(await within(d).findByText(strings['pp.ov.people.uncounted'], {}, { timeout: 8000 })).toBeInTheDocument();
      await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.people'] }));
      await waitFor(() => expect(within(d).queryByText(strings['pp.people.loading'])).toBeNull(), { timeout: 8000 });
      expect(within(d).queryByText(strings['pp.people.none'])).toBeNull();
      expect(within(d).queryByText(strings['pp.ov.people.none'])).toBeNull();
      expect(within(d).getByText(state === 'projectPeopleNoTotal' ? strings['pp.people.noTotal'] : "1 more member has a level the Hub doesn't know.")).toBeInTheDocument();
      cleanup();
    }
  }, 60000);

  it('a read paused offline shows Couldn\'t check in the list and the drawer, never the people it held before', async () => {
    const r = await openList('projectPeople');
    const row = await rowOf(first.name);
    expect(await within(row).findByText('2 people', {}, { timeout: 8000 })).toBeInTheDocument();
    // The browser's offline event: the query layer pauses its reads (TanStack's onlineManager listens to it).
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    try {
      await act(async () => {
        await r.queryClient.invalidateQueries();
      });
      // Both facts (rules and people): neither shows what it held before.
      expect(await within(await rowOf(first.name)).findAllByText(strings['pp.fact.people.failed'], {}, { timeout: 8000 })).toHaveLength(2);
      expect(within(await rowOf(first.name)).queryByText('2 people')).toBeNull();
      const d = await openPerms(first.name);
      expect(await within(d).findByText(strings['pp.people.error'], {}, { timeout: 8000 })).toBeInTheDocument();
      // The rules too: the card says the read failed, never the document it held before.
      expect(within(d).getAllByText(strings['pp.rules.error']).length).toBeGreaterThan(0);
      expect(within(d).queryByText(strings['pp.ov.rules.none'])).toBeNull();
      await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.people'] }));
      expect(within(d).queryByRole('table', { name: strings['pp.tab.people'] })).toBeNull();
    } finally {
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
    }
  }, 40000);

  it('what each level can do lists each level over the one below, from the one table', async () => {
    await openList('projectPeople');
    const d = await openPerms(first.name);
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.people'] }));
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.levels.disclosure'] }));
    expect(await within(d).findByText(strings['pp.can.workspace'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).getByText(strings['pp.can.deleteAll'])).toBeInTheDocument();
    expect(within(d).getByText('Everything in See, plus:')).toBeInTheDocument();
    expect(within(d).getByText('Everything in Work on, plus:')).toBeInTheDocument();
    expect(within(d).getByText(strings['pp.tag.grantsAll'])).toBeInTheDocument();
    await waitFor(() => expect(memberReads.length).toBeGreaterThan(0));
  }, 40000);
});
