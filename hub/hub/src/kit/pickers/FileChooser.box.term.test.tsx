// FileChooser in the terminal: ↓ in the box moves into the list, as on the web (FileChooser.tsx, the box's onKeyDown;
// FileChooser.test.tsx "Arrow down moves from the box into the list"). Before this, ↓ in the terminal box did nothing:
// a person who typed a filter had to Tab past Find (and more) to reach the match.
import { afterEach, expect, test } from 'bun:test';
import { useCallback, useMemo, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, focusedNode, getByRole, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { FileChooser } from './FileChooser';
import type { ChooserEntry, ChooserPlace, ChooserReads, ChooserResult } from './fileChooser';

const F = (name: string, size: number): ChooserEntry => ({ name, dir: false, size });
const D = (name: string): ChooserEntry => ({ name, dir: true });
const TREE: Record<string, ChooserEntry[]> = {
  '': [D('home'), F('readme.txt', 120)],
  'home/': [D('ada')],
  'home/ada/': [F('notes.md', 1200), F('big.iso', 64 * 1024 * 1024), F('cart.ts', 900)],
};

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const got: ChooserResult[][] = [];

function Host() {
  const [place, setPlace] = useState<ChooserPlace | null>(null);
  const want = useCallback((x: ChooserPlace | null) => setPlace(x), []);
  const reads = useMemo<ChooserReads>(() => {
    const entries = place ? TREE[place.dir] : undefined;
    return { folder: { place: entries ? place : null, entries: entries ?? [], failed: place !== null && !entries }, want };
  }, [place, want]);
  return <FileChooser isOpen onClose={() => undefined} overlayId="test-chooser" mode="file" reads={reads} rootLabel="/" start="home/ada/" onChoose={(r) => { got.push([...r]); }} />;
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
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const focused = () => focusedNode(tree());
const box = () => getByRole(tree(), 'searchbox');

// Catches the box's ↓ (FileChooser.term.tsx, the SearchField's onKeyDown): ↓ takes the focus to the list's stop (the
// first row, or the first match of the filter typed), and every other key still reaches the box (the filter is typed).
test('↓ in the box moves into the list: onto the first row, and with a filter onto the match; Enter there selects it', async () => {
  await draw();
  act(box(), 'focus');
  await settle();
  expect(focused()?.role).toBe('searchbox');
  t!.mockInput.pressArrow('down');
  await settle();
  expect(focused()?.role).toBe('option');
  expect(focused()?.name).toMatch(/^big\.iso/);
  act(box(), 'focus');
  await settle();
  await t!.mockInput.typeText('ca');
  await settle();
  expect(box().value).toBe('ca');
  const rows = queryAllByRole(tree(), 'option');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.name).toMatch(/^cart\.ts/);
  t!.mockInput.pressArrow('down');
  await settle();
  expect(focused()?.name).toMatch(/^cart\.ts/);
  t!.mockInput.pressEnter();
  await settle();
  expect(focused()?.name).toMatch(/^cart\.ts.*selected/);
  expect(got).toHaveLength(0);
});
