import { describe, expect, it } from 'vitest';
import { links as botsLinks } from '../bots/links';
import { links as computersLinks } from '../computers/links';
import { links as programsLinks } from '../programs/links';
import { links as scriptsLinks } from '../scripts/links';
import type { DataItem } from './logic';
import { rowLinks, sourceHome } from './rowlinks';

const item = (kind: DataItem['kind'], row: Record<string, unknown> = {}): DataItem => ({ kind, k: 'x1', t: 1, row: row as DataItem['row'] });
const ctx = { handle: 'atlas.00a1', script: null as string | null };
const pages = { computers: '/computers', bots: '/bots', scripts: '/scripts', programs: '/programs' };

describe('rowLinks', () => {
  it('every row leads to its computer', () => {
    for (const k of ['kit', 'changes', 'account', 'script', 'helper'] as const) {
      expect(rowLinks(item(k), ctx)[0]).toMatchObject({ page: 'computers', path: computersLinks.item('atlas.00a1') });
    }
  });
  it('a Bot row leads to the Bots on the computer, a visit to Programs, a run to its script', () => {
    expect(rowLinks(item('kit', { serviceName: 'bots' }), ctx).map((l) => l.id)).toEqual(['computer', 'bots']);
    expect(rowLinks(item('kit', { serviceName: 'files' }), ctx).find((l) => l.page === 'programs')?.path).toBe(programsLinks.list);
    expect(rowLinks(item('script'), { ...ctx, script: 'deploy-site.sh' }).find((l) => l.page === 'scripts')?.path).toBe(scriptsLinks.item('deploy-site.sh'));
    expect(rowLinks(item('script'), ctx).find((l) => l.page === 'scripts')?.path).toBe(scriptsLinks.list);
  });
  it('every target lies under the page it names', () => {
    for (const r of [item('kit', { serviceName: 'bots' }), item('kit', { serviceName: 'x' }), item('script'), item('changes')]) {
      for (const l of rowLinks(r, { handle: 'a b.1234', script: 's/1' })) expect(l.path.startsWith(pages[l.page]), l.path).toBe(true);
    }
    expect(botsLinks.byComputer('a b')).toBe('/bots?computer=a%20b');
  });
  it('an empty source names where its entries come from', () => {
    expect(sourceHome('bots').page).toBe('bots');
    expect(sourceHome('scripts').page).toBe('scripts');
    expect(sourceHome('everything').page).toBe('programs');
    expect(sourceHome('changes').page).toBe('computers');
    // The empty list's button opens the whole page, so it says so (never "This script").
    expect([sourceHome('bots').label, sourceHome('scripts').label, sourceHome('everything').label, sourceHome('changes').label]).toEqual(['lk.openBots', 'lk.openScripts', 'lk.openPrograms', 'lk.computers']);
  });
});
