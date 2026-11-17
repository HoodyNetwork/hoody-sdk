// An action-bar action that turns soft-disabled while its send is out (a reason: "A change is being sent.") and back
// keeps the focus in the terminal, as the web's focus-follow keeps it. The control was drawn as a ReasonButton with a
// reason and as a bare Button without one: a different tree at each change, so the focused control was a new one and
// the focus was gone (VMs: "Take a snapshot", "Make the disk bigger", a port's edit; Tab started again from the top).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Pressed, the action turns off with its reason and keeps the focus; its tip stays shut (a tip never covers the
// |   | next step: it opens when the person arrives on it or presses it); a press then runs nothing and opens the tip | 'turns off' |
// | 2 | Back on, it still has the focus and a press runs it again | 'turns off' |
// | 3 | Off with a reason it looks as before: no tone, no icon, no busy mark; read as off with the reason | 'look' |
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../../term/prim/testing';
import { FocusRoot } from '../../../term/prim';
import { OverlayHost } from '../../../term/prim/Overlay';
import { act, focusedNode, getByRole, semanticsOf, type SemRoot } from '../../../term/prim/semantics';
import { InlineActions } from './ActionBar';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);

const WHY = 'A change is being sent.';
let presses = 0;
let release: (() => void) | null = null;

function Snapshots() {
  const [sending, setSending] = useState(false);
  release = () => setSending(false);
  return (
    <InlineActions
      label="Snapshots"
      actions={[
        { id: 'take', label: 'Take a snapshot', tone: 'danger', onPress: () => { presses++; setSending(true); }, ...(sending ? { disabledReason: WHY } : {}) },
        { id: 'other', label: 'Other', onPress: () => {} },
      ]}
    />
  );
}

test('turns off: a pressed action that turns off with a reason keeps the focus, and back on it runs again', async () => {
  presses = 0;
  t = await drawTest(<FocusRoot><OverlayHost><Snapshots /></OverlayHost></FocusRoot>, { width: 80, height: 10 });
  await t.settle();
  act(getByRole(tree(), 'button', { name: 'Take a snapshot' }), 'press');
  await t.settle();
  expect(presses).toBe(1);
  // Off with its reason, and still the focused control. A regression would lose the focus (focusedNode null).
  const off = getByRole(tree(), 'button', { name: 'Take a snapshot' });
  expect(off.states.disabled).toBe(true);
  expect(focusedNode(tree())?.name).toBe('Take a snapshot');
  // Turned off under the focus: no tip over what comes next (the VMs held band). Still read with its reason.
  expect(await t.settle()).not.toContain(WHY);
  expect(off.description ?? '').toContain(WHY);
  // A press while off runs nothing, and the person asked: the tip says why.
  t.mockInput.pressEnter();
  expect(await t.settle()).toContain(WHY);
  expect(presses).toBe(1);
  // The send settles: on again, the focus is still there and Enter runs it.
  release!();
  await t.settle();
  expect(getByRole(tree(), 'button', { name: 'Take a snapshot' }).states.disabled ?? false).toBe(false);
  expect(focusedNode(tree())?.name).toBe('Take a snapshot');
  t.mockInput.pressEnter();
  await t.settle();
  expect(presses).toBe(2);
});

test('look: off with a reason it is drawn as before (no tone), read as off and described by the reason', async () => {
  presses = 0;
  t = await drawTest(<FocusRoot><OverlayHost><Snapshots /></OverlayHost></FocusRoot>, { width: 80, height: 10 });
  await t.settle();
  act(getByRole(tree(), 'button', { name: 'Take a snapshot' }), 'press');
  const frame = await t.settle();
  expect(frame).toContain('[Take a snapshot]');
  const off = getByRole(tree(), 'button', { name: 'Take a snapshot' });
  expect(off.states.disabled).toBe(true);
  expect(off.description ?? '').toContain(WHY);
});
