// A shared-access (access key) session's way out in the terminal: the Notifications page's button leaves the Hub, as
// the account menu's Leave and q do; it never signs the CLI out (term/shell/Menus.tsx).
// Before, the page drew the web's "Sign out" and its press ran core's logout through the shell data's signOut: the
// mount ended signed-out and the kept keys were purged from disk. TermShell now gives the page area its Leave
// (term/shell/TermShell.tsx pageData) and termWords.json names the button with the account menu's word.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Every page button that called sign-out reads the account menu's Leave word in the terminal | 'the words' |
// | 2 | Notifications in an access-key session: the button reads Leave the Hub (no Sign out); its press quits the shell (or asks first), no sign-out runs | 'the press leaves' |
// | 3 | The Notices view in an access-key session offers the same Leave (one SignOutAction, one mapping), never Sign out | 'notices leaves too' |
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { loggingOut } from '@core/ctx';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from '../../term/app/boot';
import { beginTermSession, type TermSession } from '../../term/env/session';
import type { TermBoot } from '../../term/app/lifecycle';
import { createTermApp } from '../../term/app/App';
import { TERM_WORDS } from '../../term/app/termWords';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { act, getByRole, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import termShell from '../../term/shell/strings.en.json';
import shellStrings from '../../shell/strings.en.json';

setDefaultTimeout(60_000);

const SRC = path.resolve(import.meta.dir, '../..');
// The web words, from the files: the imported tables carry the terminal's words once an app applied them.
const disk = (name: string) => JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>;
const NOTIFICATIONS = 'pages/notifications/strings.en.json';
const WEB_WORD = disk(NOTIFICATIONS)['token.signOut']!;
const LEAVE = termShell['account.leave'];
// The page keys whose button calls the shell data's signOut (SignOutAction in notifications/parts/SignOutAction.tsx,
// vault/view.tsx and account/view.tsx).
const SIGN_OUT_KEYS = [
  [NOTIFICATIONS, 'token.signOut'],
  ['pages/vault/strings.en.json', 'access.signOut'],
  ['pages/account/strings.en.json', 'token.signOut'],
] as const;

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;
const ends: string[] = [];

beforeAll(async () => {
  pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'notifications', fx: 'access-key' });
  // A sign-out ends the mount here (boot.ts: core's leave calls end('signed-out')).
  await boot.start(session, (why) => { ends.push(why); });
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

/** Settles until the frame passes (or `ms`). */
async function until(ok: (f: string) => boolean, ms = 6000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}
const flat = (f: string): string => f.replace(/\s+/g, ' ');

test('the words', () => {
  for (const [name, key] of SIGN_OUT_KEYS) {
    expect({ name, key, web: disk(name)[key] }).toEqual({ name, key, web: 'Sign out' });
    expect({ name, key, text: TERM_WORDS[name]?.[key] }).toEqual({ name, key, text: LEAVE });
  }
});

test('the press leaves', async () => {
  const quits: string[] = [];
  const app = createTermApp({ pages, queryClient, path: '/notifications', onQuit: () => quits.push('quit') });
  t = await drawTest(app.element, { width: 120, height: 40 });
  // The access-key state: core refused the list unsent, the page says where the notices are.
  const title = disk(NOTIFICATIONS)['token.title']!;
  const frame = await until((f) => flat(f).includes(title));
  expect(flat(frame)).toContain(title);
  const tree = semanticsOf(t.renderer as unknown as SemRoot);
  expect(queryAllByRole(tree, 'button', { name: WEB_WORD })).toEqual([]);
  const leave = getByRole(tree, 'button', { name: LEAVE });
  act(leave, 'press');
  // No work is at stake in this state, so the shell leaves at once; with some, it asks first (QuitPrompt).
  const asked = [shellStrings['leave.title'], shellStrings['leave.unsavedTitle']];
  const after = await until((f) => quits.length > 0 || asked.some((a) => f.includes(a)));
  expect(quits.length === 1 || asked.some((a) => after.includes(a))).toBe(true);
  // Core's sign-out never ran: nothing is logging out, and the mount did not end signed-out.
  await new Promise((r) => setTimeout(r, 200));
  await t.settle();
  expect(loggingOut()).toBe(false);
  expect(ends).toEqual([]);
});

test('notices leaves too', async () => {
  await t?.dispose();
  const app = createTermApp({ pages, queryClient, path: '/notifications/notices', onQuit: () => undefined });
  t = await drawTest(app.element, { width: 120, height: 40 });
  const title = disk(NOTIFICATIONS)['an.noTokenTitle']!;
  const frame = await until((f) => flat(f).includes(title));
  expect(flat(frame)).toContain(title);
  const tree = semanticsOf(t.renderer as unknown as SemRoot);
  expect(queryAllByRole(tree, 'button', { name: WEB_WORD })).toEqual([]);
  expect(getByRole(tree, 'button', { name: LEAVE })).toBeTruthy();
});
