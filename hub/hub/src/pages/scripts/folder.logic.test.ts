// Vitest: the scripts page's rules across Exec folders (execIds). Folder 1 keeps every old shape; another folder is
// addressed only by its number and never mixes with folder 1's scripts, addresses, links or hand-offs.
import { describe, expect, it } from 'vitest';
import { aliasesFor, createPreview, execOf, folderOf, fromHandoff, inFolder, isRootRel, itemId, itemKey, parseItemId, pathFor, routeOf, scriptRows, toHandoff } from './logic';
import type { Alias, ScriptRow } from './types';

const row = (path: string, x: Partial<ScriptRow> = {}): ScriptRow => ({ path, ...x }) as ScriptRow;

describe('paths across folders', () => {
  it('a path names its folder by number only', () => {
    expect(execOf('default/1/a.ts')).toBe(1);
    expect(execOf('default/42/x/y.ts')).toBe(42);
    expect(execOf('default/9999/a.ts')).toBe(9999);
    for (const p of ['default/0/a.ts', 'default/01/a.ts', 'default/10000/a.ts', 'default/abc/a.ts', 'a.ts', 'default/3', 7]) expect(execOf(p)).toBeNull();
  });
  it('a file inside any folder is root-relative; the folder itself and escapes are not', () => {
    expect(isRootRel('default/3/a.ts')).toBe(true);
    expect(isRootRel('default/3/')).toBe(false);
    expect(isRootRel('default/3/../1/a.ts')).toBe(false);
    expect(isRootRel('default/03/a.ts')).toBe(false);
    expect(inFolder('default/3/a/b.ts')).toBe('a/b.ts');
    expect(inFolder('default/1/a.ts')).toBe('a.ts');
    expect(inFolder('a.ts')).toBeNull();
    expect(folderOf('default/12/a.ts')).toBe(12);
    expect(folderOf('default/1/a.ts')).toBe(1);
  });
  it('addresses are the same rule in every folder, on that folder\'s own address', () => {
    expect(routeOf('default/3/orders/index.ts')).toBe('/orders');
    expect(routeOf('default/3/orders/[id].ts')).toBe('/orders/[id]');
    expect(pathFor('/weather')).toBe('default/1/weather.ts');
    expect(pathFor('/weather', 'js', 5)).toBe('default/5/weather.js');
    expect(pathFor('/weather', 'ts', 0)).toBeNull();
    expect(pathFor('/weather', 'ts', 10000)).toBeNull();
  });
  it('Logs and Schedules hand-offs exist for folder 1 only', () => {
    expect(toHandoff('default/1/a.ts')).toBe('a.ts');
    expect(toHandoff('default/2/a.ts')).toBeNull();
    expect(fromHandoff('a.ts')).toBe('default/1/a.ts');
    expect(fromHandoff('a.ts', 4)).toBe('default/4/a.ts');
    expect(fromHandoff('a.ts', 0)).toBeNull();
    expect(fromHandoff('../a.ts', 4)).toBeNull();
  });
  it('the selection in the URL is the path inside the folder; the folder comes from the page', () => {
    expect(itemId('atlas.1111', 'default/3/a.ts')).toBe('atlas.1111~a.ts');
    expect(parseItemId('atlas.1111~a.ts', 3)).toEqual({ handle: 'atlas.1111', rootRel: 'default/3/a.ts' });
    expect(parseItemId('atlas.1111~a.ts')).toEqual({ handle: 'atlas.1111', rootRel: 'default/1/a.ts' });
    expect(parseItemId('atlas.1111~../a.ts', 3)).toBeNull();
  });
  it("two folders' a.ts share a URL id but never a script identity (what a detail and its editor are keyed by)", () => {
    const one = { compId: 'c1', path: 'default/1/a.ts' };
    const three = { compId: 'c1', path: 'default/3/a.ts' };
    expect(itemId('atlas.1111', one.path)).toBe(itemId('atlas.1111', three.path));
    expect(itemKey(one)).not.toBe(itemKey(three));
    expect(itemKey(one)).not.toBe(itemKey({ compId: 'c2', path: one.path }));
  });
});

describe('a folder lists only its own scripts', () => {
  it('rows of other folders never show', () => {
    const rows = [row('default/1/a.ts'), row('default/2/b.ts'), row('default/2/c.js'), row('default/22/d.ts'), row('default/2/node_modules/x.ts'), row('default/2/readme.md')];
    expect(scriptRows(rows).map((r) => r.path)).toEqual(['default/1/a.ts']);
    expect(scriptRows(rows, 2).map((r) => r.path)).toEqual(['default/2/b.ts', 'default/2/c.js']);
    expect(scriptRows(rows, 22).map((r) => r.path)).toEqual(['default/22/d.ts']);
    expect(scriptRows(rows, 3)).toEqual([]);
  });
});

describe('the create preview of another folder', () => {
  it('a script of folder 1 answering a folder-3 address is a general script there, never "taken"', () => {
    expect(createPreview({ matched: true, scriptPath: 'default/1/a.ts', type: 'static' } as never, 3).state).toBe('general');
    expect(createPreview({ matched: true, scriptPath: 'default/3/a.ts', type: 'static' } as never, 3).state).toBe('taken');
    expect(createPreview({ matched: true, scriptPath: 'default/3/a.ts', type: 'static' } as never).state).toBe('general');
  });
});

describe('links of a folder', () => {
  const a = (x: Partial<Alias>): Alias => ({ id: 'al', target_path: '/a', enabled: true, program: 'exec', ...x }) as Alias;
  it('a link belongs to the folder its index names; one with no index is folder 1\'s', () => {
    const rows = [a({ id: 'one', index: 1 }), a({ id: 'none' }), a({ id: 'three', index: 3 }), a({ id: 'other', program: 'terminal', index: 3 })];
    expect(aliasesFor(rows, 'default/1/a.ts').map((x) => x.id)).toEqual(['one', 'none']);
    expect(aliasesFor(rows, 'default/3/a.ts').map((x) => x.id)).toEqual(['three']);
    expect(aliasesFor(rows, 'default/4/a.ts')).toEqual([]);
  });
});
