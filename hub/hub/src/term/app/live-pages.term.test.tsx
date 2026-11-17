// No live page reads the fixture world: a fixtures-compiled build on a LIVE
// transport (a terminal live mount, live tests) has no fixture side loaded, so a live-path fixture read throws
// FIXTURES_NOT_INSTALLED and the page draws its error boundary; in a dev web build it would show fixture names as real.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Every visible page, mounted LIVE on a fake client (boot answered, everything else 404) with a computer chosen that the shell's list does not hold: no page shows FIXTURES_NOT_INSTALLED (hooks registered outside fixture mode, fixtureComputer on the live path, any other seam read) | 'every page live, no fixture read' |
// | 2 | Static: in every live page module (not a test, not dev-only), each `fixtureComputer(` call is guarded on its own line, `fixtureModeActive() ? fixtureComputer(` (a call on a path test 1 does not draw is caught too) | 'live modules guard fixture reads' |
//
// Limit (stated): fixture HOOKS (a pageFixtures source's useQuery/useMutation) are checked by behaviour only (test 1):
// pages dispatch them in several shapes (`fixtureModeActive() ? useFx() : useLive()`, use…Fixture functions), so a
// line rule would be all false positives. Test 1 sees what each page draws first, with a computer chosen; a hook
// registered only on a later screen is not exercised.
import { afterEach, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { isDevOnly } from '../../../scripts/term/build/plugin';
import { discoverPages, visiblePages } from '../../app/pages';
import { currentTermSession } from '../env/session';
import { mountTerminalHub } from '../entry';
import type { HoodyClient, Receipt } from '../host-types';
import { fakeApiClient } from '../../../scripts/term/live-fake-api';
import { UNSTYLED_FOR_TESTS } from './styles';

setDefaultTimeout(240_000);
afterEach(() => { currentTermSession()?.end(); });

const HUB = path.resolve(import.meta.dir, '..', '..', '..');

function fakeClient(): { client: HoodyClient; end: () => void } {
  // The real adapter over an in-memory wire (a live mount is always wired: a fake must pass its attempt).
  return fakeApiClient({ table: {
    'GET /users/auth/me': { data: { id: '64f0ada00000000000000001', username: 'ada', email: 'ada@example.com' } },
    'GET /realms': { data: { realm_ids: [] } },
  } });
}

test('every page live, no fixture read', async () => {
  const pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false }).filter((p) => !p.path.includes(':'));
  expect(pages.length).toBeGreaterThan(10);
  const bad: string[] = [];
  for (const p of pages) {
    const f = fakeClient();
    let out = '';
    const done: Promise<Receipt> = mountTerminalHub({
      styles: UNSTYLED_FOR_TESTS, client: f.client, route: { page: p.id, path: p.path }, onSetDefault: async () => {},
      context: { profile: 'test', realmId: 'all', projectId: '6a0000000000000000000001', containerId: 'c0a7150000000000000000a1' },
      io: { cells: { write: (s) => { out += s; } }, input: { onData: () => () => {} }, size: () => ({ cols: 100, rows: 30 }), colourTier: 'mono' },
    });
    for (let i = 0; i < 400 && !out.includes('HOODY'); i++) await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setTimeout(r, 600));
    if (out.includes('FIXTURES_NOT_INSTALLED')) bad.push(p.id);
    f.end();
    await done;
  }
  expect(bad).toEqual([]);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec|scenario)\.|\.term\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

test('live modules guard fixture reads', () => {
  const bad: string[] = [];
  for (const f of walk(path.join(HUB, 'src', 'pages'))) {
    const rel = path.relative(HUB, f);
    if (isDevOnly(rel)) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/\bfixtureComputer\(/.test(code) && !/\bfixtureModeActive\(\)\s*\?\s*fixtureComputer\(/.test(code)) bad.push(`${rel}:${i + 1} fixtureComputer outside fixture mode`);
    });
  }
  expect(bad).toEqual([]);
});
