// Below 80x24 the shell draws "Terminal too small", centred, over its frame instead of squeezing the frame into the
// window (TooSmall.tsx). The page stays mounted under it: what was typed and an open palette are there again once the
// window is large enough, and keys and clicks made while it shows reach nothing under it. `q` leaves, and Ctrl-C keeps
// its two-press rule with its note on the last row. A layer that opens in the same commit (the Ask sheet, when the
// shrink crosses 120 columns with the dock open) is under it.
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import type { PageManifest } from '@kit/page';
import { useAskDock } from '@kit/ask';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from '../app/boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from '../app/lifecycle';
import { createTermApp } from '../app/App';
import { Text } from '../prim';
import { drawTest, type TestTerm } from '../prim/testing';
import { queryAllByRole, semanticsOf } from '../prim/semantics';
import { provideAskDock } from './AskDock';
import { MIN_COLS, MIN_ROWS } from './TooSmall';
import strings from './strings.en.json';

setDefaultTimeout(30_000);

const TITLE = strings['small.title'];
const AGAIN = strings['status.again'];
let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;

beforeAll(async () => {
  pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null });
  await boot.start(session, () => {});
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

/** Settles until the frame passes (or 4 s). */
async function until(ok: (f: string) => boolean, ms = 4000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}
const framed = (f: string) => f.includes('HOODY') && !f.includes('Loading…');
async function open(path: string, size = { width: 120, height: 40 }, ready: (f: string) => boolean = framed): Promise<string[]> {
  await t?.dispose();
  const quits: string[] = [];
  const app = createTermApp({ pages, queryClient, path, onQuit: () => quits.push('quit') });
  t = await drawTest(app.element, size);
  await until(ready);
  return quits;
}
const key = async (name: string, m?: { ctrl?: boolean; meta?: boolean }) => {
  t!.mockInput.pressKey(name, m);
  await new Promise((r) => setTimeout(r, 40));
  return t!.settle();
};
const resize = async (width: number, height: number, ready: (f: string) => boolean) => { t!.resize(width, height); return until(ready); };
const shown = (f: string) => f.includes(TITLE);
/** The small screen in the semantics tree (null while the frame is drawn). */
const small = () => queryAllByRole(semanticsOf(t!.renderer as never), 'alertdialog', { name: TITLE })[0] ?? null;
/** The screen's last row (the frame may end with a line break: the last two lines, as shell.term.test.tsx reads it). */
const lastRow = (f: string): string => f.split('\n').slice(-2).join('');
const ACT = strings['small.leave'];
let closeDock: (() => void) | null = null;
function DockCloser() { const d = useAskDock(); closeDock = d.close; return null; }

test('80x24 draws the frame; one column or one row less draws the small screen, centred, which names both sizes', async () => {
  await open('/schedules', { width: MIN_COLS, height: MIN_ROWS });
  let f = await t!.settle();
  expect(f).toContain('HOODY');
  expect(small()).toBeNull();
  for (const [w, h] of [[MIN_COLS - 1, MIN_ROWS], [MIN_COLS, MIN_ROWS - 1]] as const) {
    f = await resize(w, h, shown);
    expect(f, f).toContain(TITLE);
    expect(f).not.toContain('HOODY');
    expect(f).toContain(`${w}×${h}`);
    expect(f).toContain(`${MIN_COLS}×${MIN_ROWS}`);
    expect(small()).not.toBeNull();
    // Centred both ways in the rows above the last one (left free for the Ctrl+C note): three lines, none wrapped here.
    const lines = f.split('\n');
    const row = lines.findIndex((l) => l.includes(TITLE));
    expect(Math.abs(row - Math.floor((h - 1 - 3) / 2)), f).toBeLessThanOrEqual(1);
    expect(Math.abs(lines[row]!.indexOf(TITLE) - Math.floor((w - TITLE.length) / 2)), f).toBeLessThanOrEqual(1);
    expect(f).toContain(ACT);
    // Large enough again: the frame is back and the small screen is gone.
    f = await resize(MIN_COLS, MIN_ROWS, framed);
    expect(f).toContain('HOODY');
    expect(f).not.toContain(TITLE);
    expect(small()).toBeNull();
  }
  // Fewer rows than lines: the spacers give way first, so the title is on the first row and the lines after it are
  // cut. At 2 rows the column holds 1 of the 3 lines, so a centred column that overflows would start a row above the
  // screen and cut the title instead (at 3 rows its half-row offset could round to 0 and pass either way).
  f = await resize(MIN_COLS, 2, shown);
  expect(f.split('\n')[0], f).toContain(TITLE);
  expect(f).not.toContain(ACT);
});

