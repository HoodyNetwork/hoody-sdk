// Logs: the inspector's actions, the bar's Save this view and Live's "N new" pill, pressed in the terminal as a person
// would (the semantic tree's press: focus, then Enter). No terminal test drove these flows; each is correct today.
//
// | # | Flow | Pins |
// |---|---|---|
// | 1 | ⋯ → Copy for support (open row) | one copy: the support line (an ISO time first, " · " between parts, one line) |
// | 2 | Around this moment (open row) | the row closes and the When chip reads "around <the row's time>" |
// | 3 | ⋯ for this view → Save this view | the name typed is offered back in that menu as Open “<name>” |
// | 4 | Live (l) with a row open | new rows wait behind the "N new" pill; pressing it puts the newest live row on top |
//
// 4 runs at 200x50, where the list stays beside an open row (at 120x40 the row is the only pane and the pill, which
// lives in the list, is not drawn). An open row is what makes the list "reading" (parts/LogList.term.tsx), so Live
// rows wait behind the pill instead of landing on top.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import kit from '../../kit/strings.en.json';
import { act, queryAllByRole, semanticsOf, within, type SemNode } from '../../term/prim/semantics';
import { copiesOf } from '../../term/prim/testing';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const DETAIL = '/logs?src=everything&sel=k300';
const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fill = (x: string, v: Record<string, string | number>): string => x.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k]));
const starts = (x: string): RegExp => new RegExp(`^${esc(x)}`);
const tree = (p: PageSession): SemNode[] => { const r = p.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(p: PageSession, ok: () => boolean, tries = 40): Promise<string> {
  let frame = await p.settle();
  for (let i = 0; i < tries && !ok(); i++) { await pause(250); frame = await p.settle(); }
  return frame;
}
/** The inspector's action group of the open row. */
const actions = (p: PageSession): SemNode | undefined => queryAllByRole(tree(p), 'group', { name: strings['act.group'] })[0];
/** Presses the first node of `role` named `name` (inside `scope` when given), waiting for it first. */
async function press(p: PageSession, role: SemNode['role'], name: string | RegExp, scope?: () => SemNode[] | undefined): Promise<void> {
  const find = () => queryAllByRole(scope ? scope() ?? [] : tree(p), role, { name })[0];
  await until(p, () => find() !== undefined);
  const n = find();
  if (!n) throw new Error(`no ${role} named ${String(name)}`);
  act(n, 'press');
  await p.settle();
}

test('Copy for support copies the row\'s support line, once', async () => {
  s = await renderPage({ page: 'logs', cols: 120, rows: 40, path: DETAIL });
  const p = s;
  await until(p, () => actions(p) !== undefined);
  const copies = copiesOf(p.renderer);
  await press(p, 'button', kit['action.more'], () => (actions(p) ? within(actions(p)!) : undefined));
  await press(p, 'menuitem', starts(strings['act.copy']));
  await until(p, () => copies.length > 0);
  expect(copies.length).toBe(1);
  const line = copies[0]!;
  expect(line).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
  expect(line).toContain(' · ');
  expect(line).not.toContain('\n');
  expect(p.failures).toEqual([]);
}, 240_000);

test('Around this moment closes the row and sets the window around its time', async () => {
  s = await renderPage({ page: 'logs', cols: 120, rows: 40, path: DETAIL });
  const p = s;
  let frame = await until(p, () => actions(p) !== undefined);
  // The verdict line, ins.restTook: "<time> · <took> · <source>"; the chip shows the same time (parts/words shortClock).
  const time = /· ([^·\n]+?) · \d[\d,]* ms ·/.exec(frame)?.[1]?.trim();
  expect(time).toBeDefined();
  await press(p, 'button', strings['act.around'], () => (actions(p) ? within(actions(p)!) : undefined));
  frame = await until(p, () => actions(p) === undefined && p.frame.includes(fill(strings['when.around'], { time: time! })));
  expect(actions(p)).toBeUndefined();
  expect(frame).toContain(fill(strings['when.around'], { time: time! }));
  expect(queryAllByRole(tree(p), 'region', { name: strings.list }).length).toBe(1);
  expect(p.failures).toEqual([]);
}, 240_000);

test('Save this view: its name comes back in the bar\'s menu', async () => {
  s = await renderPage({ page: 'logs', cols: 120, rows: 40, path: '/logs?src=everything' });
  const p = s;
  const name = 'Morning check';
  await press(p, 'button', strings['act.barMore']);
  await press(p, 'menuitem', starts(strings['v.save']));
  const dialog = () => queryAllByRole(tree(p), 'dialog', { name: strings['v.save'] })[0];
  await until(p, () => dialog() !== undefined);
  const field = queryAllByRole(within(dialog()!), 'textbox', { name: strings['v.name'] })[0];
  expect(field).toBeDefined();
  act(field!, 'type', name);
  await p.settle();
  await press(p, 'button', strings['v.saveGo'], () => (dialog() ? within(dialog()!) : undefined));
  await until(p, () => dialog() === undefined);
  expect(dialog()).toBeUndefined();
  await press(p, 'button', strings['act.barMore']);
  const open = () => queryAllByRole(tree(p), 'menuitem', { name: starts(fill(strings['v.open'], { name })) });
  await until(p, () => open().length > 0);
  expect(open().length).toBe(1);
  expect(p.failures).toEqual([]);
}, 240_000);

test('Live with a row open: new rows wait behind the pill, and the pill puts the newest on top', async () => {
  // The detail shot's row, open from the start: the list is reading before Live starts.
  s = await renderPage({ page: 'logs', fx: 'live', cols: 200, rows: 50, path: DETAIL });
  const p = s;
  const list = () => queryAllByRole(tree(p), 'region', { name: strings.list })[0];
  // Data rows carry their clock time; the header row's name is its column labels only.
  const dataRows = () => (list() ? queryAllByRole(within(list()!), 'row').filter((r) => /\d/.test(r.name)) : []);
  await until(p, () => dataRows().length > 0 && actions(p) !== undefined);
  expect(actions(p)).toBeDefined();
  expect(dataRows().length).toBeGreaterThan(0);
  await p.keys.press('l');
  const live = () => queryAllByRole(tree(p), 'switch', { name: strings['act.live'] })[0];
  await until(p, () => live()?.states.checked === true);
  expect(live()?.states.checked).toBe(true);
  const pill = new RegExp([strings['pill.new_one'], strings['pill.new_other']].map((x) => esc(x).replace(esc('{{n}}'), '\\d+')).join('|'));
  const pills = () => (list() ? queryAllByRole(within(list()!), 'button', { name: pill }) : []);
  // The fixture's Live adds a row every 2.5 s (liveEveryMs): up to 20 s for the first.
  await until(p, () => pills().length > 0, 80);
  expect(pills().length).toBe(1);
  // Waiting behind the pill: no live row on top yet.
  expect(dataRows()[0]?.name ?? '').not.toContain('/live/');
  act(pills()[0]!, 'press');
  await until(p, () => (dataRows()[0]?.name ?? '').includes('/live/'));
  expect(dataRows()[0]?.name ?? '').toContain('/live/');
  expect(p.failures).toEqual([]);
}, 240_000);
