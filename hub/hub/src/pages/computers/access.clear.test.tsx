// "Where these rules come from" and "Use only the project's rules" in the computer's access drawer.
// Offered only over a project document with rules and a computer keeping rules of its
// own (the state reads default or applied), both read in this opening, on a session holding the rules leaf. A press reads the rules,
// the state and the project's document again: a failed read or a changed project document shows no confirm. The
// DELETE sends the version read as If-Match, once; 412 says changed elsewhere; a lost answer is held and only a
// state read as missing proves it (never a terminal "moved").
import { fixtureWorld, heldChanges, queryClient as coreQueryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness: another tab's sender on the same core, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { useClearAccess } from './data';
import { accessOwnFails, accessOwnHold, accessOwnSlow, clearSends, computers, projectRulesReads, projectRulesSwap, resetAccess } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import { links } from './links';
import { permissionsTesting } from './permissions.testing';
import strings from './parts/AccessDrawer.strings.en.json';
import pageStrings from './strings.en.json';

const { leaveAndReturn } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const ATLAS = computers[0]!;
const HOME = fixtureWorld.projects[0]!;
if (ATLAS.project_id !== HOME.id) throw new Error('fixture: the first computer is in the first project');
const SLOW = { timeout: 8000 };
// The file's first render pays the page's cold start (over 8 s under load, past SLOW), so the first page wait and
// the first two tests' own budgets leave room for it.
const COLD = { timeout: 30000 };

async function openDrawer(state: string) {
  await renderPage(page, { path: links.permissions(handleOf(ATLAS)), state });
  const d = await screen.findByRole('tabpanel', undefined, COLD);
  await within(d).findByText(strings['acc.now.advanced'], undefined, SLOW);
  return d;
}
const offerButton = (d: HTMLElement) => within(d).findByRole('button', { name: strings['acc.proj.use.go'] }, SLOW);
const fill = (k: keyof typeof strings, vars: Record<string, string> = {}) => Object.entries(vars).reduce((s, [n, v]) => s.replace(`{{${n}}}`, v), strings[k]);

async function pressAndConfirm(d: HTMLElement) {
  await userEvent.click(await offerButton(d));
  const c = await screen.findByRole('alertdialog', { name: strings['acc.proj.use.confirm.title'] }, SLOW);
  await userEvent.click(within(c).getByRole('button', { name: strings['acc.proj.use.confirm.go'] }));
}
/** Another tab's sender of the same clear, on the same core: it frees and sends without this
 *  drawer's own send counter moving. */
let otherClear: ReturnType<typeof useClearAccess> | null = null;
function OtherTab() {
  otherClear = useClearAccess();
  return null;
}
const checkAgain = async (d: HTMLElement) => {
  const b = within(d).queryAllByRole('button', { name: strings['acc.held.check'] })[0];
  if (b) await userEvent.click(b).catch(() => undefined);
};

beforeEach(() => {
  resetAccess();
  projectRulesReads.length = 0;
});

describe("computers: a computer's rules and its project's", () => {
  it("says where the rules come from, names the project, and Open the project's permissions opens its rules tab", async () => {
    const d = await openDrawer('useRulesApplied');
    expect(await within(d).findByRole('heading', { name: strings['acc.proj.title'] }, SLOW)).toBeInTheDocument();
    expect(within(d).getByText(new RegExp(fill('acc.proj.body', { project: HOME.name }).replace('.', '\\.')))).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.proj.open'] }));
    const perms = await screen.findByRole('dialog', { name: pageStrings['pp.title'].replace('{{name}}', HOME.name) }, SLOW);
    expect(within(perms).getByRole('tab', { name: pageStrings['pp.tab.rules'] })).toHaveAttribute('aria-selected', 'true');
  }, 60000);

  it("says whether the computer keeps rules of its own: present, missing (the project decides alone) or unread", async () => {
    let d = await openDrawer('useRulesApplied');
    expect(await within(d).findByText(new RegExp(strings['acc.proj.own.present'].slice(0, 40)), undefined, SLOW)).toBeInTheDocument();
    for (const [state, key] of [['useRulesMissing', 'acc.proj.own.missing'], ['useRulesNoState', 'acc.proj.own.unknown']] as const) {
      cleanup();
      d = await openDrawer(state);
      expect(await within(d).findByText(new RegExp(strings[key].slice(0, 40)), undefined, SLOW)).toBeInTheDocument();
      expect(within(d).queryByText(new RegExp(strings['acc.proj.own.present'].slice(0, 40)))).toBeNull();
    }
  }, 60000);

  it('closed and opened again at once: the project document and the state are read again, and the offer comes back', async () => {
    let d = await openDrawer('useRulesApplied');
    await offerButton(d);
    const reads = projectRulesReads.length;
    d = await leaveAndReturn(pageStrings);
    expect(await offerButton(d)).toBeInTheDocument();
    expect(projectRulesReads.length).toBeGreaterThan(reads);
  }, 30000);

  it('answered done but the state read fails: unproved, and its Check again only reads (then done)', async () => {
    const d = await openDrawer('useRulesDoneThenFail');
    await pressAndConfirm(d);
    expect(await within(d).findByText(strings['acc.proj.use.unproved'], undefined, SLOW)).toBeInTheDocument();
    accessOwnFails.on = false;
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.check'] }));
    expect(await within(d).findByText(fill('acc.proj.use.done', { name: ATLAS.name, project: HOME.name }), undefined, SLOW)).toBeInTheDocument();
    expect(clearSends).toHaveLength(1);
  }, 30000);

  it('a press reads again, the confirm names the computer, the project and what its rules say, and one DELETE goes with the version read', async () => {
    const d = await openDrawer('useRulesApplied');
    await userEvent.click(await offerButton(d));
    const c = await screen.findByRole('alertdialog', { name: strings['acc.proj.use.confirm.title'] }, SLOW);
    expect(c.textContent).toContain(`${ATLAS.name} will follow only the rules of ${HOME.name}`);
    expect(c.textContent).toContain('hub-my-ip');
    expect(clearSends).toHaveLength(0);
    await userEvent.click(within(c).getByRole('button', { name: strings['acc.proj.use.confirm.go'] }));
    expect(await within(d).findByText(fill('acc.proj.use.done', { name: ATLAS.name, project: HOME.name }), undefined, SLOW)).toBeInTheDocument();
    expect(clearSends).toEqual([{ id: ATLAS.id, ifMatch: 'file:v4' }]);
    // Nothing of its own is left: no second offer.
    await waitFor(() => expect(within(d).queryByRole('button', { name: strings['acc.proj.use.go'] })).toBeNull(), SLOW);
    expect(await within(d).findByText(new RegExp(strings['acc.proj.own.missing'].slice(0, 40)), undefined, SLOW)).toBeInTheDocument();
  }, 30000);

  it('a default document of its own is offered too; a missing, invalid or unread state, or a project without rules, is not', async () => {
    let d = await openDrawer('useRulesDefault');
    expect(await offerButton(d)).toBeInTheDocument();
    for (const state of ['useRulesMissing', 'useRulesInvalid', 'useRulesNoState']) {
      cleanup();
      d = await openDrawer(state);
      expect(await within(d).findByRole('heading', { name: strings['acc.proj.title'] }, SLOW)).toBeInTheDocument();
      expect(within(d).queryByText(strings['acc.proj.use.title'])).toBeNull();
      expect(within(d).queryByRole('button', { name: strings['acc.proj.use.go'] })).toBeNull();
    }
    cleanup();
    d = await openDrawer('useRulesProjectOpen');
    await waitFor(() => expect(projectRulesReads.length).toBeGreaterThan(0), SLOW);
    expect(within(d).queryByText(strings['acc.proj.title'])).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['acc.proj.use.go'] })).toBeNull();
  }, 60000);

  it("the project's rules changed while open: the new ones show, no confirm, and a second press asks", async () => {
    const d = await openDrawer('useRulesApplied');
    await offerButton(d);
    projectRulesSwap.to = 'rulesSecret';
    await userEvent.click(await offerButton(d));
    expect(await within(d).findByText(strings['acc.proj.parentChanged'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(clearSends).toHaveLength(0);
    await userEvent.click(await offerButton(d));
    const c = await screen.findByRole('alertdialog', { name: strings['acc.proj.use.confirm.title'] }, SLOW);
    expect(c.textContent).not.toContain('hub-my-ip');
    expect(c.textContent).toContain('team');
  }, 30000);

  it("the project's rules changed while the question was open: Yes sends nothing and the new rules show", async () => {
    const d = await openDrawer('useRulesApplied');
    await userEvent.click(await offerButton(d));
    const c = await screen.findByRole('alertdialog', { name: strings['acc.proj.use.confirm.title'] }, SLOW);
    expect(c.textContent).toContain('hub-my-ip');
    // Another tab stores other project rules: the question on screen describes rules that are gone.
    projectRulesSwap.to = 'rulesSecret';
    await userEvent.click(within(c).getByRole('button', { name: strings['acc.proj.use.confirm.go'] }));
    expect(await within(d).findByText(strings['acc.proj.parentChanged'], undefined, SLOW)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(clearSends).toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  }, 30000);

  it('a read that fails on the press shows no confirm and sends nothing', async () => {
    const d = await openDrawer('useRulesApplied');
    await offerButton(d);
    accessOwnFails.on = true;
    await userEvent.click(await offerButton(d));
    expect(await within(d).findByText(strings['acc.proj.use.readFailed'], undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(clearSends).toHaveLength(0);
  }, 30000);

  it('answered done, then rules of its own read again: says they were written again, never done', async () => {
    const d = await openDrawer('useRulesDoneRecreate');
    await pressAndConfirm(d);
    expect(await within(d).findByText(strings['acc.proj.use.again'], undefined, SLOW)).toBeInTheDocument();
    expect(within(d).queryByText(fill('acc.proj.use.done', { name: ATLAS.name, project: HOME.name }))).toBeNull();
    expect(clearSends).toHaveLength(1);
  }, 30000);

  it('a press still reading when the drawer is closed and opened again shows nothing: the new opening reads afresh', async () => {
    let d = await openDrawer('useRulesApplied');
    await offerButton(d);
    accessOwnSlow.ms = 1500;
    await userEvent.click(await offerButton(d));
    await userEvent.click(screen.getByRole('tab', { name: pageStrings['tab.overview'] }));
    await waitFor(() => expect(screen.getByRole('tab', { name: pageStrings['tab.overview'] })).toHaveAttribute('aria-selected', 'true'), SLOW);
    projectRulesSwap.to = 'rulesSecret';
    accessOwnSlow.ms = 0;
    await userEvent.click(screen.getByRole('tab', { name: pageStrings['tab.permissions'] }));
    d = await screen.findByRole('tabpanel', undefined, SLOW);
    await offerButton(d);
    await new Promise((r) => setTimeout(r, 2500));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(d).queryByText(strings['acc.proj.parentChanged'])).toBeNull();
    expect(clearSends).toHaveLength(0);
  }, 40000);

  it('412: changed elsewhere, nothing removed, sent once', async () => {
    const d = await openDrawer('useRulesStale');
    await pressAndConfirm(d);
    expect(await within(d).findByText(strings['acc.stale'], undefined, SLOW)).toBeInTheDocument();
    expect(within(d).queryByText(fill('acc.proj.use.done', { name: ATLAS.name, project: HOME.name }))).toBeNull();
    expect(clearSends).toHaveLength(1);
  }, 30000);

  it('a lost answer is held; Check again says it is still there and never sends again', async () => {
    const d = await openDrawer('useRulesLost');
    await pressAndConfirm(d);
    expect(await within(d).findByText(new RegExp(strings['acc.proj.use.held'].slice(0, 40)), undefined, SLOW)).toBeInTheDocument();
    // Before its own Check again, the reads from before the lost answer say nothing of where it stands.
    await new Promise((r) => setTimeout(r, 800));
    expect(within(d).queryByText(new RegExp(strings['acc.proj.use.stillThere'].slice(0, 30)))).toBeNull();
    await checkAgain(d);
    expect(await within(d).findByText(new RegExp(strings['acc.proj.use.stillThere'].slice(0, 30)), undefined, SLOW)).toBeInTheDocument();
    expect(within(d).queryByText(fill('acc.proj.use.done', { name: ATLAS.name, project: HOME.name }))).toBeNull();
    expect(clearSends).toHaveLength(1);
  }, 30000);

  // An earlier hold's Check again that finishes after a Dismiss and a second send says
  // nothing of the second one, while that send's own read-back has not answered.
  it('a Check again of an earlier hold that finishes after a second send leaves no line on the new hold', async () => {
    const d = await openDrawer('useRulesLost');
    const heldText = new RegExp(strings['acc.proj.use.held'].slice(0, 40));
    // 1. The first DELETE's answer is lost and nothing is deleted; its Check again's state reads stay pending.
    await pressAndConfirm(d);
    await within(d).findByText(heldText, undefined, SLOW);
    accessOwnHold.on = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.check'] }));
    await waitFor(() => expect(accessOwnHold.parked.length).toBeGreaterThan(0));
    const firstCheck = accessOwnHold.parked.splice(0);
    accessOwnHold.on = false;
    // 2. Dismiss; Use project rules again, its reads answer, and the second DELETE is confirmed.
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.dismiss'] }));
    const dm = await screen.findByRole('alertdialog', { name: strings['acc.held.dismissTitle'] }, SLOW);
    await userEvent.click(within(dm).getByRole('button', { name: strings['acc.held.dismissGo'] }));
    await userEvent.click(await offerButton(d));
    const c = await screen.findByRole('alertdialog', { name: strings['acc.proj.use.confirm.title'] }, SLOW);
    // 4. The second answer is lost too, and its automatic read-back's state reads stay pending.
    accessOwnHold.on = true;
    await userEvent.click(within(c).getByRole('button', { name: strings['acc.proj.use.confirm.go'] }));
    await within(d).findByText(heldText, undefined, SLOW);
    expect(clearSends).toHaveLength(2);
    // 3. The earlier check finishes now, after the second send.
    for (const release of firstCheck) release();
    await new Promise((r) => setTimeout(r, 1500));
    expect(within(d).getByText(heldText)).toBeInTheDocument();
    expect(within(d).queryByText(new RegExp(strings['acc.proj.use.stillThere'].slice(0, 30)))).toBeNull();
    expect(within(d).queryByText(new RegExp(strings['acc.proj.use.newer'].slice(0, 30)))).toBeNull();
  }, 40000);

  // stepCapture's hold check alone: the hold moves here with no send of this drawer's, so its
  // send counter does not drop the earlier check's write; only the hold comparison does.
  it('a Check again whose hold another tab replaced, with no send from this drawer, leaves no line on the new hold', async () => {
    const d = await openDrawer('useRulesLost');
    const heldText = new RegExp(strings['acc.proj.use.held'].slice(0, 40));
    // 1. The DELETE's answer is lost; its Check again's state reads stay pending.
    await pressAndConfirm(d);
    await within(d).findByText(heldText, undefined, SLOW);
    accessOwnHold.on = true;
    await userEvent.click(within(d).getByRole('button', { name: strings['acc.held.check'] }));
    await waitFor(() => expect(accessOwnHold.parked.length).toBeGreaterThan(0));
    const firstCheck = accessOwnHold.parked.splice(0);
    accessOwnHold.on = false;
    // 2. Another tab dismisses that hold and sends the same clear, lost too: a new hold, and this drawer sent nothing.
    const [h] = heldChanges('computer.access');
    expect(h?.hold).toBeTruthy();
    const from = Number((h!.identity as { from?: unknown }).from);
    render(createElement(QueryClientProvider, { client: coreQueryClient }, createElement(OtherTab)));
    await act(async () => {
      await otherClear!.dismiss({ id: ATLAS.id, from }, h!.hold as string);
    });
    await act(async () => {
      await otherClear!.mutateAsync({ id: ATLAS.id, from }).catch(() => undefined);
    });
    await waitFor(() => expect(heldChanges('computer.access')[0]?.hold).toBeTruthy());
    expect(heldChanges('computer.access')[0]!.hold).not.toBe(h!.hold);
    await within(d).findByText(heldText, undefined, SLOW);
    expect(clearSends).toHaveLength(2);
    // 3. The first check finishes now, on a hold that is no longer the one it started under.
    for (const release of firstCheck) release();
    await new Promise((r) => setTimeout(r, 1500));
    expect(within(d).getByText(heldText)).toBeInTheDocument();
    expect(within(d).queryByText(new RegExp(strings['acc.proj.use.stillThere'].slice(0, 30)))).toBeNull();
    expect(within(d).queryByText(new RegExp(strings['acc.proj.use.newer'].slice(0, 30)))).toBeNull();
  }, 40000);

  it('a lost answer that arrives later: held until a state read says missing, then done', async () => {
    const d = await openDrawer('useRulesLostLate');
    await pressAndConfirm(d);
    const done = fill('acc.proj.use.done', { name: ATLAS.name, project: HOME.name });
    await waitFor(async () => {
      if (!within(d).queryByText(done)) await checkAgain(d);
      expect(within(d).getByText(done)).toBeInTheDocument();
    }, { timeout: 15000, interval: 800 });
    expect(clearSends).toHaveLength(1);
  }, 40000);

  it('a lost answer that was applied is proved by the read-back: done', async () => {
    const d = await openDrawer('useRulesLostApplied');
    await pressAndConfirm(d);
    await checkAgain(d);
    expect(await within(d).findByText(fill('acc.proj.use.done', { name: ATLAS.name, project: HOME.name }), undefined, SLOW)).toBeInTheDocument();
    expect(clearSends).toHaveLength(1);
  }, 30000);

  for (const [state, what] of [['useRulesLostOther', '"Anyone"'], ['useRulesLostRecreate', 'deleted and made again']] as const) {
    it(`another tab wrote rules of its own after a lost clear (${what}): held with the newer line, never done`, async () => {
      const d = await openDrawer(state);
      await pressAndConfirm(d);
      await within(d).findByText(new RegExp(strings['acc.proj.use.held'].slice(0, 40)), undefined, SLOW);
      await checkAgain(d);
      expect(await within(d).findByText(new RegExp(strings['acc.proj.use.newer'].slice(0, 30)), undefined, SLOW)).toBeInTheDocument();
      await checkAgain(d);
      expect(within(d).getByRole('button', { name: strings['acc.held.check'] })).toBeInTheDocument();
      expect(within(d).queryByText(fill('acc.proj.use.done', { name: ATLAS.name, project: HOME.name }))).toBeNull();
      expect(clearSends).toHaveLength(1);
    }, 30000);
  }

  it('a key without the rules leaf, or one limited to a realm, reads no project rules and is offered nothing', async () => {
    for (const state of ['useRulesKeyNoLeaf', 'useRulesKeyRealm']) {
      cleanup();
      projectRulesReads.length = 0;
      const d = await renderPage(page, { path: links.permissions(handleOf(ATLAS)), state }).then(() => screen.findByRole('tabpanel', undefined, SLOW).catch(() => null));
      await new Promise((r) => setTimeout(r, 600));
      expect(projectRulesReads).toHaveLength(0);
      if (d) {
        expect(within(d).queryByText(strings['acc.proj.title'])).toBeNull();
        expect(within(d).queryByRole('button', { name: strings['acc.proj.use.go'] })).toBeNull();
      }
    }
  }, 40000);
});
