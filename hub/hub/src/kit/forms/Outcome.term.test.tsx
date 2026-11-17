// Outcome and OutcomeSlot in the terminal (Outcome.term.tsx on Outcome.pure.ts): what a person sees after an action.
//   - the kind reads without colour: ✓ done, ◷ may have gone through, ✗ didn't go through, i nothing was sent / not applied
//   - Check again only while pending; Try again only after a definite failure; Dismiss never on a pending line
//   - Check again reads back once and says "Checking…" while the read runs
//   - OutcomeSlot: while pending the action is gone (nothing can be sent twice); a failure puts the line before the
//     action; done shows for `doneFor`, then the action comes back
//   - block variant: the long titles and the default pending sentence
// The promoted-pending Stop tracking rule has its own file (Outcome.promotedStop.term.test.tsx).
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Button } from '../controls/Button';
import { Outcome, OutcomeSlot } from './Outcome';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: ReactNode, width = 120, height = 12): Promise<string> => {
  t = await drawTest(<FocusRoot><Box dir="column">{node}</Box></FocusRoot>, { width, height });
  return t.settle();
};
const noop = () => {};

// Catches OUTCOME_MARK (line 20) or the short titles (lines 33-39) changing: in mono the mark is all that tells the kinds apart.
test('each kind has its own mark and words, so it reads without colour', async () => {
  const f = await draw(
    <>
      <Outcome outcome="done" />
      <Outcome outcome="pending" />
      <Outcome outcome="failed" />
      <Outcome outcome="not_sent" />
      <Outcome outcome="stale" />
    </>,
  );
  expect(f).toContain('✓ Done');
  expect(f).toContain('◷ May have gone through');
  expect(f).toContain("✗ Didn't go through");
  expect(f).toContain('i Nothing was sent');
  expect(f).toContain('i Not applied');
});

// Catches the action conditions (lines 59-64): Check again on pending only, Try again on failed/not_sent/stale only,
// Dismiss never while pending (a pending line must not be waved away).
test('pending offers Check again only; a definite failure offers Try again and Dismiss, never Check again', async () => {
  let f = await draw(<Outcome outcome="pending" onCheck={() => true} onRetry={noop} onDismiss={noop} />);
  expect(f).toContain('Check again');
  expect(f).not.toContain('Try again');
  expect(f).not.toContain('Dismiss');
  t!.renderer.destroy();
  t = null;
  f = await draw(<Outcome outcome="failed" onCheck={() => true} onRetry={noop} onDismiss={noop} />);
  expect(f).toContain('Try again');
  expect(f).toContain('Dismiss');
  expect(f).not.toContain('Check again');
  t!.renderer.destroy();
  t = null;
  f = await draw(<Outcome outcome="done" onRetry={noop} onDismiss={noop} />);
  expect(f).not.toContain('Try again');
  expect(f).toContain('Dismiss');
});

// Catches the Check again button losing its press or its busy words (line 60, useCheck): one read per press, and the
// person sees that it is running.
test('Check again reads back once and says "Checking…" until the read ends', async () => {
  let calls = 0;
  let end: (v: boolean) => void = () => {};
  await draw(<Outcome outcome="pending" onCheck={() => { calls += 1; return new Promise<boolean>((r) => { end = r; }); }} />);
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressEnter();
  let f = await t!.settle();
  expect(calls).toBe(1);
  expect(f).toContain('Checking…');
  expect(f).not.toContain('Check again');
  // Busy refuses a second press while the first read is out.
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(calls).toBe(1);
  end(true);
  f = await t!.settle();
  expect(f).toContain('Check again');
  expect(f).not.toContain('Checking…');
});

// Catches OutcomeSlot's rule (line 79): the action is hidden while pending, so the change cannot be sent a second time.
test('OutcomeSlot: while pending the action is gone and Check again stands in its place', async () => {
  const f = await draw(
    <OutcomeSlot outcome="pending" onCheck={() => true} toastOnLeave={false}>
      <Button onPress={noop}>Save alias</Button>
    </OutcomeSlot>,
  );
  expect(f).toContain('◷ May have gone through');
  expect(f).toContain('Check again');
  expect(f).not.toContain('Save alias');
});

test('OutcomeSlot: after a definite failure the line comes first, then the action to try again', async () => {
  const f = await draw(
    <OutcomeSlot outcome="failed" toastOnLeave={false}>
      <Button onPress={noop}>Save alias</Button>
    </OutcomeSlot>,
  );
  expect(f).toContain("✗ Didn't go through");
  expect(f).toContain('Save alias');
  expect(f.indexOf("Didn't go through")).toBeLessThan(f.indexOf('Save alias'));
});

// Catches useDoneFlash / line 79: Done shows for its moment instead of the action, then the action comes back.
test('OutcomeSlot: done shows for doneFor, then the action is back and Done is gone', async () => {
  let f = await draw(
    <OutcomeSlot outcome="done" doneFor={1000} toastOnLeave={false}>
      <Button onPress={noop}>Save alias</Button>
    </OutcomeSlot>,
  );
  expect(f).toContain('✓ Done');
  expect(f).not.toContain('Save alias');
  await new Promise((r) => setTimeout(r, 1300));
  f = await t!.settle();
  expect(f).toContain('Save alias');
  expect(f).not.toContain('✓ Done');
});

// Catches the block titles and the default pending sentence (lines 33-41): a drawer body says it in full.
test('block variant: the long title and the default "check before you try again" sentence', async () => {
  const f = await draw(<Outcome outcome="pending" variant="block" onCheck={() => true} />);
  expect(f).toContain('◷ This may have gone through');
  expect(f).toContain("The server didn't confirm it. Check before you try again.");
});
