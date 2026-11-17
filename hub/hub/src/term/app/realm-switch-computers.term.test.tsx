// After a switch to "Acme client" (3 computers in the realm menu) the top bar said "No computers yet":
// the pages' default fixtures answered the computer list with the first realm's rows for every realm, and the Hub keeps
// only the selected realm's. The fixture boot now answers another realm's list from the fixture world (boot.ts).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { FIXTURE_REALM_2 } from '../../core/fixtures';
import { switchTo } from '../../core/realm';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('after a realm switch the top bar names a computer of that realm', async () => {
  s = await renderPage({ page: 'home', cols: 140, rows: 40 });
  await s.settle();
  expect(await switchTo(FIXTURE_REALM_2)).toBe(true);
  let frame = await s.settle();
  for (let i = 0; i < 50 && !frame.includes('◆ Acme client ▾'); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await s.settle(); }
  for (let i = 0; i < 30 && /Loading/.test(frame.split('\n')[0] ?? ''); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await s.settle(); }
  expect(frame).toContain('◆ Acme client ▾');
  expect(frame).not.toContain('No computers yet');
}, 180_000);
