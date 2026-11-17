// Notices about your servers in the terminal (parts/Notices.tsx, NoticeDrawer.tsx) and the shared-access session on
// both views. Replies are counted on the fake server's record (fixtures.ts abuseReplies), which a boot does not
// reset: each test resets it first.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A reply whose answer is unknown (stored, then 502): the box is locked and Send reply off; Check again only reads; Stop tracking asks first and Cancel keeps it | 'reply unknown' |
// | 2 | An access-key session: Inbox and Notices each show their "not here" state, not an error | 'access key' |
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { frameShows } from '../../../scripts/term/wait-text';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { abuseReplies, NOTICE_PLAIN, resetAbuseFixtures } from './fixtures';
import ns from './strings.en.json';
import fo from '../../kit/forms/forms.strings.en.json';
import st from '../../kit/states/strings.en.json';
import os from '../../kit/overlays/strings.en.json';

let s: PageSession | null = null;
beforeEach(() => resetAbuseFixtures());
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const below = (n: SemNode): SemNode[] => n.children.flatMap((c) => [c, ...below(c)]);
const fold = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
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
// A focus move lands on the next frame: a key sent in the same tick goes to what had the focus before (here the reply
// box, where Enter is a new line). So the button is focused, a frame drawn, then pressed. `scope` is read again after.
async function press(name: string, scope: () => SemNode[] = tree) {
  const first = enabled(buttons(name, scope()))[0];
  if (!first) throw new Error(`no enabled button "${name}"`);
  if (!first.states.focused && first.actions.includes('focus')) { act(first, 'focus'); await s!.settle(); }
  const b = enabled(buttons(name, scope()))[0];
  if (!b) throw new Error(`no enabled button "${name}" once focused`);
  act(b, 'press');
  await s!.settle();
}
/** Types into the field as a person does: focus it, let the frame land, then the keys; it then holds exactly the text. */
async function typeInto(field: () => SemNode | undefined, text: string) {
  act(field()!, 'focus');
  await s!.settle();
  act(field()!, 'type', text);
  await s!.settle();
  expect(field()?.value).toBe(text);
}
const dialog = (title: string): SemNode | null => [...queryAllByRole(tree(), 'alertdialog', { name: title }), ...queryAllByRole(tree(), 'dialog', { name: title })][0] ?? null;
const replyBox = (): SemNode | undefined => queryAllByRole(tree(), 'textbox', { name: ns['an.reply.label'] })[0];

// After a check: "Checked at <time>. Look for your reply in the messages above." (the time part left out).
const checkedTail = ns['an.held.checked'].split('}}. ')[1]!;

test('reply unknown', async () => {
  s = await renderPage({ page: 'notifications', fx: 'notice-reply-unknown', path: `/notifications/notices?sel=${NOTICE_PLAIN}`, cols: 140, rows: 50 });
  expect(await until(() => !!replyBox())).toBe(true);
  // Typed in the same tick as the focus move, the keys were lost: the box stayed empty and Send reply stayed off.
  await typeInto(replyBox, 'Removed the script and rotated the keys.');
  await press(ns['an.reply.send']);
  expect(await until(() => shows(ns['an.held.known']))).toBe(true);
  expect(abuseReplies).toHaveLength(1);
  // Locked while held: no second reply can be sent from here.
  expect(enabled(buttons(ns['an.reply.send']))).toEqual([]);
  const box = replyBox();
  if (box) expect(box.states.readonly === true || box.states.disabled === true).toBe(true);
  // Check again reads the notice; it sends nothing.
  await press(fo['outcome.check']);
  expect(await until(() => shows(checkedTail))).toBe(true);
  expect(abuseReplies).toHaveLength(1);
  // Stop tracking asks first; Cancel keeps the held reply and its banner.
  await press(st['err.stopTracking']);
  expect(await until(() => !!dialog(st['outcome.pending.dismissTitle']))).toBe(true);
  await press(os.cancel, () => [dialog(st['outcome.pending.dismissTitle'])!]);
  expect(await until(() => !dialog(st['outcome.pending.dismissTitle']))).toBe(true);
  expect(shows(ns['an.held.known'])).toBe(true);
  expect(enabled(buttons(ns['an.reply.send']))).toEqual([]);
  expect(abuseReplies).toHaveLength(1);
}, 240_000);

test('access key', async () => {
  s = await renderPage({ page: 'notifications', fx: 'access-key', path: '/notifications', cols: 120, rows: 40 });
  expect(await until(() => shows(ns['token.title']))).toBe(true);
  expect(shows(ns['token.body'])).toBe(true);
  expect(s.failures).toEqual([]);
  s.close();
  s = null;
  s = await renderPage({ page: 'notifications', fx: 'access-key', path: '/notifications/notices', cols: 120, rows: 40 });
  expect(await until(() => shows(ns['an.noTokenTitle']))).toBe(true);
  expect(shows(ns['an.noToken'])).toBe(true);
  expect(s.failures).toEqual([]);
}, 240_000);
