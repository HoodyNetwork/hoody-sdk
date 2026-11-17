// The voice pieces in the terminal (MicButton.term.tsx, CaptionStrip.term.tsx). MicButton.scenario.ts holds the
// hand-off on a press, no press ever run and the page's reason; TalkBar.scenario.ts holds End. These hold:
//   - Talk: a second press closes the hand-off again (the dock stays a few rows high; the address only on demand)
//   - useMicAction: the action carries the page's reason, else the terminal's own, so it is always soft-disabled here
//   - CaptionStrip: "You: “…”" with "(hearing)" while partial, "<Bot>: “…”" under it, nothing for no words
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { CaptionStrip } from './CaptionStrip';
import { MicButton, useMicAction } from './MicButton';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const REASON = 'Talking needs a microphone, and this terminal cannot reach one.';

// Catches the toggle (MicButton.term.tsx line 23, `setOpen((v) => !v)`) and the hand-off drawn only while open (line 26).
test('Talk: Enter opens the hand-off under it, Enter again closes it; the press handler never runs', async () => {
  let pressed = 0;
  t = await drawTest(<FocusRoot><MicButton onPress={() => { pressed += 1; }} /></FocusRoot>, { width: 140, height: 12 });
  let f = await t.settle();
  expect(f).toContain('[⇗ Talk]');
  expect(f).not.toContain(REASON);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).toContain(REASON);
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(f).not.toContain(REASON);
  expect(f).toContain('[⇗ Talk]');
  expect(pressed).toBe(0);
});

// Catches useMicAction's disabledReason (MicButton.term.tsx line 35): the page's reason, else the terminal's, never none.
test('useMicAction: soft-disabled with the page\'s reason, else the terminal\'s; ownTab is not a reason here', async () => {
  const seen: (string | undefined)[] = [];
  function Probe({ reason }: { reason?: 'notSetUp' | 'ownTab' }) {
    seen.push(useMicAction({ reason, busy: false, onPress: () => {} }).disabledReason);
    return null;
  }
  t = await drawTest(<FocusRoot><Probe reason="notSetUp" /><Probe /><Probe reason="ownTab" /></FocusRoot>, { width: 40, height: 3 });
  await t.settle();
  expect(seen.slice(0, 3)).toEqual(["Voice isn't set up for this Bot", REASON, REASON]);
});

// Catches the two lines (CaptionStrip.term.tsx lines 84-94), "(hearing)" only after a partial line of yours (line 87)
// and nothing drawn without words (line 81).
test('CaptionStrip: your words with "(hearing)" while partial, the Bot\'s under them; nothing without words', async () => {
  t = await drawTest(
    <FocusRoot><CaptionStrip you={{ text: 'what time is it', final: false }} bot={{ name: 'Ada', text: 'It is noon.', final: true }} /></FocusRoot>,
    { width: 60, height: 4 },
  );
  let f = await t.settle();
  const rows = f.split('\n').map((r) => r.trimEnd());
  // The quote marks may take one cell or two (ambiguous width): only the words and their order are asserted.
  expect(rows[0]).toStartWith('You: ');
  expect(rows[0]).toContain('what time is it');
  expect(rows[0]).toEndWith('(hearing)');
  expect(rows[1]).toStartWith('Ada: ');
  expect(rows[1]).toContain('It is noon.');
  expect(rows[1]).not.toContain('hearing');
  t.renderer.destroy();
  t = await drawTest(<FocusRoot><CaptionStrip you={{ text: 'what time is it', final: true }} /></FocusRoot>, { width: 60, height: 3 });
  f = await t.settle();
  expect(f.split('\n')[0]!.trimEnd()).toStartWith('You: ');
  expect(f).toContain('what time is it');
  expect(f).not.toContain('hearing');
  t.renderer.destroy();
  t = await drawTest(<FocusRoot><CaptionStrip you={{ text: '', final: false }} /></FocusRoot>, { width: 60, height: 3 });
  f = await t.settle();
  expect(f.trim()).toBe('');
});
