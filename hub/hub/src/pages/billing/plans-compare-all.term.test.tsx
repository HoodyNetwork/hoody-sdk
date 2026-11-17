// Compare plans in a terminal keeps every plan and every row. The kit draws the table as list rows there: each row is
// its label, then every plan's value named by its plan. The values once stopped after the third plan (the list row's
// cap on meta fields), so Large and Bare metal showed in no row. The rows below the first 30 lines sit in the table's
// own scroll: the cursor reaches them.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const TITLE = strings['plans.cmp.title'];
/** Every row the fixture's table has, top to bottom. */
const ROWS = [
  strings['col.price'], strings['buy.resComputers'], strings['buy.resCpu'], strings['buy.resRam'], strings['buy.resDisk'], strings['buy.resDiskIo'], strings['buy.resNetwork'],
  strings['plans.hardware'], strings['plans.regions'],
  strings['buy.resSnapshots'], strings['buy.resBotUrls'], strings['buy.resAliases'], strings['plans.aiLabel'], strings['plans.cmp.realms'], strings['plans.cmp.vms'],
];
/** The rows after Regions (the catalogue's lower facts and the one the page words). */
const BOTTOM = ROWS.slice(ROWS.indexOf(strings['plans.regions']) + 1);

/** The table's lines in one frame: from under its title to the next section's frame, without the sidebar, the cursor
 *  mark and the scroll bar. */
function tableLines(frame: string): string[] {
  const lines = frame.split('\n');
  const at = lines.findIndex((l) => l.includes(TITLE));
  if (at < 0) return [];
  const x = lines[at]!.indexOf(TITLE);
  const out: string[] = [];
  for (const l of lines.slice(at + 1)) {
    const own = l.slice(Math.max(0, x - 2));
    if (/^\s*[┌┏]/.test(own)) break;
    out.push(own.replace(/[›▌█░▀▄]/g, ' ').replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** Each row's words, read over the frames as the cursor walks down the table: label -> its value lines, joined. */
async function walk(cols: number, rows: number): Promise<Map<string, string>> {
  s = await renderPage({ page: 'billing', cols, rows });
  let frame = await s.settle();
  const lines = frame.split('\n');
  const y = lines.findIndex((l, i) => i > lines.findIndex((m) => m.includes(TITLE)) && l.replace(/[›▌█░│┃]/g, ' ').trim() === ROWS[0]);
  expect(y, 'the Price row is drawn under the title').toBeGreaterThan(0);
  await s.click(lines[y]!.indexOf(ROWS[0]!) + 1, y);
  const seen = new Map<string, string>();
  for (let step = 0; step <= ROWS.length + 2; step++) {
    frame = await s.settle();
    const body = tableLines(frame);
    let label: string | null = null;
    for (const l of body) {
      if (ROWS.includes(l)) { label = l; if (!seen.has(l)) seen.set(l, ''); continue; }
      if (label !== null && l !== '') seen.set(label, mergeLine(seen.get(label)!, l));
    }
    await s.keys.press('down');
  }
  expect(s.failures).toEqual([]);
  return seen;
}

/** A row's value lines kept once each, in the order first seen (a row is drawn in several frames, sometimes in part). */
const mergeLine = (have: string, line: string): string => (` ${have} `.includes(` ${line} `) ? have : `${have} ${line}`.trim());

for (const [cols, rows] of [[120, 300], [80, 160]] as const) {
  test(`${cols} columns: every row names the plans on sale and Bare metal, and the cursor reaches the rows after Regions`, async () => {
    const seen = await walk(cols, rows);
    expect([...seen.keys()]).toEqual(ROWS);
    for (const label of BOTTOM) expect(seen.has(label), label).toBe(true);
    const names = ['Small', 'Medium', 'Large', strings['plans.bareMetal']];
    for (const label of [strings['col.price'], strings['plans.hardware'], strings['plans.cmp.vms']]) {
      const value = seen.get(label)!;
      let from = 0;
      for (const name of names) {
        const at = value.indexOf(name, from);
        expect(at, `${label}: ${name} in "${value}"`).toBeGreaterThanOrEqual(0);
        from = at + name.length;
      }
    }
    // The values themselves, not only the names: Large's price and Bare metal's own words.
    expect(seen.get(strings['col.price'])).toContain('Large $59 a month');
    expect(seen.get(strings['plans.hardware'])).toContain(`${strings['plans.bareMetal']} ${strings['plans.cmp.dedicated']}`);
  }, 180_000);
}
