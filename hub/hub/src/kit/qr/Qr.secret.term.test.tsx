// Terminal QR under the secret-safe screen rules (term/app/secret-screen-ctx.ts), as SecretField follows them
// (Secret.screen.term.test.tsx): what the screen refuses is never drawn or copied, and a shown QrPanel address hides
// again. A secret code a page draws itself (the share token's, a Bot key's) is tested through its page
// (pages/keys/held-copy-gate.term.test.tsx); here only what QrPanel and the 2FA image add.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | QrPanel: Show (`s`) asks the screen; refused, no module and no address drawn, the field's line says why | 'QrButton: a refused Show draws nothing, a refused Copy sends nothing' |
// | 2 | QrPanel: Copy asks the screen; refused, nothing copied, the field's line says why | the same |
// | 3 | The 2FA image in a QrSecret asks as it is drawn; refused, the box says "hidden" (it has no Show) and the line says why | 'the 2FA image in a QrSecret asks the screen as it is drawn' |
// | 4 | A QrPanel's own code is not asked again: a panel its caller shows at once (secret={false}, keyed) is drawn on any screen, while the same code drawn by a page is refused there | 'a panel shown at once is drawn on any screen' |
// | 5 | A shown address hides on terminal blur and after the idle time with no key press | 'a shown address hides again on terminal blur', '... after the idle time' |
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import QRCode from 'qrcode';
import { copiesOf, drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { semanticsOf, semText } from '../../term/prim/semantics';
import { SecretScreenCtx, __secretIdleSeams, type SecretScreen } from '../../term/app/secret-screen-ctx';
import { QrButton, QrCode, QrImage, QrSecret } from './Qr';
import { qrMatrix } from './qr';

const URL_ = 'https://example.com/terminal/0123456789abcdef';
const DENY: SecretScreen = { reveal: false, copy: false };
const ALLOW: SecretScreen = { reveal: true, copy: true };
const SIZE = { width: 110, height: 60 };
const SHOW_REFUSED = 'Not shown: this screen could keep it';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __secretIdleSeams.reset(); });
const tree = () => semText(semanticsOf(t!.renderer as never));

/** Draws `node` under a screen that answers `answer` (inside the test renderer's own ALLOW provider, so it wins). */
async function draw(node: ReactNode, answer: SecretScreen): Promise<string> {
  t = await drawTest(<SecretScreenCtx.Provider value={() => answer}><FocusRoot><OverlayHost><PaneSize>{node}</PaneSize></OverlayHost></FocusRoot></SecretScreenCtx.Provider>, SIZE);
  return t.settle();
}

/** Opens the QrButton's dialog (Tab to [QR], Enter). */
async function open(): Promise<string> {
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressEnter();
  return t!.settle();
}

/** Clicks the dialog's [Copy]. */
async function clickCopy(): Promise<string> {
  const rows = (await t!.settle()).split('\n');
  const y = rows.findIndex((l) => l.includes('[Copy]'));
  expect(y).toBeGreaterThanOrEqual(0);
  await t!.mockMouse.click(rows[y]!.indexOf('[Copy]') + 2, y);
  return t!.settle();
}

test('QrButton: a refused Show draws nothing, a refused Copy sends nothing', async () => {
  for (const answer of [ALLOW, DENY]) {
    await draw(<QrButton url={URL_} name="Terminal" />, answer);
    const copied = copiesOf(t!.renderer);
    expect(await open()).toContain('Hidden until you press Show');
    t!.mockInput.pressKey('s');
    let f = await t!.settle();
    if (answer.reveal) {
      // The positive control: the same keys on a screen that allows it draw the code and the address.
      expect(f).toMatch(/[▀▄]/);
      expect(f).toContain(URL_);
      expect(f).not.toContain('Not shown');
    } else {
      expect(f).not.toMatch(/[▀▄]/);
      expect(f).not.toContain(URL_);
      expect(f).toContain('Hidden until you press Show');
      expect(f).toContain(SHOW_REFUSED);
    }
    f = await clickCopy();
    if (answer.copy) {
      expect(copied).toEqual([URL_]);
      expect(f).not.toContain('Not copied');
    } else {
      expect(copied).toEqual([]);
      expect(f).toContain('Not copied: this terminal has not said it takes copies.');
    }
    t!.renderer.destroy();
    t = null;
  }
});

test('the 2FA image in a QrSecret asks the screen as it is drawn', async () => {
  const png = await QRCode.toDataURL('otpauth://totp/Hoody%20(ada)?secret=JBSWY3DPEHPK3PXP&issuer=Hoody', { errorCorrectionLevel: 'M' });
  for (const answer of [ALLOW, DENY]) {
    // The 2FA setup's image (pages/account/parts/Secrets.tsx KeyQr), drawn at once: there is no Show.
    await draw(<QrSecret note="Holds your sign-in key"><QrImage src={png} alt="QR code for your authenticator app" /></QrSecret>, answer);
    await wait(80);
    const f = await t!.settle();
    expect(/[▀▄]/.test(f)).toBe(answer.reveal);
    expect(f.includes(SHOW_REFUSED)).toBe(!answer.reveal);
    expect(tree()).toContain(answer.reveal ? 'filled' : 'hidden');
    // A refused image says "hidden", never "until you press Show" (it has no Show).
    expect(f).not.toContain('Hidden until you press Show');
    t!.renderer.destroy();
    t = null;
  }
});

test('a panel shown at once is drawn on any screen (its caller made no secret: the Board link, a hand-off)', async () => {
  await draw(<QrButton url={URL_} name="Watch link" secret={false} keyed />, DENY);
  const f = await open();
  expect(f).toMatch(/[▀▄]/);
  expect(f).toContain(URL_);
  expect(f).not.toContain('Not shown');
  t!.renderer.destroy();
  t = null;
  // The positive control on the same screen: the same keyed code drawn by a page, not by a panel, is refused.
  const g = await draw(<QrSecret note="Anyone who scans it signs in"><QrCode matrix={qrMatrix(URL_)!} label="QR code with the token" secret /></QrSecret>, DENY);
  expect(g).not.toMatch(/[▀▄]/);
  expect(g).toContain(SHOW_REFUSED);
});

test('a shown address hides again on terminal blur', async () => {
  await draw(<QrButton url={URL_} name="Terminal" />, ALLOW);
  await open();
  t!.mockInput.pressKey('s');
  let f = await t!.settle();
  expect(f).toMatch(/[▀▄]/);
  expect(f).toContain(URL_);
  (t!.renderer as unknown as { emit(e: string): void }).emit('blur');
  f = await t!.settle();
  expect(f).not.toMatch(/[▀▄]/);
  expect(f).not.toContain(URL_);
  expect(f).toContain('Hidden until you press Show');
});

test('a shown address hides again after the idle time with no key press', async () => {
  __secretIdleSeams.setMs(300);
  await draw(<QrButton url={URL_} name="Terminal" />, ALLOW);
  await open();
  t!.mockInput.pressKey('s');
  let f = await t!.settle();
  expect(f).toMatch(/[▀▄]/);
  expect(f).toContain(URL_);
  await wait(700);
  f = await t!.settle();
  expect(f).not.toMatch(/[▀▄]/);
  expect(f).not.toContain(URL_);
  expect(f).toContain('Hidden until you press Show');
});
