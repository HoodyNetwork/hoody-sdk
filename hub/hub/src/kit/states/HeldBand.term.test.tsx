// HeldBand in the terminal (HeldBand.term.tsx): the band of a change that may have gone through. HeldBand.scenario.ts
// holds the presses on both platforms; these hold the keyboard and what the terminal draws:
//   - the pending mark ◷ and the sentence; Check again reads once and stays busy until the read settles (Enter on it
//     meanwhile reads nothing more)
//   - Stop tracking asks first; the question opens on Cancel, so Enter there (or Esc) stops nothing; only Stop tracking
//     anyway stops tracking, once
//   - the answer calls the onDismiss the band had when it asked, not a later one
//   - inFlight: both actions stay Tab stops, say why while focused, and do nothing
//   - a read-only hold with `elsewhere: null` shows its sentence alone; the note sits under the sentence, past the mark
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { HeldBand, type HeldBandProps } from './HeldBand';

const TEXT = 'Snapshot nightly may be taken.';
const ASK = 'Stop tracking this?';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

type Bits = Partial<Omit<HeldBandProps, 'text' | 'overlayId'>>;
const draw = async (p: Bits) => {
  t = await drawTest(
    <FocusRoot><OverlayHost><HeldBand text={TEXT} readOnly={false} overlayId="t-held" onCheck={() => undefined} onDismiss={() => undefined} {...p} /></OverlayHost></FocusRoot>,
    { width: 120, height: 30 },
  );
  return t.settle();
};
const step = async (fn: () => void): Promise<string> => { fn(); return t!.settle(); };
/** Esc waits for the key parser's lone-escape timeout. */
const esc = async (): Promise<string> => { t!.mockInput.pressEscape(); await new Promise((r) => setTimeout(r, 80)); return t!.settle(); };

// Catches the busy Check again (HeldBand.term.tsx line 29: `busy={checking}` until the read's promise settles).
test('◷ and the sentence; Check again reads once and stays busy until the read settles; Enter meanwhile reads nothing', async () => {
  let checks = 0;
  let release: () => void = () => undefined;
  let f = await draw({ onCheck: () => { checks += 1; return new Promise<void>((r) => { release = r; }); } });
  expect(f).toContain('◷');
  expect(f).toContain(TEXT);
  expect(f).toContain('[Check again]');
  expect(f).toContain('[Stop tracking]');
  await step(() => t!.mockInput.pressTab()); // Check again
  f = await step(() => t!.mockInput.pressEnter());
  expect(checks).toBe(1);
  expect(f).toContain('[… Check again]');
  f = await step(() => t!.mockInput.pressEnter());
  expect(checks).toBe(1);
  release();
  f = await t!.settle();
  expect(f).toContain('[Check again]');
  expect(f).not.toContain('… Check again');
  await step(() => t!.mockInput.pressEnter());
  expect(checks).toBe(2);
});

// Catches the question before Stop tracking (lines 31, 38-49) and the confirm's opening on Cancel (Dialog.term.tsx).
test('Stop tracking asks first: Enter on Cancel and Esc stop nothing; Stop tracking anyway stops once', async () => {
  let dismissed = 0;
  let f = await draw({ onDismiss: () => { dismissed += 1; } });
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressTab()); // Stop tracking
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain(ASK);
  expect(f).toContain('Stop tracking anyway');
  expect(dismissed).toBe(0);
  f = await step(() => t!.mockInput.pressEnter()); // the question opens on Cancel
  expect(f).not.toContain(ASK);
  expect(dismissed).toBe(0);
  f = await step(() => t!.mockInput.pressEnter()); // the focus is back on Stop tracking: it asks again
  expect(f).toContain(ASK);
  f = await esc();
  expect(f).not.toContain(ASK);
  expect(dismissed).toBe(0);
  await step(() => t!.mockInput.pressEnter());
  await step(() => t!.mockInput.pressTab()); // Cancel → Stop tracking anyway
  f = await step(() => t!.mockInput.pressEnter());
  expect(dismissed).toBe(1);
  expect(f).not.toContain(ASK);
});

let swapOut: () => void = () => {};
function Swapping({ log }: { log: number[] }) {
  const [n, setN] = useState(1);
  swapOut = () => setN(2);
  return <FocusRoot><OverlayHost><HeldBand text={TEXT} readOnly={false} overlayId="t-held" onCheck={() => undefined} onDismiss={() => { log.push(n); }} /></OverlayHost></FocusRoot>;
}

// Catches `asked = { go: onDismiss }` taken at the press (line 31): the question answers for the band it was asked from.
test('the answer calls the onDismiss the band had when it asked, not a later one', async () => {
  const log: number[] = [];
  t = await drawTest(<Swapping log={log} />, { width: 120, height: 30 });
  await t.settle();
  await step(() => t!.mockInput.pressTab());
  await step(() => t!.mockInput.pressTab());
  let f = await step(() => t!.mockInput.pressEnter());
  expect(f).toContain(ASK);
  await step(() => swapOut());
  await step(() => t!.mockInput.pressTab());
  f = await step(() => t!.mockInput.pressEnter());
  expect(log).toEqual([1]);
  expect(f).not.toContain(ASK);
});

// Catches `wait` (line 19): both actions soft-disabled with the reason, never pressed.
test('inFlight: both actions stay Tab stops, say why while focused, and do nothing', async () => {
  let checks = 0;
  let dismissed = 0;
  let f = await draw({ inFlight: true, onCheck: () => { checks += 1; }, onDismiss: () => { dismissed += 1; } });
  expect(f).not.toContain('Still waiting for the answer.');
  f = await step(() => t!.mockInput.pressTab()); // Check again
  expect(f).toContain('Still waiting for the answer.');
  await step(() => t!.mockInput.pressEnter());
  expect(checks).toBe(0);
  f = await step(() => t!.mockInput.pressTab()); // Stop tracking
  expect(f).toContain('Still waiting for the answer.');
  f = await step(() => t!.mockInput.pressEnter());
  expect(f).not.toContain(ASK);
  expect(dismissed).toBe(0);
});

// Catches the read-only sentence (line 35: `elsewhere !== null`) and the note's place (line 38: two cells in).
test('read-only with elsewhere null: the sentence alone, no Stop tracking; the note under it, past the mark', async () => {
  const f = await draw({ readOnly: true, elsewhere: null, note: 'Not in the list yet.' });
  expect(f).toContain(TEXT);
  expect(f).not.toContain('only that one can stop tracking');
  expect(f).not.toContain('Stop tracking');
  expect(f).toContain('[Check again]');
  const noteLine = f.split('\n').find((l) => l.includes('Not in the list yet.')) ?? '';
  expect(noteLine.indexOf('Not in the list yet.')).toBe(2);
  const bandLine = f.split('\n').find((l) => l.includes(TEXT)) ?? '';
  expect(bandLine.indexOf(TEXT)).toBe(2);
});
