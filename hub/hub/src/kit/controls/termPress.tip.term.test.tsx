// A soft-disabled control's reason tip opens when the person arrives on it (Tab, a click, a shortcut) or presses it,
// never because the control turned off under a focus it already had: a tip never covers the next
// step. VMs storage-full-held: "Make the disk bigger" kept the focus while its drawer sent, turned off with "Another
// change of this VM is not confirmed yet.", and when the drawer closed its tip covered the held band and its
// [Check again] [Stop tracking].
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Turns off under the focus: no tip; Enter then shows it and runs nothing | 'turns off under the focus' |
// | 2 | Turns off while a layer holds the keys: when the page is back, no tip; Tab away and back shows it | 'page comes back' |
// | 3 | Back on and off again under the focus: still no tip (a tip once asked for is not kept for the next reason) | 'turns off under the focus' |
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { focusedNode, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { Button } from './Button';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);

const WHY = 'Another change is not confirmed yet.';
let set: { off: (v: boolean) => void; active: (v: boolean) => void } | null = null;
let presses = 0;

function Bench() {
  const [off, setOff] = useState(false);
  const [active, setActive] = useState(true);
  set = { off: setOff, active: setActive };
  return (
    <FocusRoot active={active}>
      <OverlayHost>
        <Box dir="column" gap={1}>
          <Button autoFocus {...(off ? { isDisabled: true, disabledReason: WHY } : {})} onPress={() => { presses++; }}>Make it bigger</Button>
          <Button onPress={() => {}}>Check again</Button>
        </Box>
      </OverlayHost>
    </FocusRoot>
  );
}

test('turns off under the focus: no tip; Enter then shows it and runs nothing; on and off again: no tip', async () => {
  presses = 0;
  t = await drawTest(<Bench />, { width: 60, height: 10 });
  await t.settle();
  expect(focusedNode(tree())?.name).toBe('Make it bigger');
  set!.off(true);
  let f = await t.settle();
  expect(focusedNode(tree())?.name).toBe('Make it bigger');
  expect(f).not.toContain(WHY);
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(presses).toBe(0);
  expect(f).toContain(WHY);
  set!.off(false);
  f = await t.settle();
  expect(f).not.toContain(WHY);
  set!.off(true);
  f = await t.settle();
  expect(focusedNode(tree())?.name).toBe('Make it bigger');
  expect(f).not.toContain(WHY);
});

test('page comes back: turned off while a layer held the keys, no tip on return; Tab away and back shows it', async () => {
  t = await drawTest(<Bench />, { width: 60, height: 10 });
  await t.settle();
  expect(focusedNode(tree())?.name).toBe('Make it bigger');
  set!.active(false);
  await t.settle();
  set!.off(true);
  await t.settle();
  set!.active(true);
  let f = await t.settle();
  expect(focusedNode(tree())?.name).toBe('Make it bigger');
  expect(f).not.toContain(WHY);
  t.mockInput.pressTab();
  f = await t.settle();
  expect(focusedNode(tree())?.name).toBe('Check again');
  t.mockInput.pressTab({ shift: true });
  f = await t.settle();
  expect(focusedNode(tree())?.name).toBe('Make it bigger');
  expect(f).toContain(WHY);
});
