// Account > This browser in a terminal at 80x24: the Language row's button opens the list, arrows move through it, a
// coming-soon language does nothing, and Escape closes the list back to the page.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('the Language row end to end at 80x24', async () => {
  s = await renderPage({ page: 'account', path: '/account?section=browser', cols: 80, rows: 24 });
  let f = await s.settle();
  expect(s.failures).toEqual([]);
  const lines = f.split('\n');
  const y = lines.findIndex((l) => l.includes('[English ▾]'));
  expect(y, f).toBeGreaterThan(-1);
  expect(lines[y]).toContain('Language');
  expect(f).not.toContain('Bosanski');
  await s.click(lines[y]!.indexOf('[English ▾]') + 2, y);
  f = await s.settle();
  expect(f, 'the list is open').toContain('Bosanski');
  const before = f;
  await s.keys.press('down');
  f = await s.settle();
  expect(f, 'the cursor moved').not.toBe(before);
  await s.keys.press('enter');
  f = await s.settle();
  expect(f, 'a coming-soon language leaves the list open').toContain('Bosanski');
  await s.keys.press('escape');
  f = await s.settle();
  expect(f).not.toContain('Bosanski');
  expect(f).toContain('[English ▾]');
  expect(s.failures).toEqual([]);
}, 240_000);
