// The Bots listed beside an open Bot (the rail, from about 122 columns) are two lines each, as on the web: the name
// with its status, then what the Bot is doing. The card rows of the page's own list (the model on a line of its own,
// the reach foot under it) took four lines there, and the foot wrapped the app names letter by letter in the rail's
// 36 cells when a privacy note stood beside them.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
// The rail's cells of each line: between the sidebar's edge and the open Bot's (the scrollbar cells left out).
const railOf = (text: string): string[] => text.split('\n').map((l) => (l.split('│')[1] ?? '').replace(/[█░]/g, ' ').trimEnd());
// A Bot's name line in the rail: its mark letter, its name, then its status dot.
const nameLine = (l: string): boolean => /^\s*▌?\s+[A-Z] \S.*●/.test(l);

test('a rail row is two lines: no model line, no reach foot', async () => {
  s = await renderPage({ page: 'bots', fx: 'idle', path: `/bots?sel=${encodeURIComponent(CHIEF)}`, cols: 140, rows: 40 });
  const rail = railOf(await s.settle());
  const at = rail.findIndex((l) => nameLine(l) && l.includes('Chief'));
  expect(at).toBeGreaterThan(0);
  // The line after Chief's activity line is the next Bot's name line.
  expect(rail[at + 1]).toContain('Last active');
  expect(nameLine(rail[at + 2]!)).toBe(true);
  const all = rail.join('\n');
  expect(all).not.toContain('Model Hoody Free');
  expect(all).not.toContain('Public link');
  expect(all).not.toContain('Only here in the Hub');
  // 33 rows of rail: the four-line rows showed 8 Bots.
  expect(rail.filter(nameLine).length).toBeGreaterThanOrEqual(14);
  expect(s.failures).toEqual([]);
}, 180_000);

test('app names are never wrapped letter by letter beside a privacy note', async () => {
  s = await renderPage({ page: 'bots', fx: 'chatsWaiting', path: `/bots?sel=${encodeURIComponent(CHIEF)}`, cols: 140, rows: 40 });
  const rail = railOf(await s.settle());
  expect(rail.some((l) => nameLine(l) && l.includes('Chief'))).toBe(true);
  // "Te", "le", "gr", "am": a line holding one or two letters is a word cut into a two-cell column.
  expect(rail.filter((l) => /^\s*[A-Za-z]{1,2}\s*$/.test(l))).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

test('the page\'s own list keeps its card rows: model and reach foot', async () => {
  s = await renderPage({ page: 'bots', fx: 'chatsWaiting', cols: 120, rows: 40 });
  const text = await s.settle();
  expect(text).toContain('Model Hoody Free');
  expect(text).toContain('Public link');
  expect(text).toContain('Telegram privacy on');
  expect(s.failures).toEqual([]);
}, 180_000);
