// PageHeader's primary action in the terminal (a primary that ignored isDisabled survived every run).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { semanticsOf } from '../../term/prim/semantics';
import { routed } from './termHarness';
import { PageHeader } from './PageHeader';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

async function draw(isDisabled: boolean, onPress: () => void): Promise<TestTerm> {
  const { element } = routed(() => (
    <FocusRoot><PageHeader title="Schedules" primary={{ label: 'New schedule', onPress, isDisabled }} /></FocusRoot>
  ));
  const term = await drawTest(element, { width: 80, height: 6 });
  await term.settle();
  return term;
}

test('Tab then Enter on the primary runs it once', async () => {
  let n = 0;
  t = await draw(false, () => { n++; });
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(n).toBe(1);
});

test('a disabled primary never runs, from the keyboard or a click, and says it is disabled', async () => {
  let n = 0;
  t = await draw(true, () => { n++; });
  const f = await t.settle();
  expect(f).toContain('New schedule');
  for (let i = 0; i < 3; i++) { t.mockInput.pressTab(); await t.settle(); t.mockInput.pressEnter(); await t.settle(); }
  const at = f.split('\n').findIndex((l) => l.includes('New schedule'));
  const col = f.split('\n')[at]!.indexOf('New schedule');
  await t.mockMouse.click(col + 1, at);
  await t.settle();
  expect(n).toBe(0);
  const button = semanticsOf(t.renderer).find((s) => s.role === 'button' && s.name === 'New schedule');
  expect(button?.states.disabled).toBe(true);
});
