// Alt+R where the top bar has no realm switcher (an access key over all realms whose realm list is empty, which can
// make none: Switchers.term.tsx RealmSwitcher draws nothing): the status line says why, as Alt+C does with no computer
// switcher (status.noComputers). Before: nothing happened, while the `?` sheet lists Alt+R.
// Its own file: the shell's other tests boot the account session, where the realm switcher always shows.
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import type { PageManifest } from '@kit/page';
import { bootFixtureCore, fixtureSession, queryClient, realmsFixture } from '@core';
import { bootPageOrder, fixtureStore, loadCoreRules, resetFixtureServers } from '@app/fixtures';
import { disposeCoreSession } from '../../core/dispose';
import { configureLifecycle } from '../../core/lifecycle';
import { installTransport } from '../../core/transport';
import { discoverPages, visiblePages } from '../../app/pages';
import { beginTermSession, type TermSession } from '../env/session';
import { createTermApp } from '../app/App';
import { drawTest, type TestTerm } from '../prim/testing';
import strings from './strings.en.json';

setDefaultTimeout(30_000);

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let t: TestTerm | null = null;

beforeAll(async () => {
  pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  session = beginTermSession();
  // The fixture boot of app/boot.ts (bootTermFixtures), with an access key over all realms and no realm listed.
  configureLifecycle({ navigate: () => {}, herePath: () => '/' });
  fixtureStore.set({ state: null, latency: 'instant' });
  const ids = pages.map((p) => p.id);
  await resetFixtureServers(ids);
  const pageRules = await loadCoreRules(bootPageOrder(ids, '#/schedules'), null);
  bootFixtureCore({ rules: [fixtureSession({ kind: 'token', caps: [], realm: 'all' }), ...realmsFixture([]), ...pageRules], keepStorage: true }).setExtraDelay(0);
});
afterAll(async () => {
  await t?.dispose();
  try { await disposeCoreSession('term-quit'); } finally { configureLifecycle({ navigate: () => {}, herePath: () => '/' }); installTransport(null); }
  session?.end();
});

/** Settles until the frame passes (or 4 s). */
async function until(ok: (f: string) => boolean, ms = 4000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}

test('Alt+R with no realm switcher says there is no realm to pick', async () => {
  const app = createTermApp({ pages, queryClient, path: '/schedules', onQuit: () => {} });
  t = await drawTest(app.element, { width: 120, height: 40 });
  let f = await until((x) => x.includes('HOODY') && !x.includes('Loading…'));
  // The case under test: no realm trigger in the top bar (the account session draws `◆ <realm> ▾` there).
  expect(f.split('\n')[0], f).not.toContain('◆');
  t.mockInput.pressKey('r', { meta: true });
  f = await until((x) => x.includes(strings['status.noRealms']));
  expect(f.split('\n').slice(-2).join('\n'), f).toContain(strings['status.noRealms']);
});
