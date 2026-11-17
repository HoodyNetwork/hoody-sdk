// Why in the terminal (Why.term.tsx): a closed question that opens to its answer and always ends with the page FAQ's
// link (FaqLink, Faq.term.tsx). Why.scenario.ts holds the tree on both platforms; these hold the keys and what the
// terminal draws:
//   - closed: "▸ question" and nothing under it; Enter opens it ("▾", the answer, then the link); Enter closes it
//   - on a wide terminal the answer keeps a line of reading text (64 cells), and all of it is drawn
//   - the link, with the question NOT on the page: Enter (or Space) unfolds its answer in place; again folds it
//   - the link, with the question on the page: Enter lands there (that question opens and takes the focus), no peek
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { cellWidth } from '../../term/prim/TableCells';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { routed } from './termHarness';
import { PageBody } from './termScroll';
import { Faq } from './Faq';
import { Why } from './Why';

const Q = 'Which one should I pick?';
const SHORT = 'Pick the first one for a quick start.';
const ITEM = { id: 'pick', q: 'How do I choose a program?', a: 'Start with the one your guide names.' };
const LINK = 'More about picking';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

/** Why in a page body (the page's scroll owner); `withFaq` puts the page's questions under it. */
const draw = async (withFaq: boolean, answer = SHORT, width = 80): Promise<string> => {
  t = await drawTest(routed(() => (
    <PageBody>
      <Why question={Q} faq={{ item: ITEM, label: LINK }}>{answer}</Why>
      {withFaq ? <Faq faq={{ items: [ITEM] }} /> : null}
    </PageBody>
  )).element, { width, height: 24 });
  return t.settle();
};
const step = async (fn: () => void): Promise<string> => { fn(); return t!.settle(); };
const focused = () => focusedNode(semanticsOf(t!.renderer as never));
const times = (frame: string, s: string): number => frame.split(s).length - 1;

// Catches the fold (Disclosure, closed by default) and the order inside it (the answer, then the link: Why.term.tsx 18-20).
test('closed: the question alone; Enter opens it to the answer, then the link; Enter closes it', async () => {
  let f = await draw(false);
  expect(f).toContain(`▸ ${Q}`);
  expect(f).not.toContain(SHORT);
  expect(f).not.toContain(LINK);
  await step(() => t!.mockInput.pressTab());
  expect(focused()?.name).toBe(Q);
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain(`▾ ${Q}`);
  const rows = f.split('\n');
  const answerRow = rows.findIndex((l) => l.includes(SHORT));
  expect(answerRow).toBeGreaterThan(rows.findIndex((l) => l.includes(Q)));
  expect(rows.findIndex((l) => l.includes(LINK))).toBeGreaterThan(answerRow);
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain(`▸ ${Q}`);
  expect(f).not.toContain(SHORT);
  expect(f).not.toContain(LINK);
});

// Catches the answer's measure (line 13: ANSWER_COLS 64, the web's 64ch).
test('at 160 columns the answer wraps at the reading width, and all of it is drawn', async () => {
  const long = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu';
  await draw(false, long, 160);
  await step(() => t!.mockInput.pressTab());
  const f = await step(() => t!.mockInput.pressEnter());
  const words = long.split(' ');
  const body = f.split('\n').map((l) => l.trim()).filter((l) => l && !l.includes(Q) && !l.includes(LINK) && words.some((w) => l.includes(w)));
  expect(body.length).toBeGreaterThanOrEqual(3);
  expect(Math.max(...body.map((l) => cellWidth(l)))).toBeLessThanOrEqual(64);
  expect(body.join(' ')).toBe(long);
});

// Catches FaqLink's peek (Faq.term.tsx press(): the question is not on the page, so its answer unfolds in place).
test('the link with the question not on the page: Enter unfolds its answer here, Enter folds it, Space unfolds it', async () => {
  await draw(false);
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressEnter());
  let f = await step(() => t!.mockInput.pressTab());
  expect(focused()?.name).toBe(LINK);
  expect(f).not.toContain(ITEM.a);
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain(ITEM.a);
  const rows = f.split('\n');
  expect(rows.findIndex((l) => l.includes(ITEM.a))).toBeGreaterThan(rows.findIndex((l) => l.includes(LINK)));
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).not.toContain(ITEM.a);
  f = await step(() => t!.mockInput.pressKey(' '));
  expect(f).toContain(ITEM.a);
  expect(focused()?.name).toBe(LINK);
});

// Catches FaqLink's landing (press(): revealAnchor finds the question on the page, then the FAQ push; the Faq's landing
// opens that item and moves the focus to it): the answer shows once, in the page's questions, never also as a peek.
test('the link with the question on the page: Enter lands there; that question opens and takes the focus', async () => {
  let f = await draw(true);
  expect(f).toContain(`▸ ${ITEM.q}`);
  expect(f).not.toContain(ITEM.a);
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressEnter());
  await step(() => t!.mockInput.pressTab());
  expect(focused()?.name).toBe(LINK);
  await step(() => t!.mockInput.pressEnter());
  f = await t!.settle(); // the push is a navigation, then the landing's timer
  expect(f).toContain(`▾ ${ITEM.q}`);
  expect(times(f, ITEM.a)).toBe(1);
  expect(focused()?.name).toBe(ITEM.q);
});
