// OtpField's inputRef in the terminal (OtpField.term.tsx line 77): a page moves the focus to the code field through it
// (a sign-in step that asks for the code after another field). OtpField.scenario.ts says "covered by the term unit test
// (focus handle)"; no terminal test used inputRef before this one.
// Fails if the handle's focus() does not focus the field: the digits then go to the other field.
import { afterEach, expect, test } from 'bun:test';
import { createRef, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OtpField } from './OtpField';
import { TextField } from './fields';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

test('inputRef.focus() moves the focus into the code: the digits fill its slots, not the field that had the focus', async () => {
  const ref = createRef<HTMLInputElement>();
  const codes: string[] = [];
  const other: string[] = [];
  function P() {
    const [v, setV] = useState('');
    const [o, setO] = useState('');
    return (
      <FocusRoot>
        <TextField label="Email" value={o} onChange={(x) => { other.push(x); setO(x); }} autoFocus />
        <OtpField value={v} onChange={(x) => { codes.push(x); setV(x); }} inputRef={ref} />
      </FocusRoot>
    );
  }
  t = await drawTest(<P />, { width: 60, height: 10 });
  await t.settle();
  ref.current!.focus();
  await t.settle();
  await t.mockInput.typeText('42');
  const f = await t.settle();
  expect(f).toContain('[4][2][_][_][_][_]');
  expect(codes.at(-1)).toBe('42');
  expect(other).toEqual([]);
});
