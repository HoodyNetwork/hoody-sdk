// The terminal Security checklist keeps its heading while its reads are out, as the web's SubSection does: the loading
// frame shows "Security" over the rows' skeleton, never a bare skeleton.
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from '../../term/app/boot';
import { beginTermSession, type TermSession } from '../../term/env/session';
import type { TermBoot } from '../../term/app/lifecycle';
import { createTermApp } from '../../term/app/App';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';

setDefaultTimeout(60_000);

const SRC = path.resolve(import.meta.dir, '../..');
const TITLE = (JSON.parse(readFileSync(path.join(SRC, 'pages/account/strings.en.json'), 'utf8')) as Record<string, string>)['sum.railTitle']!;

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;

beforeAll(async () => {
  pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'account', fx: 'loading' });
  await boot.start(session, () => undefined);
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

test('the loading Security checklist keeps its heading', async () => {
  const app = createTermApp({ pages, queryClient, path: '/account', onQuit: () => undefined });
  t = await drawTest(app.element, { width: 120, height: 40 });
  const end = performance.now() + 8000;
  let found = false;
  while (!found && performance.now() < end) {
    await t.settle();
    const tree = semanticsOf(t.renderer as unknown as SemRoot);
    found = queryAllByRole(tree, 'heading', { name: TITLE }).length > 0;
    if (!found) await new Promise((r) => setTimeout(r, 50));
  }
  expect(found).toBe(true);
});
