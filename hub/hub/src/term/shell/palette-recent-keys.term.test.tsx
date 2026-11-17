// The palette's Recent rows are their own rows. In a live terminal at 80x24 a page opened from the palette
// is listed twice on the next empty-field open, under Recent and under Pages, and both rows had the same list key
// (`page:<id>`): React reported "two children with the same key" on every open, which the live mount kept as
// UNHANDLED problem records and the launcher printed on leave. A row listed twice keeps one key per row.
// Also here: Ctrl+K in the open palette closes it (the web's palette key toggles; before, the key did nothing there).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('a page run from the palette shows under Recent and under Pages with no key clash, and Recent still runs it', async () => {
  s = await renderPage({ page: 'bots', fx: 'idle', path: '/bots', cols: 80, rows: 24 });
  await s.settle();
  await s.keys.press('k', { ctrl: true });
  await s.keys.type('Home');
  await s.settle();
  await s.keys.press('return');
  await s.settle();
  await s.keys.press('k', { ctrl: true });
  const f = await s.settle();
  // Recent, with the page just run, above the full list of pages (which still holds it).
  const lines = f.split('\n');
  const recent = lines.findIndex((l) => /RECENT/.test(l));
  const pagesAt = lines.findIndex((l) => /PAGES/.test(l));
  expect(recent, f).toBeGreaterThan(0);
  expect(lines[recent + 1], f).toContain('Home');
  expect(lines.slice(pagesAt).some((l) => l.includes('Home')), f).toBe(true);
  expect(pagesAt, f).toBeGreaterThan(recent);
  expect(s.errors.filter((e) => /same key/.test(e)), f).toEqual([]);
  // The Recent row is the active one and Enter runs it: the palette closes on the page.
  await s.keys.press('return');
  const after = await s.settle();
  expect(after, after).not.toContain('Command palette');
  expect(s.errors.filter((e) => /same key/.test(e))).toEqual([]);
}, 240_000);

test('Ctrl+K in the open palette closes it, as the web toggles it', async () => {
  s = await renderPage({ page: 'bots', fx: 'idle', path: '/bots', cols: 80, rows: 24 });
  await s.settle();
  await s.keys.press('k', { ctrl: true });
  const open = await s.settle();
  expect(open, open).toContain('Command palette');
  await s.keys.press('k', { ctrl: true });
  const closed = await s.settle();
  expect(closed, closed).not.toContain('Command palette');
  expect(closed, closed).toContain('HOODY');
}, 240_000);
