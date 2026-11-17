// Home and the onboarding tour in a terminal. On the web Home opens the tour once for a new account whose first computer
// is being made, and offers it once (the Welcome) when that computer already runs. In the terminal the tour is a
// hand-off to the web Hub (pages/onboarding/page.ts `handoff`), so Home does neither: it stays put. The Welcome's tour
// entry is a hand-off line (kit Handoff, parts/Welcome.tsx): it opens the web Hub and never routes into the tour page.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The first computer is being made: Home stays (no move to /onboarding) | 'first computer being made: Home stays' |
// | 2 | The first computer runs: no Welcome opened by the tour offer | 'first computer running: no tour offer' |
// | 3 | The opened Welcome's tour line opens the web tour; Home stays | 'the Welcome's tour line hands off to the web' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import tour from '../onboarding/strings.en.json';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });
const flat = (f: string): string => f.replace(/[│┃║┌┐└┘─╭╮╰╯]/g, ' ').replace(/\s+/g, ' ');
const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};
// The web rules hold in the All-realms view only (pages/home/data.ts firstMaking / firstRunning); the fixture opens on
// one realm, so each case switches to All realms before the app is built.
const allRealms = async (): Promise<void> => {
  const { switchTo } = (await import('../../core/realm')) as { switchTo(t: string): Promise<boolean> };
  expect(await switchTo('all')).toBe(true);
};
function clean(p: PageSession): void {
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
  expect(p.frame).not.toContain('could not be drawn');
}

test('first computer being made: Home stays', async () => {
  s = await renderPage({ page: 'home', fx: 'firstMaking', cols: 120, rows: 40, afterBoot: allRealms });
  const frame = flat(await s.settle());
  await s.releaseHeld();
  const after = flat(await s.settle());
  clean(s);
  expect(frame).toContain('All realms');
  for (const f of [frame, after]) {
    expect(f).not.toContain(tour['term.reason']);
    expect(f).not.toContain(`Open the ${tour['term.what']} on the web:`);
  }
}, 180_000);

test('first computer running: no tour offer', async () => {
  s = await renderPage({ page: 'home', fx: 'newAccount', cols: 120, rows: 40, afterBoot: allRealms });
  const frame = flat(await s.settle());
  clean(s);
  expect(frame).toContain('All realms');
  expect(frame).not.toContain(strings['intro.tour']);
  expect(frame).not.toContain(tour['term.reason']);
}, 180_000);

test("the Welcome's tour line hands off to the web", async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'home', fx: 'newAccount', path: '/home?intro=1', cols: 120, rows: 40, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  // The hand-off's keys work while any of its actions has the focus; Copy link is the one name only it carries.
  for (let i = 0; i < 160 && focused(s) !== 'Copy link'; i++) await s.keys.press('tab');
  expect(focused(s)).toBe('Copy link');
  await s.keys.press('o');
  const frame = flat(await s.settle());
  clean(s);
  expect(opened, frame).toHaveLength(1);
  expect(opened[0]).toContain('#/onboarding');
  // Still Home's Welcome, never the tour page's own hand-off.
  expect(frame).toContain(strings['intro.lead'].split(',')[0]!);
  expect(frame).toContain(strings['intro.tourReason']);
  expect(frame).not.toContain(`Open the ${tour['term.what']} on the web:`);
}, 240_000);
