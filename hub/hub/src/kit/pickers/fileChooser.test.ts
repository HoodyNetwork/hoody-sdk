// FileChooser's pure part: the order and filter of a folder, what the box's text means, the name cut, what a pick reads
// as in a message, and what this device keeps.
import { describe, expect, it } from 'vitest';
import {
  RECENT_MAX, acceptExtensions, chooserFolderOf, chooserRows, entryIcon, fileOriginText, fileReferenceText, fullPathOf, memoryOf, mentionText, nameParts, pushRecent, typedPlace,
  type ChooserEntry,
} from './fileChooser';

const E = (name: string, dir = false, size: number | null = null, modified: number | null = null): ChooserEntry => ({ name, dir, size, modified });
const names = (rows: readonly ChooserEntry[]) => rows.map((e) => e.name);
const VIEW = { sort: 'name', desc: false, hidden: false } as const;

describe('chooserRows', () => {
  const entries = [E('b.txt', false, 20, 300), E('a10.txt', false, 5, 100), E('a2.txt', false, null, 200), E('zeta', true), E('.env', false, 1, 1), E('alpha', true), E('..x', true)];
  it('folders first, names in natural order, hidden names and names out of the root left out', () => {
    expect(names(chooserRows(entries, '', VIEW))).toEqual(['alpha', 'zeta', 'a2.txt', 'a10.txt', 'b.txt']);
  });
  it('hidden names on request, or when the filter itself starts with a dot', () => {
    expect(names(chooserRows(entries, '', { ...VIEW, hidden: true }))).toContain('.env');
    expect(names(chooserRows(entries, '', VIEW, '.e'))).toEqual(['.env']);
  });
  it('filters by a part of the name, case ignored', () => {
    expect(names(chooserRows(entries, '', VIEW, 'A1'))).toEqual(['a10.txt']);
  });
  it('sorts by size or time either way, an unknown value last, folders still first', () => {
    expect(names(chooserRows(entries, '', { ...VIEW, sort: 'size', desc: true }))).toEqual(['alpha', 'zeta', 'b.txt', 'a10.txt', 'a2.txt']);
    expect(names(chooserRows(entries, '', { ...VIEW, sort: 'size' }))).toEqual(['alpha', 'zeta', 'a10.txt', 'b.txt', 'a2.txt']);
    expect(names(chooserRows(entries, '', { ...VIEW, sort: 'modified', desc: true }))).toEqual(['alpha', 'zeta', 'b.txt', 'a2.txt', 'a10.txt']);
  });
  it('a "~" name is out of the root only at the root', () => {
    expect(names(chooserRows([E('~old', true)], '', VIEW))).toEqual([]);
    expect(names(chooserRows([E('~old', true)], 'a/', VIEW))).toEqual(['~old']);
  });
});

describe('typedPlace', () => {
  it('no "/" is a filter of the open folder', () => {
    expect(typedPlace('rep', '/')).toEqual({ filter: 'rep' });
    expect(typedPlace('', '~')).toEqual({ filter: '' });
  });
  it('with a "/" it is a path: the folder is listed, the last part filters', () => {
    expect(typedPlace('src/in', '/')).toEqual({ dir: 'src/', name: 'in' });
    expect(typedPlace('/etc/ho', '/')).toEqual({ dir: 'etc/', name: 'ho' });
    expect(typedPlace('~/src/', '~')).toEqual({ dir: 'src/', name: '' });
    expect(typedPlace('/', '/')).toEqual({ dir: '', name: '' });
  });
  it('a path that may leave the root is outside', () => {
    for (const [text, root] of [['../x/', '/'], ['a/../b', '/'], ['/etc/', '~'], ['~/x', '/srv']] as const) expect(typedPlace(text, root), text).toBe('outside');
  });
});

describe('names and paths', () => {
  it('joins a path to how the root reads', () => {
    expect(fullPathOf('/', 'etc/hosts')).toBe('/etc/hosts');
    expect(fullPathOf('~', 'src/')).toBe('~/src/');
    expect(fullPathOf('/srv/shop', '')).toBe('/srv/shop');
    expect(fullPathOf('/', '')).toBe('/');
  });
  it('a long name is cut in two so its ending stays; a short one is whole', () => {
    expect(nameParts('notes.md')).toEqual(['notes.md', '']);
    const long = 'quarterly-report-final-version-2026.tar.gz';
    const [head, tail] = nameParts(long);
    expect(head + tail).toBe(long);
    expect(tail.endsWith('.gz')).toBe(true);
    expect([...tail].length).toBeGreaterThanOrEqual(6);
  });
  it('picks an icon by kind', () => {
    expect(entryIcon(E('src', true))).toBe('files');
    expect(entryIcon(E('shot.PNG'))).toBe('file-image');
    expect(entryIcon(E('a.tar'))).toBe('file-archive');
    expect(entryIcon(E('main.ts'))).toBe('file-code');
    expect(entryIcon(E('README'))).toBe('file');
  });
  it('an accept rule by ending refuses other files with its reason, never a folder', () => {
    const accept = acceptExtensions(['json', '.YAML'], 'Only JSON or YAML files.');
    expect(accept(E('a.json'))).toBeNull();
    expect(accept(E('b.yaml'))).toBeNull();
    expect(accept(E('c.txt'))).toBe('Only JSON or YAML files.');
    expect(accept(E('json'))).toBe('Only JSON or YAML files.');
    expect(accept(E('dir.txt', true))).toBeNull();
  });
});

