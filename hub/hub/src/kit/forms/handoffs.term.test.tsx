// Hand-offs: the web components with no terminal form, each held here.
// FileButton: a one-line hand-off ("⇗ <why it needs the web Hub>" and its copy-link key); onFiles never called.
// DatePickButton: a "Pick a date" button (web name, disabled state); pressing it opens a one-line hand-off for the
//   calendar; onChange never called.
// CodeEditor read-only: the code as numbered plain lines, problem lines marked ✗, problems listed; the handle's find()
//   counts matches; control characters in the code are never drawn raw. (Editable is a field: CodeEditor.edit.term.test.tsx.)
import { expect, test } from 'bun:test';
import { createRef } from 'react';
import { drawTest } from '../../term/prim/testing';
import { routed } from '../layouts/termHarness';
import { FocusRoot } from '../../term/prim';
import { FileButton } from '../controls/FileButton';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { DatePickButton } from './DatePickButton';

test('FileButton and DatePickButton hand off in one line', async () => {
  const calls: unknown[] = [];
  const t = await drawTest(routed(() =>
    <FocusRoot>
      <FileButton label="Upload key" onFiles={(f) => calls.push(f)} />
      <DatePickButton value="2026-11-11" onChange={(d) => calls.push(d)} />
    </FocusRoot>).element, { width: 100, height: 10 });
  let f = await t.settle();
  expect(f).toContain('⇗ Choosing files from this computer needs the web Hub.');
  expect(f).toContain('Pick a date');
  expect(f).not.toContain('pick it from the calendar on the web');
  // The calendar button keeps its web name; pressing it opens the hand-off (it is the last Tab stop).
  t.mockInput.pressTab({ shift: true });
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain('pick it from the calendar on the web');
  expect(f).toContain('[c Copy link]');
  expect(calls).toEqual([]);
  t.renderer.destroy();
});

test('CodeEditor: read-only shows numbered lines and problems', async () => {
  const ref = createRef<CodeEditorHandle>();
  const code = 'a = 1\nb = a\x1b]52;c;eA==\x07\nprint(b)';
  const t = await drawTest(routed(() =>
    <FocusRoot>
      <CodeEditor ref={ref} value={code} onChange={() => {}} readOnly problems={[{ line: 2, message: 'Unused.' }, { line: null, message: 'Lint off.' }]} />
    </FocusRoot>).element, { width: 100, height: 14 });
  const f = await t.settle();
  expect(f).toContain(' 1 │ a = 1');
  expect(f).toContain('✗2 │ b = a');
  expect(f).toContain(' 3 │ print(b)');
  expect(f).toContain('✗ Line 2: Unused.');
  expect(f).toContain('✗ Lint off.');
  expect(f).not.toContain('\x1b');
  expect(ref.current!.find('b')).toBe(2);
  t.renderer.destroy();
});
