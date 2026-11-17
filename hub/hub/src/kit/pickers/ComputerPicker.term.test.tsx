// Terminal pickers: ComputerPicker opens PickerPanel on the overlay layer, rows are radio rows with glyph marks (never a
// colour alone), the state word is drawn for every state but running, the flag is letters (no emoji), arrows/Enter pick,
// typing starts the search, the folded "Not running" group opens on its toggle, and a pick reports once.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { semanticsOf, semText } from '../../term/prim/semantics';
import { ShellDataProvider } from '../../shell/context';
import { ComputerPicker, type ComputerChoice } from './ComputerPicker';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const tree = () => semText(semanticsOf(t!.renderer as never));
const SG = String.fromCodePoint(0x1f1f8, 0x1f1ec);

const COMPUTERS: ComputerChoice[] = [
  { id: 'a', name: 'atlas', running: true, state: 'Running', stateKind: 'running', place: 'Singapore · n12', flag: SG, color: '#3092ff', realm: { name: 'Personal', color: 'blue' } },
  { id: 'b', name: 'birch', running: false, state: 'Stopped', stateKind: 'stopped', place: 'Frankfurt · fra-7', realm: { name: 'Personal', color: 'blue' } },
  { id: 'c', name: 'cedar', running: true, state: 'Running', stateKind: 'running', place: 'Ashburn · ash-3', realm: { name: 'Lab', color: 'green' } },
  { id: 'd', name: 'dune', state: 'Failed', stateKind: 'attention', realm: { name: 'Lab', color: 'green' } },
  { id: 'e', name: 'ember', running: true, state: 'Running', stateKind: 'running', disabledReason: 'Already in the other pane', realm: { name: 'Lab' } },
];

function Host({ seen }: { seen: string[] }) {
  const [v, setV] = useState<string | undefined>('a');
  return (
    <ShellDataProvider value={{ realms: [{ id: 'r1', name: 'Personal' } as never], realmId: 'r1', computers: [] }}>
      <ComputerPicker label="Computer" computers={COMPUTERS} value={v} onChange={(id) => { seen.push(id); setV(id); }} />
    </ShellDataProvider>
  );
}

const draw = async (node: React.ReactNode, w = 100, h = 30) => {
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize>{node}</PaneSize></OverlayHost></FocusRoot>, { width: w, height: h });
  return t.settle();
};

const open = async () => { t!.mockInput.pressTab(); await t!.settle(); t!.mockInput.pressEnter(); return t!.settle(); };
const key = async (k: 'down' | 'up' | 'enter' | 'escape' | string) => {
  if (k === 'down') t!.mockInput.pressArrow('down');
  else if (k === 'up') t!.mockInput.pressArrow('up');
  else if (k === 'enter') t!.mockInput.pressEnter();
  else if (k === 'escape') { t!.mockInput.pressEscape(); await new Promise((r) => setTimeout(r, 80)); }
  else t!.mockInput.pressKey(k);
  return t!.settle();
};

test('the trigger shows the pick in words and marks; no emoji flag anywhere; named as the web names it', async () => {
  const f = await draw(<Host seen={[]} />);
  expect(f).toContain('● ');
  expect(f).toContain('SG atlas');
  expect(f).toContain('Personal ▾');
  // The realm tail reads as part of this one control: a "·" before it, one ▾ at the end.
  const row = f.split('\n').find((l) => l.includes('SG atlas'))!;
  expect(row).toMatch(/SG atlas · .*Personal ▾/);
  expect(row.split('▾').length - 1).toBe(1);
  expect(f).not.toMatch(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u);
  expect(tree()).toContain('button "atlas Personal Running Computer"');
});

test('open: realm groups, glyph marks, a state word for every state but running, the parked group folded', async () => {
  await draw(<Host seen={[]} />);
  const f = await open();
  expect(f).toContain('(•) ● █ SG atlas');
  expect(f).toContain('( ) ○ birch Stopped');
  expect(f).toContain('Already in the other pane');
  expect(f).toContain('▸ Not running (1)');
  expect(f).not.toContain('dune');
  const s = tree();
  expect(s).toContain('radio "atlas Singapore · n12 Personal Running" checked');
  expect(s).toContain('radio "ember Lab Running Already in the other pane" disabled');
});

test('↓ from the search enters the list at the pick; ↓ Enter picks the next row and closes; the disabled row is skipped', async () => {
  const seen: string[] = [];
  await draw(<Host seen={seen} />);
  await open();
  await key('down'); // search → the picked row (atlas)
  expect(tree()).toMatch(/radio "atlas[^"]*" focused checked|radio "atlas[^"]*" checked focused/);
  await key('down'); // birch
  await key('down'); // cedar
  await key('down'); // ember is disabled: the fold toggle
  expect(tree()).toMatch(/button "Not running \(1\)" focused/);
  await key('up');
  const f = await key('enter');
  expect(seen).toEqual(['c']);
  expect(f).not.toContain('Find a computer');
  expect(f).toContain('cedar');
});

test('typing on a row starts the search; the fold opens on its toggle; Esc closes and changes nothing', async () => {
  const seen: string[] = [];
  await draw(<Host seen={seen} />);
  await open();
  await key('down');
  let f = await key('d');
  expect(f).toContain('○ dune Failed'); // a search shows every group with a match open, the parked one too
  expect(f).toContain('3 of 5 shown'); // birch (its state "Stopped"), cedar, dune
  expect(f).not.toContain('atlas Singapore');
  await key('escape'); // clears the search (the field's Escape)
  f = await key('escape'); // closes
  expect(f).not.toContain('Find a computer');
  expect(seen).toEqual([]);
});

test('picking the row already picked changes nothing and closes', async () => {
  const seen: string[] = [];
  await draw(<Host seen={seen} />);
  await open();
  await key('down');
  const f = await key('enter');
  expect(seen).toEqual([]);
  expect(f).not.toContain('Find a computer');
});
