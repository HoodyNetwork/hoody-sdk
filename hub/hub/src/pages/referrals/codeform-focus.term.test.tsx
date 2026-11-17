// A custom code made from the terminal: the field empties and Create turns off; a focused control that turns off gives
// the focus up (term/prim/focus.ts useFocusable), so the person who had just pressed Create had the focus nowhere and
// the next Tab started at the top of the screen. The form now gives the focus back to its field.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const FIELD = strings['create.label'];
const retire = (code: string): string => strings['release.label'].replace('{{code}}', code);
const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
async function one(role: Role, name: string | RegExp): Promise<SemNode> {
  let n = all(role, name)[0];
  for (let i = 0; i < 5 && !n; i++) { await s!.settle(); n = all(role, name)[0]; }
  expect(n).toBeDefined();
  return n!;
}
async function until(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 5 && !ok(); i++) await s!.settle();
}

test('after a code is made the focus is back in the New code field, and the next keys go into it', async () => {
  s = await renderPage({ page: 'referrals', fx: null, cols: 120, rows: 40 });
  await s.settle();
  act(await one('textbox', FIELD), 'type', 'maya-new1');
  await s.settle();
  await until(() => (all('textbox', FIELD)[0]?.description ?? '').includes(strings['check.available']));
  act(await one('button', strings['create.action']), 'press');
  await s.settle();
  await until(() => all('button', retire('maya-new1')).length > 0);

  // Positive controls: the code is listed with its own Retire…, the field is empty and Create is off (what dropped
  // the focus before).
  expect(all('button', retire('maya-new1')).length).toBe(1);
  expect((await one('textbox', FIELD)).value).toBe('');
  expect((await one('button', strings['create.action'])).states.disabled).toBe(true);

  // The defect: before the fix nothing had the focus here (focusedNode null).
  expect(focusedNode(tree())?.role).toBe('textbox');
  expect(focusedNode(tree())?.name).toBe(FIELD);
  await s.keys.type('next');
  expect((await one('textbox', FIELD)).value).toBe('next');
  expect(s.failures).toEqual([]);
  expect(s.trapsAt).toEqual([]);
}, 240_000);
