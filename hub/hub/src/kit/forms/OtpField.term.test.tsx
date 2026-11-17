// OtpField.term: the web component's observable behaviours, each held here.
//  - label "Code" (default) and the help line; slots drawn [_] empty, [1] filled
//  - digits fill the next slot; a non-digit changes nothing; onChange(digits) carries digits only
//  - Backspace clears back one slot
//  - a paste with spaces or dashes fills them all, capped at `length`
//  - onComplete(code) once when the last digit arrives, again only after the code changed
//  - errorMessage shows (✗) and the focus comes back to the field
//  - a resetKey change wipes it: onChange('')
//  - otpDigits: digits only, capped
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OtpField, otpDigits } from './OtpField';
import { TextField } from './fields';

function P({ got, done, length, err, reset }: { got: string[]; done: string[]; length?: number; err?: { set?: (e: string | undefined) => void }; reset?: { set?: (k: number) => void } }) {
  const [v, setV] = useState('');
  const [e, setE] = useState<string | undefined>();
  const [k, setK] = useState(1);
  if (err) err.set = setE;
  if (reset) reset.set = setK;
  return (
    <FocusRoot>
      <OtpField value={v} length={length} errorMessage={e} resetKey={k} onChange={(x) => { got.push(x); setV(x); }} onComplete={(c) => done.push(c)} autoFocus />
      <TextField label="Other" value="" onChange={() => {}} />
    </FocusRoot>
  );
}

test('otpDigits', () => {
  expect(otpDigits('12 3-45a67')).toBe('123456');
  expect(otpDigits('9876', 3)).toBe('987');
});

test('slots fill, a letter changes nothing, Backspace clears back', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} done={[]} />, { width: 60, height: 10 });
  let f = t.captureCharFrame();
  expect(f).toContain('Code');
  expect(f).toContain('The 6-digit code from your authenticator app.');
  expect(f).toContain('[_][_][_][_][_][_]');
  await t.mockInput.typeText('1a2');
  f = await t.settle();
  expect(f).toContain('[1][2][_][_][_][_]');
  // The letter reports the unchanged digits, as the web input's input event does.
  expect(got).toEqual(['1', '1', '12']);
  t.mockInput.pressBackspace();
  f = await t.settle();
  expect(f).toContain('[1][_][_]');
  expect(got.at(-1)).toBe('1');
  t.renderer.destroy();
});

test('a paste fills all and completes once', async () => {
  const got: string[] = [];
  const done: string[] = [];
  const t = await drawTest(<P got={got} done={done} />, { width: 60, height: 10 });
  await t.mockInput.pasteBracketedText('123 456 789');
  const f = await t.settle();
  expect(f).toContain('[1][2][3][4][5][6]');
  expect(got).toEqual(['123456']);
  expect(done).toEqual(['123456']);
  await t.mockInput.typeText('7');
  await t.settle();
  expect(done).toEqual(['123456']);
  t.renderer.destroy();
});

test('a new error shows and takes the focus back; resetKey wipes', async () => {
  const got: string[] = [];
  const err: { set?: (e: string | undefined) => void } = {};
  const reset: { set?: (k: number) => void } = {};
  const t = await drawTest(<P got={got} done={[]} length={4} err={err} reset={reset} />, { width: 60, height: 10 });
  await t.mockInput.typeText('12');
  t.mockInput.pressTab();
  await t.settle();
  err.set!('Wrong code.');
  let f = await t.settle();
  expect(f).toContain('✗ Wrong code.');
  await t.mockInput.typeText('3');
  f = await t.settle();
  expect(f).toContain('[1][2][3][_]');
  reset.set!(2);
  f = await t.settle();
  expect(got.at(-1)).toBe('');
  expect(f).toContain('[_][_][_][_]');
  t.renderer.destroy();
});
