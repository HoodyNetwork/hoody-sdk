// A Save whose answer is unknown and whose hold core freed before any render (a read that proved it while
// run() was still out) ends with the neutral line, never silently. The runner is wrapped so run() answers pending
// with no hold left: the page fixtures always render the hold first, so only this unit-level case reaches it.
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { projectRulesSends, resetAccess } from './fixtures';
import page from './page';
import type * as Runner from './parts/runner';
import strings from './strings.en.json';

vi.mock('./parts/runner', async (orig) => {
  const m = await orig<typeof Runner>();
  return {
    ...m,
    useRunner: ((mut: unknown, held: unknown) => {
      const r = (m.useRunner as (a: unknown, b: unknown) => ReturnType<typeof m.useRunner>)(mut, held);
      return { ...r, held: null, hold: undefined, run: async () => ({ outcome: 'pending' as const }) };
    }) as typeof m.useRunner,
  };
});

const first = fixtureWorld.projects[0]!;
const SLOW = { timeout: 8000 };
const fill = (k: keyof typeof strings, v: Record<string, string | number> = {}) => Object.entries(v).reduce<string>((s, [n, x]) => s.split(`{{${n}}}`).join(String(x)), strings[k]);

beforeEach(() => resetAccess());

describe('Projects: a project-rules Save whose hold went before a render', () => {
  it('pending with no hold left shows exactly the neutral line: no saved, no refusal', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'rulesChange' });
    const row = (await screen.findByText(first.name, { selector: 'strong' }, SLOW)).closest('[data-row-id]') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
    const d = await screen.findByRole('dialog', { name: fill('pp.title', { name: first.name }) }, SLOW);
    await userEvent.click(within(d).getByRole('tab', { name: strings['pp.tab.rules'] }));
    await userEvent.click(within(await within(d).findByRole('radiogroup', { name: strings['pp.rules.choice'] }, SLOW)).getByRole('radio', { name: new RegExp(strings['pp.rules.c.private']) }));
    await userEvent.click(within(d).getByRole('button', { name: strings['pp.rules.save'] }));
    const c = await screen.findByRole('alertdialog', { name: fill('pp.rules.confirm.title', { name: first.name }) }, SLOW).catch(() => screen.findByRole('dialog', { name: fill('pp.rules.confirm.title', { name: first.name }) }, SLOW));
    await userEvent.click(within(c).getByRole('button', { name: strings['pp.rules.go'] }));
    expect(await within(d).findByText(strings['pp.rules.settled'], undefined, SLOW)).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    for (const k of ['pp.rules.saved', 'pp.rules.notSaved', 'pp.rules.stale', 'pp.rules.held'] as const) expect(within(d).queryByText(strings[k])).toBeNull();
    expect(projectRulesSends).toHaveLength(0);
  }, 60000);
});
