// A focused control that turns disabled (prim/focus.ts useFocusable): it gives the focus up (an inert control never
// keeps pressing or editing), and the next Tab or Shift-Tab goes on from its place in the Tab order (as from the control
// itself), as a browser keeps a focused element that becomes disabled as its sequential-focus starting point. Before,
// nothing kept that place, so Tab started again at the first stop of the screen (in the shell: the top bar), e.g. after
// a support reply or a referral code was sent and its Send / Create turned off.
// | # | Web behaviour | Test |
// | 1 | Tab after the focused control turned disabled reaches the control after it, then goes on in order | 'Tab goes on after a control that turned disabled' |
// | 2 | Shift-Tab reaches the control before it | 'Shift-Tab goes back from a control that turned disabled' |
// | 3 | The disabled control keeps no focus: Enter presses nothing | 'the control that turned disabled holds no focus' |
// | 4 | A control that turns disabled while another has the focus changes nothing | 'disabling an unfocused control leaves the focus alone' |
// | 5 | Turned on again before the Tab (a busy Save that is done): Tab goes to the control after it, not back to it | 'a control turned on again before the Tab is not where Tab goes' |
// | 6 | The only control of its region: Tab goes to the next region in Tab order, Shift-Tab to the previous one, whatever is drawn below it | 'the only control of its region: Tab and Shift-Tab follow the region order' |
import { expect, test } from 'bun:test';
import { useState, type ReactElement } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRegion, FocusRoot, Pressable, Text } from '../prim';

/** A, B, C in one column. B has the first focus and turns itself off when pressed (a Send after its own send);
 *  A's press turns C off instead (a control turning off while another has the focus). `bOn.fn` turns B on again from
 *  outside (a busy control whose work ended); set at render, as focus-removed.term.test.tsx does. */
function Three({ log, bOn }: { log: string[]; bOn?: { fn: () => void } }): ReactElement {
  const [bOff, setBOff] = useState(false);
  const [cOff, setCOff] = useState(false);
  if (bOn) bOn.fn = () => setBOff(false);
  return (
    <FocusRoot>
      <Box dir="column">
        <Pressable onPress={() => { log.push('A'); setCOff(true); }}><Text>[A]</Text></Pressable>
        <Pressable autoFocus disabled={bOff} onPress={() => { log.push('B'); setBOff(true); }}><Text>[B]</Text></Pressable>
        <Pressable disabled={cOff} onPress={() => log.push('C')}><Text>[C]</Text></Pressable>
      </Box>
    </FocusRoot>
  );
}

type T = Awaited<ReturnType<typeof drawTest>>;
async function enter(t: T): Promise<void> { t.mockInput.pressEnter(); await t.settle(); }
async function tab(t: T, shift = false): Promise<void> { t.mockInput.pressTab(shift ? { shift: true } : undefined); await t.settle(); }

test('Tab goes on after a control that turned disabled', async () => {
  const log: string[] = [];
  const t = await drawTest(<Three log={log} />, { width: 20, height: 4 });
  await t.settle();
  await enter(t); // B presses and turns itself off
  expect(log).toEqual(['B']);
  await tab(t);
  await enter(t);
  // C, the control after B (before the fix: A, the first stop of the screen).
  expect(log).toEqual(['B', 'C']);
  await tab(t);
  await enter(t);
  // Then on in order, B skipped while it is off: A (which turns C off).
  expect(log).toEqual(['B', 'C', 'A']);
  t.renderer.destroy();
});

test('Shift-Tab goes back from a control that turned disabled', async () => {
  const log: string[] = [];
  const t = await drawTest(<Three log={log} />, { width: 20, height: 4 });
  await t.settle();
  await enter(t);
  expect(log).toEqual(['B']);
  await tab(t, true);
  await enter(t);
  // A, the control before B (before the fix: C, the last stop of the screen).
  expect(log).toEqual(['B', 'A']);
  t.renderer.destroy();
});

test('the control that turned disabled holds no focus', async () => {
  const log: string[] = [];
  const t = await drawTest(<Three log={log} />, { width: 20, height: 4 });
  await t.settle();
  await enter(t);
  await enter(t);
  await enter(t);
  // Positive control: the first Enter pressed B. After it turned off nothing has the focus, so Enter presses nothing.
  expect(log).toEqual(['B']);
  t.renderer.destroy();
});

test('disabling an unfocused control leaves the focus alone', async () => {
  const log: string[] = [];
  const t = await drawTest(<Three log={log} />, { width: 20, height: 4 });
  await t.settle();
  await tab(t, true); // B -> A
  await enter(t); // A presses and turns C off; A keeps the focus
  await enter(t);
  expect(log).toEqual(['A', 'A']);
  await tab(t);
  await enter(t);
  // From A: B (still on), not C (off now).
  expect(log).toEqual(['A', 'A', 'B']);
  t.renderer.destroy();
});

test('a control turned on again before the Tab is not where Tab goes', async () => {
  const log: string[] = [];
  const bOn = { fn: () => {} };
  const t = await drawTest(<Three log={log} bOn={bOn} />, { width: 20, height: 4 });
  await t.settle();
  await enter(t); // B presses and turns itself off
  expect(log).toEqual(['B']);
  bOn.fn(); // B is on again before any key
  await t.settle();
  // Positive control: B is on again but holds no focus (Enter presses nothing).
  await enter(t);
  expect(log).toEqual(['B']);
  await tab(t);
  await enter(t);
  // C, the control after B, as a browser's search starts after its starting point. Not B again (a starting point that
  // counted B itself as its first stop), and not A (no starting point: the first stop of the screen).
  expect(log).toEqual(['B', 'C']);
  t.renderer.destroy();
});

/** Three regions in Tab order 1, 2, 3, drawn in another order: B, the only stop of region 2, on the first row; X (region
 *  1) and Z (region 3) both drawn below it. B has the first focus and turns itself off when pressed. */
function Regions({ log }: { log: string[] }): ReactElement {
  const [bOff, setBOff] = useState(false);
  return (
    <FocusRoot>
      <Box dir="column">
        <FocusRegion order={2}>
          <Pressable autoFocus disabled={bOff} onPress={() => { log.push('B'); setBOff(true); }}><Text>[B]</Text></Pressable>
        </FocusRegion>
        <FocusRegion order={1}>
          <Pressable onPress={() => log.push('X')}><Text>[X]</Text></Pressable>
        </FocusRegion>
        <FocusRegion order={3}>
          <Pressable onPress={() => log.push('Z')}><Text>[Z]</Text></Pressable>
        </FocusRegion>
      </Box>
    </FocusRoot>
  );
}

test('the only control of its region: Tab and Shift-Tab follow the region order', async () => {
  for (const [shift, want] of [[false, 'Z'], [true, 'X']] as const) {
    const log: string[] = [];
    const t = await drawTest(<Regions log={log} />, { width: 20, height: 4 });
    await t.settle();
    await enter(t); // B presses and turns itself off (positive control: B had the focus)
    expect(log).toEqual(['B']);
    await tab(t, shift);
    await enter(t);
    // Tab: Z, the next region after B's (as Tab from B itself). Not X, the first stop drawn below B but in an EARLIER
    // region (a search by drawn place across regions), nor X as the first stop of the screen (no starting point).
    // Shift-Tab: X, the previous region. Not Z (the last stop of the screen).
    expect(log).toEqual(['B', want]);
    t.renderer.destroy();
  }
});
