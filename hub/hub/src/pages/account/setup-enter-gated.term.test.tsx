// Account > Turn on two-step sign-in, step 2, in the terminal: while Turn on is off (the backup codes not ticked as
// saved, or the code short), Enter in the code field sends nothing and keeps the typed code, as the web page swallows
// it. Before, the terminal submitted the step's form (with Turn on off it has no submit button, so Enter submits it)
// and the code field wiped itself: a code typed before the tick was lost, and a short code got a format error and was
// lost too. Once the gate is open, Enter in the same field turns two-step sign-in on (the positive control: the drawer
// closes on the fixture's done answer). The third test is the positive control of the "no format error" checks: an
// error under this field (the fixture's wrong-code answer) is seen by the same reads (tree, frame, invalid state).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, getByRole, semanticsOf, semText, within, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string | undefined => focusedNode(tree())?.name;
const TITLE = `dialog "${strings['2fa.setupTitle']}"`;
const drawer = (): SemNode[] => within(getByRole(tree(), 'dialog', { name: strings['2fa.setupTitle'] }));
const code = (): SemNode => getByRole(drawer(), 'textbox', { name: strings['2fa.code'] });
const tick = (): SemNode => getByRole(drawer(), 'checkbox', { name: strings['2fa.iSaved'] });
const turnOn = (): SemNode => getByRole(drawer(), 'button', { name: strings['2fa.confirm'] });

async function tabTo(name: string): Promise<void> {
  for (let i = 0; i < 30 && focused() !== name; i++) await s!.keys.press('tab');
  expect(focused()).toBe(name);
}

/** Enter, then every held timer (the field's wipe is a 0 ms task; a fixture answer is held too). */
async function enter(): Promise<void> {
  await s!.keys.press('enter');
  await s!.releaseHeld();
}

async function step2(fx = 'twofa-off'): Promise<void> {
  s = await renderPage({ page: 'account', fx, cols: 120, rows: 40, path: '/account?sheet=setup' });
  await s.settle();
  expect(s.frame).toContain(strings['2fa.step1of2']);
  await s.keys.type('pw');
  await enter();
  expect(s.frame).toContain(strings['2fa.step2of2']);
}

test('a code typed before the tick: Enter keeps it and sends nothing; after the tick Enter turns it on', async () => {
  await step2();
  await tabTo(strings['2fa.code']);
  await s!.keys.type('123456');
  // Positive controls: the code is typed, the tick is not given, Turn on is off for that reason.
  expect(code().filled).toBe(true);
  expect(tick().states.checked ?? false).toBe(false);
  expect(turnOn().states.disabled).toBe(true);
  expect(turnOn().description ?? '').toContain(strings['2fa.reason.saved']);

  await enter();
  // Still step 2 with the code kept and no error (the field never wipes itself).
  expect(s!.frame).toContain(strings['2fa.step2of2']);
  expect(semText(tree())).toContain(TITLE);
  expect(code().filled).toBe(true);
  expect(code().states.invalid ?? false).toBe(false);
  expect(semText(tree())).not.toContain(strings['2fa.eFormat']);
  expect(s!.frame).not.toContain(strings['2fa.eFormat']);

  // The gate opens: tick, back to the code, Enter turns two-step sign-in on.
  await tabTo(strings['2fa.iSaved']);
  await s!.keys.press('space');
  expect(tick().states.checked).toBe(true);
  expect(turnOn().states.disabled ?? false).toBe(false);
  await tabTo(strings['2fa.code']);
  expect(code().filled).toBe(true);
  await enter();
  expect(semText(tree())).not.toContain(TITLE);
  expect(s!.failures).toEqual([]);
}, 240_000);

test('a short code after the tick: Enter keeps it with no format error; the full code then turns it on', async () => {
  await step2();
  await tabTo(strings['2fa.iSaved']);
  await s!.keys.press('space');
  expect(tick().states.checked).toBe(true);
  await tabTo(strings['2fa.code']);
  await s!.keys.type('123');
  // Positive controls: typed, and Turn on is off because the code is short.
  expect(code().filled).toBe(true);
  expect(turnOn().states.disabled).toBe(true);
  expect(turnOn().description ?? '').toContain(strings['2fa.reason.code']);

  await enter();
  // Never "Enter the 6 digits your app shows." under the field, never the three digits wiped.
  expect(semText(tree())).toContain(TITLE);
  expect(code().filled).toBe(true);
  expect(code().states.invalid ?? false).toBe(false);
  expect(semText(tree())).not.toContain(strings['2fa.eFormat']);
  expect(s!.frame).not.toContain(strings['2fa.eFormat']);

  // The rest of the code: the gate opens and Enter turns two-step sign-in on.
  await s!.keys.type('456');
  expect(turnOn().states.disabled ?? false).toBe(false);
  await enter();
  expect(semText(tree())).not.toContain(TITLE);
  expect(s!.failures).toEqual([]);
}, 240_000);

test('positive control: an error under the code field is seen by the same reads (wrong code, gate open)', async () => {
  // Fixture code-wrong: the setup's verify answers INVALID_OTP_CODE, so Turn on (Enter in the field, gate open) puts
  // "That code is not right." under the field. The reads the two tests above use to say "no format error" (the tree,
  // the frame, the field's invalid state) all show this one.
  await step2('code-wrong');
  await tabTo(strings['2fa.iSaved']);
  await s!.keys.press('space');
  expect(tick().states.checked).toBe(true);
  await tabTo(strings['2fa.code']);
  await s!.keys.type('123456');
  expect(turnOn().states.disabled ?? false).toBe(false);
  await enter();
  expect(semText(tree())).toContain(TITLE);
  expect(code().states.invalid).toBe(true);
  expect(semText(tree())).toContain(strings['err.code']);
  expect(s!.frame).toContain(strings['err.code']);
  expect(s!.failures).toEqual([]);
}, 240_000);
