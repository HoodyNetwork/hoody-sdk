// Files: New folder from the keyboard (Shift+N, the page shortcut folderKeys.term.ts registers), end to end on the
// fixture computer atlas in /home/ada. The fixtures record every change request (`sentChanges`, `<kind>:<path>`) and
// every folder read (`seen`, `atlas:<path>`), reset on each boot, so each test counts what was sent and what was read.
//
// | # | Flow | Pins |
// |---|---|---|
// | 1 | Shift+N, "drafts", Create | the dialog closes, the row appears, one mkdir sent |
// | 2 | Shift+N, "notes.txt" | the taken-name error shows, Create stays off, Enter sends nothing |
// | 3 | "lost", Create, Check again | "may have gone through" with Create off; Check again sends nothing, the read settles it and the dialog closes |
// | 4 | "lost", Create, Esc, Check again | Esc closes (a pending outcome does not block it; Dialog.term.tsx `dismissable`), the held band says what may have gone through; its Check again sends nothing and the read settles it |
//
// The name 'lost' is the fixture's lost answer: the folder is made and the answer never comes (fixtures.ts changes()).
// Tests 3 and 4 run in fixture state heldSlow, as the held-pending shot does (shots.ts). After the lost answer the
// page reads the folder again; in the default state that read lists 'lost' at once, which settles the hold and closes
// the dialog before Check again is there to press. heldSlow keeps every read of that folder from answering (a 60 s
// answer the harness holds), so the outcome stays open; after Check again, p.releaseHeld() lets the held reads answer.
// Check again joins the read of the folder already out (overlapping read-backs share one request: core/query.ts
// flight()), so it adds no request of its own and the count of folder reads need not rise. What it may never do is
// send the change again; the read that answers then shows 'lost' and settles the hold.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import forms from '../../kit/forms/forms.strings.en.json';
import { act, queryAllByRole, semanticsOf, within, type SemNode } from '../../term/prim/semantics';
import { seen, sentChanges } from './fixtures';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const ADA = '/files?a=atlas.00a1&ap=%2Fhome%2Fada';
const fill = (x: string, v: Record<string, string | number>): string => x.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k]));
const tree = (p: PageSession): SemNode[] => { const r = p.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(p: PageSession, ok: () => boolean, tries = 40): Promise<string> {
  let frame = await p.settle();
  for (let i = 0; i < tries && !ok(); i++) { await pause(250); frame = await p.settle(); }
  return frame;
}
/** The first few words of a sentence: on one line wherever the dialog wraps it. */
const head = (x: string, words = 4): string => x.split(' ').slice(0, words).join(' ');
const dialog = (p: PageSession): SemNode | undefined => queryAllByRole(tree(p), 'dialog', { name: strings['mkdir.title'] })[0];
const inDialog = (p: PageSession, role: SemNode['role'], name: string): SemNode | undefined => { const d = dialog(p); return d ? queryAllByRole(within(d), role, { name })[0] : undefined; };
const create = (p: PageSession) => inDialog(p, 'button', strings['action.create']);
const rowNamed = (p: PageSession, name: string): SemNode | undefined => queryAllByRole(tree(p), 'row').find((r) => r.name.split(/\s+/).includes(name));
const reads = (path: string): number => seen.filter((x) => x === `atlas:${path}`).length;

/** Like until, but each round first lets the held answers go (a slow fixture answer fires only on release). */
async function untilReleased(p: PageSession, ok: () => boolean, tries = 40): Promise<string> {
  let frame = await p.releaseHeld();
  for (let i = 0; i < tries && !ok(); i++) { await pause(250); frame = await p.releaseHeld(); }
  return frame;
}

/** /home/ada listed, then Shift+N and the name typed into the dialog's field. */
async function newFolder(name: string, fx: string | null = null): Promise<PageSession> {
  const p = await renderPage({ page: 'files', fx, cols: 120, rows: 40, path: ADA });
  await until(p, () => rowNamed(p, 'notes.txt') !== undefined);
  expect(rowNamed(p, 'notes.txt')).toBeDefined();
  await p.keys.press('N');
  await until(p, () => dialog(p) !== undefined);
  const field = inDialog(p, 'textbox', strings['name.label']);
  expect(field).toBeDefined();
  act(field!, 'type', name);
  await p.settle();
  return p;
}

test('Shift+N, a name, Create: the dialog closes and the folder is listed', async () => {
  s = await newFolder('drafts');
  const p = s;
  expect(create(p)?.states.disabled ?? false).toBe(false);
  act(create(p)!, 'press');
  await until(p, () => dialog(p) === undefined && rowNamed(p, 'drafts') !== undefined);
  expect(dialog(p)).toBeUndefined();
  expect(rowNamed(p, 'drafts')).toBeDefined();
  expect(sentChanges).toEqual(['mkdir:/home/ada/drafts']);
  expect(p.failures).toEqual([]);
}, 240_000);

test('A taken name: the error shows, Create stays off and Enter sends nothing', async () => {
  s = await newFolder('notes.txt');
  const p = s;
  const frame = await until(p, () => p.frame.includes(head(strings['name.taken'])));
  expect(frame).toContain(head(strings['name.taken']));
  expect(create(p)?.states.disabled).toBe(true);
  await p.keys.press('enter');
  await pause(500);
  await p.settle();
  expect(dialog(p)).toBeDefined();
  expect(sentChanges).toEqual([]);
  expect(p.failures).toEqual([]);
}, 240_000);

test('Create answer lost: "may have gone through", Create off, and Check again only reads', async () => {
  s = await newFolder('lost', 'heldSlow');
  const p = s;
  act(create(p)!, 'press');
  const check = () => inDialog(p, 'button', forms['outcome.check']);
  const frame = await until(p, () => check() !== undefined);
  expect(frame).toContain(forms['outcome.pending']);
  expect(dialog(p)).toBeDefined();
  expect(create(p)?.states.disabled).toBe(true);
  expect(sentChanges).toEqual(['mkdir:/home/ada/lost']);
  // The folder was read again after the lost answer, and that read is still out (held).
  expect(reads('/home/ada')).toBeGreaterThan(1);
  act(check()!, 'press');
  // The read answers once released: the listing shows 'lost', which settles the hold and closes the dialog.
  await untilReleased(p, () => dialog(p) === undefined && rowNamed(p, 'lost') !== undefined);
  expect(dialog(p)).toBeUndefined();
  expect(rowNamed(p, 'lost')).toBeDefined();
  // Never sent again.
  expect(sentChanges).toEqual(['mkdir:/home/ada/lost']);
  expect(p.failures).toEqual([]);
}, 240_000);

test('Create answer lost, then Esc: the band keeps "may have gone through", and its Check again only reads', async () => {
  s = await newFolder('lost', 'heldSlow');
  const p = s;
  act(create(p)!, 'press');
  await until(p, () => inDialog(p, 'button', forms['outcome.check']) !== undefined);
  expect(sentChanges).toEqual(['mkdir:/home/ada/lost']);
  await p.keys.press('escape');
  const held = fill(strings['held.mkdir'], { name: 'lost' });
  let frame = await until(p, () => dialog(p) === undefined && p.frame.includes(held));
  expect(dialog(p)).toBeUndefined();
  expect(frame).toContain(held);
  const checks = () => queryAllByRole(tree(p), 'button', { name: forms['outcome.check'] });
  expect(checks().length).toBeGreaterThan(0);
  expect(reads('/home/ada')).toBeGreaterThan(1);
  // The first Check again on screen: the band's, or the toast the dialog left on closing; each only reads the folder.
  act(checks()[0]!, 'press');
  frame = await untilReleased(p, () => !p.frame.includes(held));
  expect(frame).not.toContain(held);
  expect(sentChanges).toEqual(['mkdir:/home/ada/lost']);
  expect(p.failures).toEqual([]);
}, 240_000);
