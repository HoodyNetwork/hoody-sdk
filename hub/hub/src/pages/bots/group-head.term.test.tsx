// Bots grouped by computer: a group header never gives a count that is not known or not true (for example
// "mellow-canyon No Bots" above "Couldn't read this computer's Bots", and "No Bots · 1 paused").
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { localSetting } from '../../core/prefs';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

// Group headers are drawn in the List presentation (where the page offers Cards / List, Cards is the default and
// draws no headers: the computers' notes sit above the grid). Chosen as the reader does: the remembered setting.
const asList = (): void => { void localSetting('hub.v3.table.present.bots').set('list'); };

// The group's own header line: a notice row above the groups may name the computer too ("<name>: ..."), and may push
// the header below the fold, so page down until the header is drawn.
async function headOf(p: PageSession, name: string): Promise<string> {
  let text = await p.settle();
  for (let i = 0; i < 6; i++) {
    const head = text.split('\n').find((l) => l.includes(name) && !l.includes(`${name}:`));
    if (head !== undefined) return head;
    p.keys.press('pagedown');
    text = await p.settle();
  }
  return '';
}

test('a computer whose Bots could not be read is headed "Couldn\'t read Bots"', async () => {
  s = await renderPage({ page: 'bots', cols: 120, rows: 40, fx: 'railLong', afterBoot: asList });
  const text = await s.settle();
  const head = await headOf(s, 'cinder-production-worker-eu-central-01');
  expect(head).toContain("Couldn't read Bots");
  expect(text).not.toContain('No Bots');
  expect(s.failures).toEqual([]);
}, 180_000);

test('a computer whose only Bots are paused shows no count, the pill says how many', async () => {
  s = await renderPage({ page: 'bots', cols: 120, rows: 40, fx: 'railPaused', afterBoot: asList });
  const text = await s.settle();
  const head = await headOf(s, 'glad-silver-falcon');
  expect(head).toContain('1 paused');
  expect(head).not.toContain('Bots');
  expect(text).not.toContain('No Bots');
  expect(s.failures).toEqual([]);
}, 180_000);
