// Notification Inbox mark-reads in the terminal (parts/Inbox.tsx, ForgetReadAll.tsx), counted on the fake server's
// own records (fixtures.ts doneAckSends / lostAckSends): what was SENT, not only what was drawn.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Opening an unread notice sends one mark-read; opening another sends one for it; opening the first again sends none | 'open marks once' |
// | 2 | A mark-read that may have gone through (ack-lost): Check again only reads; Stop tracking asks first (Cancel keeps it), confirming frees it unsent | 'held row' |
// | 3 | Mark all read that may have gone through: its pending line and Stop tracking, which asks first and frees it unsent | 'held mark all' |
// | 4 | Bulk Mark read skips a row whose mark-read is held and sends the others | 'bulk skips held' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { frameShows } from '../../../scripts/term/wait-text';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { doneAckSends, lostAckSends } from './fixtures';
import ns from './strings.en.json';
import ks from '../../kit/strings.en.json';
import fo from '../../kit/forms/forms.strings.en.json';
import os from '../../kit/overlays/strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const below = (n: SemNode): SemNode[] => n.children.flatMap((c) => [c, ...below(c)]);
const fold = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
const fill = (x: string, v: Record<string, string | number>) => x.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k]));
function shows(text: string): boolean {
  if (frameShows(s!.frame, text)) return true;
  const want = fold(text);
  return tree().flatMap((n) => [n, ...below(n)]).some((n) => fold(n.name).includes(want) || fold(n.description ?? '').includes(want));
}
async function until(ok: () => boolean, tries = 50): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    await s!.settle();
    if (ok()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  await s!.settle();
  return ok();
}
const buttons = (name: string, scope: SemNode[] = tree()) => queryAllByRole(scope, 'button', { name });
const enabled = (xs: SemNode[]) => xs.filter((n) => !n.states.disabled);
async function press(name: string, scope?: SemNode[]) {
  const b = enabled(buttons(name, scope))[0];
  if (!b) throw new Error(`no enabled button "${name}"`);
  act(b, 'press');
  await s!.settle();
}
const dialog = (title: string): SemNode | null => [...queryAllByRole(tree(), 'alertdialog', { name: title }), ...queryAllByRole(tree(), 'dialog', { name: title })][0] ?? null;
const rowWith = (text: string): SemNode | undefined => queryAllByRole(tree(), 'row').find((r) => below(r).some((c) => c.name.includes(text)));
/** Enabled buttons of this name outside every table row (a row's own inline action has the same name). */
function outsideRows(name: string): SemNode[] {
  const t = tree();
  const inRow = new Set(queryAllByRole(t, 'row').flatMap(below));
  return enabled(queryAllByRole(t, 'button', { name })).filter((b) => !inRow.has(b));
}

// The fixture's first two unread notices (fixtures.ts make(): template k over the world's computers).
const ATLAS = '4e0000000000000000000000';
const ATLAS_TITLE = 'Computer atlas stopped';
const BOREALIS = '4e0001000000000000000000';
const BOREALIS_TITLE = 'Payment received for borealis';
// The first sentence of the held line, enough to tell one notice's from another's.
const heldLine = (title: string) => fill(ns.pendingNamed, { title }).split('. ')[0]!;
const allHeldLine = ns['ack.allPendingDetail'].split('. ')[0]!;

async function openRow(title: string) {
  expect(await until(() => !!rowWith(title))).toBe(true);
  act(rowWith(title)!, 'focus');
  await s!.settle();
  await s!.keys.press('enter');
}

test('open marks once', async () => {
  s = await renderPage({ page: 'notifications', path: `/notifications?sel=${ATLAS}`, cols: 200, rows: 50 });
  expect(await until(() => doneAckSends().length > 0 && shows(ns['ack.readDone']))).toBe(true);
  expect(doneAckSends()).toEqual([ATLAS]);
  // The atlas notice names Computers, so its inspector links there; the payment notice does not: that tells which is open.
  expect(shows(ns['inspector.openComputers'])).toBe(true);
  await openRow(BOREALIS_TITLE);
  expect(await until(() => doneAckSends().length === 2 && !shows(ns['inspector.openComputers']))).toBe(true);
  expect(doneAckSends()).toEqual([ATLAS, BOREALIS]);
  // Read now (kept in the list as read): opening it again sends nothing.
  await openRow(ATLAS_TITLE);
  expect(await until(() => shows(ns['inspector.openComputers']))).toBe(true);
  await until(() => false, 5);
  expect(doneAckSends()).toEqual([ATLAS, BOREALIS]);
}, 240_000);

