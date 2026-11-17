// TextField.term, empty: the web draws an empty field as a box (its extent shows with no value and no placeholder). Here
// an empty, unfocused single-line field with no placeholder fills its room with a faint "_" rule after the gutter, so it
// reads as a field to fill in (in mono too), never as a stray "│" (Referrals "New code"). The fill is
// drawing only: never in the semantics, gone while focused (the caret takes the field), and a placeholder or a value
// draws instead of it.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { semanticsOf, semText } from '../../term/prim/semantics';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { TextField } from './fields';

const W = { width: 90, height: 4 };
const row = (f: string): string => f.split('\n')[0] ?? '';

test('empty, unfocused, no placeholder: the gutter, then a faint "_" rule across the field\'s room', async () => {
  const t = await drawTest(<FocusRoot><TextField aria-label="New code" value="" onChange={() => {}} /></FocusRoot>, W);
  const line = row(t.captureCharFrame());
  expect(line).toMatch(/^│ _{60,}/);
  // Drawing only: the reader hears an empty text box, never underscores.
  expect(semText(semanticsOf(t.renderer))).not.toContain('_');
  t.renderer.destroy();
});

test('a placeholder or a value draws instead of the fill', async () => {
  let t = await drawTest(<FocusRoot><TextField aria-label="x" placeholder="e.g. FRIEND10" value="" onChange={() => {}} /></FocusRoot>, W);
  let line = row(t.captureCharFrame());
  expect(line).toContain('e.g. FRIEND10');
  expect(line).not.toContain('_');
  t.renderer.destroy();
  t = await drawTest(<FocusRoot><TextField aria-label="x" value="ada" onChange={() => {}} /></FocusRoot>, W);
  line = row(t.captureCharFrame());
  expect(line).toMatch(/^│ ada\s*$/);
  t.renderer.destroy();
});

function Typed({ got }: { got: string[] }) {
  const [v, setV] = useState('');
  // A second field, so Tab leaves the first one.
  return (
    <FocusRoot>
      <TextField aria-label="x" value={v} onChange={(x) => { got.push(x); setV(x); }} />
      <TextField aria-label="y" value="z" onChange={() => {}} />
    </FocusRoot>
  );
}

test('focused: the fill goes (the caret holds the field); typing works; leaving empty brings it back', async () => {
  const got: string[] = [];
  const t = await drawTest(<Typed got={got} />, W);
  expect(row(t.captureCharFrame())).toContain('____');
  t.mockInput.pressTab();
  let f = await t.settle();
  expect(row(f)).toMatch(/^┃/);
  expect(row(f)).not.toContain('_');
  await t.mockInput.typeText('ab');
  f = await t.settle();
  expect(got.at(-1)).toBe('ab');
  expect(row(f)).toMatch(/^┃ ab/);
  t.mockInput.pressBackspace();
  t.mockInput.pressBackspace();
  await t.settle();
  t.mockInput.pressTab();
  f = await t.settle();
  expect(got.at(-1)).toBe('');
  expect(row(f)).toMatch(/^│ _{60,}/);
  t.renderer.destroy();
});

test('a password field (drawn field) shows the same fill while empty and unfocused', async () => {
  const t = await drawTest(<FocusRoot><TextField aria-label="Password" type="password" value="" onChange={() => {}} /></FocusRoot>, W);
  expect(row(await t.settle())).toMatch(/^│ _{60,}/);
  t.renderer.destroy();
});

test('the fill is cut at the field\'s edge on purpose: no layout fault (its run is wider than any row)', async () => {
  const t = await drawTest(<FocusRoot><TextField aria-label="Name (optional)" value="" onChange={() => {}} /></FocusRoot>, { width: 55, height: 4 });
  expect(row(t.captureCharFrame())).toMatch(/^│ _{40,}/);
  const cuts = layoutFaults(t.renderer.root as never, { cols: 55, rows: 4 }).filter((x) => x.kind === 'cut');
  expect(cuts).toEqual([]);
  t.renderer.destroy();
});

// On the home page (shot-customize, Address), a focused empty field with a placeholder showed "▌ ▌https://", the
// focused gutter's half block beside the caret cell, read as two carets. Exactly one caret-like mark: the caret cell.
test('focused, empty, with a placeholder: one caret-like mark (the caret), the gutter a plain heavy rule', async () => {
  const t = await drawTest(<FocusRoot><TextField aria-label="Address" placeholder="https://" value="" onChange={() => {}} /></FocusRoot>, W);
  t.mockInput.pressTab();
  const f = await t.settle();
  const line = row(f);
  expect(line).toMatch(/^┃ +https:\/\//);
  expect((line.match(/[▌▐█]/g) ?? []).length).toBe(0);
  t.renderer.destroy();
});
