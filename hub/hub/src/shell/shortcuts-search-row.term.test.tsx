// The `?` sheet listed "/ Search this page's list" on every page, though on a page with no search field the
// key only answers "This page has no search field". The row is drawn only while a search field is on screen.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const SEARCH = "Search this page's list";

test('a page with no search field: the sheet has no / row', async () => {
  s = await renderPage({ page: 'billing', cols: 140, rows: 60 });
  await s.settle();
  await s.keys.type('?');
  const frame = await s.settle();
  expect(frame).toContain('Search or jump to anything');
  expect(frame).not.toContain(SEARCH);
}, 180_000);

test('a page with a list search: the sheet keeps the / row', async () => {
  s = await renderPage({ page: 'computers', cols: 140, rows: 60 });
  await s.settle();
  await s.keys.type('?');
  const frame = await s.settle();
  expect(frame).toContain(SEARCH);
}, 180_000);
