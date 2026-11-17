// A read-only multiline field (a raw `<textarea readOnly rows>`, a kit TextField `isReadOnly multiline`) drew as ONE
// line: FieldInput sent every read-only field to the one-line drawn field before it looked at `lines`
// (src/term/prim/FieldInput.ts), so Logs Explain showed one cut line of what it sends to the AI helper. Now the
// value's lines fill the rows, the arrows, PageDown, Home and End move them, every edit is refused, a key that cannot
// move it goes on, and a masked field stays one line of bullets. A read-only field is as tall as its text (one row at
// least, `lines` at most), so a one-line locked draft does not push what follows down; an editable one keeps its rows,
// and so does one that is read-only only while a send is out (`keepRows`): it no longer shrinks and grows back.
import { expect, test } from 'bun:test';
import { useState, type ReactElement } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Text, useKeys } from '../prim';
import { FieldInput } from '../prim/FieldInput';
import { getByRole, semanticsOf } from '../prim/semantics';

const rowsOf = (frame: string): string[] => frame.split('\n').map((l) => l.trimEnd());
const textbox = (t: { renderer: unknown }, name: string) => getByRole(semanticsOf(t.renderer as never), 'textbox', { name });

/** Records the keys nothing focused took (as a drawer body or a page scroll gets them). */
function Passed({ seen }: { seen: string[] }) {
  useKeys((k) => { seen.push(k.name); return false; });
  return null;
}

test('read-only, at most 4 rows: one line of the value per row; keys and a paste change nothing; a read-only multiline textbox', async () => {
  const sent: string[] = [];
  const value = 'alpha\nbeta\ngamma';
  const t = await drawTest(
    <FocusRoot><Box dir="row" height={4}><FieldInput value={value} onChange={(v) => sent.push(v)} readOnly lines={4} sem={{ name: 'Sent' }} /></Box></FocusRoot>,
    { width: 24, height: 6 },
  );
  let rows = rowsOf(await t.settle());
  // Before the fix: "alpha" alone on the first row, the rest of the value on no row at all.
  expect(rows[0]).toMatch(/^alpha\s/);
  expect(rows[1]).toMatch(/^beta\s/);
  expect(rows[2]).toMatch(/^gamma\s/);
  // The rail: │ idle, ┃ once the focus is in it.
  expect(rows[0]!.endsWith('│')).toBe(true);
  t.mockInput.pressTab();
  rows = rowsOf(await t.settle());
  expect(textbox(t, 'Sent').states.focused).toBe(true);
  expect(rows[0]!.endsWith('┃')).toBe(true);
  await t.mockInput.typeText('zz');
  t.mockInput.pressBackspace();
  t.mockInput.pressKey('DELETE');
  t.mockInput.pressKey('u', { ctrl: true });
  t.mockInput.pressEnter();
  await t.mockInput.pasteBracketedText('p');
  rows = rowsOf(await t.settle());
  expect(sent).toEqual([]);
  expect(rows.slice(0, 3).map((r) => r.split(/\s+/)[0])).toEqual(['alpha', 'beta', 'gamma']);
  const n = textbox(t, 'Sent');
  expect(n.value).toBe(value);
  expect(n.states.readonly).toBe(true);
  expect(n.states.multiline).toBe(true);
  expect(n.actions).not.toContain('type');
  t.renderer.destroy();
});

test('read-only, 3 rows over 6 lines: Down, PageDown, Home and End move it; ↑ / ↓ mark what lies beyond; at the end a key goes on', async () => {
  const seen: string[] = [];
  const t = await drawTest(
    <FocusRoot><Passed seen={seen} /><Box dir="row" height={3}><FieldInput value={'l1\nl2\nl3\nl4\nl5\nl6'} onChange={() => {}} readOnly lines={3} sem={{ name: 'Sent' }} /></Box></FocusRoot>,
    { width: 20, height: 4 },
  );
  const first = (f: string): string[] => rowsOf(f).slice(0, 3).map((r) => r.split(/\s+/)[0]!);
  const rails = (f: string): string[] => rowsOf(f).slice(0, 3).map((r) => r.slice(-1));
  let f = await t.settle();
  expect(first(f)).toEqual(['l1', 'l2', 'l3']);
  expect(rails(f)).toEqual(['│', '│', '↓']);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(first(f)).toEqual(['l2', 'l3', 'l4']);
  expect(rails(f)).toEqual(['↑', '┃', '↓']);
  t.mockInput.pressKey('\x1b[6~' as never); // PageDown: mockInput has no name for it
  f = await t.settle();
  expect(first(f)).toEqual(['l4', 'l5', 'l6']);
  expect(rails(f)).toEqual(['↑', '┃', '┃']);
  // Taken while they moved it: nothing went on.
  expect(seen.filter((k) => k === 'down' || k === 'pagedown')).toEqual([]);
  // At the end: Down moves nothing and goes on (a drawer or page around it scrolls instead).
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(first(f)).toEqual(['l4', 'l5', 'l6']);
  expect(seen).toContain('down');
  t.mockInput.pressKey('HOME');
  f = await t.settle();
  expect(first(f)).toEqual(['l1', 'l2', 'l3']);
  t.mockInput.pressKey('END');
  f = await t.settle();
  expect(first(f)).toEqual(['l4', 'l5', 'l6']);
  t.renderer.destroy();
});

