// A raw <input type="password"> (the compat runtime, src/term/jsx/dom.ts) that its page empties, as a form does after a
// save: nothing typed comes back by undo or redo. The page sends no wipe signal here; the field itself notices a ''
// it did not send (src/term/prim/FieldInput.ts).
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { inputHeld, testRender, type TestTerm } from '../prim/testing';
import { FocusRoot } from '../prim';

test('raw password input: the page clears it after a save; undo and redo restore nothing', async () => {
  const got: string[] = [];
  let save: () => void = () => {};
  function Page() {
    const [v, setV] = useState('old1');
    save = () => setV('');
    return <FocusRoot><div><input type="password" value={v} onChange={(e) => { got.push(e.target.value); setV(e.target.value); }} /></div></FocusRoot>;
  }
  // The Kitty keyboard: Ctrl+. (redo) reaches the field only through it.
  const t = await testRender(<Page />, { width: 40, height: 6, kittyKeyboard: true }) as TestTerm;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  t.settle = async () => {
    let last = '';
    for (let same = 0, i = 0; same < 3 && i < 100; i++) {
      await t.renderOnce();
      const f = t.captureCharFrame();
      same = f === last && !inputHeld(t.renderer) ? same + 1 : 0;
      last = f;
      await new Promise((r) => setTimeout(r, 5));
    }
    return last;
  };
  const undo = () => t.mockInput.pressKey('-', { ctrl: true });
  const redo = () => t.mockInput.pressKey('.', { ctrl: true });
  await t.settle();
  // The only field: Tab puts the focus in it.
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.typeText('pw3rd');
  await t.settle();
  expect(got.at(-1)).toBe('old1pw3rd');
  undo();
  await t.settle();
  const undone = got.at(-1)!;
  expect(undone).not.toBe('old1pw3rd');
  // Redo works before the clear.
  redo();
  await t.settle();
  expect(got.at(-1)).toBe('old1pw3rd');
  // Seeded: one step to redo is waiting when the page clears the field (no edit in between).
  undo();
  let f = await t.settle();
  expect(got.at(-1)).toBe(undone);
  expect(f).toContain('•');
  const before = got.length;
  save();
  f = await t.settle();
  expect(f).not.toContain('•');
  redo();
  await t.settle();
  undo();
  await t.settle();
  undo();
  await t.settle();
  redo();
  f = await t.settle();
  expect(got.slice(before).filter((x) => x !== '')).toEqual([]);
  expect(f).not.toContain('•');
  // The field still works.
  await t.mockInput.typeText('n');
  expect(await t.settle()).toContain('•');
  expect(got.at(-1)).toBe('n');
  t.renderer.destroy();
}, 30_000);