test('held row', async () => {
  s = await renderPage({ page: 'notifications', fx: 'ack-lost', path: `/notifications?sel=${ATLAS}`, cols: 200, rows: 50 });
  expect(await until(() => shows(heldLine(ATLAS_TITLE)))).toBe(true);
  expect(lostAckSends()).toBe(1);
  // The mark was lost (never applied), so no read can prove it: Check again reads and it stays held, unsent.
  await press(fo['outcome.check']);
  await until(() => enabled(buttons(fo['outcome.check'])).length > 0, 20);
  expect(shows(heldLine(ATLAS_TITLE))).toBe(true);
  expect(lostAckSends()).toBe(1);
  await press(ns['forgetOne.button']);
  expect(await until(() => !!dialog(ns['forgetOne.title']))).toBe(true);
  await press(os.cancel, [dialog(ns['forgetOne.title'])!]);
  expect(await until(() => !dialog(ns['forgetOne.title']))).toBe(true);
  expect(shows(heldLine(ATLAS_TITLE))).toBe(true);
  await press(ns['forgetOne.button']);
  expect(await until(() => !!dialog(ns['forgetOne.title']))).toBe(true);
  await press(ns['forgetOne.confirm'], [dialog(ns['forgetOne.title'])!]);
  expect(await until(() => !dialog(ns['forgetOne.title']) && !shows(heldLine(ATLAS_TITLE)))).toBe(true);
  // Freed: the inspector's own Mark read is back, and nothing was sent by the release.
  expect(outsideRows(ns.read).length).toBeGreaterThan(0);
  expect(lostAckSends()).toBe(1);
}, 240_000);

test('held mark all', async () => {
  s = await renderPage({ page: 'notifications', fx: 'ack-lost', path: '/notifications', cols: 200, rows: 50 });
  expect(await until(() => enabled(buttons(ns.readAll)).length > 0)).toBe(true);
  await press(ns.readAll);
  expect(await until(() => shows(allHeldLine))).toBe(true);
  expect(lostAckSends()).toBe(1);
  expect(buttons(ns.readAll)).toEqual([]);
  await press(ns['forgetAll.button']);
  expect(await until(() => !!dialog(ns['forgetAll.title']))).toBe(true);
  await press(os.cancel, [dialog(ns['forgetAll.title'])!]);
  expect(await until(() => !dialog(ns['forgetAll.title']))).toBe(true);
  expect(shows(allHeldLine)).toBe(true);
  await press(ns['forgetAll.button']);
  expect(await until(() => !!dialog(ns['forgetAll.title']))).toBe(true);
  await press(ns['forgetAll.confirm'], [dialog(ns['forgetAll.title'])!]);
  expect(await until(() => !dialog(ns['forgetAll.title']) && !shows(allHeldLine) && enabled(buttons(ns.readAll)).length > 0)).toBe(true);
  expect(lostAckSends()).toBe(1);
}, 240_000);

test('bulk skips held', async () => {
  s = await renderPage({ page: 'notifications', fx: 'ack-lost', path: '/notifications', cols: 200, rows: 50 });
  // atlas's mark-read first, from its row (the row action's key), so it is held before the bulk press.
  expect(await until(() => !!rowWith(ATLAS_TITLE))).toBe(true);
  act(rowWith(ATLAS_TITLE)!, 'focus');
  await s.settle();
  await s.keys.press('m');
  expect(await until(() => lostAckSends() === 1 && shows(heldLine(ATLAS_TITLE)))).toBe(true);
  // Pick atlas and the next row (borealis), then the bulk bar's Mark read.
  await s.keys.press('space');
  await s.keys.press('down');
  await s.keys.press('space');
  expect(await until(() => shows(fill(ks['table.selected_other'], { count: 2 })))).toBe(true);
  expect(outsideRows(ns.read)).toHaveLength(1);
  act(outsideRows(ns.read)[0]!, 'press');
  await s.settle();
  // One more send, borealis's: had the loop tried atlas again it would have stopped there (held) and never reached
  // borealis, so borealis's own held line is the proof atlas was skipped.
  expect(await until(() => lostAckSends() === 2)).toBe(true);
  expect(await until(() => shows(heldLine(ATLAS_TITLE)) && shows(heldLine(BOREALIS_TITLE)))).toBe(true);
  await until(() => false, 5);
  expect(lostAckSends()).toBe(2);
}, 240_000);
