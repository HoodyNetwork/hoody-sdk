// ComputerLink in the terminal (ComputerLink.term.tsx): a computer's name as a link to that computer's page, by its
// handle (name.last4, never the full id); the name as text where there is nowhere to go. ComputerLink.scenario.ts
// holds the tree; these hold what the terminal draws and where Enter goes:
//   - a link: one Tab stop named by the name; Enter opens /computers?sel=<handle>
//   - made from the id and name: the handle core makes; the id is never drawn
//   - no handle and no id, a load that does not serve Computers, or `plain`: the name as text, no Tab stop
//   - `cut`: the text form stays on one line and ends in "…"
import { afterEach, expect, test } from 'bun:test';
import type { AnyRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { computerHandle } from '@core';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { focusedNode, queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { PagesProvider } from '../../shell/pageLinks';
import { routed } from '../layouts/termHarness';
import { ComputerLink } from './ComputerLink';

const ID = 'a1b2c3d4e5f60718293a4b5c';
let t: TestTerm | null = null;
let router: AnyRouter | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; router = null; });

const draw = async (node: () => ReactNode, width = 60): Promise<string> => {
  const r = routed(node);
  router = r.router;
  t = await drawTest(r.element, { width, height: 6 });
  return t.settle();
};
const step = async (fn: () => void): Promise<string> => { fn(); return t!.settle(); };
const tree = () => semanticsOf(t!.renderer as never);
const at = () => ({ path: router!.state.location.pathname, sel: (router!.state.location.search as Record<string, string>).sel });

// Catches the link's target (line 16: computerHref of the handle) and Enter going there.
test('a link named by the name; Enter opens the computer\'s page by its handle', async () => {
  const f = await draw(() => <ComputerLink name="daring-mint-walrus" handle="daring-mint-walrus.4b5c" />);
  expect(f).toContain('daring-mint-walrus');
  await step(() => t!.mockInput.pressTab());
  expect(focusedNode(tree())).toMatchObject({ role: 'link', name: 'daring-mint-walrus' });
  await step(() => t!.mockInput.pressEnter());
  await t!.settle();
  expect(at()).toEqual({ path: '/computers', sel: 'daring-mint-walrus.4b5c' });
});

// Catches the handle made from the id (line 14: computerHandle, the last four of the id) and the id kept off screen.
test('made from the id and name: the handle core makes; the id is never drawn', async () => {
  const f = await draw(() => <ComputerLink id={ID} name="atlas" />);
  expect(f).toContain('atlas');
  expect(f).not.toContain(ID);
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressEnter());
  await t!.settle();
  expect(at()).toEqual({ path: '/computers', sel: computerHandle({ id: ID, name: 'atlas' }) });
  expect(at().sel).toBe('atlas.4b5c');
});

// Catches the three text forms (line 15): nothing to link by, Computers not served, `plain`.
test('no handle and no id, a load without Computers, or plain: the name as text, no link, nothing to Tab to', async () => {
  const cases: Array<[string, () => ReactNode]> = [
    ['gone-box', () => <ComputerLink name="gone-box" />],
    ['atlas', () => <PagesProvider pages={[{ id: 'keys', path: '/keys' }] as never}><ComputerLink name="atlas" handle="atlas.4b5c" /></PagesProvider>],
    ['plain-box', () => <ComputerLink name="plain-box" handle="plain-box.4b5c" plain />],
  ];
  for (const [name, node] of cases) {
    const f = await draw(node);
    expect(f).toContain(name);
    expect(queryAllByRole(tree(), 'link')).toHaveLength(0);
    await step(() => t!.mockInput.pressTab());
    await step(() => t!.mockInput.pressEnter());
    expect(at().path).toBe('/page');
    t!.renderer.destroy();
    t = null;
  }
});

// Catches `cut` on the text form (line 15: <Text truncate>): one line, cut at the end with one "…".
test('cut: the text form stays on one line and ends in "…"', async () => {
  const name = 'a-very-long-computer-name-that-does-not-fit';
  const f = await draw(() => <ComputerLink name={name} cut />, 20);
  const line = f.split('\n').find((l) => l.includes('a-very')) ?? '';
  expect(line.trimEnd().endsWith('…')).toBe(true);
  expect(f).not.toContain('does-not-fit');
});
