import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../../scripts/term/render';
import { semanticsOf, semJson, semText } from '../../../term/prim/semantics';
import strings from './boardTerm.strings.en.json';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });
/** The frame's text lines joined without the card's borders, so a wrapped address reads whole. */
const joined = (frame: string) => frame.split('\n').map((l) => l.replace(/^.*?│ *│?\s*|\s*│?\s*$/g, '')).join('');

test('the Board hands off to the web and says its Boards live in the web browser (no stand-in, no crash)', async () => {
  const s = await renderPage({ page: 'board', cols: 80, rows: 24 });
  close = () => s.close();
  expect(s.failures).toEqual([]);
  expect(s.frame).toContain('The Board shows live programs');
  // The address wraps in the card and carries the session's realm and computer as a query (pageAddress): read it joined.
  expect(joined(s.frame)).toMatch(/\/auth\/home(\?[^#\s]*)?#\/board(?![/?])/);
  // Boards are saved in each web browser, which a terminal never holds: it lists none, so it never claims an empty
  // Board ("Main · no tiles") a person's browser may well have filled. The page keeps the one-cell margin every other
  // page has: no line of the body starts at the screen's first column.
  expect(semText(semanticsOf(s.renderer as never))).toContain(`text "${strings['term.local']}"`);
  expect(s.frame).not.toContain('no tiles');
  expect(s.frame).not.toContain('Boards in this realm');
  expect(s.frame.split('\n').slice(1, -1).filter((l) => /^\S/.test(l))).toEqual([]);
  expect(s.frame).not.toContain('‹BoardView›');
}, 60_000);

// The Add link and the program view travel only because they name the fixture account's own computer (atlas,
// c0a7…00a1, handle atlas.00a1): pageRoute looks every Board extra up in the shell's computer list.
test('an Add link is not taken here: the hand-off carries it to the web Board, where it is added', async () => {
  const s = await renderPage({ page: 'board', cols: 120, rows: 30, path: '/board?add=terminal-new&cid=c0a7150000000000000000a1' });
  close = () => s.close();
  const flat = s.frame.split('\n').map((l) => l.replace(/^.*?│ *│?\s*|\s*│?\s*$/g, '')).join('');
  // Drawn with the id masked; the copy, open, link and QR actions carry it whole (Handoff.leak).
  expect(flat).toContain('#/board?add=terminal-new&cid=c0a7…00a1');
  expect(s.frame).not.toContain('c0a7150000000000000000a1');
}, 60_000);

test('a program view names the program and computer, then hands off with its own address', async () => {
  const s = await renderPage({ page: 'board', cols: 80, rows: 24, path: '/board/open/atlas.00a1/terminal-1' });
  close = () => s.close();
  expect(s.failures).toEqual([]);
  expect(s.frame).toContain('terminal-1 on atlas');
  expect(joined(s.frame)).toMatch(/\/auth\/home(\?[^#\s]*)?#\/board\/open\/atlas\.00a1\/terminal-1/);
}, 60_000);

// The program view's title names the computer only from the account's list and never echoes the route (a
// handle that is no listed computer, a script's route). Canaries of a valid shape through the WHOLE page: the frame,
// the semantics tree, and everything the session captured (console errors, failures).
const HEX = 'feedfacefeedfacefeedface';
const CANARY = 'hdyR9canaryQz7x4Lp9Tv';
for (const [name, path, title] of [
  ['an unlisted handle made of a 24-hex value', `/board/open/${HEX}.k3/terminal-1`, 'terminal-1'],
  ['an unlisted handle holding a token-like value', `/board/open/${CANARY}.face/port-8080`, 'port 8080'],
  ['a listed computer\'s script route', `/board/open/atlas.00a1/script/${CANARY}/${HEX}`, 'script on atlas'],
  ['an unlisted handle with a script route', `/board/open/${HEX}.k3/script/${CANARY}`, 'script'],
] as const) {
  test(`${name} reaches no output of the page; the title is "${title}"`, async () => {
    const s = await renderPage({ page: 'board', cols: 120, rows: 30, path });
    close = () => s.close();
    expect(s.failures).toEqual([]);
    const tree = semanticsOf(s.renderer as never);
    const outs = [s.frame, semText(tree), JSON.stringify(semJson(tree)), ...s.errors, JSON.stringify(s.failures)];
    for (const out of outs) for (const c of [HEX, CANARY]) expect(out).not.toContain(c);
    expect(semText(tree)).toContain(`text "${title}"`);
  }, 60_000);
}
