// FileChooser in the terminal: a fake host answers folders at once; the tests pin what the caller is handed: a file
// pressed twice, the open folder in folder mode, the chosen files of files mode against the caller's limit, and a file
// `accept` refuses.
import { afterEach, expect, test } from 'bun:test';
import { useCallback, useMemo, useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, getAllByRole, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
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
afterEach(() => { t?.renderer.destroy(); t = null; });
const got: ChooserResult[][] = [];

function Host(p: Partial<FileChooserProps>) {
  const [place, setPlace] = useState<ChooserPlace | null>(null);
  const want = useCallback((x: ChooserPlace | null) => setPlace(x), []);
  const reads = useMemo<ChooserReads>(() => {
    const entries = place ? TREE[place.dir] : undefined;
    return { folder: { place: entries ? place : null, entries: entries ?? [], failed: place !== null && !entries }, want };
  }, [place, want]);
  return <FileChooser isOpen onClose={() => undefined} overlayId="test-chooser" mode="file" reads={reads} rootLabel="/" start="home/ada/" onChoose={(r) => { got.push([...r]); }} {...p} />;
}

const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const settle = async () => {
  await t!.settle();
  await new Promise((r) => setTimeout(r, 30));
  return t!.settle();
};
const draw = async (p: Partial<FileChooserProps> = {}) => {
  got.length = 0;
  t = await drawTest(<FocusRoot><OverlayHost><PaneSize><Host {...p} /></PaneSize></OverlayHost></FocusRoot>, { width: 100, height: 40 });
  return settle();
};
const names = () => queryAllByRole(tree(), 'option').map((o) => o.name.split(',')[0]);
const press = async (role: 'option' | 'button', name: string | RegExp) => {
  act(getAllByRole(tree(), role, { name })[0]!, 'press');
  return settle();
};

test('file mode: the folder asked for is listed; a file pressed is selected, pressed again it is chosen', async () => {
  const f = await draw();
  expect(f).toContain('Choose a file');
  expect(names()).toEqual(['big.iso', 'cart.ts', 'notes.md']);
  await press('option', /^notes\.md/);
  expect(got).toHaveLength(0);
  expect(queryAllByRole(tree(), 'option', { selected: true }).map((o) => o.name)).toEqual([expect.stringContaining('selected')]);
  await press('option', /^notes\.md/);
  expect(got).toHaveLength(1);
  expect(got[0]).toEqual([{ computer: null, realm: null, path: 'home/ada/notes.md', fullPath: '/home/ada/notes.md', name: 'notes.md', kind: 'file', size: 1200 }]);
});

test('Up one folder opens the folder above; a folder row opens it', async () => {
  await draw();
  await press('button', 'Up one folder');
  expect(names()).toEqual(['ada']);
  await press('option', /^ada,/);
  expect(names()).toEqual(['big.iso', 'cart.ts', 'notes.md']);
});

test('folder mode: files cannot be chosen; Use this folder takes the open one', async () => {
  await draw({ mode: 'folder', start: 'home/' });
  await press('button', 'Use this folder');
  expect(got).toHaveLength(1);
  expect(got[0]![0]).toMatchObject({ kind: 'folder', path: 'home/', fullPath: '/home/', name: 'home', size: null });
});

test('files mode: each press adds or removes a file, up to the limit; Choose sends them all', async () => {
  const f0 = await draw({ mode: 'files', limits: { maxFiles: 2 } });
  expect(f0).toContain('0 of 2 chosen');
  await press('option', /^notes\.md/);
  await press('option', /^cart\.ts/);
  let f = await press('option', /^big\.iso/);
  expect(f).toContain('2 of 2 chosen');
  expect(f).toContain('This takes 2 files at most.');
  f = await press('option', /^cart\.ts/);
  expect(f).toContain('1 of 2 chosen');
  await press('button', 'Choose');
  expect(got).toHaveLength(1);
  expect(got[0]!.map((x) => x.path)).toEqual(['home/ada/notes.md']);
});

test('a file the caller does not accept says why and is never chosen', async () => {
  const f = await draw({ accept: (e) => (e.name.endsWith('.iso') ? 'Too large to attach.' : null) });
  expect(f).toContain('Too large to attach.');
  const iso = getAllByRole(tree(), 'option', { name: /^big\.iso/ })[0]!;
  expect(iso.states.disabled).toBe(true);
  expect(got).toHaveLength(0);
});

test('the title names the computer; ".." opens the folder above; Up says why it stops at the top folder', async () => {
  const f = await draw({ computerName: 'atlas', home: 'home/ada/' });
  expect(f).toContain('Choose a file on atlas');
  expect(f).toContain('/ › home › ada');
  await press('button', '.., the folder above');
  expect(names()).toEqual(['ada']);
  const f2 = await press('button', '.., the folder above');
  expect(names()).toEqual(['home', 'readme.txt']);
  expect(queryAllByRole(tree(), 'button', { name: '.., the folder above' })).toHaveLength(0);
  expect(f2).not.toContain(' ..');
  const up = getAllByRole(tree(), 'button', { name: 'Up one folder' })[0]!;
  expect(up.states.disabled).toBe(true);
  expect(up.description).toContain("This is the computer's top folder.");
});

test('the places name the computer\'s top folder and the home folder', async () => {
  await draw({ computerName: 'atlas', home: 'home/ada/' });
  const f = await press('button', 'Places');
  expect(f).toContain('Computer (/)');
  expect(f).toContain('Home (/home/ada)');
});
