// The model browser in the terminal: every path that moves the focus after a press (Back from a provider, a Directory
// section's next page, the consent bar and its Choose another, typing from the list into the search). Each asked
// `document` for the control to focus and ended the whole Hub with TERM_GLOBAL; now they go through
// pickerFocus.web.ts, whose terminal sibling answers from the focus scope.
import { providers } from '@core';
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize, useKeys } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, focusedNode, getAllByRole, getByRole, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { evidence7k } from './fixtures/evidence7k';
import { ModelBrowser, type ModelBrowserProps } from './ModelBrowser';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const press = async (name: string | RegExp) => { act(getByRole(tree(), 'button', { name }), 'press'); return t!.settle(); };
const focused = () => { const n = focusedNode(tree()); return n ? `${n.role} ${n.name}` : null; };

/** What a drawer around the browser would hear: a key no control took. */
const outer: string[] = [];
function Outer() { useKeys((k) => { outer.push(k.name); return false; }); return null; }

const draw = async (p: Partial<ModelBrowserProps> = {}, w = 100, h = 80) => {
  outer.length = 0;
  t = await drawTest(
    <FocusRoot><Outer /><OverlayHost><PaneSize>
      <ModelBrowser evidence={evidence7k('freeOnly')} computerName="atlas" value="" rules={providers.rulesFor('bot')} purpose="bot"
        onChoose={() => undefined} onSetup={() => undefined} onOtherWay={() => undefined} onRetry={() => undefined} {...p} />
    </PaneSize></OverlayHost></FocusRoot>, { width: w, height: h });
  return t.settle();
};

test('a provider opens with the focus on its heading, and Back returns it to the chip that opened it', async () => {
  let f = await draw();
  expect(f).toContain('Ready to use');
  f = await press('Anthropic');
  expect(f).toContain('Back to ready models');
  // As on the web: the new view's heading (tabIndex -1) has the focus, and Tab goes on from it.
  expect(focused()).toBe('heading Anthropic');
  f = await press(/Back to ready models/);
  expect(f).toContain('Ready to use');
  expect(f).not.toContain('Back to ready models');
  // document.getElementById(chip id).focus() on the web: the kit Button passes its id to the focus scope.
  expect(focused()).toBe('button Anthropic');
});

test('the Directory pages a section and the focus goes to the new page', async () => {
  let f = await draw();
  f = await press('Set up a provider');
  expect(f).toContain('Back to ready models');
  const next = queryAllByRole(tree(), 'button', { name: /^Next/ });
  expect(next.length).toBeGreaterThan(0);
  const before = f;
  act(next[0]!, 'press');
  f = await t!.settle();
  expect(f).toContain('Back to ready models');
  expect(f).not.toBe(before);
  expect(focusedNode(tree())?.role).toBe('button');
});

test('the consent bar takes the focus, and Choose another gives it back to the option', async () => {
  const onChoose: string[] = [];
  await draw({ evidence: evidence7k('threeReady'), onChoose: (c) => onChoose.push(c.kind) });
  const option = getAllByRole(tree(), 'option').find((o) => o.name.startsWith('Devstral Medium Latest'))!;
  act(option, 'press');
  let f = await t!.settle();
  expect(f).toContain("Can't tell if Devstral Medium Latest runs on atlas right now.");
  expect(focused()).toBe('button Use it anyway');
  f = await press('Choose another');
  expect(f).not.toContain("Can't tell if Devstral Medium Latest runs on atlas right now.");
  expect(focused()).toStartWith('option Devstral Medium Latest');
  expect(onChoose).toEqual([]);
});

test('a letter typed on the list goes to the search field, which takes the focus', async () => {
  await draw({ evidence: evidence7k('threeReady') });
  act(getAllByRole(tree(), 'option')[0]!, 'focus');
  await t!.settle();
  t!.mockInput.pressKey('g');
  await t!.settle();
  const at = focusedNode(tree());
  expect(at?.role).toBe('searchbox');
  expect(at?.value).toBe('g');
});

