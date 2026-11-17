// The reply box while its reply is out, in a terminal. A read-only text area is as tall as its text (one row at least,
// its own rows at most: term/prim/FieldInput.ts ReadArea), and the box is read-only while it sends. So a one-line reply
// shrank the box from four rows to one for the send and grew it back to four after it: Send and everything under the
// box jumped up, then down. A box read-only only while a send is out keeps its rows (kit TextField `keepRows`), also
// when the box is left and opened again before the answer (back to the list, then this ticket again: a new box, its
// reply still out from the earlier one).
//
// At 120x40 the shell's sidebar leaves the page under the width for two panes (kit/layouts/termBreaks.ts
// BOTH_PANES_COLS), so an open thread is the only pane and the list is hidden behind it. Esc closes the detail in either
// layout (kit/layouts/ListDetailPage.term.tsx), so leaving does not depend on which one is drawn.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import { requestLog } from './fixtures';
import strings from './strings.en.json';

let s: PageSession | null = null;
beforeEach(() => { requestLog.length = 0; });
afterEach(() => { s?.close(); s = null; });

/** T_OPEN of the fixtures: "Invoice shows the wrong country", waiting for support (a reply box under it). */
const OPEN = '0000000000000000' + (0x6720a1b2 + 2).toString(16);
const OPEN_SUBJECT = 'Invoice shows the wrong country';
const REPLY = strings['reply.label'];
const SEND = strings['action.send'];

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** Whether the screen draws these words as text or a control's name (a field's VALUE is not counted: it is `value`). */
const says = (text: string): boolean => flat(tree()).some((n) => n.role !== 'textbox' && (n.name.includes(text) || (n.description ?? '').includes(text)));
async function one(role: Role, name: string | RegExp): Promise<SemNode> {
  let n = all(role, name)[0];
  for (let i = 0; i < 5 && !n; i++) { await s!.settle(); n = all(role, name)[0]; }
  expect(n).toBeDefined();
  return n!;
}
async function until(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 10 && !ok(); i++) await s!.settle();
}
/** The box's rows, and how far under its top Send sits (what follows the box moves with its height). */
async function measure(): Promise<{ rows: number; sendBelow: number; field: SemNode }> {
  const field = await one('textbox', REPLY);
  const send = await one('button', SEND);
  return { rows: field.box[3], sendBelow: send.box[1] - field.box[1], field };
}
/** The list's row of a ticket, when the list is drawn. */
const rowWith = (subject: string): SemNode | undefined => flat(tree()).find((n) => n.role === 'row' && n.name.includes(subject));
/** Leaves the open thread: Esc closes the detail, and the list is drawn again. Waits until the reply box is gone and
 *  this ticket's row is listed. */
async function leave(subject: string): Promise<void> {
  await s!.keys.press('escape');
  await until(() => all('textbox', REPLY).length === 0 && rowWith(subject) !== undefined);
}
/** Opens a ticket from the list as a reader does: its row focused (the table's cursor goes there), then Enter. */
async function openRow(subject: string): Promise<void> {
  let r = rowWith(subject);
  for (let i = 0; i < 5 && !r; i++) { await s!.settle(); r = rowWith(subject); }
  expect(r).toBeDefined();
  act(r!, 'focus');
  await s!.settle();
  await s!.keys.press('enter');
  await s!.settle();
}
/** Types the reply and presses Send; the answer is held (sendSlow). Returns the box as it was before the press. */
async function typeAndSend(words: string): Promise<{ rows: number; sendBelow: number; field: SemNode }> {
  act(await one('textbox', REPLY), 'focus');
  await s!.settle();
  await s!.keys.type(words);
  const before = await measure();
  expect(before.field.value).toBe(words);
  expect(before.rows).toBe(4);
  act(await one('button', SEND), 'focus');
  await s!.settle();
  act(await one('button', SEND), 'press');
  await s!.settle();
  const replies = requestLog.filter((r) => r.route === 'reply');
  expect(replies.length).toBe(1);
  expect((replies[0]!.body as { body?: unknown }).body).toBe(words);
  return before;
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}

