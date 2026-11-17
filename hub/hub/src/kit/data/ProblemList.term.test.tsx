// ProblemList in the terminal (ProblemList.term.tsx). ProblemList.scenario.ts holds the press reporting its line, no
// press for a row without a line, and nothing drawn for no problems. These hold what a person reads and does:
//   - each row: the tone's mark (✗ default, ! warn: reads in mono), the line number right-aligned in a column as wide as
//     the longest, the message in its own column (a long one wraps under itself, not under the mark)
//   - Tab reaches the rows that have a line, in order; Enter and Space jump; a row with no line is no stop
//   - the press is named "Line N message"
//   - firstRef.focus() puts the focus on the first row's press
import { afterEach, expect, test } from 'bun:test';
import { createRef } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { semanticsOf, semText } from '../../term/prim/semantics';
import { ProblemList, type Problem } from './ProblemList';

const PROBLEMS: Problem[] = [
  { line: 9, message: 'Unexpected token' },
  { line: null, message: 'The file has no entry point', tone: 'warn' },
  { line: 120, message: 'Expected a closing brace before the end of the file, found the end of input' },
];

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const lines = (f: string) => f.split('\n');
const lineWith = (f: string, s: string) => lines(f).find((l) => l.includes(s)) ?? '';

// Catches the mark per tone (lines 24, 29), the number column (lines 20, 30: padStart to the widest) and the message
// column (lines 31-32: its own column, so a wrapped message continues under its first word).
test('marks per tone, numbers right-aligned, messages in one column; a long message wraps under itself', async () => {
  t = await drawTest(<FocusRoot><ProblemList label="Problems" problems={PROBLEMS} /></FocusRoot>, { width: 44, height: 10 });
  const f = await t.settle();
  const a = lineWith(f, 'Unexpected token');
  const b = lineWith(f, 'no entry point');
  const c = lineWith(f, 'Expected a closing');
  expect(a).toMatch(/^✗ +9 Unexpected token/);
  expect(b).toMatch(/^! +The file has no entry point/);
  expect(c).toMatch(/^✗ 120 Expected a closing/);
  const msg = c.indexOf('Expected');
  expect(a.indexOf('Unexpected')).toBe(msg);
  expect(b.indexOf('The file')).toBe(msg);
  expect(a.indexOf('9')).toBe(c.indexOf('120') + 2);
  expect(f).toContain('input');
  const next = lines(f)[lines(f).indexOf(c) + 1]!;
  expect(next.search(/\S/)).toBe(msg);
});

// Catches the press only for a row with a line (line 38), onJump(line) (line 39) and Space as a press.
test('Tab reaches the rows with a line, skipping the one without; Enter and Space jump to their line', async () => {
  const jumps: number[] = [];
  t = await drawTest(<FocusRoot><ProblemList label="Problems" problems={PROBLEMS} onJump={(n) => jumps.push(n)} /></FocusRoot>, { width: 80, height: 8 });
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(jumps).toEqual([9]);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressKey(' ');
  await t.settle();
  expect(jumps).toEqual([9, 120]);
  const tree = semText(semanticsOf(t.renderer as never));
  expect(tree).toContain('button "Line 120 Expected a closing brace');
  expect(tree).not.toMatch(/button "[^"]*no entry point/);
});

// Catches firstRef's handle (line 18) bound to the first row's press (line 39, `handle={i === 0 ? first : undefined}`).
test('firstRef.focus() puts the focus on the first row: Enter then jumps to its line', async () => {
  const jumps: number[] = [];
  const ref = createRef<HTMLLIElement>();
  t = await drawTest(<FocusRoot><ProblemList label="Problems" problems={PROBLEMS} onJump={(n) => jumps.push(n)} firstRef={ref} /></FocusRoot>, { width: 80, height: 8 });
  await t.settle();
  ref.current!.focus();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(jumps).toEqual([9]);
});
