// Home's setup panel in a terminal (parts/SetupPanel.tsx through the terminal kit): the All-realms view of an account
// with no computer yet. A redeem whose answer may have gone through is held: the panel says so and offers a read-back,
// never "that code did not work", and nothing is sent again until the hold ends (a read-back that proves it, or the
// person's warned Stop tracking).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Lost answer, failing read-back: "may have gone through", Check again only reads, a second code is never sent | 'a lost redeem is held …' |
// | 2 | Lost answer, read-back answers but proves nothing: still held; Stop tracking asks in the page's words, then frees it | 'Check again keeps the hold …' |
// | 3 | A busy server (429) is not "that code did not work" | 'a busy server …' |
// | 4 | A 200 with a block reason says the code cannot be used | 'a redeem answered 200 …' |
// | 5 | Reinstalled server: title, body, and Open Projects goes to Computers | 'reinstalled: …' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, type SemNode } from '../../term/prim/semantics';
import kit from '../../kit/strings.en.json';
import kitStates from '../../kit/states/strings.en.json';
import computers from '../computers/strings.en.json';
import { sent } from './fixtures';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
const named = (name: string, role?: string, within: readonly SemNode[] = tree()): SemNode[] => flat(within).filter((n) => n.name === name && (!role || n.role === role));
/** The control of that name inside the pending banner (role alert), not one of the page's own. */
const inBanner = (name: string): SemNode | undefined => {
  const banner = flat(tree()).find((n) => n.role === 'alert' && flat(n.children).some((c) => c.name.includes(kit['outcome.pending.title'])));
  return banner ? flat(banner.children).find((n) => n.name === name && n.actions.includes('press')) : undefined;
};
const redeemButton = (): SemNode | undefined => named(strings['setup.invite.redeem'], 'button')[0];
async function until(ok: () => boolean): Promise<void> { for (let i = 0; i < 8 && !ok(); i++) await s!.settle(); }
async function press(n: SemNode | undefined): Promise<void> {
  expect(n).toBeDefined();
  act(n!, 'press');
  await s!.settle();
}
async function type(code: string): Promise<void> {
  const field = named(strings['setup.invite.field'], 'textbox')[0];
  expect(field).toBeDefined();
  act(field!, 'setValue', code);
  await s!.settle();
}

// The setup panel shows in the All-realms view only (pages/home/data.ts accountEmpty): the fixture opens on one realm,
// so each case switches to All realms before the app is built.
const allRealms = async (): Promise<void> => {
  const { switchTo } = (await import('../../core/realm')) as { switchTo(t: string): Promise<boolean> };
  expect(await switchTo('all')).toBe(true);
};
async function open(fx: string): Promise<void> {
  s = await renderPage({ page: 'home', fx, cols: 120, rows: 40, afterBoot: allRealms });
  await s.settle();
  await until(() => says(strings['setup.invite.title']) || says(strings['setup.reinstalled.title']));
  clean();
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.frame).not.toContain('could not be drawn');
}
const pending = (): boolean => says(kit['outcome.pending.title']);
/** Nothing on the page says the code was refused or the send failed. */
function neverFailed(): void {
  for (const no of [strings['setup.inviteFailed.title'], strings['setup.redeem.trouble'], kit['outcome.failed.title']]) expect(says(no)).toBe(false);
}

