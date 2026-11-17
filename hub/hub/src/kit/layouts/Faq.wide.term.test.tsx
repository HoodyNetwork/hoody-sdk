// Big screens: an open answer keeps the web's reading width (Faq.module.css.answer: 62ch).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { cellWidth } from '../../term/prim/TableCells';
import { routed } from './termHarness';
import { Faq } from './Faq';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const A = 'A Bot works for you on one of your computers: it starts tasks and asks you before risky steps. You can reach it from here, from its chat apps, or from any app, agent or program that speaks HTTP.';
const items = [{ id: 'what', q: 'What is a Bot?', a: A }, { id: 'other', q: 'Another question?', a: 'Short.' }];

test('an open answer at 240 columns wraps at the reading width; the whole text is drawn', async () => {
  t = await drawTest(routed(() => <Faq faq={{ items }} />).element, { width: 240, height: 14 });
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  const lines = (await t.settle()).split('\n').map((l) => l.trimEnd());
  const body = lines.filter((l) => l.startsWith('  ') && l.trim() && !l.includes('▸') && !l.includes('▾'));
  expect(body.length).toBeGreaterThanOrEqual(3);
  // A regression would draw one line of 190+ cells.
  expect(Math.max(...body.map((l) => cellWidth(l)))).toBeLessThanOrEqual(64);
  expect(body.map((l) => l.trim()).join(' ')).toBe(A);
});

test('at 50 columns the answer takes the room it has', async () => {
  t = await drawTest(routed(() => <Faq faq={{ items }} />).element, { width: 50, height: 14 });
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  const lines = (await t.settle()).split('\n').map((l) => l.trimEnd());
  const body = lines.filter((l) => l.startsWith('  ') && l.trim() && !l.includes('▸') && !l.includes('▾'));
  expect(Math.max(...body.map((l) => cellWidth(l)))).toBeGreaterThan(40);
});
