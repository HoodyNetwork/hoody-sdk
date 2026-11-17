// The two-step code prompt in a terminal (OtpDialog.term.tsx): it shows the same help line as the web dialog, which
// says a backup code doesn't work here, and its field takes six digits and nothing else.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../term/prim/testing';
import { FocusRoot } from '../term/prim';
import { OverlayHost } from '../term/prim/Overlay';
import { OtpDialog } from './OtpDialog';
import { otpPrompt, resetOtp } from '@core/otp';
import strings from './strings.en.json';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; resetOtp(); });
// A frame's words: every run of anything but letters, digits and full stops is one space (borders, wraps, the apostrophe).
const words = (text: string): string => text.replace(/[^\p{L}\p{N}.]+/gu, ' ');

test('the prompt shows the shared help line (a backup code does not work here), and takes only the six digits', async () => {
  resetOtp();
  t = await drawTest(<FocusRoot><OverlayHost><OtpDialog /></OverlayHost></FocusRoot>, { width: 80, height: 24 });
  const answer = otpPrompt.ask();
  const frame = words(await t.settle());
  expect(strings['otp.help']).toContain("A backup code doesn't work here.");
  expect(frame).toContain(words("A backup code doesn't work here."));
  // A backup code's letters are not taken; its digits fill the boxes like any other.
  await t.mockInput.typeText('ab12-cd34');
  expect(await t.settle()).toContain('[1][2][3][4][_][_]');
  t.mockInput.pressEnter();
  await t.settle();
  await t.mockInput.typeText('56');
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(await answer).toBe('123456');
});
