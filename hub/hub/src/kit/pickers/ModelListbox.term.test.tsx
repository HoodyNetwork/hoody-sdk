// Terminal ModelListbox: rows read like PickerPanel's (›, (•)/( ), tags as words, the state on the line under it, a warn
// state starting with "!"); one Tab stop on the value; an asked focus (`focusSpec` + a new `focusToken`) moves the
// cursor; when the focused row leaves the list the cursor goes to the nearest survivor.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { ModelListbox, type ListGroup } from './ModelListbox';
import { ProviderMark } from './ProviderMark';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const groups = (drop: string[] = []): ListGroup[] => [
  { id: 'hoody-ai', header: <><ProviderMark id="hoody-ai" name="Hoody AI" /> Hoody AI</>, options: [{ spec: 'h/free', label: 'Hoody Free', tags: ['Current', 'Recommended'], selected: true }] },
  {
    id: 'openai',
    header: <><ProviderMark id="openai" name="OpenAI" /> OpenAI</>,
    options: [
      { spec: 'o/5', label: 'GPT-5', facts: '$1.25 / M', selected: false },
      { spec: 'o/mini', label: 'GPT-5 mini', state: 'Needs setup: API key', tone: 'warn' as const, selected: false },
      { spec: 'o/nano', label: 'GPT-5 nano', state: "Can't tell if it runs here", selected: false },
    ].filter((o) => !drop.includes(o.spec)),
  },
];
const draw = async (node: React.ReactNode, w = 70, h = 16) => {
  t = await drawTest(<FocusRoot><PaneSize>{node}</PaneSize></FocusRoot>, { width: w, height: h });
  return t.settle();
};

test('rows: the value is (•) and bold, tags are words, a warn state says "!", facts at the line end; the cursor is ›', async () => {
  let f = await draw(<ModelListbox id="ml" labelledBy="h" groups={groups()} onActivate={() => {}} />);
  const lines = f.split('\n');
  expect(lines.find((l) => l.includes('Hoody Free'))).toMatch(/^ \(•\) Hoody Free Current · Recommended/);
  expect(lines.find((l) => l.includes('GPT-5 ') && l.includes('$1.25'))).toMatch(/^ \( \) GPT-5 +\$1\.25 \/ M\s*$/);
  expect(f).toContain('     ! Needs setup: API key');
  expect(f).toContain("     Can't tell if it runs here");
  expect(lines.find((l) => l.includes('OpenAI'))).toMatch(/^ O +OpenAI/);
  // One Tab stop: the value.
  t!.mockInput.pressTab();
  f = await t!.settle();
  expect(f).toContain('›(•) Hoody Free');
});

test('arrows cross groups; Enter activates the cursor row; End goes to the last row', async () => {
  const got: string[] = [];
  await draw(<ModelListbox id="ml" labelledBy="h" groups={groups()} onActivate={(s) => got.push(s)} />);
  t!.mockInput.pressTab(); await t!.settle();
  t!.mockInput.pressArrow('down'); await t!.settle();
  t!.mockInput.pressEnter(); await t!.settle();
  t!.mockInput.pressKey('END'); await t!.settle();
  t!.mockInput.pressEnter(); await t!.settle();
  expect(got).toEqual(['o/5', 'o/nano']);
});

test('focusSpec with a new token moves the cursor; the focused row leaving goes to the nearest survivor', async () => {
  let ask: (spec: string) => void = () => {};
  let drop: (spec: string) => void = () => {};
  function Host() {
    const [tok, setTok] = useState<number | undefined>(undefined);
    const [spec, setSpec] = useState<string | null>(null);
    const [gone, setGone] = useState<string[]>([]);
    ask = (s) => { setSpec(s); setTok((n) => (n ?? 0) + 1); };
    drop = (s) => setGone((g) => [...g, s]);
    return <ModelListbox id="ml" labelledBy="h" groups={groups(gone)} onActivate={() => {}} focusSpec={spec} {...(tok !== undefined ? { focusToken: tok } : {})} />;
  }
  await draw(<Host />);
  ask('o/mini');
  let f = await t!.settle();
  expect(f).toContain('›( ) GPT-5 mini');
  drop('o/mini');
  f = await t!.settle();
  await t!.settle();
  f = await t!.settle();
  expect(f).toContain('›( ) GPT-5 nano');
});
