// The Schedules page on its fixtures, as the terminal draws it: behaviour here; the frames of every fixture state at
// both sizes are page goldens (src/pages/schedules/term-golden, written by `bun scripts/term/check.ts --page schedules`
// on a frozen clock). The two frames below pin the three layout symptoms (cells running together, stacked header).
import { afterAll, afterEach, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { renderPage, type PageSession } from '../../../scripts/term/render';

const dir = path.join(import.meta.dirname, 'golden');
// One mount per process at a time (TERM_SESSION_ACTIVE): each test closes its session before the next opens one.
const sessions: PageSession[] = [];
const closeAll = (): void => { for (const s of sessions.splice(0)) s.close(); };
afterEach(closeAll);
afterAll(closeAll);

function check(name: string, frame: string): void {
  const file = path.join(dir, name);
  const text = frame.split('\n').map((l) => l.trimEnd()).join('\n').trimEnd() + '\n';
  if (process.env.UPDATE_GOLDEN === '1') { fs.writeFileSync(file, text); return; }
  // Times move with the clock here (page goldens freeze it): compare with digits masked.
  const mask = (x: string): string => x.replace(/\d/g, '0');
  expect(mask(text)).toBe(mask(fs.readFileSync(file, 'utf8')));
}

test('schedules at 120x40: the real table inside the shell, no stand-in drawn', async () => {
  const s = await renderPage({ page: 'schedules', cols: 120, rows: 40 });
  sessions.push(s);
  expect(s.failures).toEqual([]);
  expect(s.placeholders.rendered).toEqual([]);
  expect(s.frame).toContain('ping-api');
  check('schedules.120x40.txt', s.frame);
}, 60_000);

test('schedules at 80x24: no sidebar, fewer columns', async () => {
  const s = await renderPage({ page: 'schedules', cols: 80, rows: 24 });
  sessions.push(s);
  expect(s.failures).toEqual([]);
  expect(s.frame).not.toContain('BUILD');
  check('schedules.80x24.txt', s.frame);
}, 60_000);

// With the shell's sidebar a 120-column body has room for one pane: the detail takes the list's place under the back
// row ("‹ Schedules  Esc"), which is its only way back. Close details belongs to a pane drawn beside the list.
test('Down, Enter opens the detail in place of the list; Esc brings the list back', async () => {
  const s = await renderPage({ page: 'schedules', cols: 120, rows: 40 });
  sessions.push(s);
  await s.keys.press('down');
  await s.keys.press('enter');
  expect(s.frame).toContain('‹ Schedules  Esc');
  expect(s.frame).toContain('[Run now]');
  expect(s.frame).not.toContain('[Close details]');
  expect(s.failures).toEqual([]);
  await s.keys.press('escape');
  expect(s.frame).not.toContain('‹ Schedules  Esc');
  expect(s.frame).not.toContain('[Run now]');
  expect(s.frame).toContain('ping-api');
}, 60_000);
