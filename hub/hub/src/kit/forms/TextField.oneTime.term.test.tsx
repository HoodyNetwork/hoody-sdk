// TextField.term, a one-time code typed as text (autoComplete="one-time-code": the account's "6-digit code or backup
// code" in the Turn off and Stop asking drawers). It is a credential (term/docs/forms.md, secrets rules 2 and 3), so it
// is secret entry as a type="password" TextField is: masked as typed (one bullet per character), the semantics tree
// says only that something is typed, and the page still gets the value it sends. A plain-text field
// would let the frame draw the code (`zq7x-41mv`) and the tree carry it as the textbox's value (`="zq7x-41mv"`).
// The control: an ordinary field still draws its value and keeps it in the tree.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { semanticsOf, semJson, semText } from '../../term/prim/semantics';
import { TextField } from './fields';

const W = { width: 70, height: 6 };
const LABEL = '6-digit code or backup code';
// Made up (not a fixture code): any text, nothing checks it here.
const CODE = 'zq7x-41mv';

function Field({ auto, got }: { auto?: string; got: string[] }) {
  const [v, setV] = useState('');
  return (
    <FocusRoot>
      <TextField label={LABEL} autoComplete={auto} inputMode="text" maxLength={32} mono value={v} onChange={(x) => { got.push(x); setV(x); }} />
    </FocusRoot>
  );
}

async function typed(auto: string | undefined) {
  const got: string[] = [];
  const t = await drawTest(<Field auto={auto} got={got} />, W);
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.typeText(CODE);
  const frame = await t.settle();
  const tree = semanticsOf(t.renderer);
  return { t, got, frame, text: semText(tree), json: JSON.stringify(semJson(tree)) };
}

test('one-time code: masked as typed, only "typed" in the tree, the value reaches the page', async () => {
  const { t, got, frame, text, json } = await typed('one-time-code');
  // Positive controls: every character reached the field and the page, and the tree holds the field.
  expect(got.at(-1)).toBe(CODE);
  expect(frame).toContain('•'.repeat(CODE.length));
  expect(text).toMatch(new RegExp(`textbox "${LABEL}" .*=<secret>`));
  // The code itself: not drawn, not in the tree in either form.
  expect(frame).not.toContain(CODE);
  expect(text).not.toContain(CODE);
  expect(json).not.toContain(CODE);
  t.renderer.destroy();
});

test('control: an ordinary field draws its value and keeps it in the tree', async () => {
  const { t, got, frame, text } = await typed(undefined);
  expect(got.at(-1)).toBe(CODE);
  expect(frame).toContain(CODE);
  expect(frame).not.toContain('•');
  expect(text).toContain(`="${CODE}"`);
  expect(text).not.toContain('=<secret>');
  t.renderer.destroy();
});
