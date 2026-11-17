// ActionBar in the terminal (a section's or a page's row of actions). Button.term.test.tsx holds InlineActions and
// SuggestionActions wrapping; no terminal test drew an ActionBar. Wide, the bar draws its secondaries, then the
// primary, then ⋯ with the menu. Narrow (content under FOLD_BELOW px, 8 px a column), button secondaries fold into ⋯
// ahead of the menu and links stay. An action with a disabled reason is a ReasonButton; `name` names a control;
// withoutPrimary leaves the primary out; a bar with nothing to draw draws nothing.
import { afterEach, expect, test } from 'bun:test';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { FocusRoot } from '../../../term/prim';
import { OverlayHost } from '../../../term/prim/Overlay';
import { act, focusedNode, getByRole, queryAllByRole, semanticsOf } from '../../../term/prim/semantics';
import { ActionBar, type ActionBarProps } from './ActionBar';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = () => semanticsOf(t!.renderer as never);

function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}

const bar = (log: string[], over: Partial<ActionBarProps> = {}): ActionBarProps => ({
  label: 'Computer actions',
  primary: { id: 'start', label: 'Start', onPress: () => log.push('start') },
  secondary: [
    { id: 'copy', label: 'Copy', name: 'Copy the address', onPress: () => log.push('copy') },
    { id: 'docs', label: 'Docs', href: '/guide' },
  ],
  menu: [{ id: 'rename', label: 'Rename', onAction: () => log.push('rename') }],
  ...over,
});
async function draw(p: ActionBarProps, width: number): Promise<string> {
  t = await drawTest(<FocusRoot><OverlayHost><Routed><ActionBar {...p} /></Routed></OverlayHost></FocusRoot>, { width, height: 16 });
  await t.settle();
  return t.settle();
}
/** Columns where each word starts on its line (-1 when absent). */
const at = (f: string, words: string[]) => { const l = f.split('\n').find((x) => x.includes(words[0]!)) ?? ''; return words.map((w) => l.indexOf(w)); };
const menuItems = () => queryAllByRole(tree(), 'menuitem').map((m) => m.name);

// Catches the drawing order and the ⋯ (ActionBar.term.tsx lines 107-110), `name` as the accessible name (line 44) and
// the group's name (line 107).
test('wide: secondaries, then the primary, then ⋯ on one line; each acts; ⋯ holds the menu', async () => {
  const log: string[] = [];
  const f = await draw(bar(log), 100);
  const [copy, docs, start, more] = at(f, ['[Copy]', '[Docs]', ' Start ', '[⋯]']);
  expect(copy).toBeGreaterThanOrEqual(0);
  expect(docs).toBeGreaterThan(copy!);
  expect(start).toBeGreaterThan(docs!);
  expect(more).toBeGreaterThan(start!);
  expect(getByRole(tree(), 'group', { name: 'Computer actions' })).toBeDefined();
  t!.mockInput.pressTab();
  await t!.settle();
  expect(focusedNode(tree())?.name).toBe('Copy the address');
  t!.mockInput.pressEnter();
  await t!.settle();
  act(getByRole(tree(), 'button', { name: 'Start' }), 'press');
  await t!.settle();
  expect(log).toEqual(['copy', 'start']);
  act(getByRole(tree(), 'button', { name: 'More actions' }), 'press');
  await t!.settle();
  expect(menuItems()).toEqual(['Rename']);
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log).toEqual(['copy', 'start', 'rename']);
});

// Catches the narrow measure (line 102, useContentNarrow(FOLD_BELOW)) feeding the fold: at 70 columns (560 px) the
// button secondary goes into ⋯, by its fuller name and ahead of the menu; the link stays drawn.
test('narrow: a button secondary folds into ⋯ ahead of the menu; the link stays; choosing it runs it', async () => {
  const log: string[] = [];
  const f = await draw(bar(log), 70);
  expect(f).not.toContain('[Copy]');
  const [docs, start, more] = at(f, ['[Docs]', ' Start ', '[⋯]']);
  expect(docs).toBeGreaterThanOrEqual(0);
  expect(start).toBeGreaterThan(docs!);
  expect(more).toBeGreaterThan(start!);
  act(getByRole(tree(), 'button', { name: 'More actions' }), 'press');
  await t!.settle();
  expect(menuItems()).toEqual(['Copy the address', 'Rename']);
  t!.mockInput.pressEnter(); // the opening focus is the first item
  await t!.settle();
  expect(log).toEqual(['copy']);
});

// Catches the disabled reason's control (lines 31-36: a ReasonButton, focusable, its reason shown, no action),
// withoutPrimary (line 104) and the empty bar (line 105).
test('a disabled reason is a focusable control that says why and does nothing; withoutPrimary; an empty bar draws nothing', async () => {
  const log: string[] = [];
  const why = 'Stop the computer first.';
  let f = await draw(bar(log, { withoutPrimary: true, secondary: [{ id: 'resize', label: 'Resize', disabledReason: why, onPress: () => log.push('resize') }], menu: [] }), 100);
  expect(f).toContain('[Resize]');
  expect(f).not.toContain('Start');
  expect(f).not.toContain('[⋯]');
  t!.mockInput.pressTab();
  f = await t!.settle();
  expect(focusedNode(tree())?.name).toBe('Resize');
  expect(focusedNode(tree())?.states.disabled).toBe(true);
  expect(f).toContain(why);
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(log).toEqual([]);
  t!.renderer.destroy();
  await draw(bar(log, { withoutPrimary: true, secondary: undefined, menu: [] }), 100);
  expect(queryAllByRole(tree(), 'group', { name: 'Computer actions' })).toHaveLength(0);
});
