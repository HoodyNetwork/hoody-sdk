// A change that ended pending (unknown outcome) must not go silent in the terminal: the page it was sent from shows its
// own outcome, so the shell says nothing there; once the person leaves that page, the shell shows the web's pending toast
// (pendingNotice.tsx, the web's CoreNotices toast).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { notifyPending } from '../../core/api';
import { bump, capture, identity, setIdentity } from '../../core/ctx';
import { toastQueue } from '../../kit/states/Toast.store';
import { makeT } from '../../kit/strings';
import shellStrings from '../../shell/strings.en.json';
import { act, semanticsOf, type SemNode } from '../prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

// Pinned by the web's string keys (notice.pending / notice.pendingBody), never the sentence: the words are the web's.
// The title wraps inside the toast's frame, so the frame is read for the mark and the title's first words, the store for
// the whole title and body.
const st = makeT(shellStrings);
const TITLE = st('notice.pending', { realm: 'Personal' });
const BODY = st('notice.pendingBody');
const DRAWN = '◷ ' + TITLE.slice(0, 12);
const told = (): string[] => toastQueue().visibleToasts.filter((x) => x.content.title === TITLE && x.content.body === BODY).map((x) => x.content.title);
async function settleTold(): Promise<string> {
  let frame = await s!.settle();
  for (let i = 0; i < 50 && !frame.includes(DRAWN); i++) { await new Promise((r) => setTimeout(r, 50)); frame = await s!.settle(); }
  return frame;
}

/** Leaves the page as a person does: presses the sidebar's Home entry. */
async function goHome(): Promise<void> {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  const all = (ns: SemNode[]): SemNode[] => ns.flatMap((n) => [n, ...all(n.children)]);
  const home = all(semanticsOf({ root: r.root, stdin: r.stdin })).find((n) => n.name === 'Home' && n.actions.includes('press'));
  expect(home).toBeDefined();
  act(home!, 'press');
  const frame = await s!.settle();
  expect(frame).not.toContain(' Guide ◆');
}

test('a pending change is quiet on its own page and told once the person leaves it', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  notifyPending(capture());
  let frame = await s.settle();
  expect(frame).not.toContain(DRAWN);
  expect(told()).toEqual([]);
  await goHome();
  frame = await settleTold();
  expect(frame).toContain(DRAWN);
  expect(told()).toEqual([TITLE]);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 120_000);

test('a change pending after the person already left is told at once, and only once per change', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  const ctx = capture();
  await goHome();
  await s.settle();
  notifyPending(ctx);
  notifyPending(ctx);
  const frame = await settleTold();
  expect(frame.split(DRAWN).length - 1).toBe(1);
  expect(told()).toHaveLength(1);
}, 120_000);

test('nothing is told for a change that went pending while signing out', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  notifyPending(capture(), true);
  await goHome();
  const frame = await s.settle();
  expect(frame).not.toContain(DRAWN);
  expect(told()).toEqual([]);
}, 120_000);

test('a change pending for one account is never told to the next account', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  const was = identity();
  expect(was).not.toBeNull();
  notifyPending(capture());
  // Another account is shown in this same shell (no sign-out flag): the wait is dropped, nothing shows on leaving.
  setIdentity({ ...was!, id: 'another-account' } as never);
  bump('account');
  await goHome();
  const frame = await s.settle();
  expect(frame).not.toContain(DRAWN);
  expect(told()).toEqual([]);
}, 120_000);
