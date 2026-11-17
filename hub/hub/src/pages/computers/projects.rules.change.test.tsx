// Changing a project's own access rules:
// No project rules, Only my IP or Private, for the owner and a Full control member, over a document that is one
// of the three. Every save reads again and asks first: the mode line always, the owner's counts of the computers shown,
// a member's "can't list". It sends the version it read as If-Match, once: 412 changed nothing; a lost answer is held
// and only a fresh read of the rules frees it (Check again never sends again).
import { fixtureWorld, queryClient as coreQueryClient } from '@core';
import { holdOfLock, pendingOf, settleChange } from '@core/changes';
// eslint-disable-next-line no-restricted-imports -- a test harness: another tab's sender on the same core, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { type ProjectRulesWrite, useSetProjectRules } from './data';
import { myIpServer, projectListQueries, projectListReads, projectListServer, projectPutNext, projectRulesElsewhere, projectRulesFails, projectRulesSends, projectRulesSwap, resetAccess } from './fixtures';
import page from './page';
import { rulesFrom } from './parts/access.logic';
import { projectWriteVerdict } from './parts/projectPerms.logic';
import strings from './strings.en.json';
import accStrings from './parts/AccessDrawer.strings.en.json';

const first = fixtureWorld.projects[0]!;
const SLOW = { timeout: 8000 };
// The first render of a run also loads the page's parts; on a busy host that alone can pass SLOW.
const COLD = { timeout: 30000 };
const fill = (k: keyof typeof strings, v: Record<string, string | number> = {}) => Object.entries(v).reduce<string>((s, [n, x]) => s.split(`{{${n}}}`).join(String(x)), strings[k]);

