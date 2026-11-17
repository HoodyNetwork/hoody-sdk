// RadioGroup `reveal` in a terminal: the picked option's own fields are drawn under it, as on the web
// (RadioGroup.tsx draws `o.reveal` while `value === o.value`). The terminal list drew only the radios, so every caller
// that puts its fields in a reveal had nothing to type in: the New VM drawer's image, template, copy and file pickers,
// the computer's exit IP proxy and "another computer" fields, Permissions' "Only these IPs" list.
//  1. The picked option's fields are drawn right under its radio, indented under its label; another option's are not.
//  2. Picking another option (arrow keys, as a parent that follows onChange does) swaps the fields.
//  3. The fields are their own Tab stops after the group, and keys typed there stay there: the group's arrows never
//     change the pick while a revealed field has the focus.
//  4. A controlled group whose parent does not follow onChange keeps the parent's option's fields (the web reads value).
//  5. Horizontal rows and cards draw the fields after the whole group.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { focusedNode, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { RadioGroup } from './more';
import { TextField } from './fields';
import type { Option } from './more.pure';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const boxes = (name: string) => queryAllByRole(tree(), 'textbox', { name });
const lines = (f: string): string[] => f.split('\n').map((l) => l.trimEnd());
const rowOf = (f: string, text: string): number => lines(f).findIndex((l) => l.includes(text));

type V = 'proxy' | 'computer' | 'off';
function Exit({ typed, got, follow = true, orientation, variant }: { typed: string[]; got: V[]; follow?: boolean; orientation?: 'horizontal'; variant?: 'cards' }) {
  const [v, setV] = useState<V>('proxy');
  const [host, setHost] = useState('');
  const opts: Option<V>[] = [
    { value: 'proxy', label: 'Your own proxy', reveal: <TextField label="Proxy host" value={host} onChange={(x) => { typed.push(x); setHost(x); }} /> },
    { value: 'computer', label: 'Another computer', reveal: <TextField label="Computer name" value="" onChange={() => {}} /> },
    { value: 'off', label: 'No exit' },
  ];
  return (
    <FocusRoot>
      <RadioGroup<V> label="Exit" options={opts} value={v} {...(orientation ? { orientation } : {})} {...(variant ? { variant } : {})}
        onChange={(x) => { got.push(x); if (follow) setV(x); }} />
      <TextField label="After" value="" onChange={() => {}} />
    </FocusRoot>
  );
}

test('the picked option\'s fields are drawn under its radio, indented under its label; the others\' are not', async () => {
  t = await drawTest(<Exit typed={[]} got={[]} />, { width: 60, height: 20 });
  const f = await t.settle();
  expect(boxes('Proxy host').length, f).toBe(1);
  expect(boxes('Computer name').length).toBe(0);
  const pick = rowOf(f, '(•) Your own proxy');
  const field = rowOf(f, 'Proxy host');
  const next = rowOf(f, '( ) Another computer');
  expect(pick).toBeGreaterThanOrEqual(0);
  expect(field).toBeGreaterThan(pick);
  expect(next).toBeGreaterThan(field);
  // Indented under the label, not under the mark.
  expect(lines(f)[field]!.indexOf('Proxy host')).toBeGreaterThanOrEqual(lines(f)[pick]!.indexOf('Your own proxy'));
});

test('picking another option swaps the fields; an option with none shows none', async () => {
  const got: V[] = [];
  t = await drawTest(<Exit typed={[]} got={got} />, { width: 60, height: 20 });
  t.mockInput.pressTab();
  t.mockInput.pressArrow('down');
  let f = await t.settle();
  expect(got).toEqual(['computer']);
  expect(boxes('Computer name').length, f).toBe(1);
  expect(boxes('Proxy host').length).toBe(0);
  expect(rowOf(f, 'Computer name')).toBeGreaterThan(rowOf(f, '(•) Another computer'));
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(got).toEqual(['computer', 'off']);
  expect(boxes('Computer name').length, f).toBe(0);
  expect(boxes('Proxy host').length).toBe(0);
});

test('a revealed field is the next Tab stop after the group, takes the typing, and its arrows never move the pick', async () => {
  const typed: string[] = [];
  const got: V[] = [];
  t = await drawTest(<Exit typed={typed} got={got} />, { width: 60, height: 20 });
  t.mockInput.pressTab();
  await t.settle();
  expect(focusedNode(tree())?.role).toBe('radio');
  t.mockInput.pressTab();
  await t.settle();
  expect(focusedNode(tree())?.name).toBe('Proxy host');
  await t.mockInput.typeText('px');
  t.mockInput.pressArrow('down');
  t.mockInput.pressArrow('up');
  const f = await t.settle();
  expect(typed.at(-1)).toBe('px');
  expect(got).toEqual([]);
  expect(f).toContain('(•) Your own proxy');
  expect(focusedNode(tree())?.name).toBe('Proxy host');
  // Then on to what follows the group.
  t.mockInput.pressTab();
  await t.settle();
  expect(focusedNode(tree())?.name).toBe('After');
});

test('controlled without a parent update: the parent\'s option keeps its fields', async () => {
  const got: V[] = [];
  t = await drawTest(<Exit typed={[]} got={got} follow={false} />, { width: 60, height: 20 });
  t.mockInput.pressTab();
  t.mockInput.pressArrow('down');
  const f = await t.settle();
  expect(got).toEqual(['computer']);
  expect(boxes('Proxy host').length, f).toBe(1);
  expect(boxes('Computer name').length).toBe(0);
});

for (const shape of [{ orientation: 'horizontal' as const }, { variant: 'cards' as const }]) {
  test(`${Object.values(shape)[0]}: the fields are drawn after the whole group`, async () => {
    t = await drawTest(<Exit typed={[]} got={[]} {...shape} />, { width: 100, height: 24 });
    const f = await t.settle();
    expect(boxes('Proxy host').length, f).toBe(1);
    const last = Math.max(rowOf(f, 'Your own proxy'), rowOf(f, 'Another computer'), rowOf(f, 'No exit'));
    expect(rowOf(f, 'Proxy host')).toBeGreaterThan(last);
  });
}
