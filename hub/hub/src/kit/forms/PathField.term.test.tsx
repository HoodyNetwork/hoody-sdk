// PathField.term: the web component's observable behaviours, each held here.
//  - the path is typed after the root's label ("~/"); an absolute path drops the prefix
//  - typed text is always the value (onChange(path, 'typed')); the field never refuses it, a page errorMessage shows
//  - while focused, the folder being typed is asked for (read.want(dir)); leaving asks want(null); a lock asks nothing
//  - its entries are offered: folders first, dotfiles only after ".", only names starting with what is typed;
//    mode 'folder' offers folders only
//  - ↓/↑ move through them, Enter picks (onChange(path, 'picked')); a folder ends in "/" and its entries come next
//  - notes instead of rows: Reading…, Couldn't read, empty, hidden names, no match, outside the root
//  - Browse is a handoff line to the web Hub
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { routed } from '../layouts/termHarness';
import { PathField } from './PathField';
import { TextField } from './fields';
import type { PathEntry } from './pathPick';

const W = { width: 80, height: 20 };
const TREE: Record<string, PathEntry[]> = {
  '': [{ name: 'src', dir: true }, { name: 'README.md', dir: false }, { name: '.env', dir: false }, { name: 'scripts', dir: true }],
  'src/': [{ name: 'kit', dir: true }, { name: 'main.ts', dir: false }],
  'src/kit/': [],
};

function P({ got, wants, mode, failed, isDisabled, errorMessage }: { got: Array<[string, string]>; wants: (string | null)[]; mode?: 'folder' | 'file' | 'any'; failed?: boolean; isDisabled?: boolean; errorMessage?: string }) {
  const [v, setV] = useState('');
  const [dir, setDir] = useState<string | null>(null);
  const [want] = useState(() => (d: string | null) => { wants.push(d); if (d !== null) setDir(d); });
  const read = { entries: dir !== null && !failed ? (TREE[dir] ?? []) : [], dir: failed ? null : dir, failed, want };
  return (
    <FocusRoot>
      <PathField label="Folder" value={v} onChange={(p, how) => { got.push([p, how]); setV(p); }} read={read} mode={mode} rootLabel="~" isDisabled={isDisabled} errorMessage={errorMessage} />
      <TextField label="Next" value="" onChange={() => {}} />
    </FocusRoot>
  );
}

test('prefix, offered entries, ↓ Enter picks a folder then its entries; leaving asks nothing', async () => {
  const got: Array<[string, string]> = [];
  const wants: (string | null)[] = [];
  const t = await drawTest(routed(() => <P got={got} wants={wants} />).element, W);
  let f = t.captureCharFrame();
  expect(f).toContain('~/');
  expect(f).toContain('⇗ Browsing a folder tree is in the web Hub');
  expect(f).not.toContain('README.md');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(wants).toContain('');
  expect(f).toMatch(/src\/[\s\S]*scripts\/[\s\S]*README\.md/);
  expect(f).not.toContain('.env');
  await t.mockInput.typeText('s');
  f = await t.settle();
  expect(f).not.toContain('README.md');
  t.mockInput.pressArrow('down');
  t.mockInput.pressArrow('down');
  t.mockInput.pressArrow('up');
  f = await t.settle();
  expect(f).toContain('› src/');
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(got.at(-1)).toEqual(['src/', 'picked']);
  expect(wants.at(-1)).toBe('src/');
  expect(f).toContain('main.ts');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(wants.at(-1)).toBeNull();
  expect(f).not.toContain('main.ts');
  t.renderer.destroy();
});

test('notes: hidden names, empty, no match, outside; folder mode; absolute drops the prefix', async () => {
  const got: Array<[string, string]> = [];
  const wants: (string | null)[] = [];
  const t = await drawTest(routed(() => <P got={got} wants={wants} mode="folder" />).element, W);
  t.mockInput.pressTab();
  let f = await t.settle();
  expect(f).not.toContain('README.md');
  await t.mockInput.typeText('zz');
  f = await t.settle();
  expect(f).toContain('No match.');
  t.mockInput.pressKey('u', { ctrl: true });
  await t.mockInput.typeText('src/kit/');
  f = await t.settle();
  expect(f).toContain('This folder is empty.');
  t.mockInput.pressKey('u', { ctrl: true });
  await t.mockInput.typeText('../x');
  f = await t.settle();
  expect(f).toContain('Only paths inside ~ are listed.');
  expect(got.at(-1)).toEqual(['../x', 'typed']);
  t.mockInput.pressKey('u', { ctrl: true });
  await t.mockInput.typeText('/etc');
  f = await t.settle();
  expect(f).not.toContain('~/');
  t.renderer.destroy();
});

test('failed read; page error; a lock asks nothing and offers nothing', async () => {
  const wants: (string | null)[] = [];
  let t = await drawTest(routed(() => <P got={[]} wants={wants} failed errorMessage="Pick a folder you own." />).element, W);
  expect(t.captureCharFrame()).toContain('✗ Pick a folder you own.');
  t.mockInput.pressTab();
  expect(await t.settle()).toContain("Couldn't read this folder.");
  t.renderer.destroy();
  const w2: (string | null)[] = [];
  t = await drawTest(routed(() => <P got={[]} wants={w2} isDisabled />).element, W);
  t.mockInput.pressTab();
  const f = await t.settle();
  expect(f).toContain('Folder (unavailable)');
  expect(w2.every((x) => x === null)).toBe(true);
  t.renderer.destroy();
});
