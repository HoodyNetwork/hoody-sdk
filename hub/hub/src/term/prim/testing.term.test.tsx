// drawTest().settle(): a key still in the renderer's input parser is work under way.
//
// A lone ESC waits in the parser for its timeout (20 ms) before it is the Escape key. settle() used to return after
// three still frames 5 ms apart, about the same 20 ms: Escape arrived as settle() returned, the state changed and
// nothing drew it, so the caller read the frame from before the key (Composer.term.test.tsx "Esc closes the row" was
// red or green by render speed).
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, inputHeld } from './testing';
import { FocusRoot, Text, useKeys } from '.';

function Row() {
  const [open, setOpen] = useState(true);
  useKeys((k) => { if (k.name === 'escape') { setOpen(false); return true; } return false; });
  return <Text>{open ? 'row open' : 'row closed'}</Text>;
}

test('settle() after a lone Esc: the key is handled and its frame drawn, no sleep needed', async () => {
  // Several presses: one run of the old settle() could pass by luck (a slow frame), ten in a row could not.
  for (let i = 0; i < 10; i++) {
    const t = await drawTest(<FocusRoot><Row /></FocusRoot>, { width: 30, height: 3 });
    expect(t.captureCharFrame()).toContain('row open');
    t.mockInput.pressEscape();
    expect(inputHeld(t.renderer)).toBe(true);
    const settled = await t.settle();
    expect(inputHeld(t.renderer)).toBe(false);
    expect(settled).toContain('row closed');
    expect(t.captureCharFrame()).toContain('row closed');
    t.renderer.destroy();
  }
});

test('inputHeld: false with nothing typed, false again once an ordinary key went through', async () => {
  const t = await drawTest(<FocusRoot><Row /></FocusRoot>, { width: 30, height: 3 });
  expect(inputHeld(t.renderer)).toBe(false);
  t.mockInput.pressKey('a');
  expect(inputHeld(t.renderer)).toBe(false);
  t.renderer.destroy();
});
