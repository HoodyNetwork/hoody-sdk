// A project's own access rules, read only: the Projects list's rules fact (from the project's document, never
// guessed from its computers), the drawer's Access rules tab and Overview card, and Explain with the Agent. No
// credential reaches the page; a shared-access (key) session sends no rules read; the server's 403 says who may see.
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { projectRulesHeld, projectRulesReads } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import accStrings from './parts/AccessDrawer.strings.en.json';

const first = fixtureWorld.projects[0]!;
const others = fixtureWorld.projects.slice(1);
const openList = (state: string) => renderPage(page, { path: '/computers/projects', state });
const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;
const openPerms = async (name: string) => {
  const row = await rowOf(name);
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
  return screen.findByRole('dialog', { name: strings['pp.title'].replace('{{name}}', name) }, { timeout: 8000 });
};
const rulesTab = async (d: HTMLElement) => {
  await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.rules'] }));
  return d;
};

beforeEach(() => {
  projectRulesReads.length = 0;
  projectRulesHeld.length = 0;
});

describe('Projects: access rules', () => {
  it("each row's rules fact comes from the project's own document: set, or none for the default and a stored open one", async () => {
    await openList('projectRulesIp');
    expect(await within(await rowOf(first.name)).findByText(strings['pp.fact.rules.set'], {}, { timeout: 8000 })).toBeInTheDocument();
    for (const p of others) expect(await within(await rowOf(p.name)).findByText(strings['pp.fact.rules.none'], {}, { timeout: 8000 })).toBeInTheDocument();
    cleanup();
    await openList('projectRulesOpenStored');
    expect(await within(await rowOf(first.name)).findByText(strings['pp.fact.rules.none'], {}, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);

  it("a failed read says Couldn't check; the server's refusal says who may see them; a read in flight says nothing yet", async () => {
    await openList('projectRulesFail');
    const row = await rowOf(first.name);
    expect(await within(row).findByText(strings['pp.fact.rules.failed'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(row).queryByText(strings['pp.fact.rules.none'])).toBeNull();
    cleanup();
    await openList('projectRulesLevel');
    expect(await within(await rowOf(first.name)).findByText(strings['pp.fact.rules.level'], {}, { timeout: 8000 })).toBeInTheDocument();
    cleanup();
    await openList('projectRulesHold');
    const held = await rowOf(first.name);
    await waitFor(() => expect(projectRulesReads.length).toBeGreaterThan(0), { timeout: 8000 });
    expect(within(held).queryByText(strings['pp.fact.rules.none'])).toBeNull();
    expect(within(held).queryByText(strings['pp.fact.rules.set'])).toBeNull();
    expect(within(held).queryByText(strings['pp.fact.rules.failed'])).toBeNull();
    for (const go of projectRulesHeld.splice(0)) go();
    expect(await within(held).findByText(strings['pp.fact.rules.none'], {}, { timeout: 8000 })).toBeInTheDocument();
  }, 60000);

  it.each(['projectPeopleKey', 'projectPeopleKeyRealm'])('a shared-key session (%s) sends no rules read: the column, the card and the tab say why', async (state) => {
    await openList(state);
    // The rules fact and the people fact both say it.
    expect(await within(await rowOf(first.name)).findAllByText(strings['pp.fact.rules.key'], {}, { timeout: 8000 })).toHaveLength(2);
    const d = await openPerms(first.name);
    expect(within(d).getAllByText(strings['pp.rules.cantRead.key']).length).toBeGreaterThan(0);
    expect(within(d).queryByRole('button', { name: /^See /i })).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['pp.ov.explain'] })).toBeNull();
    await rulesTab(d);
    expect(within(d).getAllByText(strings['pp.rules.cantRead.key']).length).toBeGreaterThan(0);
    expect(projectRulesReads).toEqual([]);
  }, 40000);

  it('the Access rules tab reads the document: who gets in, the groups and what they may open, with no credential on the page', async () => {
    await openList('projectRulesSecret');
    const d = await rulesTab(await openPerms(first.name));
    expect(within(d).getByText(strings['pp.rules.title'].replace('{{name}}', first.name))).toBeInTheDocument();
    expect(await within(d).findByText(/Only members of team, bots can open the programs/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).getByText(accStrings['acc.adv.kind.password'])).toBeInTheDocument();
    expect(within(d).getByText(accStrings['acc.adv.kind.token'])).toBeInTheDocument();
    expect(within(d).getByText(accStrings['acc.adv.default.deny'])).toBeInTheDocument();
    // The project's hook is named as not used, never as running.
    expect(within(d).getByText(strings['pp.rules.hooksIgnored'])).toBeInTheDocument();
    expect(within(d).queryByText(/hook is set up/)).toBeNull();
    // Read only here: nothing to change.
    expect(within(d).queryByRole('radio')).toBeNull();
    expect(within(d).queryByRole('button', { name: /save/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/fixture-project-(password|token)|fixture-salt|hooks\.example/);
  }, 40000);

  it('Overview: a project with rules says so without counts, the Access rules tab holds them; one without says each computer decides', async () => {
    await openList('projectRulesIp');
    const d = await openPerms(first.name);
    expect(await within(d).findByText(/Only members of hub-my-ip can open the programs/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(d).toHaveTextContent(strings['pp.ov.rules.noCounts']);
    expect(within(d).getByRole('button', { name: strings['pp.ov.explain'] })).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.rules'] }));
    expect(await within(d).findByText(strings['pp.rules.title'].replace('{{name}}', first.name), {}, { timeout: 8000 })).toBeInTheDocument();
    cleanup();
    await openList('projectRulesIp');
    const d2 = await openPerms(others[0]!.name);
    expect(await within(d2).findByText(strings['pp.ov.rules.none'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(d2).not.toHaveTextContent(strings['pp.ov.rules.noCounts']);
  }, 60000);

  it('the drawer: a refused read (403) and a failed one say so on the card and the tab, never "no rules"', async () => {
    await openList('projectRulesLevel');
    const d = await openPerms(first.name);
    expect(await within(d).findByText(strings['pp.rules.cantRead.level'], {}, { timeout: 8000 })).toBeInTheDocument();
    await rulesTab(d);
    expect(within(d).getAllByText(strings['pp.rules.cantRead.level']).length).toBeGreaterThan(0);
    expect(within(d).queryByText(strings['pp.rules.none'])).toBeNull();
    cleanup();
    await openList('projectRulesFail');
    const f = await openPerms(first.name);
    expect((await within(f).findAllByText(strings['pp.rules.error'], {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(within(f).queryByText(strings['pp.ov.rules.none'])).toBeNull();
    expect(within(f).queryByRole('button', { name: strings['pp.ov.explain'] })).toBeNull();
  }, 60000);
});
