// A focused control that is removed (its row deleted by its own confirm, a band that resolved, a menu that went with
// its state): nothing has the focus, as on the web, but the next Tab goes on from where it was drawn, in its region,
// as a browser's sequential-focus starting point does. It went to the first stop of the screen (the shell's sidebar),
// so a person deleting rows one by one had to walk back through the whole sidebar and top bar after each.
//  1. Tab after the removal: the next stop of the page; Shift-Tab: the one before it. Never the sidebar.
//  2. The last stop of the page removed: Tab wraps as it always did (the first stop of the scope).
//  3. Anything focused meanwhile (a click, an autoFocus, focus()) cancels the starting point.
//  4. A removal while nothing of it was focused changes nothing.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box, FocusRegion, FocusRoot, Pressable, Text } from '../prim';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

/** One control; `x` is taken only by the focused one, which records its name. Module level: a component made inside
 *  Shell would be a new type on every render, and React would remount every control when a row goes. */
function P({ n, seen, autoFocus }: { n: string; seen: string[]; autoFocus?: boolean }) {
  return <Pressable onPress={() => {}} autoFocus={autoFocus} onKey={(k) => { if (k.name === 'x') seen.push(n); return k.name === 'x'; }}><Text>[{n}]</Text></Pressable>;
}

/** The shell's shape: a sidebar region (0) beside a page region (2) whose rows can be removed. */
function Shell({ seen, rows, remove, extra }: { seen: string[]; rows: string[]; remove: { fn: (n: string) => void }; extra?: { fn: () => void } }) {
  const [list, setList] = useState(rows);
  const [auto, setAuto] = useState(false);
  remove.fn = (n) => setList((l) => l.filter((x) => x !== n));
  if (extra) extra.fn = () => setAuto(true);
  return (
    <FocusRoot>
      <Box dir="row" width="100%" height="100%">
        <FocusRegion order={0}><Box dir="column" width={10}><P n="side1" seen={seen} /><P n="side2" seen={seen} /></Box></FocusRegion>
        <FocusRegion order={2}>
          <Box dir="column" grow={1}>
            {list.map((n) => <P key={n} n={n} seen={seen} />)}
            {auto ? <P n="late" seen={seen} autoFocus /> : null}
          </Box>
        </FocusRegion>
      </Box>
    </FocusRoot>
  );
}

/** Which control has the focus: `x` is taken only by the focused one, which records its name. */
async function focusedName(seen: string[]): Promise<string | undefined> {
  seen.length = 0;
  t!.mockInput.pressKey('x'); await t!.settle();
  return seen[0];
}
async function tabTo(seen: string[], name: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    t!.mockInput.pressTab(); await t!.settle();
    if ((await focusedName(seen)) === name) return;
  }
  throw new Error(`Tab never reached ${name}`);
}

test('Tab after the focused row is removed goes to the next row of the page, not the sidebar', async () => {
  const seen: string[] = [];
  const remove = { fn: (_: string) => {} };
  t = await drawTest(<Shell seen={seen} rows={['row1', 'row2', 'row3']} remove={remove} />, { width: 40, height: 6 });
  await tabTo(seen, 'row2');
  remove.fn('row2');
  await t.settle();
  expect(await focusedName(seen)).toBeUndefined();
  t.mockInput.pressTab(); await t.settle();
  expect(await focusedName(seen)).toBe('row3');
});

test('Shift-Tab after the removal goes to the row before it', async () => {
  const seen: string[] = [];
  const remove = { fn: (_: string) => {} };
  t = await drawTest(<Shell seen={seen} rows={['row1', 'row2', 'row3']} remove={remove} />, { width: 40, height: 6 });
  await tabTo(seen, 'row2');
  remove.fn('row2');
  await t.settle();
  t.mockInput.pressTab({ shift: true }); await t.settle();
  expect(await focusedName(seen)).toBe('row1');
});

test('the last row of the page removed: Tab wraps to the first stop, as before', async () => {
  const seen: string[] = [];
  const remove = { fn: (_: string) => {} };
  t = await drawTest(<Shell seen={seen} rows={['row1', 'row2']} remove={remove} />, { width: 40, height: 6 });
  await tabTo(seen, 'row2');
  remove.fn('row2');
  await t.settle();
  t.mockInput.pressTab(); await t.settle();
  expect(await focusedName(seen)).toBe('side1');
});

test('an autoFocus after the removal takes the focus, and Tab goes on from it', async () => {
  const seen: string[] = [];
  const remove = { fn: (_: string) => {} };
  const extra = { fn: () => {} };
  t = await drawTest(<Shell seen={seen} rows={['row1', 'row2', 'row3']} remove={remove} extra={extra} />, { width: 40, height: 7 });
  await tabTo(seen, 'row1');
  remove.fn('row1');
  await t.settle();
  extra.fn();
  await t.settle();
  expect(await focusedName(seen)).toBe('late');
  // From the autoFocused control (drawn last), Tab wraps to the first stop; the removed row's place is forgotten.
  t.mockInput.pressTab(); await t.settle();
  expect(await focusedName(seen)).toBe('side1');
});

test('a row removed while another control has the focus changes nothing', async () => {
  const seen: string[] = [];
  const remove = { fn: (_: string) => {} };
  t = await drawTest(<Shell seen={seen} rows={['row1', 'row2', 'row3']} remove={remove} />, { width: 40, height: 6 });
  await tabTo(seen, 'row1');
  remove.fn('row2');
  await t.settle();
  expect(await focusedName(seen)).toBe('row1');
  t.mockInput.pressTab(); await t.settle();
  expect(await focusedName(seen)).toBe('row3');
});
