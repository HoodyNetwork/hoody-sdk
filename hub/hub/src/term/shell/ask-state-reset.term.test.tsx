// The Agent dock left open by one test is closed for the next (scripts/term/test-preload.ts calls kit/ask.ts
// resetAskForTests after every test). kit/ask.ts keeps the dock's state for the process and in the host's storage, so
// before, every later test file drew its first frame with the dock open: ten page tests went red after one Ask test,
// and entry.term.test.tsx's "q ends the mount" timed out when run after app/askdock.term.test.tsx.
// The two tests are one sequence: bun runs a file's tests in order.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

// Alt: the mock input takes `meta`; the session's key type names only shift and ctrl.
const ALT = { meta: true } as never;
let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('first: a test opens the dock and leaves it open', async () => {
  s = await renderPage({ page: 'home', cols: 120, rows: 40 });
  await s.settle();
  await s.keys.press('j', ALT);
  expect(await s.settle()).toContain('Close Agent');
}, 240_000);

test('then: the next test starts with the dock closed', async () => {
  s = await renderPage({ page: 'home', cols: 120, rows: 40 });
  expect(await s.settle()).not.toContain('Close Agent');
}, 240_000);
