// FileChooser in the terminal, by keys only (FileChooser.term.test.tsx presses through the tree, never a key): the
// header's "↓/↑ move, Enter opens or selects, Backspace goes up". Opening a folder from the list replaces its rows, so
// the row that had the focus unmounts. Unless the focus is moved, nothing has it afterwards (focus.ts: an unmounted
// focused thing leaves nothing focused), and the next Tab starts again at the top of the dialog, several stops above the list.
import { afterEach, expect, test } from 'bun:test';
import { useCallback, useMemo, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { focusedNode, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { FileChooser, type FileChooserProps } from './FileChooser';
import type { ChooserEntry, ChooserPlace, ChooserReads, ChooserResult } from './fileChooser';

const F = (name: string, size: number): ChooserEntry => ({ name, dir: false, size });
const D = (name: string): ChooserEntry => ({ name, dir: true });
const TREE: Record<string, ChooserEntry[]> = {
  '': [D('home'), F('readme.txt', 120)],
  'home/': [D('ada')],
  'home/ada/': [F('notes.md', 1200), F('big.iso', 64 * 1024 * 1024), F('cart.ts', 900)],
};

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; held.on = false; held.release = null; });
const got: ChooserResult[][] = [];
/** While `on`, the host answers the next folder only when the test calls release() (a slow computer). */
const held: { on: boolean; release: (() => void) | null } = { on: false, release: null };

function Host(p: Partial<FileChooserProps>) {
  const [place, setPlace] = useState<ChooserPlace | null>(null);
  const want = useCallback((x: ChooserPlace | null) => {
    if (held.on && x !== null) held.release = () => setPlace(x);
    else setPlace(x);
  }, []);
  const reads = useMemo<ChooserReads>(() => {
    const entries = place ? TREE[place.dir] : undefined;
    return { folder: { place: entries ? place : null, entries: entries ?? [], failed: place !== null && !entries }, want };
  }, [place, want]);
  return <FileChooser isOpen onClose={() => undefined} overlayId="test-chooser" mode="file" reads={reads} rootLabel="/" start="home/ada/" onChoose={(r) => { got.push([...r]); }} {...p} />;
}

const settle = async () => {
  await t!.settle();
  await new Promise((r) => setTimeout(r, 30));
  return t!.settle();
};
const draw = async () => {
  got.length = 0;
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Host /></PaneSize></OverlayHost></FocusRoot>, { width: 100, height: 40 });
  return settle();
};
const focused = () => focusedNode(semanticsOf(t!.renderer as unknown as SemRoot));
/** Tab until a row of the list has the focus (the list is one stop); fails when none ever does. */
async function tabIntoList(): Promise<void> {
  for (let i = 0; i < 20 && focused()?.role !== 'option'; i++) { t!.mockInput.pressTab(); await settle(); }
  expect(focused()?.role).toBe('option');
}

// Catches the focus coming back (FileChooser.term.tsx lines 312-317; the flag set at 267-268 for Backspace and at 423
// for a folder row) and the row keys (line 260 ↓, lines 266-268 Backspace).
test('↓ moves; Backspace goes up and Enter opens a folder, the keyboard staying in the list; Enter twice chooses', async () => {
  await draw();
  await tabIntoList();
  expect(focused()?.name).toMatch(/^big\.iso/);
  t!.mockInput.pressArrow('down');
  await settle();
  expect(focused()?.name).toMatch(/^cart\.ts/);
  t!.mockInput.pressBackspace();
  await settle();
  expect(focused()?.role).toBe('option');
  expect(focused()?.name).toMatch(/^ada, folder/);
  t!.mockInput.pressEnter();
  await settle();
  expect(focused()?.name).toMatch(/^big\.iso/);
  t!.mockInput.pressArrow('down');
  await settle();
  t!.mockInput.pressEnter(); // selects cart.ts
  await settle();
  expect(focused()?.name).toMatch(/^cart\.ts.*selected/);
  expect(got).toHaveLength(0);
  t!.mockInput.pressEnter(); // chooses it
  await settle();
  expect(got).toEqual([[{ computer: null, realm: null, path: 'home/ada/cart.ts', fullPath: '/home/ada/cart.ts', name: 'cart.ts', kind: 'file', size: 900 }]]);
});

// The guard (line 316, `scope.current() === null`): the focus comes back only to an empty dialog. A person who moved it
// while the folder was loading keeps it where they put it.
test('a person who Tabs away while the folder loads keeps the focus there when the rows arrive', async () => {
  await draw();
  await tabIntoList();
  held.on = true;
  t!.mockInput.pressBackspace();
  await settle();
  expect(held.release).not.toBeNull(); // the folder above is asked for and not answered yet
  expect(focused()).toBeNull(); // the row that had the focus is gone
  t!.mockInput.pressTab();
  await settle();
  const put = focused();
  expect(put).not.toBeNull();
  expect(put!.role).not.toBe('option');
  held.release!();
  await settle();
  expect(t!.captureCharFrame()).toContain(' ada'); // the rows are drawn
  expect(focused()?.role).toBe(put!.role);
  expect(focused()?.name).toBe(put!.name);
});
