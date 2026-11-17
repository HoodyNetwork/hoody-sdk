// The reply box after a reply went through, in a terminal. The box empties and Send turns off; a focused control that
// turns off gives the focus up (term/prim/focus.ts useFocusable), so the person who had just pressed Send had the focus
// nowhere and the next Tab started again at the top of the screen. The box now gives the focus back to its own field,
// so the next message is typed at once (only after its own send: a refusal keeps the text, a field error takes the focus).
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import { requestLog } from './fixtures';
import strings from './strings.en.json';

let s: PageSession | null = null;
beforeEach(() => { requestLog.length = 0; });
afterEach(() => { s?.close(); s = null; });

/** T_OPEN of the fixtures: "Invoice shows the wrong country", waiting for support (a reply box under it). */
const OPEN = '0000000000000000' + (0x6720a1b2 + 2).toString(16);
const REPLY = strings['reply.label'];

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
  for (let i = 0; i < 5 && !ok(); i++) await s!.settle();
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}

test('after a sent reply the focus is back in the empty reply field, and the next words go into it', async () => {
  s = await renderPage({ page: 'support', fx: null, cols: 120, rows: 40, path: `/support?sel=${OPEN}` });
  await s.settle();
  const words = 'Thanks, the invoice reads right now';
  // Focus, let the field draw focused, then type: an engine field takes keys only once it draws focused, so
  // act(…, 'type') (focus and keys in one go) would lose them.
  act(await one('textbox', REPLY), 'focus');
  await s.settle();
  await s.keys.type(words);
  expect((await one('textbox', REPLY)).value).toBe(words);
  act(await one('button', strings['action.send']), 'press');
  await s.settle();
  await until(() => says(words));

  // Positive controls: the reply went out once, with the typed words and a client key; the thread draws it; the box is
  // empty and Send is off (that is what dropped the focus).
  const replies = requestLog.filter((r) => r.route === 'reply');
  expect(replies.length).toBe(1);
  const body = replies[0]!.body as { body?: unknown; client_key?: unknown };
  expect(body.body).toBe(words);
  expect(typeof body.client_key).toBe('string');
  expect(says(words)).toBe(true);
  expect((await one('textbox', REPLY)).value).toBe('');
  expect((await one('button', strings['action.send'])).states.disabled).toBe(true);

  // Without the guard nothing would have the focus here (focusedNode null).
  expect(focusedNode(tree())?.role).toBe('textbox');
  expect(focusedNode(tree())?.name).toBe(REPLY);

  // It is the live field: keys typed now (no Tab, no click) land in it.
  await s.keys.type('one more');
  expect((await one('textbox', REPLY)).value).toBe('one more');
  expect(requestLog.filter((r) => r.route === 'reply').length).toBe(1);
  clean();
}, 240_000);
