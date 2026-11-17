// CountBadge in the terminal (CountBadge.term.tsx): the count in round brackets after its label, inside its text run.
// CountBadge.scenario.ts holds what both platforms share (a count is text, the cap, the lower bound); these hold the
// terminal's own:
//   - countText: the web's counting rule, case for case (the twin repeats it, it does not import it)
//   - drawn in round brackets inside the text run it sits in ("Inbox (3)" on one line), never the uncapped number
//   - an accent count is bold and coloured apart from a neutral one, which is not bold
//   - `label` names the drawn count; `hidden` leaves no node for it, its words neither
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text, setColourTier } from '../../term/prim';
import { TextAttributes } from '../../term/prim/otui';
import { queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { CountBadge, countText } from './CountBadge';

// The web's countText cases (CountBadge.test.tsx), so the two rules stay one.
test('countText: whole, never negative, capped with a plus, a lower bound with a plus (the web\'s cases)', () => {
  const cases: Array<[number, number, boolean, string]> = [
    [3, 99, false, '3'], [3.9, 99, false, '3'], [-2, 99, false, '0'],
    [99, 99, false, '99'], [100, 99, false, '99+'], [12, 9, false, '9+'],
    [5, 99, true, '5+'], [0, 99, true, '0+'], [150, 99, true, '99+'],
  ];
  for (const [count, max, atLeast, want] of cases) expect(countText(count, max, atLeast)).toBe(want);
});

// Catches the bracketed form and its place in the run (line 20, and hxInline at line 24).
test('drawn in round brackets inside its text run: "Inbox (3)" on one line; 250 is "(99+)", never 250', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="column"><Text>Inbox <CountBadge count={3} /></Text><Text>All <CountBadge count={250} /></Text><Text>Some <CountBadge count={5} atLeast /></Text></Box></FocusRoot>,
    { width: 30, height: 4 },
  );
  const f = await t.settle();
  expect(f).toContain('Inbox (3)');
  expect(f).toContain('All (99+)');
  expect(f).toContain('Some (5+)');
  expect(f).not.toContain('250');
  t.renderer.destroy();
});

// Catches the tone (line 20: accent = bold in the accent colour; neutral = muted, not bold): never colour alone.
test('an accent count is bold and coloured apart; a neutral one is not bold', async () => {
  setColourTier('truecolor');
  const t = await drawTest(
    <FocusRoot><Box dir="row" gap={1}><CountBadge count={1} tone="accent" /><CountBadge count={2} /></Box></FocusRoot>,
    { width: 20, height: 1 },
  );
  await t.settle();
  const spans = t.captureSpans().lines.flatMap((l) => l.spans);
  const accent = spans.find((s) => s.text.includes('(1)'))!;
  const neutral = spans.find((s) => s.text.includes('(2)'))!;
  expect(accent.attributes & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
  expect(neutral.attributes & TextAttributes.BOLD).toBe(0);
  expect(accent.fg.toInts().join()).not.toBe(neutral.fg.toInts().join());
  t.renderer.destroy();
});

// Catches the names (line 19): `label` names the drawn count; `hidden` keeps it, and its words, out of the tree.
test('label names the drawn count; hidden leaves no node for it, its words neither', async () => {
  let t = await drawTest(<FocusRoot><CountBadge count={120} label="120 unread" /></FocusRoot>, { width: 20, height: 1 });
  let f = await t.settle();
  expect(f).toContain('(99+)');
  expect(f).not.toContain('120');
  expect(queryAllByRole(semanticsOf(t.renderer as never), 'img').map((n) => n.name)).toEqual(['120 unread']);
  t.renderer.destroy();
  t = await drawTest(<FocusRoot><CountBadge count={4} atLeast hidden label="at least 4 waiting" /></FocusRoot>, { width: 20, height: 1 });
  f = await t.settle();
  expect(f).toContain('(4+)');
  const tree = JSON.stringify(semanticsOf(t.renderer as never));
  expect(tree).not.toContain('at least 4 waiting');
  expect(tree).not.toContain('4+');
  t.renderer.destroy();
});
