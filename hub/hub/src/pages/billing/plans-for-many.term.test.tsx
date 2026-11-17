// "Plans for" with many servers in a terminal of 24 rows: the default, "A new server", is the first choice, so it is
// on screen and marked chosen however many servers follow it.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('80x24, many servers: "A new server" is drawn chosen, before the first server', async () => {
  s = await renderPage({ page: 'billing', fx: 'many26', cols: 80, rows: 24 });
  const frame = await s.settle();
  expect(s.failures).toEqual([]);
  const lines = frame.split('\n');
  const chosen = lines.findIndex((l) => l.includes(`(•) ${strings['plans.forNew']}`));
  expect(chosen).toBeGreaterThan(-1);
  const firstServer = lines.findIndex((l) => /\( \) node-\d+/.test(l));
  expect(firstServer === -1 || firstServer > chosen).toBe(true);
});
