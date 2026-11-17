// The one model picker's body in the terminal, by keys. ModelPickBody.term.test.tsx presses rows through the tree and
// never types. This file covers what its header and ModelPickBody.term.tsx's header promise:
// - A printable key in the list goes to the search, and the search box takes the rest.
// - Escape clears the search, both in the box and in the list.
// - On Ready, a search with no match offers every provider.
// - The consent bar takes the focus, and Escape or Choose another gives it back to the row pressed.
// - A locked body chooses nothing.
import { providers } from '@core';
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, focusedNode, getByRole, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { evidence7k } from './fixtures/evidence7k';
import type { SetupRequest } from './ModelBrowser';
import { ModelPickBody, type ModelPickBodyProps } from './ModelPickBody';
import { NO_MODEL_PREFS, type ModelPrefs } from './modelPickLogic';
import strings from './ModelPick.strings.en.json';
import mc from './ModelChooser.strings.en.json';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const chosen: providers.Choice[] = [];
const setups: SetupRequest[] = [];

function Host(p: Partial<ModelPickBodyProps> & { prefs0?: ModelPrefs }) {
  const { prefs0, ...rest } = p;
  const [prefs, setPrefs] = useState<ModelPrefs>(prefs0 ?? NO_MODEL_PREFS);
  return (
    <ModelPickBody
      id="mp"
      evidence={evidence7k('threeReady')}
      computerName="atlas"
      value=""
      rules={providers.rulesFor('bot')}
      purpose="bot"
      onChoose={(c) => chosen.push(c)}
      onSetup={(r) => setups.push(r)}
      onOtherWay={() => undefined}
      onRetry={() => undefined}
      pick={{ prefs, onPrefs: (fn) => setPrefs(fn) }}
      {...rest}
    />
  );
}

const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const settle = async () => {
  await t!.settle();
  await new Promise((r) => setTimeout(r, 50));
  return t!.settle();
};
const draw = async (p: Parameters<typeof Host>[0] = {}) => {
  chosen.length = 0;
  setups.length = 0;
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Host {...p} /></PaneSize></OverlayHost></FocusRoot>, { width: 110, height: 70 });
  return settle();
};
const options = () => queryAllByRole(tree(), 'option');
const focused = () => focusedNode(tree());
const searchText = () => getByRole(tree(), 'searchbox').value ?? '';
/** The "<shown> of <total> models" line's shown number (null while the line is not drawn). */
const shown = (): number | null => {
  const m = /([\d,]+) of [\d,]+ models/.exec(t!.captureCharFrame());
  return m ? Number(m[1]!.replace(/,/g, '')) : null;
};
/** Tab until a row of the list has the focus (the list is one stop); fails when none ever does. */
async function tabIntoList(): Promise<void> {
  for (let i = 0; i < 30 && focused()?.role !== 'option'; i++) { t!.mockInput.pressTab(); await settle(); }
  expect(focused()?.role).toBe('option');
}
/** In the list, type "deepseek": the first letter goes through the list, the rest into the box it moved to. */
async function typeDeepseekFromList(): Promise<void> {
  await tabIntoList();
  await t!.mockInput.typeText('d');
  await settle();
  expect(focused()?.role).toBe('searchbox');
  await t!.mockInput.typeText('eepseek');
  await settle();
}

// Catches the list's onType (ModelPickBody.term.tsx lines 557-560: the key is added to the search and the box takes
// the focus) and the search narrowing the view (line 160). It also catches SearchField's Escape (fields.term.tsx
// line 167) clearing it.
test('a letter typed in the list starts the search; the box takes the rest; Escape in the box clears it', async () => {
  await draw();
  const all = shown();
  expect(all).not.toBeNull();
  await typeDeepseekFromList();
  expect(searchText()).toBe('deepseek');
  const n = shown();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(all!);
  for (const o of options()) expect(o.name).toMatch(/deepseek/i);
  t!.mockInput.pressEscape();
  await settle();
  expect(searchText()).toBe('');
  expect(shown()).toBe(all);
}, 30_000);

