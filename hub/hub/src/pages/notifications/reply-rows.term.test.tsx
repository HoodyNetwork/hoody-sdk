// A notice's reply box while the reply is out, in a terminal (parts/NoticeDrawer.tsx). A read-only text area is as tall
// as its text (one row at least, its own rows at most: term/prim/FieldInput.ts ReadArea), and the box is read-only while
// it sends. So a one-line reply shrank the box from four rows to one for the send and grew it back after it, and what
// is under the box jumped up, then down. A box read-only only while a send is out keeps its rows (kit TextField
// `keepRows`); a held reply (its answer unknown) is read-only as it rests and still takes its text's rows.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { abuseReplies, NOTICE_PLAIN, resetAbuseFixtures } from './fixtures';
import { resetDraftsForTests } from './abuse';
import { resetAttempts } from '@core/attempts';
import ns from './strings.en.json';

let s: PageSession | null = null;
// One process draws many files: a reply another file left held for this notice (notices-held 'reply unknown' keeps
// its hold on purpose), with the words it was sent with, would open this box read-only on those words.
beforeEach(() => { resetAbuseFixtures(); resetAttempts(); resetDraftsForTests(); });
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const replyBox = (): SemNode | undefined => queryAllByRole(tree(), 'textbox', { name: ns['an.reply.label'] })[0];
const sendButton = (): SemNode | undefined => queryAllByRole(tree(), 'button', { name: ns['an.reply.send'] }).filter((n) => !n.states.disabled)[0];
async function until(ok: () => boolean, tries = 50): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    await s!.settle();
    if (ok()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  await s!.settle();
  return ok();
}

test('a one-line reply: the box keeps its four rows before, during and after the send', async () => {
  // notice-reply-slow: the reply is stored and answered after a while; the harness holds that answer until releaseHeld().
  s = await renderPage({ page: 'notifications', fx: 'notice-reply-slow', path: `/notifications/notices?sel=${NOTICE_PLAIN}`, cols: 140, rows: 50 });
  expect(await until(() => !!replyBox())).toBe(true);
  const words = 'Removed the script.';
  // Focus, let the field draw focused, then type (an engine field takes keys once it draws focused).
  act(replyBox()!, 'focus');
  await s.settle();
  act(replyBox()!, 'type', words);
  await s.settle();
  expect(replyBox()?.value).toBe(words);
  const before = replyBox()!.box[3];
  expect(before).toBe(4);

  // Send reply: focused first and a frame drawn, so its Enter is not a new line in the box.
  expect(await until(() => !!sendButton())).toBe(true);
  act(sendButton()!, 'focus');
  await s.settle();
  act(sendButton()!, 'press');
  await s.settle();
  // Positive controls: the reply is out once, with the typed words; the box is read-only and still shows them.
  expect(abuseReplies.map((r) => r.body)).toEqual([words]);
  const during = replyBox()!;
  expect(during.states.readonly).toBe(true);
  expect(during.value).toBe(words);
  // A regression shows 1 row here (the read-only area takes its one line of text).
  expect(during.box[3]).toBe(before);

  await s.releaseHeld();
  expect(await until(() => replyBox()?.value === '' && replyBox()?.states.readonly !== true)).toBe(true);
  expect(replyBox()!.box[3]).toBe(before);
  expect(abuseReplies).toHaveLength(1);
  expect(s.failures).toEqual([]);
  expect(s.trapsAt).toEqual([]);
});