test('a lost redeem is held: it may have gone through, Check again only reads, and a second code is never sent', async () => {
  await open('inviteRedeemLost');
  // Nothing typed: nothing to send.
  expect(redeemButton()?.states.disabled).toBe(true);
  await type('abc123');
  expect(redeemButton()?.states.disabled).toBeUndefined();
  await press(redeemButton());
  await until(pending);
  expect(sent.redeem).toBe(1);
  expect(pending()).toBe(true);
  expect(says(strings['setup.invite.title'])).toBe(true);
  expect(inBanner(kit['outcome.pending.check'])).toBeDefined();
  expect(inBanner(kitStates['err.stopTracking'])).toBeDefined();
  neverFailed();

  // Another code while the first answer is unknown: the button stays off, and a click on it sends nothing.
  await type('zzz999');
  const off = redeemButton();
  expect(off?.states.disabled).toBe(true);
  act(off!, 'click', undefined, { force: true });
  await s!.settle();
  expect(sent.redeem).toBe(1);

  // Check again reads; the read fails, so the hold stays and nothing is sent.
  await press(inBanner(kit['outcome.pending.check']));
  expect(pending()).toBe(true);
  expect(redeemButton()?.states.disabled).toBe(true);
  expect(sent.redeem).toBe(1);
  neverFailed();
  clean();
}, 240_000);

test('Check again keeps the hold when the read proves nothing; Stop tracking asks first, then frees the code field', async () => {
  await open('inviteRedeemRecover');
  await type('abc123');
  await press(redeemButton());
  await until(pending);
  expect(sent.redeem).toBe(1);

  // The read answers: no computer, and the setup still asks for a code. That proves nothing, so the hold stays.
  await press(inBanner(kit['outcome.pending.check']));
  await s!.settle();
  expect(pending()).toBe(true);
  expect(sent.redeem).toBe(1);

  // Stop tracking: the page's own warning (setup could run twice), a danger dialog.
  await press(inBanner(kitStates['err.stopTracking']));
  const dialog = () => flat(tree()).find((n) => (n.role === 'dialog' || n.role === 'alertdialog') && n.name === strings['setup.dismiss.title']);
  await until(() => dialog() !== undefined);
  expect(dialog()).toBeDefined();
  expect(says(strings['setup.dismiss.body'])).toBe(true);
  await press(named(strings['setup.dismiss.confirm'], 'button', [dialog()!])[0]);
  await until(() => !pending());
  expect(dialog()).toBeUndefined();
  expect(pending()).toBe(false);
  expect(sent.redeem).toBe(1);

  // The hold is over: a typed code can be redeemed again.
  await type('abc123');
  expect(redeemButton()?.states.disabled).toBeUndefined();
  neverFailed();
  clean();
}, 240_000);

test('a busy server is not "that code did not work"', async () => {
  await open('inviteTrouble');
  await type('abc123');
  await press(redeemButton());
  await until(() => says(strings['setup.redeem.trouble']));
  expect(says(strings['setup.redeem.trouble'])).toBe(true);
  expect(says(strings['setup.inviteFailed.title'])).toBe(false);
  expect(says(strings['setup.invite.title'])).toBe(true);
  expect(pending()).toBe(false);
  // Nothing is held: another code can be sent.
  await type('abc123');
  expect(redeemButton()?.states.disabled).toBeUndefined();
  clean();
}, 240_000);

test('a redeem answered 200 with a block reason says the code cannot be used', async () => {
  await open('inviteBlocked200');
  await type('abc123');
  await press(redeemButton());
  await until(() => says(strings['setup.blocked.code']));
  expect(says(strings['setup.blocked.code'])).toBe(true);
  expect(says(strings['setup.invite.title'])).toBe(true);
  expect(pending()).toBe(false);
  clean();
}, 240_000);

test('reinstalled: the panel says what happened, and Open Projects goes to Computers', async () => {
  await open('reinstalled');
  expect(says(strings['setup.reinstalled.title'])).toBe(true);
  expect(says(strings['setup.reinstalled.body'])).toBe(true);
  // The page title sits on the top bar's first line.
  // The page header's title (the top bar names no page).
  const top = (): string => flat(tree()).filter((n) => n.role === 'heading' && n.level === 1).map((n) => n.name ?? '').join(' ');
  expect(top()).not.toContain(computers.title);
  await press(named(strings['setup.reinstalled.go'], 'button')[0]);
  await until(() => top().includes(computers.title));
  expect(top()).toContain(computers.title);
}, 240_000);
