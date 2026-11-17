// The first committed render that shows a held write: before the tab's token effect runs, its own
// earlier answer (here a 412 "changed elsewhere") is already gone. A layout read would see a stale band beside the hold
// for one commit if the render did not mask the tab's own answer while a hold shows; the DOM's mutation order says
// which commit removed it: the band must leave no later than the hold arrives.
import { fixtureWorld, queryClient as coreQueryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness: another tab's sender on the same core, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, renderPage, screen, userEvent, within } from '@app/testing';
import { type ProjectRulesWrite, useSetProjectRules } from './data';
import { projectPutNext, resetAccess } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const first = fixtureWorld.projects[0]!;
const SLOW = { timeout: 20000 };
const fill = (k: keyof typeof strings, v: Record<string, string> = {}) => Object.entries(v).reduce<string>((s, [n, x]) => s.split(`{{${n}}}`).join(x), strings[k]);

let otherSend: ((v: ProjectRulesWrite) => Promise<unknown>) | null = null;
function OtherTab() {
  otherSend = useSetProjectRules().mutateAsync;
  return null;
}

beforeEach(() => resetAccess());

describe('Projects: the first render of a held write', () => {
  it("the tab's own 412 is gone in the same commit that first shows another tab's held write", { timeout: 90000 }, async () => {
    await renderPage(page, { path: '/computers/projects', state: 'rulesChangeStale' });
    const row = (await screen.findByText(first.name, { selector: 'strong' }, SLOW)).closest('[data-row-id]') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
    const d = await screen.findByRole('dialog', { name: fill('pp.title', { name: first.name }) }, SLOW);
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.rules'] }));
    await userEvent.click(within(await within(d).findByRole('radiogroup', { name: strings['pp.rules.choice'] }, SLOW)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.private']) }));
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.rules.save'] }));
    const c = await screen.findByRole('alertdialog', { name: fill('pp.rules.confirm.title', { name: first.name }) }, SLOW);
    await userEvent.click(within(c).getByRole('button', { name: strings['pp.rules.go'] }));
    expect(await within(d).findByText(strings['pp.rules.stale'], undefined, SLOW)).toBeInTheDocument();

    // Every DOM change from here on, in order.
    const seen: MutationRecord[] = [];
    const watch = new MutationObserver((r) => seen.push(...r));
    watch.observe(document.body, { childList: true, subtree: true, characterData: true });
    projectPutNext.push('lost');
    render(createElement(QueryClientProvider, { client: coreQueryClient }, createElement(OtherTab)));
    await act(async () => {
      await otherSend!({ pid: first.id, want: { kind: 'private' }, from: 3, body: { project: first.id, enable_proxy: true, groups: {}, permissions: {}, default: 'deny' } });
    });
    expect(await within(d).findByText(strings['pp.rules.held'], undefined, SLOW)).toBeInTheDocument();
    seen.push(...watch.takeRecords());
    watch.disconnect();
    expect(within(d).queryByText(strings['pp.rules.stale'])).toBeNull();

    const has = (nodes: NodeList, text: string) => [...nodes].some((n) => (n.textContent ?? '').includes(text));
    const heldAt = seen.findIndex((r) => has(r.addedNodes, strings['pp.rules.held']));
    const staleGoneAt = seen.findIndex((r) => has(r.removedNodes, strings['pp.rules.stale']));
    expect(heldAt).toBeGreaterThanOrEqual(0);
    expect(staleGoneAt).toBeGreaterThanOrEqual(0);
    expect(staleGoneAt).toBeLessThan(heldAt);
  });
});
