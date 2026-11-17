// Compose grows with a value the CALLER sets (a picked suggestion, a restored draft), not only with typed text.
import { expect, test } from 'bun:test';
import { act } from 'react';
import { useState } from 'react';
import { drawTest } from './testing';
import { Box, FocusRoot } from '.';
import { Compose } from './Compose';

const LONG = 'How much disk space and memory is free on this computer? Flag anything close to full.';
let set: (v: string) => void = () => {};
function Host({ start }: { start: string }) {
  const [v, setV] = useState(start);
  set = setV;
  return <FocusRoot><Box dir="column" width={40}><Box dir="row" border padX={1} shrink={0}><Compose value={v} onChange={setV} minLines={1} maxLines={8} placeholder="Tell atlas what to do…" /></Box></Box></FocusRoot>;
}
const boxRows = (f: string): string[] => { const L = f.split('\n'); const a = L.findIndex((l) => l.includes('┌')); const b = L.findIndex((l) => l.includes('└')); return L.slice(a + 1, b).map((l) => l.replace(/[│]/g, '').trim()); };

test('a long value set by the caller while the editor is not focused shows every wrapped line', async () => {
  const t = await drawTest(<Host start="" />, { width: 40, height: 12 });
  expect(boxRows(await t.settle())).toEqual(['Tell atlas what to do…']);
  set(LONG);
  const rows = boxRows(await t.settle());
  expect(rows.join(' ')).toBe(LONG);
  expect(rows.length).toBe(3);
  set('');
  expect(boxRows(await t.settle())).toHaveLength(1);
  t.renderer.destroy();
}, 60_000);

test('a long value at mount shows every wrapped line', async () => {
  const t = await drawTest(<Host start={LONG} />, { width: 40, height: 12 });
  expect(boxRows(await t.settle()).join(' ')).toBe(LONG);
  t.renderer.destroy();
}, 60_000);

test('a draft held at mount is continued at its end', async () => {
  let now = '';
  function Kept() { const [v, setV] = useState('next'); now = v; return <FocusRoot><Box dir="column" width={40}><Compose value={v} onChange={setV} autoFocus /></Box></FocusRoot>; }
  const t = await drawTest(<Kept />, { width: 40, height: 6 });
  await t.settle();
  await act(async () => { await t.mockInput.typeText('ww'); });
  await t.settle();
  expect(now).toBe('nextww');
  t.renderer.destroy();
}, 60_000);
