// A setting switch draws its switch beside the label's value column on a wide row and at the end of the label's line
// on a stacked one. A focused switch keeps the focus when a resize moves it between the two, both ways, and the next
// key still reaches it.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Focused switch, wide -> narrow -> wide: the focus stays on the switch, Space still toggles | 'switch across the stack' |
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { Box, FocusRoot } from '../../term/prim';
import { SettingGroup, SettingSwitch } from './SettingGroup';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; });

const focusedRole = (): string | undefined => focusedNode(semanticsOf(term!.renderer as never))?.role;
const lines = (f: string): string[] => f.split('\n').map((l) => l.trimEnd());

function Row({ seen }: { seen: boolean[] }) {
  const [on, setOn] = useState(false);
  return (
    <FocusRoot><Box dir="column">
      <SettingGroup label="Alerts">
        <SettingSwitch label="Mail me" help="When a computer stops, a mail goes to your address." isSelected={on} onChange={(v) => { seen.push(v); setOn(v); }} />
      </SettingGroup>
    </Box></FocusRoot>
  );
}

test('switch across the stack: a focused switch keeps the focus, both ways, and the next key reaches it', async () => {
  const seen: boolean[] = [];
  term = await drawTest(<Row seen={seen} />, { width: 100, height: 12 });
  await term.settle();
  for (let i = 0; i < 4 && focusedRole() !== 'switch'; i++) { term.mockInput.pressTab(); await term.settle(); }
  expect(focusedRole()).toBe('switch');
  const wide = lines(await term.settle());
  // Positive control: beside, the help shares the label column (wraps there); stacked, the help gets the row.
  const wideHelp = wide.findIndex((l) => l.includes('When a computer stops'));
  term.resize(40, 12);
  const narrow = lines(await term.settle());
  expect(narrow.join('\n')).not.toEqual(wide.join('\n'));
  expect(narrow.findIndex((l) => l.includes('When a computer'))).toBeGreaterThanOrEqual(0);
  expect(wideHelp).toBeGreaterThanOrEqual(0);
  expect(focusedRole(), narrow.join('\n')).toBe('switch');
  term.mockInput.pressKey(' ');
  await term.settle();
  expect(seen).toEqual([true]);
  term.resize(100, 12);
  const back = lines(await term.settle());
  expect(focusedRole(), back.join('\n')).toBe('switch');
  term.mockInput.pressKey(' ');
  await term.settle();
  expect(seen).toEqual([true, false]);
}, 60_000);
