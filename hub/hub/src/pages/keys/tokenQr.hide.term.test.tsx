// A made share's code with the token in the terminal: once shown, it hides again by the rule for a shown secret
// (term/app/secret-screen.ts rule 3, through the kit useRevealGuard): when the terminal loses focus and
// after the idle time with no key press, and the button reads Show again. It used to stay drawn until Hide was pressed.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Shown, then the terminal loses focus: the hatched box again, and the button says Show | 'the token code hides again on terminal blur' |
// | 2 | Shown: still shown before the idle time; no key press for the idle time hides it | 'the token code hides again after the idle time with no key press' |
import { afterEach, expect, test } from 'bun:test';
import type { Ctx, HeldSecret } from '@core';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, PaneSize } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, getByRole, queryByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { SecretScreenCtx, __secretIdleSeams, type SecretScreen } from '../../term/app/secret-screen-ctx';
import strings from './strings.en.json';
import { TokenQr } from './parts/ShareShown';

const TEXT = 'Hoody shared access: test\nToken: hdy_test_0123456789abcdef';
const ALLOW: SecretScreen = { reveal: true, copy: true };
const SIZE = { width: 120, height: 60 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A held text for one stand-in context (TokenQr only reveals it and follows its drop; the page mints the real one).
const CTX = {} as Ctx;
const held: HeldSecret = { ctx: CTX, reveal: (c) => (c === CTX ? TEXT : null), drop() {}, dropped: false, onDrop: () => () => {} };

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __secretIdleSeams.reset(); });
const tree = () => semanticsOf(t!.renderer as unknown as SemRoot);
const code = () => queryByRole(tree(), 'img', { name: strings['share.qrTokenLabel'] });
const standIn = () => queryByRole(tree(), 'img', { name: strings['share.qrHiddenLabel'] });

async function drawShown(): Promise<void> {
  t = await drawTest(<SecretScreenCtx.Provider value={() => ALLOW}><FocusRoot><OverlayHost><PaneSize><TokenQr held={held} ctx={CTX} warning="Anyone who scans it gets the access" /></PaneSize></OverlayHost></FocusRoot></SecretScreenCtx.Provider>, SIZE);
  await t.settle();
  expect(code()).toBeNull();
  expect(standIn()?.value).toBe('hidden');
  act(getByRole(tree(), 'button', { name: strings['share.qrShow'] }), 'press');
  await t.settle();
  // The positive control: Show draws the real code (not the hatched box) and the button turns to Hide.
  expect(code()?.value).toBe('filled');
  expect(standIn()).toBeNull();
  expect(queryByRole(tree(), 'button', { name: strings['share.qrHide'] })).not.toBeNull();
}

function expectHidden(): void {
  expect(code()).toBeNull();
  expect(standIn()?.value).toBe('hidden');
  expect(queryByRole(tree(), 'button', { name: strings['share.qrShow'] })).not.toBeNull();
}

test('the token code hides again on terminal blur', async () => {
  await drawShown();
  (t!.renderer as unknown as { emit(e: string): void }).emit('blur');
  await t!.settle();
  expectHidden();
});

test('the token code hides again after the idle time with no key press', async () => {
  __secretIdleSeams.setMs(600);
  await drawShown();
  await wait(200);
  await t!.settle();
  expect(code()?.value).toBe('filled');
  await wait(900);
  await t!.settle();
  expectHidden();
});
