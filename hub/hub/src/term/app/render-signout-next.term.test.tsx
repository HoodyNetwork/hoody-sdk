// A render that signs out does not leave the next render in the process signed out (scripts/term/render.ts close()
// ends core's session, as a mount's teardown does). Before, the second render drew "Good morning" with no name and
// "Computers not loaded". The two tests are one sequence: bun runs a file's tests in order.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};
/** One letter per turn: a whole word typed at once has reached the two password fields unequal on a loaded host. */
async function typeIn(p: PageSession, text: string): Promise<void> {
  for (const ch of text) await p.keys.type(ch);
}
async function tabTo(p: PageSession, name: string): Promise<void> {
  for (let i = 0; i < 200 && focused(p) !== name; i++) await p.keys.press('tab');
  expect(focused(p)).toBe(name);
}

test('first: a render signs out ("Sign in again" after a password change)', async () => {
  s = await renderPage({ page: 'account', cols: 120, rows: 50 });
  await s.settle();
  await tabTo(s, 'Change password');
  await s.keys.press('enter');
  await s.settle();
  await tabTo(s, 'Current password');
  await typeIn(s, 'Old-pass-1234');
  await s.keys.press('tab');
  await typeIn(s, 'New-pass-98765-xy');
  await s.keys.press('tab');
  await typeIn(s, 'New-pass-98765-xy');
  await s.settle();
  await s.keys.press('enter');
  // The change is answered by the fixture transport a few turns later.
  let frame = await s.settle();
  for (let i = 0; i < 30 && !frame.includes('Password changed'); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await s.settle(); }
  expect(frame).toContain('Password changed');
  await tabTo(s, 'Leave the Hub');
  await s.keys.press('enter');
  await s.settle();
  expect(s.trapsAt).toEqual([]);
}, 240_000);

test('then: the next render starts signed in', async () => {
  s = await renderPage({ page: 'home', cols: 120, rows: 40 });
  const frame = await s.settle();
  expect(frame).toContain('Good morning, Ada');
  expect(frame).not.toContain('Computers not loaded');
  expect(s.failures).toEqual([]);
}, 240_000);