async function openRules(state: string) {
  await renderPage(page, { path: '/computers/projects', state });
  return openDrawer();
}
async function openDrawer() {
  const row = (await screen.findByText(first.name, { selector: 'strong' }, COLD)).closest('[data-row-id]') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
  const d = await screen.findByRole('dialog', { name: fill('pp.title', { name: first.name }) }, SLOW);
  await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.rules'] }));
  return d;
}
const choices = (d: HTMLElement) => within(d).findByRole('radiogroup', { name: strings['pp.rules.choice'] }, SLOW);
async function pickAndSave(d: HTMLElement, label: keyof typeof strings) {
  await userEvent.click(within(await choices(d)).getByRole('radio', { name: new RegExp(strings[label]) }));
  if (label === 'pp.rules.c.myIp') await within(d).findByText(/Singapore/, undefined, SLOW);
  await userEvent.click(within(d).getByRole('button', { name: strings['pp.rules.save'] }));
}
const confirm = () => screen.findByRole('alertdialog', { name: fill('pp.rules.confirm.title', { name: first.name }) }, SLOW).catch(() => screen.findByRole('dialog', { name: fill('pp.rules.confirm.title', { name: first.name }) }, SLOW));
const confirmShown = () => screen.queryByRole('alertdialog', { name: fill('pp.rules.confirm.title', { name: first.name }) }) ?? screen.queryByRole('dialog', { name: fill('pp.rules.confirm.title', { name: first.name }) });
const lines = (c: HTMLElement) => [...c.querySelectorAll('p')].map((p) => p.textContent).filter((x) => x);
const go = (c: HTMLElement) => userEvent.click(within(c).getByRole('button', { name: strings['pp.rules.go'] }));
const stopAsk = () => screen.queryByRole('alertdialog', { name: accStrings['acc.held.dismissTitle'] });
// What another tab's warned Stop tracking does to the shared registry: the held write goes, nothing is read.
const dismissElsewhere = async () => {
  for (const c of pendingOf('lock:project.rules')) {
    const hold = holdOfLock(c.scope, c.digest);
    await act(async () => { await settleChange({ scope: c.scope, digest: c.digest, hold: hold!, kind: 'release', warned: true, by: c.by, nobodys: true }); });
  }
};
// Another tab of the same page: its own sender on the same core (a write it sends whose answer is lost is a hold every
// mounted tab shows), mounted in a root of its own.
let otherSend: ((v: ProjectRulesWrite) => Promise<unknown>) | null = null;
function OtherTab() {
  otherSend = useSetProjectRules().mutateAsync;
  return null;
}
const ipDoc = (ip: string) => ({ groups: { 'hub-my-ip': { type: 'ip', range: `${ip}/32` } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny', enable_proxy: true });
async function sendFromOtherTab(v: ProjectRulesWrite) {
  render(createElement(QueryClientProvider, { client: coreQueryClient }, createElement(OtherTab)));
  await act(async () => { await otherSend!(v); });
}
const LIST_QUERY = { page: '1', limit: '100', include_expired: 'true', include_deleting: 'true' };

beforeEach(() => {
  resetAccess();
  projectRulesSwap.to = null;
});

describe('Projects: changing the project rules', () => {
  it('owner, Private: the confirm opens with the mode line, then the counts of the computers shown, then others and delay; the PUT names the version read', async () => {
    const d = await openRules('rulesChange');
    expect(within(await choices(d)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.myIp']) })).toBeChecked();
    await pickAndSave(d, 'pp.rules.c.private');
    const c = await confirm();
    expect(lines(c)).toEqual([
      strings['pp.rules.confirm.mode.private'],
      fill('pp.rules.confirm.full', { full: 1, effect: strings['pp.rules.eff.private.full'] }),
      fill('pp.rules.confirm.own', { own: 1 }),
      fill('pp.rules.confirm.unknown', { unknown: 1 }),
      strings['pp.rules.confirm.others'],
      strings['pp.rules.confirm.delay'],
    ]);
    expect(projectRulesSends).toEqual([]);
    expect(projectListQueries).toEqual([LIST_QUERY]);
    await go(c);
    expect(await within(d).findByText(strings['pp.rules.saved'], undefined, SLOW)).toBeInTheDocument();
    expect(projectRulesSends).toEqual([{ method: 'PUT', pid: first.id, ifMatch: 'file:v3', body: { project: first.id, enable_proxy: true, groups: {}, permissions: {}, default: 'deny' } }]);
  }, 60000);

  it('owner, No project rules: a DELETE with the version read and no document; the rules then read open', async () => {
    const d = await openRules('rulesChange');
    await pickAndSave(d, 'pp.rules.c.none');
    const c = await confirm();
    expect(lines(c)[0]).toBe(strings['pp.rules.confirm.mode.none']);
    expect(lines(c)[1]).toBe(fill('pp.rules.confirm.full', { full: 1, effect: strings['pp.rules.eff.none.full'] }));
    await go(c);
    expect(await within(d).findByText(strings['pp.rules.saved'], undefined, SLOW)).toBeInTheDocument();
    expect(projectRulesSends.map((x) => [x.method, x.ifMatch, x.body ?? null])).toEqual([['DELETE', 'file:v3', null]]);
    // "Saved" comes from the answer; the rules read after it then shows the open document.
    expect(await within(d).findByText(strings['pp.rules.none'], undefined, SLOW)).toBeInTheDocument();
  }, 60000);

  it('owner, Only my IP over no rules: the address read now, in the mode line and the effect; the body is the Hub\'s own document', async () => {
    const d = await openRules('rulesChangeOpen');
    expect(within(await choices(d)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.none']) })).toBeChecked();
    await pickAndSave(d, 'pp.rules.c.myIp');
    const c = await confirm();
    expect(lines(c)[0]).toBe(fill('pp.rules.confirm.mode.myIp', { ip: '203.0.113.7' }));
    expect(lines(c)[1]).toBe(fill('pp.rules.confirm.full', { full: 1, effect: fill('pp.rules.eff.myIp.full', { ip: '203.0.113.7' }) }));
    await go(c);
    await within(d).findByText(strings['pp.rules.saved'], undefined, SLOW);
    expect(projectRulesSends[0]).toEqual({ method: 'PUT', pid: first.id, ifMatch: 'file:v2', body: { project: first.id, enable_proxy: true, groups: { 'hub-my-ip': { type: 'ip', range: '203.0.113.7/32' } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny' } });
  }, 60000);

  it('owner over Only my IP from another address: choosing it again is a change to the address in use now', async () => {
    const d = await openRules('rulesChangePrivate');
    expect(within(await choices(d)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.myIp']) })).toBeChecked();
    await within(d).findByText(/Singapore/, undefined, SLOW);
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.rules.save'] }));
    const c = await confirm();
    expect(lines(c)[0]).toBe(fill('pp.rules.confirm.mode.myIp', { ip: '198.51.100.4' }));
    // The address stored before goes: the confirm names it.
    expect(lines(c)[1]).toBe(fill('pp.rules.confirm.ips.removed', { ips: '203.0.113.7' }));
    expect(lines(c)[2]).toBe(fill('pp.rules.confirm.full', { full: 3, effect: fill('pp.rules.eff.myIp.full', { ip: '198.51.100.4' }) }));
  }, 60000);

  it('without the per-computer rule states every computer shown is "couldn\'t tell", never "follows only the project"', async () => {
    const d = await openRules('rulesChangeNoState');
    await pickAndSave(d, 'pp.rules.c.private');
    const c = await confirm();
    expect(lines(c)).toEqual([strings['pp.rules.confirm.mode.private'], fill('pp.rules.confirm.unknown', { unknown: 3 }), strings['pp.rules.confirm.others'], strings['pp.rules.confirm.delay']]);
  }, 60000);

  it("a Full control member: the mode line and that the Hub can't list the computers, no counts, no list read", async () => {
    for (const [label, mode] of [['pp.rules.c.private', 'pp.rules.confirm.mode.private'], ['pp.rules.c.none', 'pp.rules.confirm.mode.none']] as const) {
      resetAccess();
      const d = await openRules('rulesChangeFull');
      await pickAndSave(d, label);
      const c = await confirm();
      expect(lines(c)).toEqual([strings[mode], strings['pp.rules.confirm.noList'], strings['pp.rules.confirm.others'], strings['pp.rules.confirm.delay']]);
      expect(projectListReads).toEqual([]);
      await userEvent.click(within(c).getByRole('button', { name: /cancel/i }));
      cleanup();
    }
  }, 90000);

  it("a Full control member, Only my IP: the address's mode line, can't list, no list read; the PUT over the version read", async () => {
    myIpServer.ip = '198.51.100.4';
    const d = await openRules('rulesChangeFull');
    await pickAndSave(d, 'pp.rules.c.none');
    await userEvent.click(within(await confirm()).getByRole('button', { name: /cancel/i }));
    await pickAndSave(d, 'pp.rules.c.myIp');
    const c = await confirm();
    expect(lines(c)).toEqual([fill('pp.rules.confirm.mode.myIp', { ip: '198.51.100.4' }), fill('pp.rules.confirm.ips.removed', { ips: '203.0.113.7' }), strings['pp.rules.confirm.noList'], strings['pp.rules.confirm.others'], strings['pp.rules.confirm.delay']]);
    expect(projectListReads).toEqual([]);
    await go(c);
    await within(d).findByText(strings['pp.rules.saved'], undefined, SLOW);
    expect(projectRulesSends).toEqual([{ method: 'PUT', pid: first.id, ifMatch: 'file:v3', body: { project: first.id, enable_proxy: true, groups: { 'hub-my-ip': { type: 'ip', range: '198.51.100.4/32' } }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny' } }]);
  }, 60000);

  it('a member at Work on, and a document set elsewhere: no choice is offered', async () => {
    const d = await openRules('rulesChangeWorkOn');
    await within(d).findByText(strings['pp.rules.facts'], undefined, SLOW).catch(() => undefined);
    expect(within(d).queryByRole('radiogroup', { name: strings['pp.rules.choice'] })).toBeNull();
    cleanup();
    const e = await openRules('rulesChangeSecret');
    await within(e).findByText(strings['pp.rules.hooksIgnored'], undefined, SLOW);
    expect(within(e).queryByRole('radiogroup', { name: strings['pp.rules.choice'] })).toBeNull();
    expect(within(e).queryByRole('button', { name: strings['pp.rules.save'] })).toBeNull();
  }, 60000);

  it('IPv6: Only my IP says why and cannot be saved', async () => {
    const d = await openRules('rulesChangeV6');
    await userEvent.click(within(await choices(d)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.myIp']) }));
    expect(await within(d).findByText(accStrings['acc.ipv6'].replace('{{ip}}', '2001:db8::7'), undefined, SLOW)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: strings['pp.rules.save'] })).toBeDisabled();
  }, 60000);

  it('a failed list read asks nothing; rules changed since shown are shown again and need a second press', async () => {
    const d = await openRules('rulesChangeListFails');
    await pickAndSave(d, 'pp.rules.c.private');
    expect(await within(d).findByText(strings['pp.rules.listFailed'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(projectRulesSends).toEqual([]);
    cleanup();
    resetAccess();
    const e = await openRules('rulesChange');
    await userEvent.click(within(await choices(e)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.private']) }));
    // Another tab stored a plain open document meanwhile (version 2): the press reads it and asks nothing.
    projectRulesSwap.to = 'rulesOpenStored';
    await userEvent.click(within(e).getByRole('button', { name: strings['pp.rules.save'] }));
    expect(await within(e).findByText(strings['pp.rules.changed'], undefined, SLOW)).toBeInTheDocument();
    expect(within(e).getByText(strings['pp.rules.none'])).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    // The second press asks, over the version read now.
    await userEvent.click(within(e).getByRole('button', { name: strings['pp.rules.save'] }));
    await go(await confirm());
    await waitFor(() => expect(projectRulesSends.map((x) => x.ifMatch)).toEqual(['file:v2']), SLOW);
  }, 90000);

  it('412: nothing changed here, said so, and Read them again reads the rules', async () => {
    const d = await openRules('rulesChangeStale');
    await pickAndSave(d, 'pp.rules.c.private');
    await go(await confirm());
    expect(await within(d).findByText(strings['pp.rules.stale'], undefined, SLOW)).toBeInTheDocument();
    expect(within(d).queryByText(strings['pp.rules.saved'])).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: accStrings['acc.stale.reload'] }));
    await waitFor(() => expect(within(d).queryByText(strings['pp.rules.stale'])).toBeNull(), SLOW);
  }, 60000);

  it('a lost answer is held: no second send, the choices locked; Check again reads only; it stays held while the version has not moved', async () => {
    const d = await openRules('rulesChangeLost');
    await pickAndSave(d, 'pp.rules.c.private');
    await go(await confirm());
    expect(await within(d).findByText(strings['pp.rules.held'], undefined, SLOW)).toBeInTheDocument();
    expect(within(await choices(d)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.none']) })).toBeDisabled();
    expect(within(d).getByRole('button', { name: strings['pp.rules.save'] })).toBeDisabled();
    await userEvent.click(within(d).getByRole('button', { name: accStrings['acc.held.check'] }));
    await waitFor(() => expect(within(d).getByText(strings['pp.rules.held'])).toBeInTheDocument(), SLOW);
    expect(projectRulesSends).toHaveLength(1);
    // Stop tracking asks first, then frees it.
    await userEvent.click(within(d).getByRole('button', { name: accStrings['acc.held.dismiss'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: accStrings['acc.held.dismissTitle'] }, SLOW)).getByRole('button', { name: accStrings['acc.held.dismissGo'] }));
    await waitFor(() => expect(within(d).queryByText(strings['pp.rules.held'])).toBeNull(), SLOW);
    expect(projectRulesSends).toHaveLength(1);
    // Freed by this tab's own Stop tracking: the person knows; no "no longer tracked" line.
    expect(within(d).queryByText(strings['pp.rules.settled'])).toBeNull();
  }, 60000);

  it('a lost answer that went through is freed by the read-back: no longer tracked, never "saved"; one still on its way stays held until it lands', async () => {
    const d = await openRules('rulesChangeLostApplied');
    await pickAndSave(d, 'pp.rules.c.private');
    await go(await confirm());
    expect(await within(d).findByText(strings['pp.rules.settled'], undefined, SLOW)).toBeInTheDocument();
    expect(within(d).queryByText(strings['pp.rules.saved'])).toBeNull();
    expect(within(d).queryByText(strings['pp.rules.held'])).toBeNull();
    expect(projectRulesSends).toHaveLength(1);
    cleanup();
    resetAccess();
    const e = await openRules('rulesChangeLostLate');
    await pickAndSave(e, 'pp.rules.c.private');
    await go(await confirm());
    expect(await within(e).findByText(strings['pp.rules.held'], undefined, SLOW)).toBeInTheDocument();
    for (let i = 0; i < 4 && within(e).queryByText(strings['pp.rules.held']); i++) {
      const b = within(e).queryByRole('button', { name: accStrings['acc.held.check'] });
      if (b) await userEvent.click(b).catch(() => undefined);
    }
    expect(await within(e).findByText(strings['pp.rules.settled'], undefined, SLOW)).toBeInTheDocument();
    expect(projectRulesSends).toHaveLength(1);
  }, 90000);

  it('a lost answer overtaken by another write: only that it is no longer tracked, never "saved"', async () => {
    const d = await openRules('rulesChangeLostOther');
    await pickAndSave(d, 'pp.rules.c.none');
    await go(await confirm());
    expect(await within(d).findByText(strings['pp.rules.settled'], undefined, SLOW)).toBeInTheDocument();
    expect(within(d).queryByText(strings['pp.rules.saved'])).toBeNull();
  }, 60000);

  // A hold dismissed in another tab.
  it('a hold dismissed in another tab over an unchanged version claims no outcome: only that it is no longer tracked', async () => {
    const d = await openRules('rulesChangeLost');
    await pickAndSave(d, 'pp.rules.c.private');
    await go(await confirm());
    await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
    await userEvent.click(within(d).getByRole('button', { name: accStrings['acc.held.check'] }));
    await waitFor(() => expect(within(d).getByText(strings['pp.rules.held'])).toBeInTheDocument(), SLOW);
    await dismissElsewhere();
    await waitFor(() => expect(within(d).queryByText(strings['pp.rules.held'])).toBeNull(), SLOW);
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(within(d).queryByText(strings['pp.rules.saved'])).toBeNull();
    expect(within(d).getByText(strings['pp.rules.settled'])).toBeInTheDocument();
    expect(projectRulesSends).toHaveLength(1);
  }, 60000);

  it('the tracking stays through a failed read and a document set elsewhere; once core frees it, the tab says so', async () => {
    const d = await openRules('rulesChangeLost');
    await pickAndSave(d, 'pp.rules.c.private');
    await go(await confirm());
    await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
    projectRulesFails.on = true;
    await userEvent.click(within(d).getByRole('button', { name: accStrings['acc.held.check'] }));
    await within(d).findByText(strings['pp.rules.error'], undefined, SLOW);
    expect(within(d).getByText(strings['pp.rules.held'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: accStrings['acc.held.check'] })).toBeEnabled();
    expect(within(d).queryByRole('radiogroup', { name: strings['pp.rules.choice'] })).toBeNull();
    projectRulesFails.on = false;
    projectRulesElsewhere.to = 'rulesSecret';
    await userEvent.click(within(d).getByRole('button', { name: accStrings['acc.held.check'] }));
    expect(await within(d).findByText(strings['pp.rules.settled'], undefined, SLOW)).toBeInTheDocument();
    expect(within(d).queryByText(strings['pp.rules.held'])).toBeNull();
    expect(within(d).queryByRole('radiogroup', { name: strings['pp.rules.choice'] })).toBeNull();
    expect(projectRulesSends).toHaveLength(1);
  }, 60000);

  it("each press reads the list with its own request, after a closed drawer's one; the counts are the later read's", async () => {
    projectListServer.hold = true;
    const d = await openRules('rulesChange');
    await pickAndSave(d, 'pp.rules.c.private');
    await waitFor(() => expect(projectListReads).toHaveLength(1), SLOW);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: fill('pp.title', { name: first.name }) })).toBeNull(), SLOW);
    // Every computer now keeps rules of its own.
    projectListServer.own = ['applied', 'applied', 'applied'];
    const e = await openDrawer();
    await pickAndSave(e, 'pp.rules.c.private');
    for (let i = 0; i < 20 && !screen.queryByRole('alertdialog'); i++) {
      for (const release of projectListServer.parked.splice(0)) release();
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    }
    const c = await confirm();
    expect(lines(c)).toEqual([strings['pp.rules.confirm.mode.private'], fill('pp.rules.confirm.own', { own: 3 }), strings['pp.rules.confirm.others'], strings['pp.rules.confirm.delay']]);
    expect(projectListReads).toHaveLength(2);
    expect(projectListQueries).toEqual([LIST_QUERY, LIST_QUERY]);
  }, 60000);

  it('Only my IP reads the address again at the press: a failed read asks nothing and says so; a moved address is shown first', async () => {
    const d = await openRules('rulesChangeOpen');
    await pickAndSave(d, 'pp.rules.c.myIp');
    await userEvent.click(within(await confirm()).getByRole('button', { name: /cancel/i }));
    // The cached address stays, the refresh fails.
    myIpServer.fail = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.rules.save'] }));
    expect(await within(d).findByText(accStrings['acc.ipError'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(d).getByRole('button', { name: strings['pp.rules.save'] })).toBeDisabled();
    // The address read works again, from another address: shown first, asked on the next press.
    myIpServer.fail = false;
    myIpServer.ip = '198.51.100.9';
    await userEvent.click(within(d).getByRole('button', { name: /try again|retry/i }));
    await waitFor(() => expect(within(d).getByRole('button', { name: strings['pp.rules.save'] })).toBeEnabled(), SLOW);
    myIpServer.ip = '198.51.100.10';
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.rules.save'] }));
    expect(await within(d).findByText(strings['pp.rules.ipChanged'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.rules.save'] }));
    const c = await confirm();
    expect(lines(c)[0]).toBe(fill('pp.rules.confirm.mode.myIp', { ip: '198.51.100.10' }));
    await go(c);
    await within(d).findByText(strings['pp.rules.saved'], undefined, SLOW);
    expect((projectRulesSends[0]?.body as { groups: unknown }).groups).toEqual({ 'hub-my-ip': { type: 'ip', range: '198.51.100.10/32' } });
    expect(projectRulesSends).toHaveLength(1);
  }, 60000);

  it('Stop tracking asks about the hold it was pressed for: another hold meanwhile closes the ask and is never freed by it', async () => {
    const d = await openRules('rulesChangeLost');
    await pickAndSave(d, 'pp.rules.c.private');
    await go(await confirm());
    await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
    await userEvent.click(within(d).getByRole('button', { name: accStrings['acc.held.dismiss'] }));
    await screen.findByRole('alertdialog', { name: accStrings['acc.held.dismissTitle'] }, SLOW);
    await dismissElsewhere();
    await waitFor(() => expect(stopAsk()).toBeNull(), SLOW);
    // A new send is lost too: a new hold, which no earlier ask concerns.
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.rules.save'] }));
    await go(await confirm());
    await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(stopAsk()).toBeNull();
    expect(pendingOf('lock:project.rules')).toHaveLength(1);
    expect(projectRulesSends).toHaveLength(2);
  }, 60000);

  // A held write shows only core's hold and its end; local answers belong to their own attempt.
  for (const [doc, verdict] of [['A', 'not_applied'], ['B', 'applied']] as const) {
    it(`another tab's replacement Only my IP hold (same version, other address), a newer read allowing ${doc}: nothing contradicts core (${verdict})`, async () => {
      const A = '198.51.100.4';
      const Bip = '198.51.100.9';
      myIpServer.ip = A;
      const d = await openRules('rulesChangeLost');
      await pickAndSave(d, 'pp.rules.c.myIp');
      await go(await confirm());
      await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
      await dismissElsewhere();
      await waitFor(() => expect(within(d).queryByText(strings['pp.rules.held'])).toBeNull(), SLOW);
      // The other tab sends its own address over the same version 3; its answer is lost too.
      await sendFromOtherTab({ pid: first.id, want: { kind: 'myIp', ip: Bip }, from: 3, body: { project: first.id, ...ipDoc(Bip) } });
      await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
      projectRulesElsewhere.doc = ipDoc(doc === 'A' ? A : Bip);
      await userEvent.click(within(d).getByRole('button', { name: accStrings['acc.held.check'] }));
      await waitFor(() => expect(within(d).queryByText(strings['pp.rules.held'])).toBeNull(), SLOW);
      await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
      // projectWriteVerdict for B over the document read now (version 4) is this case's verdict; the tab never contradicts
      // it: not_applied never reads "saved", applied never reads "changed somewhere else".
      expect(projectWriteVerdict({ project: first.id, from: 3, want: 'myIp', ip: Bip }, [[{ [first.id]: rulesFrom({ data: { project: first.id, ...ipDoc(doc === 'A' ? A : Bip), file_version: 4 } }) }]])).toBe(verdict);
      const text = d.textContent ?? '';
      if (verdict === 'not_applied') expect(text).not.toContain('Saved.');
      else expect(text).not.toMatch(/changed somewhere else|read differently/);
      expect(within(d).getByText(strings['pp.rules.settled'])).toBeInTheDocument();
    }, 60000);
  }

  // A confirm left open when a held write is adopted closes; no attempt starts while a hold shows.
  for (const replaced of [false, true]) {
    it(`a confirm open when another tab's held write arrives${replaced ? ' (then replaced by a third)' : ''} closes and sends nothing; the hold's end shows only the neutral line`, async () => {
      projectPutNext.push('lost', 'lost');
      const d = await openRules('rulesChange');
      await pickAndSave(d, 'pp.rules.c.private');
      const c = await confirm();
      const priv = { pid: first.id, want: { kind: 'private' as const }, from: 3, body: { project: first.id, enable_proxy: true, groups: {}, permissions: {}, default: 'deny' } };
      await sendFromOtherTab(priv);
      await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
      if (replaced) {
        // Another tab frees the first hold and sends the same write again over the same version: a new token, no render between.
        await act(async () => {
          for (const h of pendingOf('lock:project.rules')) await settleChange({ scope: h.scope, digest: h.digest, hold: holdOfLock(h.scope, h.digest)!, kind: 'release', warned: true, by: h.by, nobodys: true });
          await otherSend!(priv);
        });
        await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
      }
      // The exact sequence: whatever confirm is still there is pressed.
      const still = confirmShown();
      if (still) await go(still);
      expect(c).not.toBeInTheDocument();
      expect(within(d).getByRole('button', { name: strings['pp.rules.save'] })).toBeDisabled();
      expect(projectRulesSends).toHaveLength(replaced ? 2 : 1);
      await dismissElsewhere();
      await waitFor(() => expect(within(d).queryByText(strings['pp.rules.held'])).toBeNull(), SLOW);
      await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
      for (const k of ['pp.rules.notSaved', 'pp.rules.stale', 'pp.rules.saved'] as const) expect(within(d).queryByText(strings[k])).toBeNull();
      expect(within(d).getByText(strings['pp.rules.settled'])).toBeInTheDocument();
      // The confirm it closed does not come back once the hold is gone.
      expect(confirmShown()).toBeNull();
      expect(projectRulesSends).toHaveLength(replaced ? 2 : 1);
    }, 60000);
  }

  it("a press still reading when another tab's held write arrives asks nothing, then or after; Save works again once the hold ends", async () => {
    projectPutNext.push('lost');
    projectListServer.hold = true;
    const d = await openRules('rulesChange');
    await pickAndSave(d, 'pp.rules.c.private');
    await waitFor(() => expect(projectListReads).toHaveLength(1), SLOW);
    await sendFromOtherTab({ pid: first.id, want: { kind: 'private' }, from: 3, body: { project: first.id, enable_proxy: true, groups: {}, permissions: {}, default: 'deny' } });
    await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
    // The press's reads answer only now, under the hold: they prepare nothing.
    projectListServer.hold = false;
    for (const release of projectListServer.parked.splice(0)) release();
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(confirmShown()).toBeNull();
    await dismissElsewhere();
    await waitFor(() => expect(within(d).queryByText(strings['pp.rules.held'])).toBeNull(), SLOW);
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(confirmShown()).toBeNull();
    expect(within(d).getByText(strings['pp.rules.settled'])).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: strings['pp.rules.save'] })).toBeEnabled();
    expect(projectRulesSends).toHaveLength(1);
  }, 60000);

  it("an earlier refusal here, then another tab's held write proved: only the hold's end shows, never the old refusal", async () => {
    projectPutNext.push('refused', 'lostApplied');
    const d = await openRules('rulesChange');
    await pickAndSave(d, 'pp.rules.c.private');
    await go(await confirm());
    expect(await within(d).findByText(strings['pp.rules.notSaved'], undefined, SLOW)).toBeInTheDocument();
    await sendFromOtherTab({ pid: first.id, want: { kind: 'private' }, from: 3, body: { project: first.id, enable_proxy: true, groups: {}, permissions: {}, default: 'deny' } });
    await within(d).findByText(strings['pp.rules.held'], undefined, SLOW);
    expect(within(d).queryByText(strings['pp.rules.notSaved'])).toBeNull();
    // The other tab's own read-back may prove it first; otherwise this tab's Check again does.
    const check = within(d).queryByRole('button', { name: accStrings['acc.held.check'] });
    if (check) await userEvent.click(check);
    await waitFor(() => expect(within(d).queryByText(strings['pp.rules.held'])).toBeNull(), SLOW);
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(within(d).queryByText(strings['pp.rules.notSaved'])).toBeNull();
    expect(within(d).getByText(strings['pp.rules.settled'])).toBeInTheDocument();
    expect(projectRulesSends).toHaveLength(2);
  }, 60000);
});