test('a one-line reply: the box keeps its four rows before, during and after the send, and Send stays where it was', async () => {
  // sendSlow: the reply is answered after a while; the harness holds that answer until releaseHeld().
  s = await renderPage({ page: 'support', fx: 'sendSlow', cols: 120, rows: 40, path: `/support?sel=${OPEN}` });
  await s.settle();
  const words = 'Any news on this?';
  // Focus, let the field draw focused, then type (an engine field takes keys once it draws focused).
  act(await one('textbox', REPLY), 'focus');
  await s.settle();
  await s.keys.type(words);
  const before = await measure();
  expect(before.field.value).toBe(words);
  expect(before.rows).toBe(4);

  // Send: focused first and a frame drawn, so its Enter is not a new line in the box.
  act(await one('button', SEND), 'focus');
  await s.settle();
  act(await one('button', SEND), 'press');
  await s.settle();
  // Positive controls: the reply is out (once, with the typed words) and its answer held; the box is read-only.
  const replies = requestLog.filter((r) => r.route === 'reply');
  expect(replies.length).toBe(1);
  expect((replies[0]!.body as { body?: unknown }).body).toBe(words);
  const during = await measure();
  expect(during.field.states.readonly).toBe(true);
  expect(during.field.value).toBe(words);
  // A regression shows 1 row here (the read-only area takes its one line of text), Send three rows higher.
  expect(during.rows).toBe(before.rows);
  expect(during.sendBelow).toBe(before.sendBelow);

  await s.releaseHeld();
  await until(() => says(words));
  expect(says(words)).toBe(true);
  const after = await measure();
  expect(after.field.value).toBe('');
  expect(after.field.states.readonly === true).toBe(false);
  expect(after.rows).toBe(before.rows);
  expect(after.sendBelow).toBe(before.sendBelow);
  expect(requestLog.filter((r) => r.route === 'reply').length).toBe(1);
  clean();
});

test('left and opened again while its reply is out: the new box keeps its four rows, before and after the answer', async () => {
  s = await renderPage({ page: 'support', fx: 'sendSlow', cols: 120, rows: 40, path: `/support?sel=${OPEN}` });
  await s.settle();
  const words = 'Any news on this?';
  const before = await typeAndSend(words);

  // Back to the list (this box is gone), then this ticket again: the box is a new one, the reply still out.
  await leave(OPEN_SUBJECT);
  expect(all('textbox', REPLY).length).toBe(0);
  expect(rowWith(OPEN_SUBJECT)).toBeDefined();
  expect(requestLog.filter((r) => r.route === 'reply').length).toBe(1);
  await openRow(OPEN_SUBJECT);
  await until(() => all('textbox', REPLY).length > 0);
  const back = await measure();
  // Positive controls: still locked with the reply's words (its attempt's draft), nothing sent again.
  expect(back.field.states.readonly).toBe(true);
  expect(back.field.value).toBe(words);
  expect(requestLog.filter((r) => r.route === 'reply').length).toBe(1);
  // A regression: this box starts with nothing of its own out, so it would take its one line of text (1 row).
  expect(back.rows).toBe(before.rows);
  expect(back.sendBelow).toBe(before.sendBelow);

  // The answer comes; this box takes it (the earlier box kept it): empty again, still four rows.
  await s.releaseHeld();
  await until(() => says(words) && (all('textbox', REPLY)[0]?.value ?? '') === '');
  const after = await measure();
  expect(after.field.value).toBe('');
  expect(after.field.states.readonly === true).toBe(false);
  expect(after.rows).toBe(before.rows);
  expect(after.sendBelow).toBe(before.sendBelow);
  expect(requestLog.filter((r) => r.route === 'reply').length).toBe(1);
  clean();
});
