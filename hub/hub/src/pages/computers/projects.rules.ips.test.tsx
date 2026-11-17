// "Only these IPs" as a project's access rules (Projects, Permissions drawer, Access rules tab): the same typed list as
// a computer's. It opens on the addresses the project's document holds now; Save… reads the rules, the computers and
// the caller's address again and asks first: the mode line names every address, then the ones no longer allowed and
// the caller's own address when the list leaves it out, then the counts and the lines every confirm carries. One PUT
// with the version read; a lost answer is held and never sent again.
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { projectRulesSends, projectRulesSwap, resetAccess } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import accStrings from './parts/AccessDrawer.strings.en.json';

const first = fixtureWorld.projects[0]!;
const SLOW = { timeout: 8000 };
// The first render of a run also loads the page's parts; on a busy host that alone can pass SLOW.
const COLD = { timeout: 30000 };
const HOME = '203.0.113.7';
const OFFICE = '198.51.100.0/24';
const ALL = { '*': true, logs: true };
const fill = (k: keyof typeof strings, v: Record<string, string | number> = {}) => Object.entries(v).reduce<string>((s, [n, x]) => s.split(`{{${n}}}`).join(String(x)), strings[k]);

async function openRules(state: string) {
  await renderPage(page, { path: '/computers/projects', state });
  const row = (await screen.findByText(first.name, { selector: 'strong' }, COLD)).closest('[data-row-id]') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
  const d = await screen.findByRole('dialog', { name: fill('pp.title', { name: first.name }) }, SLOW);
  await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.rules'] }));
  return d;
}
const choices = (d: HTMLElement) => within(d).findByRole('radiogroup', { name: strings['pp.rules.choice'] }, SLOW);
async function pickList(d: HTMLElement) {
  await userEvent.click(within(await choices(d)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.ips']) }));
  return (await within(d).findByLabelText(accStrings['acc.ips.label'], undefined, SLOW)) as HTMLTextAreaElement;
}
const saveButton = (d: HTMLElement) => within(d).getByRole('button', { name: strings['pp.rules.save'] });
const confirm = () => screen.findByRole('alertdialog', { name: fill('pp.rules.confirm.title', { name: first.name }) }, SLOW).catch(() => screen.findByRole('dialog', { name: fill('pp.rules.confirm.title', { name: first.name }) }, SLOW));
const lines = (c: HTMLElement) => [...c.querySelectorAll('p')].map((p) => p.textContent).filter((x) => x);
const go = (c: HTMLElement) => userEvent.click(within(c).getByRole('button', { name: strings['pp.rules.go'] }));

beforeEach(() => {
  resetAccess();
  projectRulesSwap.to = null;
});

describe('Projects: Only these IPs as the project rules', () => {
  it('over Only my IP the stored address is already listed; adding an office asks with every address, then one PUT over the version read', async () => {
    const d = await openRules('rulesChange');
    const field = await pickList(d);
    expect(field.value).toBe(HOME);
    // The stored address alone is no change.
    expect(saveButton(d)).toBeDisabled();
    await userEvent.type(field, `, ${OFFICE}`);
    await userEvent.click(saveButton(d));
    const c = await confirm();
    expect(lines(c)).toEqual([
      fill('pp.rules.confirm.mode.ips', { ips: `${HOME}, ${OFFICE}` }),
      fill('pp.rules.confirm.full', { full: 1, effect: strings['pp.rules.eff.ips.full'] }),
      fill('pp.rules.confirm.own', { own: 1 }),
      fill('pp.rules.confirm.unknown', { unknown: 1 }),
      strings['pp.rules.confirm.others'],
      strings['pp.rules.confirm.delay'],
    ]);
    expect(projectRulesSends).toEqual([]);
    await go(c);
    expect(await within(d).findByText(strings['pp.rules.saved'], undefined, SLOW)).toBeInTheDocument();
    expect(projectRulesSends).toEqual([{
      method: 'PUT', pid: first.id, ifMatch: 'file:v3',
      body: {
        project: first.id, enable_proxy: true,
        groups: { 'hub-ip-203-0-113-7-32': { type: 'ip', range: `${HOME}/32` }, 'hub-ip-198-51-100-0-24': { type: 'ip', range: OFFICE } },
        permissions: { 'hub-ip-203-0-113-7-32': ALL, 'hub-ip-198-51-100-0-24': ALL },
        default: 'deny',
      },
    }]);
    // The rules read after the save are the list: the choice stays, and there is nothing more to save.
    await waitFor(() => expect(saveButton(d)).toBeDisabled(), SLOW);
    expect(within(await choices(d)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.ips']) })).toBeChecked();
  }, 60000);

  it('a list that drops the stored address says which one goes and that the caller\'s own address is left out', async () => {
    const d = await openRules('rulesChange');
    const field = await pickList(d);
    await userEvent.clear(field);
    await userEvent.type(field, OFFICE);
    await userEvent.click(saveButton(d));
    const c = await confirm();
    expect(lines(c).slice(0, 4)).toEqual([
      fill('pp.rules.confirm.mode.ips', { ips: OFFICE }),
      fill('pp.rules.confirm.ips.removed', { ips: HOME }),
      fill('pp.rules.confirm.ips.out', { ip: HOME }),
      fill('pp.rules.confirm.full', { full: 1, effect: strings['pp.rules.eff.ips.full'] }),
    ]);
    expect(projectRulesSends).toEqual([]);
  }, 60000);

  it('over no rules: a typed list, with a refused entry named and Save off until it is fixed', async () => {
    const d = await openRules('rulesChangeOpen');
    const field = await pickList(d);
    expect(field.value).toBe('');
    expect(saveButton(d)).toBeDisabled();
    await userEvent.type(field, '0.0.0.0/0');
    expect(d).toHaveTextContent(accStrings['acc.ips.err.all'].replace('{{entry}}', '0.0.0.0/0'));
    expect(saveButton(d)).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, HOME);
    await userEvent.click(saveButton(d));
    const c = await confirm();
    expect(lines(c)[0]).toBe(fill('pp.rules.confirm.mode.ips', { ips: HOME }));
    await go(c);
    await within(d).findByText(strings['pp.rules.saved'], undefined, SLOW);
    expect(projectRulesSends[0]).toEqual({ method: 'PUT', pid: first.id, ifMatch: 'file:v2', body: { project: first.id, enable_proxy: true, groups: { 'hub-ip-203-0-113-7-32': { type: 'ip', range: `${HOME}/32` } }, permissions: { 'hub-ip-203-0-113-7-32': ALL }, default: 'deny' } });
  }, 60000);

  it('a lost answer is held: the list and the choices lock, Check again only reads, nothing is sent twice', async () => {
    const d = await openRules('rulesChangeLost');
    const field = await pickList(d);
    await userEvent.type(field, `, ${OFFICE}`);
    await userEvent.click(saveButton(d));
    await go(await confirm());
    expect(await within(d).findByText(strings['pp.rules.held'], undefined, SLOW)).toBeInTheDocument();
    expect(saveButton(d)).toBeDisabled();
    expect(within(d).getByLabelText(accStrings['acc.ips.label'])).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: accStrings['acc.held.check'] }));
    await waitFor(() => expect(within(d).getByText(strings['pp.rules.held'])).toBeInTheDocument(), SLOW);
    expect(projectRulesSends).toHaveLength(1);
  }, 60000);

  it('a lost answer that went through is freed by the read-back holding exactly the list: no longer tracked, never sent again', async () => {
    const d = await openRules('rulesChangeLostApplied');
    const field = await pickList(d);
    await userEvent.type(field, `, ${OFFICE}`);
    await userEvent.click(saveButton(d));
    await go(await confirm());
    expect(await within(d).findByText(strings['pp.rules.settled'], undefined, SLOW)).toBeInTheDocument();
    expect(projectRulesSends).toHaveLength(1);
  }, 60000);
});
