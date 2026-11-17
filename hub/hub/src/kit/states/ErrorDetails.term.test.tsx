// ErrorDetails in the terminal (ErrorDetails.term.tsx). ErrorDetails.scenario.ts holds the expanded state, the button
// mode's dialog opening and Escape, and nothing drawn for no error. These hold what a person reads and copies:
//   - folded, only "▸ Details"; Enter unfolds the labelled lines ("▾ Details"), values in one column; Enter folds again
//   - the copy line: c (bare) or Enter sends exactly the lines, "Label: value" one a line (errorText); its label answers
//   - button mode: "Details" opens "Error details" with the same lines on Close; Close closes, the focus is back on
//     Details (Enter opens it again)
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { copiesOf, drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ErrorDetails } from './ErrorDetails';

const ERR = { status: 400, traceId: '0123456789abcdef' };

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: ReactNode, width = 70, height = 22): Promise<string> => {
  t = await drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width, height });
  return t.settle();
};
const step = async (fn: () => void): Promise<string> => { fn(); return t!.settle(); };
/** The drawn line holding `label` and a space (each label is on one line only). */
const lineOf = (f: string, label: string): string => f.split('\n').find((l) => l.includes(label + ' ')) ?? '';
/** That line from its label on, without a frame edge at its end. */
const row = (f: string, label: string): string => {
  const line = lineOf(f, label);
  return line.slice(Math.max(0, line.indexOf(label))).replace(/\s*[│║┃]?\s*$/, '');
};
/** The column where `value` starts on the line of `label`. */
const col = (f: string, label: string, value: string): number => lineOf(f, label).indexOf(value);

// Catches the toggle (lines 59-62: the ▸/▾ mark and `open &&`) and the label column (lines 27, 32: every label as wide
// as the longest, so the values line up).
test('folded: only "▸ Details"; Enter unfolds the lines with their values in one column; Enter folds them again', async () => {
  let f = await draw(<ErrorDetails error={ERR} />);
  expect(f).toContain('▸ Details');
  expect(f).not.toContain('Status');
  await step(() => t!.mockInput.pressTab());
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain('▾ Details');
  expect(row(f, 'Result')).toMatch(/^Result +Failed$/);
  expect(row(f, 'Status')).toMatch(/^Status +400$/);
  expect(row(f, 'Code')).toMatch(/^Code +none$/);
  expect(row(f, 'Trace id')).toMatch(/^Trace id +0123456789abcdef$/);
  const at = col(f, 'Trace id', '0123456789abcdef');
  expect(at).toBeGreaterThan(0);
  expect(col(f, 'Result', 'Failed')).toBe(at);
  expect(col(f, 'Status', '400')).toBe(at);
  expect(f).toContain('[c Copy details for support]');
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain('▸ Details');
  expect(f).not.toContain('Status');
  expect(f).not.toContain('Copy details');
});

// Catches the copy line's press and its bare-c key (lines 36-37: errorText, never with Ctrl) and its answer (line 40).
test('the copy line: c and Enter copy exactly the shown lines; Ctrl+C copies nothing; the label answers', async () => {
  await draw(<ErrorDetails error={ERR} />);
  const copied = copiesOf(t!.renderer);
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressEnter()); // unfold
  await step(() => t!.mockInput.pressTab()); // the copy line
  await step(() => t!.mockInput.pressKey('c', { ctrl: true }));
  expect(copied).toEqual([]);
  const f = await step(() => t!.mockInput.pressKey('c'));
  expect(copied).toHaveLength(1);
  const lines = copied[0]!.split('\n');
  expect(lines).toHaveLength(7);
  expect(lines.slice(0, 5)).toEqual(['Result: Failed', 'Status: 400', 'Code: none', 'Trace id: 0123456789abcdef', 'Request: none']);
  expect(lines[5]).toMatch(/^Time: \d{4}-\d\d-\d\dT\d\d:\d\d/);
  expect(lines[6]).toMatch(/^Page: /);
  // The headless terminal may or may not take the copy; either way the line says what happened, not its offer.
  expect(f).toMatch(/\[✓ Copied\]|\[! Copy failed\]/);
  expect(f).not.toContain('[c Copy details for support]');
  await step(() => t!.mockInput.pressEnter());
  expect(copied).toHaveLength(2);
  expect(copied[1]).toBe(copied[0]);
});

// Catches button mode (lines 46-55): the TextButton opens the Dialog with the same body, it opens on Close
// (initialFocus "cancel"), and closing hands the focus back to Details.
test('button mode: Details opens "Error details" with the lines, on Close; Close closes; Enter opens it again', async () => {
  let f = await draw(<ErrorDetails error={ERR} mode="button" />);
  expect(f).toContain('Details');
  expect(f).not.toContain('Error details');
  expect(f).not.toContain('Status');
  await step(() => t!.mockInput.pressTab());
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain('Error details');
  expect(row(f, 'Status')).toMatch(/^Status +400/);
  expect(f).toContain('[c Copy details for support]');
  expect(f).toContain('[Close]');
  f = await step(() => t!.mockInput.pressEnter()); // on Close
  expect(f).not.toContain('Error details');
  expect(f).not.toContain('Status');
  f = await step(() => t!.mockInput.pressEnter()); // the focus is back on Details
  expect(f).toContain('Error details');
});