test('Escape in the consent bar closes the bar only, and the focus goes back to the option', async () => {
  const onChoose: string[] = [];
  await draw({ evidence: evidence7k('threeReady'), onChoose: (c) => onChoose.push(c.kind) });
  act(getAllByRole(tree(), 'option').find((o) => o.name.startsWith('Devstral Medium Latest'))!, 'press');
  let f = await t!.settle();
  expect(f).toContain("Can't tell if Devstral Medium Latest runs on atlas right now.");
  expect(focused()).toBe('button Use it anyway');
  t!.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 80));
  f = await t!.settle();
  // The web Button's onKeyDown took the key: the bar is gone, the browser stays, and what is around it never heard Escape.
  expect(f).not.toContain("Can't tell if Devstral Medium Latest runs on atlas right now.");
  expect(f).toContain('Ready to use');
  expect(outer).not.toContain('escape');
  expect(focused()).toStartWith('option Devstral Medium Latest');
  expect(onChoose).toEqual([]);
});

// In the terminal: a directory row leaves when its provider becomes ready while it has the focus. The
// browser reads the row's place from the element tree (closest, children, dataset, matches, querySelector); the focus
// goes to the row now in that place, else to the view heading, never to nothing.
type Edit = NonNullable<Parameters<typeof evidence7k>[1]>['edit'];
const readyAlso = (...ids: string[]): Edit => (r) => {
  const want = new Set(ids);
  const pb = (r.providers as { body: { providers: { id: string; status?: { state: string; via: string | null } }[] } }).body;
  for (const x of pb.providers) if (want.has(x.id) && x.status) Object.assign(x.status, { state: 'ready', via: 'stored_key' });
  const mb = (r.models as { body: { models: { spec: string }[] } }).body;
  const rb = (r.ready as { body: { models: { spec: string }[] } }).body;
  rb.models = [...rb.models, ...mb.models.filter((m) => want.has(m.spec.slice(0, m.spec.indexOf('/'))))];
};
let setEvidence: ((e: ReturnType<typeof evidence7k>) => void) | null = null;
function Live() {
  const [e, set] = useState(() => evidence7k('freeOnly'));
  setEvidence = set;
  return <ModelBrowser evidence={e} computerName="atlas" value="" rules={providers.rulesFor('bot')} purpose="bot"
    onChoose={() => undefined} onSetup={() => undefined} onOtherWay={() => undefined} onRetry={() => undefined} />;
}
const openDirectory = async () => {
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Live /></PaneSize></OverlayHost></FocusRoot>, { width: 100, height: 120 });
  await t.settle();
  await press('Set up a provider');
};
const leave = async (...ids: string[]) => { setEvidence!(evidence7k('freeOnly', { seq: 2, edit: readyAlso(...ids) })); await new Promise((r) => setTimeout(r, 150)); return t!.settle(); };

test('a focused Suggested card leaves: the focus moves to the card now in its place', async () => {
  await openDirectory();
  act(getByRole(tree(), 'button', { name: 'Set up OpenAI' }), 'focus');
  await t!.settle();
  expect(focused()).toBe('button Set up OpenAI');
  await leave('openai');
  expect(queryAllByRole(tree(), 'button', { name: 'Set up OpenAI' })).toEqual([]);
  expect(focused()).toBe('button Set up Anthropic');
});

test('the last focused card of its list leaves: the focus moves to the view heading', async () => {
  await openDirectory();
  act(getByRole(tree(), 'button', { name: 'Set up Xiaomi MiMo' }), 'focus');
  await t!.settle();
  await leave('mimo');
  expect(focused()).toBe('heading Set up a provider');
});

test('a focused row that stays keeps the focus when another row leaves', async () => {
  await openDirectory();
  act(getByRole(tree(), 'button', { name: 'Set up Anthropic' }), 'focus');
  await t!.settle();
  await leave('mimo');
  expect(focused()).toBe('button Set up Anthropic');
});
