// Tips shown BY the focus under the app's own focus scope (App.tsx PageRoot). Tab onto an InfoTip on the AI
// page drew "This page could not be drawn" (Maximum update depth exceeded): the glance is a layer, PageRoot went
// inactive under ANY open layer, the trigger lost its focus, the glance hid, the scope came back, the glance showed...
// A tip takes no key, so only key-taking layers (modal, popover, entered surfaces) deactivate the page's scope.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Tab onto each focus-shown tip (InfoTip icon + term form, Tooltip, a soft-disabled reason): it shows, the focus stays, no loop | 'tips shown by the focus' |
// | 2 | A pinned InfoTip (popover, takes keys) still makes the page inactive; Esc closes it, the trigger keeps the focus, no glance comes back | 'pinned InfoTip' |
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { createElement } from 'react';
import type { PageManifest } from '@kit/page';
import { Button, Icon, InfoTip, Tooltip } from '@kit';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from './boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from './lifecycle';
import { createTermApp } from './App';
import { drawTest, type TestTerm } from '../prim/testing';
import { focusedNode, semanticsOf } from '../prim/semantics';

setDefaultTimeout(60_000);

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;
const errors: string[] = [];
const realError = console.error;

function Tips() {
  return createElement('box', { flexDirection: 'column', gap: 1 },
    createElement('text', null, 'Tip bench'),
    createElement(InfoTip, { text: 'A product-owned agent cannot be changed.', subject: 'Locked' }, createElement(Icon, { name: 'lock', size: 'sm', label: 'Locked' })),
    createElement(InfoTip, { text: 'Every tool the agent may call.', subject: 'Tools: All tools' }),
    createElement(InfoTip, { text: 'Seven tools from the list.', subject: '' }, '7 tools'),
    <Tooltip content="Reload the list"><Button aria-label="Reload" onPress={() => {}}>Reload</Button></Tooltip>,
    createElement(Button, { isDisabled: true, disabledReason: 'Nothing to save yet.', onPress: () => {} }, 'Save'));
}

beforeAll(async () => {
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  const all = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  pages = all.map((p) => (p.id !== 'demo' ? p : ({ ...p, load: async () => ({ default: Tips }) } as unknown as PageManifest)));
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'demo', fx: null });
  await boot.start(session, () => {});
});
afterAll(async () => {
  console.error = realError;
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

async function until(ok: (f: string) => boolean, ms = 4000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}
const focused = () => { const r = t!.renderer as unknown as { root: never; stdin: never }; return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin })); };
async function open() {
  await t?.dispose();
  const app = createTermApp({ pages, queryClient, path: '/demo', onQuit: () => {} });
  t = await drawTest(app.element, { width: 120, height: 40 });
  await until((f) => f.includes('Tip bench'));
}
/** Tab until the focused thing's name matches. */
async function tabTo(name: RegExp, max = 80): Promise<void> {
  for (let i = 0; i < max && !name.test(focused()?.name ?? ''); i++) { t!.mockInput.pressTab(); await t!.settle(); expect(loops()).toEqual([]); }
  expect(focused()?.name ?? '(nothing focused)').toMatch(name);
}
const loops = () => errors.filter((e) => /Maximum update depth|could not be drawn/.test(e));

test('tips shown by the focus: each shows, the focus stays on its trigger, no update loop', async () => {
  errors.length = 0;
  await open();
  const cases: [RegExp, string][] = [
    [/^Locked$/, 'A product-owned agent'],
    [/^About Tools: All tools$/, 'Every tool the agent'],
    [/^7 tools$/, 'Seven tools from'],
    [/^Reload$/, 'Reload the list'],
    [/^Save$/, 'Nothing to save yet'],
  ];
  for (const [name, tip] of cases) {
    await tabTo(name);
    const f = await until((x) => x.includes(tip), 1500);
    expect(f).toContain(tip);
    expect(f).not.toContain('could not be drawn');
    // Still there a moment later: the focus did not flip away and back.
    await new Promise((r) => setTimeout(r, 120));
    expect(focused()?.name ?? '').toMatch(name);
    expect(await t!.settle()).toContain(tip);
    expect(loops()).toEqual([]);
  }
});

test('pinned InfoTip: a popover (keys inside); Esc closes it, the trigger keeps the focus, the glance stays hidden', async () => {
  errors.length = 0;
  await open();
  await tabTo(/^7 tools$/);
  t!.mockInput.pressEnter();
  let f = await until((x) => x.includes('Seven tools from') && /┌/.test(x), 1500);
  expect(f).toContain('Seven tools from');
  t!.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 120));
  f = await t!.settle();
  expect(f).not.toContain('Seven tools from');
  expect(focused()?.name ?? '').toBe('7 tools');
  expect(loops()).toEqual([]);
});