// Catches the list's onEscape (lines 561-566): with a search, Escape in the list clears it and puts the focus in the
// box, and the full list comes back.
test('Escape in the list with a search clears it and puts the focus in the box', async () => {
  await draw();
  const all = shown();
  await typeDeepseekFromList();
  act(options()[0]!, 'focus');
  await settle();
  expect(focused()?.role).toBe('option');
  t!.mockInput.pressEscape();
  await settle();
  expect(searchText()).toBe('');
  expect(focused()?.role).toBe('searchbox');
  expect(shown()).toBe(all);
}, 30_000);

// Catches the empty view (lines 526-541): "No model matches." with no list, no Clear filters while no filter is on
// (line 531), and "Search all providers" on Ready (lines 536-538), which keeps the search and shows the matches.
// No ready provider's model or name holds "mistral" in the threeReady fixture; Mistral itself is can't-tell there.
test('on Ready, a search with no match says so and offers every provider; that keeps the search and shows the matches', async () => {
  await draw();
  act(getByRole(tree(), 'searchbox'), 'focus');
  await t!.mockInput.typeText('mistral');
  const f = await settle();
  expect(f).toContain(strings['none.title']);
  expect(options()).toHaveLength(0);
  expect(queryAllByRole(tree(), 'button', { name: strings['f.clear'] })).toHaveLength(0);
  act(getByRole(tree(), 'button', { name: strings['none.all'] }), 'press');
  await settle();
  expect(searchText()).toBe('mistral');
  expect(shown()).toBeGreaterThan(0);
  expect(options().length).toBeGreaterThan(0);
  expect(t!.captureCharFrame()).not.toContain(strings['none.title']);
}, 30_000);

// Catches the consent bar's focus (line 191 focus.mark, line 431 autoFocus on Use it anyway, lines 412-424 barBack and
// Escape on its buttons): the bar takes the focus, Escape or Choose another gives it back to the row pressed, and
// nothing is chosen.
test("the consent bar takes the focus; Escape or Choose another gives it back to the row; nothing is chosen", async () => {
  await draw({ evidence: evidence7k('catalogueFailed'), value: 'hoody-ai/hoody-free' });
  const bar = () => queryAllByRole(tree(), 'group', { name: /^Can't tell if .+ runs on atlas right now\.$/ });
  await tabIntoList();
  const row = focused()!.name;
  t!.mockInput.pressEnter();
  await settle();
  expect(bar()).toHaveLength(1);
  expect(focused()?.name).toBe(mc['unk.use']);
  t!.mockInput.pressEscape();
  await settle();
  expect(bar()).toHaveLength(0);
  expect(focused()?.role).toBe('option');
  expect(focused()?.name).toBe(row);
  t!.mockInput.pressEnter();
  await settle();
  expect(focused()?.name).toBe(mc['unk.use']);
  t!.mockInput.pressTab();
  await settle();
  expect(focused()?.name).toBe(mc['unk.other']);
  t!.mockInput.pressEnter();
  await settle();
  expect(bar()).toHaveLength(0);
  expect(focused()?.name).toBe(row);
  expect(chosen).toEqual([]);
  expect(setups).toEqual([]);
}, 30_000);

// The web's "locked: a press does nothing". Catches the lock (ModelListbox.term.tsx line 121 and ModelPickBody.term.tsx
// line 181 both hold it; the test fails only when both are gone) and the endpoint button's lock (line 488).
test('locked: a press on a ready row chooses nothing; the list and Your own endpoint read as off', async () => {
  await draw({ locked: true });
  expect(getByRole(tree(), 'listbox').states.disabled).toBe(true);
  act(options()[0]!, 'press');
  await settle();
  expect(chosen).toEqual([]);
  expect(getByRole(tree(), 'button', { name: mc['dir.endpoint'] }).states.disabled).toBe(true);
}, 30_000);
