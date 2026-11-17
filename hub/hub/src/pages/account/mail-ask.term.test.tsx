// Account in the terminal, the same data and rules as the web page: an account with no password is offered "Set a
// password" in place of Change password, and one press asks for the mail once (the row then says where to look and the
// action is gone); an address that is not verified is offered its verification mail; the Emails section holds the
// support reply switch.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string | undefined => focusedNode(tree())?.name;
function all(nodes: readonly SemNode[], pred: (n: SemNode) => boolean, out: SemNode[] = []): SemNode[] {
  for (const n of nodes) {
    if (pred(n)) out.push(n);
    all(n.children, pred, out);
  }
  return out;
}
const buttons = (name: string): SemNode[] => all(tree(), (n) => n.role === 'button' && n.name === name);
const says = (text: string): boolean => all(tree(), (n) => n.name.includes(text)).length > 0;
const said = (key: 'mail.sentReset' | 'mail.sentVerify'): string => strings[key].split('{{email}}')[0]!.trim();
async function press(name: string): Promise<void> {
  for (let i = 0; i < 80 && focused() !== name; i++) await s!.keys.press('tab');
  expect(focused(), s!.frame).toBe(name);
  await s!.keys.press('enter');
  await s!.releaseHeld();
  await s!.settle();
}

test('no password: Set a password replaces Change password, and one press asks once', async () => {
  s = await renderPage({ page: 'account', fx: 'no-password', cols: 120, rows: 40, path: '/account' });
  await s.settle();
  expect(buttons(strings['pw.set']).length, s.frame).toBe(1);
  expect(buttons(strings['pw.change']).length, s.frame).toBe(0);
  expect(says(strings['pw.noneHelp']), s.frame).toBe(true);
  await press(strings['pw.set']);
  expect(says(said('mail.sentReset')), s.frame).toBe(true);
  expect(buttons(strings['pw.set']).length, s.frame).toBe(0);
  expect(s.failures).toEqual([]);
}, 240_000);

test('an unverified address is offered its verification mail, and the ask is one for the page', async () => {
  s = await renderPage({ page: 'account', fx: 'email-unverified', cols: 120, rows: 40, path: '/account' });
  await s.settle();
  expect(buttons(strings['p.resend']).length, s.frame).toBeGreaterThan(0);
  expect(says(strings['p.unverifiedHelp']), s.frame).toBe(true);
  await press(strings['p.resend']);
  expect(says(said('mail.sentVerify')), s.frame).toBe(true);
  expect(buttons(strings['p.resend']).length, s.frame).toBe(0);
  expect(s.failures).toEqual([]);
}, 240_000);

test('a verified account with a password is offered neither, and has the support reply switch', async () => {
  s = await renderPage({ page: 'account', cols: 120, rows: 40, path: '/account' });
  await s.settle();
  expect(buttons(strings['pw.set']).length, s.frame).toBe(0);
  expect(buttons(strings['p.resend']).length, s.frame).toBe(0);
  expect(buttons(strings['pw.change']).length, s.frame).toBe(1);
  expect(all(tree(), (n) => n.role === 'switch' && n.name === strings['mail.support']).length, s.frame).toBe(1);
  expect(s.failures).toEqual([]);
}, 240_000);

test('no password and two-step sign-in off: the checklist does not say a password alone signs in', async () => {
  s = await renderPage({ page: 'account', fx: 'no-password', cols: 120, rows: 40, path: '/account' });
  await s.settle();
  const rail = all(tree(), (n) => n.role === 'region' && n.name === strings['sum.railTitle']);
  expect(rail.length, s.frame).toBe(1);
  expect(all(rail, (n) => n.name === strings['sum.twofaOffNoPassword']).length, s.frame).toBeGreaterThan(0);
  expect(all(rail, (n) => n.name.includes('password alone')).length, s.frame).toBe(0);
  expect(s.failures).toEqual([]);
}, 240_000);

test('a password and two-step sign-in off keeps the full line', async () => {
  s = await renderPage({ page: 'account', fx: 'twofa-off', cols: 120, rows: 40, path: '/account' });
  await s.settle();
  expect(says(strings['sum.twofaOff']), s.frame).toBe(true);
  expect(s.failures).toEqual([]);
}, 240_000);
