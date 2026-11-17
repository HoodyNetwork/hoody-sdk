// ModelPickBody in the terminal: the words that name or describe a control reach the semantics tree. A Text that only
// carries an id names nothing there (a Text with no role reads as plain text), so the list's count and the can't-tell
// bar's question are `text` nodes with that id:
//   - the list of models is described by its count ("N of M models")
//   - the can't-tell bar is a group named by its question
import { providers } from '@core';
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { evidence7k } from './fixtures/evidence7k';
import { ModelPickBody, type ModelPickBodyProps } from './ModelPickBody';
import { NO_MODEL_PREFS, type ModelPrefs } from './modelPickLogic';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Host(p: Partial<ModelPickBodyProps>) {
  const [prefs, setPrefs] = useState<ModelPrefs>(NO_MODEL_PREFS);
  return (
    <ModelPickBody
      id="mp"
      evidence={evidence7k('threeReady')}
      computerName="atlas"
      value=""
      rules={providers.rulesFor('bot')}
      purpose="bot"
      onChoose={() => undefined}
      onSetup={() => undefined}
      onOtherWay={() => undefined}
      onRetry={() => undefined}
      pick={{ prefs, onPrefs: (fn) => setPrefs(fn) }}
      {...p}
    />
  );
}

const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const settle = async () => {
  await t!.settle();
  await new Promise((r) => setTimeout(r, 50));
  return t!.settle();
};
const draw = async (p: Partial<ModelPickBodyProps> = {}) => {
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Host {...p} /></PaneSize></OverlayHost></FocusRoot>, { width: 110, height: 70 });
  return settle();
};

// Catches the count drawn as a Text carrying only its id: the listbox's describedBy would resolve to nothing.
test('the list of models is described by its count', async () => {
  const f = await draw();
  const count = /([\d,]+ of [\d,]+ models)/.exec(f)?.[1];
  expect(count).toBeDefined();
  const lists = queryAllByRole(tree(), 'listbox');
  expect(lists).toHaveLength(1);
  expect(lists[0]!.description).toBe(count);
});

// Catches the bar's question drawn as a Text carrying only its id: the group's labelledBy would leave it unnamed.
test("the can't-tell bar is a group named by its question", async () => {
  await draw({ evidence: evidence7k('catalogueFailed'), value: 'hoody-ai/hoody-free' });
  const bar = () => queryAllByRole(tree(), 'group', { name: /^Can't tell if .+ runs on atlas right now\.$/ });
  expect(bar()).toHaveLength(0);
  const row = queryAllByRole(tree(), 'option')[0];
  expect(row).toBeDefined();
  act(row!, 'press');
  const f = await settle();
  expect(f).toContain('Use it anyway');
  expect(bar()).toHaveLength(1);
});
