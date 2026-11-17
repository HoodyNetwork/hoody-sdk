// Account > Remove all local data, in the terminal at 80x24. The confirm's body is taller than the dialog there, so
// it scrolls. A refused confirm answers with a note at the end of the body ("Nothing was removed" and why). The note
// was drawn below the fold and the body did not move: pressing Remove looked as if it did nothing. The note is now
// brought into view when it appears (kit/overlays/termReveal.ts): its title and its reason are on screen. A note that
// is there when the dialog opens moves nothing.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Another Hub is open: after the press the frame shows "Nothing was removed" and the reason's first words | 'tabs' |
// | 2 | The Hub could not check its stores: the same, with that reason | 'unchecked' |
// | 3 | Saved payments block the confirm from the start: that note is there when the dialog opens (drawn first, see wipe-blocked-note.term.test.tsx), so nothing scrolls (a surface opens at its top): the body's first words are on screen | 'payments' |
// | 4 | At 120x40 nothing scrolls: the body's first line and the note are both on screen after the press | 'roomy' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, type SemNode } from '../../term/prim/semantics';
import web from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string => focusedNode(tree())?.name ?? '';
const NOTE = web['w.notRemoved'];
const flat = (): string => s!.frame.replace(/\s+/g, ' ');

/** `seen`: words that are on the first screen once the confirm is open (the link "What this removes", unless said). */
async function open(fx: string, cols = 80, rows = 24, seen: string = web['w.more']): Promise<void> {
  s = await renderPage({ page: 'account', fx, cols, rows, path: '/account?sheet=wipe' });
  await s.settle();
  expect(s.frame).toContain(seen);
}
/** Tab to the confirm (its name starts "Remove and" on both surfaces) and press it. */
async function confirm(): Promise<void> {
  for (let i = 0; i < 30 && !/^Remove and /.test(focused()); i++) await s!.keys.press('tab');
  expect(focused()).toMatch(/^Remove and /);
  await s!.keys.press('enter');
  await s!.releaseHeld();
  await s!.settle();
}

test('tabs', async () => {
  await open('wipe-tabs');
  expect(s!.frame).not.toContain(NOTE);
  await confirm();
  expect(s!.frame).toContain(NOTE);
  // the reason under the title, not only the title
  expect(flat()).toContain('Close any other Hub');
  expect(s!.failures).toEqual([]);
}, 240_000);

test('unchecked', async () => {
  await open('wipe-unchecked');
  expect(s!.frame).not.toContain(NOTE);
  await confirm();
  expect(s!.frame).toContain(NOTE);
  expect(flat()).toContain('could not check');
  expect(s!.failures).toEqual([]);
}, 240_000);

test('payments', async () => {
  // the note that says why the action is off is drawn first (wipe-blocked-note.term.test.tsx), then the body; the
  // link under the body is below the fold at 80x24
  await open('wipe-payments', 80, 24, 'The Hub forgets');
  expect(s!.failures).toEqual([]);
}, 240_000);

test('roomy', async () => {
  await open('wipe-tabs', 120, 40);
  const first = s!.frame;
  await confirm();
  expect(s!.frame).toContain(NOTE);
  // nothing scrolled away: the body's first words are still drawn
  const lead = first.split('\n').find((l) => l.includes('The Hub forgets'))!;
  expect(lead).toBeDefined();
  expect(s!.frame).toContain('The Hub forgets');
}, 240_000);