test('on a narrow screen a line that wraps is centred too, each of its rows', async () => {
  await open('/schedules', { width: MIN_COLS, height: MIN_ROWS });
  const w = 40;
  const f = await resize(w, 12, shown);
  const rows = f.split('\n');
  // At 40 columns both long lines wrap: their second rows hold only their ends (the positive control on the wrap).
  for (const [end, start] of [['at least', 'This terminal'], ['press q to leave.', 'Make the window']] as const) {
    const row = rows.find((l) => l.includes(end) && !l.includes(start));
    expect(row, f).toBeDefined();
    const left = row!.length - row!.trimStart().length;
    const right = w - row!.trimEnd().length;
    expect(Math.abs(left - right), f).toBeLessThanOrEqual(1);
  }
});

test('what was typed survives a shrink below the minimum and back; a key and a click while it shows reach nothing', async () => {
  await open('/logs');
  await until((x) => x.includes('/ Search'));
  expect(await key('/')).toContain('Esc leaves the field');
  await t!.mockInput.typeText('keep');
  expect(await t!.settle()).toMatch(/\/ keep/);
  let f = await resize(70, 20, shown);
  expect(f).not.toContain('keep');
  // While it shows: a letter, and a click where the page list's trigger (≡) is at this width.
  await key('x');
  await t!.mockMouse.click(1, 0);
  f = await resize(120, 40, (x) => framed(x) && !shown(x));
  expect(f, f).toMatch(/\/ keep(?!x)/);
  // The click opened no page list.
  expect(f).not.toContain(strings['menu.hint']);
  // Positive control: the focus is still in the field, so the next letter lands there.
  await key('y');
  expect(await t!.settle()).toMatch(/\/ keepy/);
});

test('an open palette with its text survives a shrink below the minimum and back; the small screen is drawn above it', async () => {
  await open('/schedules');
  let f = await key('k', { ctrl: true });
  expect(f).toContain('Command palette');
  await t!.mockInput.typeText('tunn');
  expect(await t!.settle()).toContain('› tunn');
  f = await resize(70, 20, shown);
  expect(f).not.toContain('Command palette');
  f = await resize(120, 40, (x) => x.includes('Command palette'));
  expect(f).not.toContain(TITLE);
  expect(f).toContain('› tunn');
});

test('on the small screen q leaves; Ctrl-C once shows its note on the last row, twice leaves', async () => {
  const quits = await open('/schedules', { width: 70, height: 20 }, shown);
  expect(small()).not.toBeNull();
  await key('q');
  expect(quits).toEqual(['quit']);
  const again = await open('/schedules', { width: 70, height: 20 }, shown);
  const f = await key('c', { ctrl: true });
  expect(f).toContain(TITLE);
  expect(lastRow(f), f).toContain(AGAIN);
  expect(again).toEqual([]);
  await key('c', { ctrl: true });
  expect(again).toEqual(['quit']);
});

test('the Ask sheet a shrink opens in the same commit is under the small screen; the pane is back once large enough', async () => {
  // The dock's panel is a stand-in (as askdock.term.test.tsx): only where the shell draws it is checked here.
  const unprovide = provideAskDock(() => <Text>DOCK-STAND-IN</Text>);
  try {
    await t?.dispose();
    const app = createTermApp({ pages, queryClient, path: '/schedules', onQuit: () => {} });
    t = await drawTest(<>{app.element}<DockCloser /></>, { width: 120, height: 40 });
    await until(framed);
    await key('j', { meta: true });
    let f = await until((x) => x.includes('DOCK-STAND-IN'));
    // At 120 columns it is a pane beside the page: the frame is drawn too.
    expect(f, f).toContain('HOODY');
    f = await resize(70, 20, shown);
    expect(f, f).toContain(TITLE);
    expect(f).not.toContain('DOCK-STAND-IN');
    f = await resize(120, 40, (x) => x.includes('DOCK-STAND-IN') && !shown(x));
    expect(f, f).toContain('HOODY');
    expect(f).toContain('DOCK-STAND-IN');
  } finally {
    closeDock?.();
    unprovide();
  }
});
