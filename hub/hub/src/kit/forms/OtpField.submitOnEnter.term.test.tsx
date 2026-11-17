// OtpField.term `submitOnEnter`: false while its form cannot send yet. Enter is taken and does nothing: the form is not
// submitted and the typed code stays, as the web field stops its form's implicit submission. Read from the render: once
// it turns true, Enter submits the form. Default (true): Enter submits the form once and the code is wiped after it.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OtpField } from './OtpField';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

/** A raw form with no submit button around the field (Enter in a one-field form submits it, as in a browser).
 *  `open.set` changes submitOnEnter after render; `submits` undefined = the prop is not passed (its default). */
function F({ submits, got, sent, open }: { submits?: boolean; got: string[]; sent: string[]; open?: { set?: (v: boolean) => void } }) {
  const [v, setV] = useState('');
  const [on, setOn] = useState(submits);
  if (open) open.set = setOn;
  return (
    <FocusRoot>
      <form onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); sent.push('submit'); }}>
        <OtpField value={v} onChange={(x) => { got.push(x); setV(x); }} autoFocus {...(on === undefined ? {} : { submitOnEnter: on })} />
      </form>
    </FocusRoot>
  );
}

/** Enter, then the wipe's own task (a 0 ms timer) and a frame. */
async function enter(): Promise<string> {
  t!.mockInput.pressEnter();
  await t!.settle();
  await new Promise((r) => setTimeout(r, 30));
  return t!.settle();
}

test('default: Enter submits the form once and the code is wiped after it (control)', async () => {
  const got: string[] = [];
  const sent: string[] = [];
  t = await drawTest(<F got={got} sent={sent} />, { width: 60, height: 10 });
  await t.mockInput.typeText('123456');
  expect(await t.settle()).toContain('[1][2][3][4][5][6]');
  const f = await enter();
  expect(sent).toEqual(['submit']);
  expect(got.at(-1)).toBe('');
  expect(f).toContain('[_][_][_][_][_][_]');
});

test('submitOnEnter false: Enter submits nothing and the code stays; true again: Enter submits', async () => {
  const got: string[] = [];
  const sent: string[] = [];
  const open: { set?: (v: boolean) => void } = {};
  t = await drawTest(<F submits={false} got={got} sent={sent} open={open} />, { width: 60, height: 10 });
  await t.mockInput.typeText('123456');
  expect(await t.settle()).toContain('[1][2][3][4][5][6]');
  let f = await enter();
  // A field that ignored the prop would submit the form and wipe the code.
  expect(sent).toEqual([]);
  expect(got.at(-1)).toBe('123456');
  expect(f).toContain('[1][2][3][4][5][6]');
  // The form can send now: the same field, the same code, Enter submits it.
  open.set!(true);
  await t.settle();
  f = await enter();
  expect(sent).toEqual(['submit']);
  expect(got.at(-1)).toBe('');
  expect(f).toContain('[_][_][_][_][_][_]');
});
