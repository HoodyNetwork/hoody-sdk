// The kit's dialog, drawn alone (here, beside the prims it is mounted with: FocusRoot, OverlayHost).
// A dialog whose body is taller than the screen scrolls it. A note that appears at the end of the body after a press
// (the dialog's own outcome, or an OutcomeBanner the page puts in the body) was drawn below the fold and the body did
// not move, so the press looked as if it did nothing. A note that appears after the action was pressed is now brought
// into view (kit/overlays/termReveal.ts).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The dialog's own outcome, set by pressing the action, is on screen in a body that scrolls | 'own outcome' |
// | 2 | An OutcomeBanner the page adds to the body when the action is pressed is on screen | 'banner in the body' |
// | 3 | A body that fits does not move: its first line stays, the note is drawn | 'fits: nothing moves' |
// | 4 | An OutcomeBanner in a page's own scroll (no dialog) moves nothing | 'a page scroll is left alone' |
// | 5 | A note that is there when the dialog opens moves nothing: the dialog opens at its top | 'there at open' |
// | 6 | A note that arrives by itself, before the action was pressed, moves nothing | 'arrives by itself' |
// | 7 | One press shows one note: a banner that mounts later for another reason moves nothing | 'a later banner moves nothing' |
// | 8 | A note taller than the view is shown from its first row: its title is on screen (held before this test too; pinned) | 'taller than the view' |
// | 9 | A second press while the same note is still there shows it again (the person had scrolled back up) | 'a second press shows it again' |
import { expect, test } from 'bun:test';
import { useEffect, useState } from 'react';
import { drawTest } from './testing';
import { FocusRoot, Scroll, Text } from './index';
import { OverlayHost } from './Overlay';
import { ConfirmDialog } from '../../kit/overlays/Dialog';
import { OutcomeBanner } from '../../kit/states/States';
import type { OutcomeLike } from '../../kit/outcome';

const draw = (node: React.ReactNode, width = 80, height = 24) => drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width, height });
const LINES = Array.from({ length: 30 }, (_, i) => `consequence number ${i + 1}`);
const NOTE = 'Nothing was changed';

/** What a press would do: set by whichever component is mounted. */
let fire: () => void = () => {};
function useFired(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => { fire = () => setOn(true); return () => { fire = () => {}; }; }, []);
  return on;
}
function Page({ lines, own, atOpen = false }: { lines: string[]; own: boolean; atOpen?: boolean }) {
  const on = useFired() || atOpen;
  const outcome = own && on ? ({ kind: 'failed', message: NOTE } as OutcomeLike) : undefined;
  return (
    <ConfirmDialog isOpen onOpenChange={() => {}} title="Change it?" body="First line of the body." consequences={lines} confirmLabel="Change" onConfirm={() => fire()} {...(outcome ? { outcome } : {})}>
      {!own && on ? <OutcomeBanner kind="not_sent" title={NOTE} body="Because of a reason." /> : null}
    </ConfirmDialog>
  );
}
function Plain() {
  const on = useFired();
  return (
    <Scroll followFocus height={10}>
      {LINES.map((l) => <Text key={l}>{l}</Text>)}
      {on ? <OutcomeBanner kind="not_sent" title={NOTE} /> : null}
    </Scroll>
  );
}
/** `press`: Tab from Cancel to the action and Enter, as a person does; else the note arrives by itself. */
async function shown(node: React.ReactNode, w = 80, h = 24, press = true): Promise<[string, string]> {
  const t = await draw(node, w, h);
  const before = await t.settle();
  if (press) { t.mockInput.pressTab(); await t.settle(); t.mockInput.pressEnter(); } else fire();
  await t.settle();
  await new Promise((r) => setTimeout(r, 20));
  const after = await t.settle();
  t.renderer.destroy();
  return [before, after];
}

test('own outcome', async () => {
  const [before, after] = await shown(<Page lines={LINES} own />);
  expect(before).toContain('First line of the body.');
  expect(before).not.toContain(NOTE);
  expect(after).toContain(NOTE);
});

test('banner in the body', async () => {
  const [before, after] = await shown(<Page lines={LINES} own={false} />);
  expect(before).not.toContain(NOTE);
  expect(after).toContain(NOTE);
  expect(after).toContain('Because of a reason.');
});

