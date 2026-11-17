// The Location choice of Buy a plan in a terminal of 80x24 and 120x40: the same choice with the same words as on the
// web: Automatic first, the plan's locations as city and country, a full one listed as Full and not choosable, and the
// line under the choice saying where the server will be. Fixtures only: nothing is sent.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { setLiveGate, type LiveGate } from '../../core/live-gate';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; setLiveGate(null); });

/** Clicks the first line holding `text`, on the text. */
async function clickText(text: string): Promise<string> {
  const frame = await s!.settle();
  const lines = frame.split('\n');
  const y = lines.findIndex((l) => l.includes(text));
  expect(y).toBeGreaterThan(0);
  await s!.click(lines[y]!.indexOf(text) + 2, y);
  return s!.settle();
}
async function openBuy(cols: number, rows: number, fx?: string): Promise<string> {
  s = await renderPage({ page: 'billing', path: '/billing?checkout=buy&plan=fam-plus', fx, cols, rows });
  await s.settle();
  await s.keys.press('end');
  return s.settle();
}

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: the choice is there, Automatic by default, with where that is now`, async () => {
    const frame = await openBuy(cols, rows);
    expect(frame).toContain(strings['loc.label']);
    expect(frame).toContain(strings['loc.auto']);
    // The words wrap at 80 columns (the page behind shows beside the drawer): the first sentence is on one line.
    expect(frame).toContain(strings['loc.autoNow'].replace('{{place}}', 'Frankfurt, Germany').split('. ')[0]!);
  }, 180_000);

  test(`${cols}x${rows}: the list names each location; the full one says Full and cannot be chosen; a choice says where the server will be`, async () => {
    await openBuy(cols, rows);
    const open = await clickText(strings['loc.auto']);
    for (const name of ['Frankfurt, Germany', 'Helsinki, Finland', 'Singapore', 'New York, United States']) expect(open).toContain(name);
    const full = open.split('\n').find((l) => l.includes('New York, United States'))!;
    expect(full).toContain(strings['loc.full']);
    // The full one: a click chooses nothing (the list stays or closes on Automatic).
    await clickText('New York, United States');
    await s!.keys.press('escape');
    expect(await s!.settle()).toContain(strings['loc.auto']);
    await clickText(strings['loc.auto']);
    await clickText('Helsinki, Finland');
    await s!.keys.press('end');
    const chosen = await s!.settle();
    expect(chosen).toContain(strings['loc.chosen'].replace('{{place}}', 'Helsinki, Finland').split('. ')[0]!);
    expect(chosen).toContain('Helsinki, Finland ▾');
    expect(chosen).not.toContain(strings['loc.auto']);
  }, 240_000);
}

test('80x24: the list cannot be read: said, Automatic stays, and the purchase is not blocked', async () => {
  let all = await openBuy(80, 24, 'regions-error');
  for (let i = 0; i < 4; i += 1) { await s!.keys.press('pageup'); all += await s!.settle(); }
  expect(all).toContain(strings['loc.auto']);
  expect(all).toContain(strings['loc.listErr'].split('. ')[0]!);
  expect(all).toContain('Confirm purchase');
  expect(all).not.toContain('Frankfurt');
}, 180_000);

// The live terminal sends no payment (its checkout hands off to the web Hub), so it offers no Location choice: the
// place of a server is permanent and a choice made here could not be carried there.
const GATE: LiveGate = { direct: () => Promise.reject(Object.assign(new Error('not sent'), { kind: 'not_sent', notSent: true })) };
for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}, live terminal: no Location choice, one line that it is chosen at checkout in the web Hub`, async () => {
    setLiveGate(GATE);
    s = await renderPage({ page: 'billing', path: '/billing?checkout=buy&plan=fam-plus', fx: null, cols, rows });
    await s.settle();
    await s.keys.press('end');
    const frame = (await s.settle()).replace(/[┃│]/g, ' ').replace(/\s+/g, ' ');
    expect(frame).toContain(strings['loc.atCheckout']);
    expect(frame).not.toContain(strings['loc.auto']);
    expect(frame).not.toContain(strings['loc.autoNow'].split('{{place}}')[0]!.trim());
    expect(frame).not.toContain('Confirm purchase');
  }, 180_000);
}