describe('a pick as words in a message', () => {
  const atlas = { id: 'c-atlas', name: 'atlas' };
  it('the agent\'s own mention: bare, or quoted with escapes when the path holds a space or a quote', () => {
    expect(mentionText('/etc/hosts')).toBe('@/etc/hosts');
    expect(mentionText('/home/ada/my notes.md')).toBe('@"/home/ada/my notes.md"');
    expect(mentionText('/a/say "hi".txt')).toBe('@"/a/say \\"hi\\".txt"');
  });
  it('on the chat\'s own computer it is the mention alone; on another computer the computer is named after it', () => {
    expect(fileReferenceText({ computer: atlas, fullPath: '/etc/hosts' }, 'c-atlas')).toBe('@/etc/hosts');
    expect(fileReferenceText({ computer: null, fullPath: '~/src/a.ts' }, null)).toBe('@~/src/a.ts');
    expect(fileReferenceText({ computer: atlas, fullPath: '/var/log/app log.txt' }, 'c-other')).toBe('@"/var/log/app log.txt" (on the computer "atlas")');
  });
  it('never writes a computer:path form into a reference (the agent has none)', () => {
    expect(fileReferenceText({ computer: atlas, fullPath: '/etc/hosts' }, 'c-other')).not.toMatch(/atlas:/u);
  });
  it('the origin of a carried file names the computer and the path', () => {
    expect(fileOriginText({ computer: atlas, fullPath: '/etc/hosts' })).toBe('atlas:/etc/hosts');
    expect(fileOriginText({ computer: null, fullPath: '~/a' })).toBe('~/a');
  });
});

describe('what a PathField host reads, as the chooser takes it', () => {
  const want = () => {};
  it('names the folder its entries are of, or none while another is read', () => {
    expect(chooserFolderOf({ entries: [E('a')], dir: 'x/', want }).place).toEqual({ computer: null, dir: 'x/' });
    expect(chooserFolderOf({ entries: [], dir: null, reading: true, want })).toEqual({ place: null, entries: [], reading: true });
    expect(chooserFolderOf({ entries: [], dir: null, failed: true, outside: true, want })).toMatchObject({ failed: true, outside: true });
  });
});

describe('what this device keeps', () => {
  const item = (path: string, id: string | null = 'c1') => ({ computer: id === null ? null : { id, name: 'atlas' }, path });
  it('a new entry goes first, once, and the list stays short', () => {
    let list = [item('a/'), item('b/')];
    list = pushRecent(list, item('b/'));
    expect(list.map((x) => x.path)).toEqual(['b/', 'a/']);
    for (let i = 0; i < 20; i++) list = pushRecent(list, item(`d${i}/`));
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]!.path).toBe('d19/');
  });
  it('the same path on another computer is another entry', () => {
    expect(pushRecent([item('a/', 'c1')], item('a/', 'c2'))).toHaveLength(2);
  });
  it('reads back only what it wrote: anything else is nothing kept', () => {
    expect(memoryOf(null)).toEqual({ places: [], files: [], view: { sort: 'name', desc: false, hidden: false, preview: true } });
    expect(memoryOf('not json').places).toEqual([]);
    expect(memoryOf('[1,2]').files).toEqual([]);
    const kept = memoryOf(JSON.stringify({
      places: [item('a/'), { computer: 7, path: 'x/' }, { computer: null, path: '../up/' }, 'junk'],
      files: [{ computer: null, path: 'a/b.txt' }],
      view: { sort: 'size', desc: true, hidden: true, preview: false },
    }));
    expect(kept.places).toEqual([item('a/')]);
    expect(kept.files).toEqual([{ computer: null, path: 'a/b.txt' }]);
    expect(kept.view).toEqual({ sort: 'size', desc: true, hidden: true, preview: false });
  });
});
