// A secret must never reach the semantics tree (agent export, snapshots,
// diagnostics), revealed or not. What the screen shows on purpose is not what the tree may carry: the tree says only
// whether something is there ("filled"). One case per secret surface, each checked while the value is SHOWN.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { focusedNode, semanticsOf, semText, type SemRoot, type SemNode } from '../../term/prim/semantics';
import { SecretField, SecretInput } from './Secret';
import { OtpField } from './OtpField';
import { OverlayHost } from '../../term/prim/Overlay';
import { OtpDialog } from '../../shell/OtpDialog';
import { otpPrompt, resetOtp } from '@core/otp';

const W = { width: 100, height: 20 };
const KEY = 'hk_3f9a_SUPERSECRETVALUE42';
const dump = (t: { renderer: unknown }): string => semText(semanticsOf(t.renderer as SemRoot));
// Structural, so a leak of even ONE character fails (a substring check would miss it): no node at or under a secret
// carries a value, and the secret node itself says only filled (a boolean).
function noValueUnderSecret(t: { renderer: unknown }): number {
  let secrets = 0;
  const walk = (ns: readonly SemNode[], under: boolean): void => {
    for (const n of ns) {
      const sec = under || n.states.secret === true;
      if (n.states.secret === true) { secrets++; expect(typeof n.filled).toBe('boolean'); }
      if (sec) expect(n.value).toBeUndefined();
      walk(n.children, sec);
    }
  };
  walk(semanticsOf(t.renderer as SemRoot), false);
  return secrets;
}

test('revealed SecretField: the tree carries no part of the value, only filled', async () => {
  const t = await drawTest(<FocusRoot><SecretField label="API key" value={KEY} visiblePrefix={7} /></FocusRoot>, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  expect(await t.settle()).toContain(KEY);
  const s = dump(t);
  expect(s).not.toContain('SUPERSECRET');
  expect(s).not.toContain('hk_3f9a');
  expect(s).toContain('=<secret>');
  expect(noValueUnderSecret(t)).toBeGreaterThan(0);
  t.renderer.destroy();
});

test('revealed backup codes (SecretField lines): no code in the tree', async () => {
  const codes = 'aaaa-1111\nbbbb-2222\ncccc-3333';
  const t = await drawTest(<FocusRoot><SecretField label="Backup codes" value={codes} format="lines" /></FocusRoot>, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  expect(await t.settle()).toContain('bbbb-2222');
  const s = dump(t);
  for (const c of ['aaaa', 'bbbb-2222', 'cccc']) expect(s).not.toContain(c);
  expect(s).toContain('=<secret>');
  expect(noValueUnderSecret(t)).toBeGreaterThan(0);
  t.renderer.destroy();
});

test('revealed SecretInput: the typed value is not in the tree', async () => {
  function P() { const [v, setV] = useState(''); return <FocusRoot><SecretInput label="Token" value={v} onChange={setV} autoFocus /></FocusRoot>; }
  const t = await drawTest(<P />, W);
  await t.mockInput.typeText('tok3nVALUE');
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  expect(await t.settle()).toContain('tok3nVALUE');
  const s = dump(t);
  expect(s).not.toContain('tok3n');
  expect(s).toContain('=<secret>');
  expect(noValueUnderSecret(t)).toBeGreaterThan(0);
  t.renderer.destroy();
});

test('OtpField: typed digits are not in the tree', async () => {
  function P() { const [v, setV] = useState(''); return <FocusRoot><OtpField label="6-digit code" value={v} onChange={setV} autoFocus /></FocusRoot>; }
  const t = await drawTest(<P />, W);
  await t.mockInput.typeText('482913');
  expect(await t.settle()).toContain('4');
  const s = dump(t);
  expect(s).not.toMatch(/482913|4\s*8\s*2\s*9/);
  t.renderer.destroy();
});

test('shell OtpDialog: typed digits are not in the tree; Enter answers exactly the six digits', async () => {
  resetOtp();
  const t = await drawTest(<FocusRoot><OverlayHost><OtpDialog /></OverlayHost></FocusRoot>, { width: 80, height: 24 });
  const answer = otpPrompt.ask();
  await t.settle();
  await t.mockInput.typeText('482913');
  const f = await t.settle();
  expect(f).toContain('[4][8][2][9][1][3]');
  const s = dump(t);
  expect(s).not.toMatch(/482913|4\s*8\s*2\s*9/);
  expect(s).toContain('=<secret>');
  expect(noValueUnderSecret(t)).toBeGreaterThan(0);
  t.mockInput.pressEnter();
  await t.settle();
  expect(await answer).toBe('482913');
  t.renderer.destroy();
  resetOtp();
});

// On the vault page (/vault?sel=deploy.notes), with the value box focused the tree had no focused node, so an agent
// or a test could not tell where the focus was. The group registers with the box's focus handle: focused, it is the
// focused node, named by its label, and still says only filled.
test('a focused SecretField is the focused node: its group, named by the label, value never in it', async () => {
  for (const el of [<SecretField label="Value" value={KEY} />, <SecretField label="Value" onRead={async () => KEY} />]) {
    const t = await drawTest(<FocusRoot>{el}</FocusRoot>, W);
    t.mockInput.pressTab();
    await t.settle();
    const n = focusedNode(semanticsOf(t.renderer as SemRoot));
    expect(n?.role, dump(t)).toBe('group');
    expect(n?.name, dump(t)).toBe('Value');
    expect(n?.filled, dump(t)).toBe(true);
    expect(dump(t)).not.toContain('SUPERSECRET');
    expect(noValueUnderSecret(t)).toBeGreaterThan(0);
    t.renderer.destroy();
  }
});
