// Real-px breakpoints, whole pages: a width condition is judged by cells x 8 px (the terminal for @media, the page
// pane for @container), not by a coarse narrow / medium / wide class.
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | Guide: two columns from 760 px of page, one column with the index as a strip below (`@container guide (width < 760px)`). At 100 columns the pane is 608 px: the old medium class (800 px) drew two columns | 'Guide: two columns at 120, one column and a strip at 100 and 80' |
// | 2 | A resize across a band draws the next frame from the band's table; coming back builds nothing | same test (the resolver of 120 is reused) |
// | 3 | The Agent dock takes columns from the page: container conditions follow the pane, not the window | 'the Agent dock narrows the pane: the Guide goes one-column at 120' |
// | 4 | Home under 640 px of page: "What is Hoody?" is a line of its own under the context line (`.reopenPhone { display: block }`) | 'Home at 100 columns' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { styleResolver, styleWidthClass } from '../jsx/style';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

const ALT = { meta: true } as never; // Alt+J: the Agent dock (as ask-open-type.term.test.tsx presses it)
const TWO_COLUMNS = /▌Ask your agent\s{4,}┌─/; // the index's current item and the first section's card on one row
const STRIP = /▌Ask your agent\s+Connect\s+Skills\b/; // the index as one wrapping row

test('Guide: two columns at 120, one column and a strip at 100 and 80; back at 120 the same table', async () => {
  const s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  close = () => s.close();
  expect(await s.settle()).toMatch(TWO_COLUMNS);
  const at120 = styleResolver();
  const key120 = styleWidthClass();

  await s.resize(100, 30);
  expect(s.frame).toMatch(STRIP);
  expect(s.frame).not.toMatch(TWO_COLUMNS);
  expect(styleWidthClass()).not.toBe(key120);

  await s.resize(80, 24);
  expect(s.frame).toMatch(STRIP);

  await s.resize(120, 40);
  expect(s.frame).toMatch(TWO_COLUMNS);
  expect(styleWidthClass()).toBe(key120);
  expect(styleResolver()).toBe(at120); // nothing rebuilt
}, 240_000);

test('the Agent dock narrows the pane: the Guide goes one-column at 120, and back when it closes', async () => {
  const s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  close = () => s.close();
  expect(await s.settle()).toMatch(TWO_COLUMNS);
  const key = styleWidthClass();
  await s.keys.press('j', ALT);
  await s.settle();
  expect(styleWidthClass()).not.toBe(key);
  expect(s.frame).toMatch(STRIP);
  await s.keys.press('j', ALT);
  await s.settle();
  expect(styleWidthClass()).toBe(key);
  expect(s.frame).toMatch(TWO_COLUMNS);
}, 240_000);

test('Home at 100 columns (a 608 px page): "What is Hoody?" is a line of its own under the context line', async () => {
  const s = await renderPage({ page: 'home', cols: 100, rows: 30 });
  close = () => s.close();
  const rows = (await s.settle()).split('\n');
  const ctx = rows.findIndex((r) => r.includes('SG n12'));
  expect(ctx).toBeGreaterThan(0);
  expect(rows[ctx]).not.toContain('What is Hoody?');
  expect(rows[ctx + 1]).toContain('What is Hoody?');
}, 240_000);
