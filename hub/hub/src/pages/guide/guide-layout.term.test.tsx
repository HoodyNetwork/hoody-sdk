// Guide in a terminal: layout the compat runtime got wrong.
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | A step's code block is a block under the step's words (`<li>words <CodeBlock/></li>`): the two were drawn on one row, over each other, the block past the list's edge | 'no layout fault in the steps or the key table' (ol.steps rows) |
// | 2 | In the key table each `<div class=keyRow>` is `display: contents`: its dt and dd are the grid's items, one row a shortcut (two shortcuts shared a line and the second's label was cut) | same test (dl.keyTable rows), 'one shortcut a line' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { layoutFaults } from '../../term/prim/layoutcheck';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40], [240, 67]] as const) {
  test(`${cols}x${rows}: no layout fault in the steps or the key table`, async () => {
    s = await renderPage({ page: 'guide', cols, rows });
    await s.settle();
    const faults = layoutFaults((s.renderer as never as { root: never }).root, { cols, rows }).map((f) => `${f.kind} ${f.path}`).filter((f) => /ol\.steps|dl\.keyTable/.test(f));
    expect(faults).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 180_000);
}

test('one shortcut a line, the step words above their code', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 600 });
  const lines = (await s.settle()).split('\n');
  const at = (w: string) => lines.findIndex((l) => l.includes(w));
  // Key table: the two first shortcuts of a group are on different lines.
  const a = at('Search or jump to anything');
  const b = at('Show this list');
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  // Steps: the words, then the command on a later line.
  const w = at('Make a key on the Keys page');
  const c = lines.findIndex((l, k) => k > w && l.includes('export HOODY_TOKEN='));
  expect(w).toBeGreaterThan(-1);
  expect(c).toBeGreaterThan(w);
  expect(lines[w]).not.toContain('HOODY_TOKEN');
}, 180_000);
