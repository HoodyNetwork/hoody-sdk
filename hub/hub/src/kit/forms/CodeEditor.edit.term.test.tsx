// CodeEditor in the terminal, editable: the code is in a multiline field (it was a one-line hand-off
// that showed neither the code nor its problems, so a script's failed check said nothing and "Write the code myself"
// could never be finished). Typing changes the code, Ctrl+S saves the code shown, the handle's jumpTo puts the caret at
// the start of a line, a problem with a line is a button that does the same; read-only or locked it is never a field.
import { expect, test } from 'bun:test';
import { createRef, useState, type Ref } from 'react';
import { drawTest } from '../../term/prim/testing';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { routed } from '../layouts/termHarness';
import { CodeEditor, type CodeEditorHandle, type CodeProblem } from './CodeEditor';

const CODE = 'a = 1\nb = a\nprint(b)';

function Editable({ seen, problems, onSave, edRef }: { seen: { value: string }; problems?: CodeProblem[]; onSave?: (v: string) => void; edRef?: Ref<CodeEditorHandle> }) {
  const [v, setV] = useState(CODE);
  seen.value = v;
  return <CodeEditor ref={edRef} value={v} onChange={setV} label="Script" problems={problems} onSave={onSave} rows={6} />;
}

test('editable: the code shows in a field named by the label, its problems under it, and the keys are said', async () => {
  const seen = { value: '' };
  const t = await drawTest(routed(() => <Editable seen={seen} problems={[{ line: 2, message: 'Unused.' }, { line: null, message: 'Lint off.' }, { line: 99, message: 'Past the end.' }]} onSave={() => {}} />).element, { width: 80, height: 24 });
  try {
    const f = await t.settle();
    expect(f).toContain('Script');
    expect(f).toContain('a = 1');
    expect(f).toContain('print(b)');
    expect(f).not.toContain("needs the web Hub's editor");
    expect(f).toContain('✗ Line 2: Unused.');
    expect(f).toContain('✗ Lint off.');
    // A line past the text is a problem with no line (the web's rule).
    expect(f).toContain('✗ Past the end.');
    expect(f).toContain('Ctrl+S save');
  } finally { t.renderer.destroy(); }
});

test('editable: jumpTo puts the caret at the start of that line; typing there changes the code', async () => {
  const seen = { value: '' };
  const ref = createRef<CodeEditorHandle>();
  const t = await drawTest(routed(() => <Editable seen={seen} edRef={ref} />).element, { width: 80, height: 24 });
  try {
    await t.settle();
    ref.current!.jumpTo(3);
    await t.settle();
    expect(focusedNode(semanticsOf(t.renderer))?.name).toBe('Script');
    await t.mockInput.typeText('#');
    await t.settle();
    expect(seen.value).toBe('a = 1\nb = a\n#print(b)');
  } finally { t.renderer.destroy(); }
});

test('editable: a problem with a line is a button that moves the keyboard to that line', async () => {
  const seen = { value: '' };
  const t = await drawTest(routed(() => <Editable seen={seen} problems={[{ line: 2, message: 'Unused.' }]} />).element, { width: 80, height: 24 });
  try {
    await t.settle();
    for (let i = 0; i < 6 && focusedNode(semanticsOf(t.renderer))?.name !== 'Line 2: Unused.'; i++) { t.mockInput.pressTab(); await t.settle(); }
    expect(focusedNode(semanticsOf(t.renderer))?.name).toBe('Line 2: Unused.');
    t.mockInput.pressEnter();
    await t.settle();
    expect(focusedNode(semanticsOf(t.renderer))?.name).toBe('Script');
    await t.mockInput.typeText('#');
    await t.settle();
    expect(seen.value).toBe('a = 1\n#b = a\nprint(b)');
  } finally { t.renderer.destroy(); }
});

test('editable: Ctrl+S calls onSave with the code shown; without onSave the key line does not offer it', async () => {
  const seen = { value: '' };
  const saved: string[] = [];
  const ref = createRef<CodeEditorHandle>();
  const t = await drawTest(routed(() => <Editable seen={seen} edRef={ref} onSave={(v) => saved.push(v)} />).element, { width: 80, height: 24 });
  try {
    await t.settle();
    ref.current!.focus();
    await t.settle();
    t.mockInput.pressKey('s', { ctrl: true });
    await t.settle();
    expect(saved).toEqual([CODE]);
    expect(seen.value).toBe(CODE);
  } finally { t.renderer.destroy(); }
  const t2 = await drawTest(routed(() => <Editable seen={seen} />).element, { width: 80, height: 24 });
  try {
    const f = await t2.settle();
    expect(f).toContain('Tab next control');
    expect(f).not.toContain('Ctrl+S');
  } finally { t2.renderer.destroy(); }
});

test('control characters in the code are never drawn raw, and such code is not editable here', async () => {
  const t = await drawTest(routed(() => <CodeEditor value={'a = 1\nb = a\x1b]52;c;eA==\x07\nprint(b)'} onChange={() => {}} label="Script" />).element, { width: 80, height: 24 });
  try {
    const f = await t.settle();
    expect(f).toContain('print(b)');
    expect(f).not.toContain('\x1b');
    expect(f).not.toContain('\x07');
    expect(f.replace(/\s+/g, ' ')).toContain('Edit it in the web Hub.');
  } finally { t.renderer.destroy(); }
});

// The field holds what the engine's text filter lets through (term/prim/safe.ts: a TAB becomes one
// space, CR LF becomes LF), so editing tab-indented or CR LF code here and saving would rewrite bytes the person never
// touched. Such code is shown read-only with the way to the web; nothing typed or Ctrl+S here changes or saves it.
test('code with a tab or CR LF is never a field: typing and Ctrl+S change and save nothing; read-only with the way to the web', async () => {
  const RAW = 'if x:\n\tprint(x)\r\n';
  const seen = { value: RAW };
  const saved: string[] = [];
  const ref = createRef<CodeEditorHandle>();
  function Raw() {
    const [v, setV] = useState(RAW);
    seen.value = v;
    return <CodeEditor ref={ref} value={v} onChange={setV} label="Script" onSave={(x) => saved.push(x)} rows={6} />;
  }
  const t = await drawTest(routed(() => <Raw />).element, { width: 80, height: 24 });
  try {
    await t.settle();
    ref.current!.focus();
    ref.current!.jumpTo(2);
    await t.settle();
    await t.mockInput.typeText('#');
    t.mockInput.pressKey('s', { ctrl: true });
    const f = await t.settle();
    expect(focusedNode(semanticsOf(t.renderer))).toBeNull();
    expect(seen.value).toBe(RAW);
    expect(saved).toEqual([]);
    expect(f).toContain('Script (read only)');
    expect(f).toContain('print(x)');
    expect(f.replace(/\s+/g, ' ')).toContain('Edit it in the web Hub.');
  } finally { t.renderer.destroy(); }
});

test('read-only: no field (focus and jumpTo do nothing), the code as numbered lines', async () => {
  const ref = createRef<CodeEditorHandle>();
  const t = await drawTest(routed(() => <CodeEditor ref={ref} value={CODE} onChange={() => { throw new Error('read-only edited'); }} label="Script" readOnly />).element, { width: 80, height: 24 });
  try {
    ref.current!.focus();
    ref.current!.jumpTo(2);
    const f = await t.settle();
    expect(f).toContain('Script (read only)');
    expect(f).toContain(' 2 │ b = a');
    expect(focusedNode(semanticsOf(t.renderer))).toBeNull();
  } finally { t.renderer.destroy(); }
});