test('masked and read-only over 4 rows: still one line of bullets; the value is never drawn or in the tree', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="row" height={4}><FieldInput value={'hunter2\nsecond'} onChange={() => {}} readOnly mask lines={4} sem={{ name: 'Key' }} /></Box></FocusRoot>,
    { width: 24, height: 6 },
  );
  const f = await t.settle();
  expect(f).not.toContain('hunter2');
  expect(f).not.toContain('second');
  expect(f).toContain('•');
  const n = textbox(t, 'Key');
  expect(n.value).toBeUndefined();
  expect(n.states.secret).toBe(true);
  t.renderer.destroy();
});

test('read-only is as tall as its text: one line takes one row, a long value at most `lines`, an empty one a row; an editable field keeps its rows', async () => {
  /** The frame of `field` with a line drawn right under it, and the row that line landed on. */
  const below = async (field: ReactElement): Promise<{ frame: string; at: number }> => {
    const t = await drawTest(<FocusRoot><Box dir="column"><Box dir="row">{field}</Box><Text>BELOW</Text></Box></FocusRoot>, { width: 24, height: 8 });
    const frame = await t.settle();
    t.renderer.destroy();
    return { frame, at: rowsOf(frame).findIndex((r) => r.startsWith('BELOW')) };
  };
  // One short line (a locked one-line draft): one row, and what follows sits right under it. Before: 4 rows, 3 blank.
  expect((await below(<FieldInput value="Any news on this?" onChange={() => {}} readOnly lines={4} />)).at).toBe(1);
  expect((await below(<FieldInput value={'one\ntwo'} onChange={() => {}} readOnly lines={4} />)).at).toBe(2);
  // Longer than `lines`: `lines` rows, the rest scrolls (↓ on the last row).
  const long = await below(<FieldInput value={'l1\nl2\nl3\nl4\nl5\nl6'} onChange={() => {}} readOnly lines={4} />);
  expect(long.at).toBe(4);
  expect(rowsOf(long.frame)[3]!.endsWith('↓')).toBe(true);
  // Empty, showing its placeholder: one row.
  expect((await below(<FieldInput value="" placeholder="No reply yet" onChange={() => {}} readOnly lines={4} />)).at).toBe(1);
  // Editable: the same short value keeps its 4 rows to type into.
  expect((await below(<FieldInput value="Any news on this?" onChange={() => {}} lines={4} />)).at).toBe(4);
});

test('read-only only while a send is out (keepRows): the same rows before, during and after, so what follows stays put', async () => {
  type Phase = 'typing' | 'sending' | 'sent';
  let setPhase: (p: Phase) => void = () => {};
  /** A reply box: typed into, read-only while its one-line reply is out, then empty and editable again. */
  function Reply() {
    const [phase, set] = useState<Phase>('typing');
    setPhase = set;
    const sending = phase === 'sending';
    return (
      <Box dir="column">
        <Box dir="row"><FieldInput value={phase === 'sent' ? '' : 'Any news on this?'} onChange={() => {}} readOnly={sending} keepRows={sending} lines={4} sem={{ name: 'Reply' }} /></Box>
        <Text>BELOW</Text>
      </Box>
    );
  }
  const t = await drawTest(<FocusRoot><Reply /></FocusRoot>, { width: 24, height: 8 });
  const at = async (): Promise<number> => rowsOf(await t.settle()).findIndex((r) => r.startsWith('BELOW'));
  expect(await at()).toBe(4);
  setPhase('sending');
  // Before: 1 (the read-only area took its one line), and 4 again once the send was over.
  expect(await at()).toBe(4);
  // Positive controls: it is the read-only area now, showing the text it sends.
  expect(textbox(t, 'Reply').states.readonly).toBe(true);
  expect(textbox(t, 'Reply').value).toBe('Any news on this?');
  setPhase('sent');
  expect(await at()).toBe(4);
  expect(textbox(t, 'Reply').states.readonly === true).toBe(false);
  t.renderer.destroy();
  // A longer text keeps its rows too and still scrolls (↓ on the last row).
  const long = await drawTest(
    <FocusRoot><Box dir="column"><Box dir="row"><FieldInput value={'l1\nl2\nl3\nl4\nl5\nl6'} onChange={() => {}} readOnly keepRows lines={4} /></Box><Text>BELOW</Text></Box></FocusRoot>,
    { width: 24, height: 8 },
  );
  const rows = rowsOf(await long.settle());
  expect(rows.findIndex((r) => r.startsWith('BELOW'))).toBe(4);
  expect(rows[3]!.endsWith('↓')).toBe(true);
  long.renderer.destroy();
});
