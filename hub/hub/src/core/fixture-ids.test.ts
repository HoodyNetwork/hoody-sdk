// The fixture seam: live core and app modules import no fixture module, and the live transport's fixture
// anchors (literals) equal the world's.
import { describe, expect, it } from 'vitest';
import { FIXTURE_REALM, FIXTURE_TARGET, FIXTURE_UID } from './transport';
import { fixtureWorld } from './world';
import { fixtureComputer, pageFixtures } from './fixture-seam';
import { discoverPages, visiblePages } from '../app/pages';
import '../app/fixtures';

// index.ts is the fixture-adding barrel; the live barrel is index.live.ts (checked here) and index.ts is checked below.
const LIVE = import.meta.glob<string>(['./index.live.ts', './shell.ts', './transport.ts', './fixture-seam.ts', '../app/pages.ts'], { eager: true, query: '?raw', import: 'default' });
const INDEX = import.meta.glob<string>(['./index.ts'], { eager: true, query: '?raw', import: 'default' });
const FIXTURE_IMPORT = /from '(\.\/(world|fixtures|fixture-boot|index\.fixtures|run-open\/fixtureKits)|@kit\/gallery\/[^']*|\.\.\/pages\/demo\/[^']*|\.\/fixtures|@app\/fixtures)'/;

describe('live modules import no fixture module', () => {
  it.each(Object.keys(LIVE))('%s', (f) => {
    // Type-only imports are erased at build (fixture-seam.ts names WorldComputer): only value imports count.
    const value = LIVE[f]!.split('\n').filter((l) => !/^import type /.test(l)).join('\n');
    expect(value).not.toMatch(FIXTURE_IMPORT);
  });
});

describe('@core (index.ts) is the live barrel plus fixture names only', () => {
  it('re-exports index.live whole, and every other export comes from a fixture module', () => {
    const idx = Object.values(INDEX)[0]!;
    const code = idx.split('\n').filter((l) => l.trim() !== '' && !/^\s*\/\//.test(l));
    expect(code).toContain("export * from './index.live';");
    const rest = code.filter((l) => l !== "export * from './index.live';");
    expect(rest.length).toBeGreaterThan(0);
    for (const l of rest) expect(l, l).toMatch(/^export \{[^}]*\} from '[^']+';$/);
    for (const l of rest) expect(l, l).toMatch(FIXTURE_IMPORT);
  });
});

describe('fixture anchors equal the world', () => {
  it('account, first realm, current computer', () => {
    expect(FIXTURE_UID).toBe(fixtureWorld.account.id);
    expect(FIXTURE_REALM).toBe(fixtureWorld.realms[0]!.id);
    expect(FIXTURE_TARGET).toEqual({ project: { id: fixtureWorld.current.project_id }, container: { id: fixtureWorld.current.id, server_name: fixtureWorld.current.server_name } });
  });
});

describe('the seam answers once the fixture side loaded', () => {
  it('computers, page sources, dev pages', async () => {
    await import('./fixture-boot');
    expect(fixtureComputer(fixtureWorld.current.id)?.name).toBe(fixtureWorld.current.name);
    expect(fixtureComputer('nope')).toBeUndefined();
    const s = pageFixtures('logs');
    expect(s).toBe(pageFixtures('logs'));
    expect(typeof s?.useQuery).toBe('function');
    const all = discoverPages().pages;
    expect(all.some((p) => p.id === 'demo')).toBe(true);
    expect(visiblePages(all, { preview: true, only: '*', fixtures: true }).some((p) => p.id === 'kit-gallery' || p.path === '/_kit')).toBe(true);
  });
});
