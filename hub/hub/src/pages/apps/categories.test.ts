// Vitest: the launcher's categories table covers every starter of the run kit's
// catalogue (fixtures.ts starterIds, copied from the run kit's starter catalogue), an unknown id is More apps, every Category option has its
// words, and the default view's groups keep the table's order and the catalogue's order inside each group.
import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_OPTIONS, categoryKeeps, categoryOf, groupStarters, type CategoryOption } from './categories';
import { starterIds } from './fixtures';
import type { Item, Starter } from './logic';
import strings from './strings.en.json';

const words = strings as Record<string, string>;
const starter = (id: string, ord?: number): Starter => ({ id, name: id, description: '', opensIn: 'web', available: true, shares: false, ...(ord === undefined ? {} : { ord }) });

describe('the categories table follows the run kit catalogue', () => {
  it('the copied catalogue ids are the ten of the starter catalogue version 1, in its order', () => {
    expect(starterIds).toEqual(['firefox', 'mousepad', 'vscodium', 'gimp', 'pcmanfm', 'htop', 'ncdu', 'btop', 'jupyterlab', 'miniserve']);
  });
  it('every catalogue id has its design category, none falls to More apps', () => {
    expect(Object.fromEntries(starterIds.map((id) => [id, categoryOf(id)]))).toEqual({
      firefox: 'web', miniserve: 'web', pcmanfm: 'web',
      mousepad: 'code', vscodium: 'code',
      gimp: 'graphics',
      htop: 'monitors', ncdu: 'monitors', btop: 'monitors',
      jupyterlab: 'data',
    });
  });
  it('every category but More apps holds at least one catalogue id', () => {
    for (const c of CATEGORIES.filter((x) => x !== 'more')) expect(starterIds.some((id) => categoryOf(id) === c)).toBe(true);
  });
  it('an id the table does not know is More apps, an inherited object key included', () => {
    for (const id of ['open-webui', 'code-server', '', 'constructor', 'toString', 'GIMP']) expect(categoryOf(id)).toBe('more');
  });
});

describe('the Category filter', () => {
  it('lists All, On this computer, Coding agents, then every category with More apps last; From GitHub is not an option', () => {
    expect(CATEGORY_OPTIONS).toEqual(['all', 'installed', 'agents', 'code', 'web', 'graphics', 'monitors', 'data', 'more']);
  });
  it('every option has its name and its menu line, and the filter has its label', () => {
    expect(words['cat.label']).toBe('Category');
    for (const o of CATEGORY_OPTIONS) {
      expect(words[`cat.${o}`], o).toBeTruthy();
      expect(words[`cat.${o}.desc`], o).toBeTruthy();
    }
    expect(CATEGORY_OPTIONS.map((o) => words[`cat.${o}`])).toEqual(['All', 'On this computer', 'Coding agents', 'Code and text', 'Web and files', 'Graphics', 'System monitors', 'Notebooks and data', 'More apps']);
  });

  type Row = Pick<Item, 'type' | 'id' | 'provider' | 'agent'>;
  const rows: Record<string, Row> = {
    gimp: { type: 'starter', id: 'gimp', provider: null },
    htop: { type: 'starter', id: 'htop', provider: null },
    unknown: { type: 'starter', id: 'open-webui', provider: null },
    system: { type: 'row', id: 'system:vim', provider: 'system' },
    nix: { type: 'row', id: 'nix:gimp', provider: 'nix' },
    agent: { type: 'row', id: 'system:claude', provider: 'system', agent: 'claude' },
  };
  const keeps: Record<CategoryOption, string[]> = {
    all: ['gimp', 'htop', 'unknown', 'system', 'nix', 'agent'],
    installed: ['system', 'agent'],
    agents: ['agent'],
    code: [],
    web: [],
    graphics: ['gimp'],
    monitors: ['htop'],
    data: [],
    more: ['unknown'],
  };
  it.each(CATEGORY_OPTIONS)('%s keeps exactly its rows (On this computer is the system source only, never a starter)', (o) => {
    expect(Object.keys(rows).filter((k) => categoryKeeps(o, rows[k]!))).toEqual(keeps[o]);
  });
});

describe('the default view groups the starters', () => {
  it('groups follow the table order, empty groups are left out and More apps comes last', () => {
    const g = groupStarters(['miniserve', 'open-webui', 'htop', 'mousepad', 'firefox'].map((id) => starter(id)));
    expect(g.map((x) => x.category)).toEqual(['code', 'web', 'monitors', 'more']);
  });
  it('inside a group the catalogue order holds (ord first, then the order given), not the name', () => {
    const g = groupStarters([starter('pcmanfm', 3), starter('miniserve', 1), starter('firefox', 2)]);
    expect(g).toHaveLength(1);
    expect(g[0]!.starters.map((s) => s.id)).toEqual(['miniserve', 'firefox', 'pcmanfm']);
    expect(groupStarters([starter('pcmanfm'), starter('firefox'), starter('miniserve')])[0]!.starters.map((s) => s.id)).toEqual(['pcmanfm', 'firefox', 'miniserve']);
  });
  it('every starter lands in exactly one group, unchanged', () => {
    const all = [...starterIds, 'open-webui', 'vlc'].map((id) => starter(id));
    const flat = groupStarters(all).flatMap((x) => x.starters);
    expect(flat).toHaveLength(all.length);
    expect(new Set(flat)).toEqual(new Set(all));
  });
  it('no starters, no groups', () => {
    expect(groupStarters([])).toEqual([]);
  });
});