test('fits: nothing moves', async () => {
  const [before, after] = await shown(<Page lines={['one']} own={false} />, 120, 40);
  expect(before).toContain('First line of the body.');
  expect(after).toContain('First line of the body.');
  expect(after).toContain(NOTE);
});

test('a page scroll is left alone', async () => {
  const [before, after] = await shown(<Plain />, 80, 24, false);
  expect(before).toContain('consequence number 1');
  expect(after.split('\n')[0]).toContain('consequence number 1 ');
  expect(after).not.toContain(NOTE);
});

test('there at open', async () => {
  const [before] = await shown(<Page lines={LINES} own={false} atOpen />, 80, 24, false);
  expect(before).toContain('First line of the body.');
  expect(before).not.toContain(NOTE);
});

test('arrives by itself', async () => {
  const [, after] = await shown(<Page lines={LINES} own={false} />, 80, 24, false);
  expect(after).toContain('First line of the body.');
  expect(after).not.toContain(NOTE);
});

const LATER = 'Something else happened';
let later: () => void = () => {};
/** The pressed note, some lines under it, then a banner that arrives by itself (`later()`). */
function Two() {
  const on = useFired();
  const [more, setMore] = useState(false);
  useEffect(() => { later = () => setMore(true); return () => { later = () => {}; }; }, []);
  return (
    <ConfirmDialog isOpen onOpenChange={() => {}} title="Change it?" body="First line of the body." consequences={LINES} confirmLabel="Change" onConfirm={() => fire()}>
      {on ? <OutcomeBanner kind="not_sent" title={NOTE} body="Because of a reason." /> : null}
      {LINES.slice(0, 12).map((l) => <Text key={l}>under: {l}</Text>)}
      {more ? <OutcomeBanner kind="not_sent" title={LATER} /> : null}
    </ConfirmDialog>
  );
}
const LONG = Array.from({ length: 60 }, (_, i) => `reason word ${i + 1}`).join(' ');
function Tall() {
  const on = useFired();
  return (
    <ConfirmDialog isOpen onOpenChange={() => {}} title="Change it?" body="First line of the body." consequences={LINES} confirmLabel="Change" onConfirm={() => fire()}>
      {on ? <OutcomeBanner kind="not_sent" title={NOTE} body={`${LONG} ${LONG} ${LONG}`} /> : null}
    </ConfirmDialog>
  );
}
type Rn = { getChildren?: () => Rn[]; scrollTop?: number } & Record<string, unknown>;
/** The dialog's body scroll: the one a press armed. */
function armedScroll(n: Rn): Rn | null {
  if ('hxRevealsOutcome' in n) return n;
  for (const c of n.getChildren?.() ?? []) { const f = armedScroll(c); if (f) return f; }
  return null;
}
const tick = () => new Promise((r) => setTimeout(r, 20));

test('a later banner moves nothing', async () => {
  const t = await draw(<Two />);
  await t.settle();
  t.mockInput.pressTab(); await t.settle(); t.mockInput.pressEnter();
  await t.settle(); await tick();
  const shownNote = await t.settle();
  expect(shownNote).toContain(NOTE);
  later();
  await t.settle(); await tick();
  const after = await t.settle();
  t.renderer.destroy();
  expect(after).toContain(NOTE);
  expect(after).not.toContain(LATER);
});

test('taller than the view', async () => {
  const [, after] = await shown(<Tall />);
  expect(after).toContain(NOTE);
  expect(after).toContain('reason word 1 ');
});

test('a second press shows it again', async () => {
  const t = await draw(<Page lines={LINES} own={false} />);
  await t.settle();
  t.mockInput.pressTab(); await t.settle(); t.mockInput.pressEnter();
  await t.settle(); await tick();
  expect(await t.settle()).toContain(NOTE);
  const scroll = armedScroll(t.renderer.root as unknown as Rn);
  expect(scroll).not.toBeNull();
  scroll!.scrollTop = 0;
  const back = await t.settle();
  expect(back).toContain('First line of the body.');
  expect(back).not.toContain(NOTE);
  t.mockInput.pressEnter();
  await t.settle(); await tick();
  const again = await t.settle();
  t.renderer.destroy();
  expect(again).toContain(NOTE);
});
