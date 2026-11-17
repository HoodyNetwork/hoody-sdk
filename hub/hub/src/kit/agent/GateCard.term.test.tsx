// GateCard.term: the approval must be impossible to miss and safe. Arrival focus on Deny, the arming window, y / n only
// inside the card, nothing decided by keys typed into the composer, the card's frame and words, a lost answer.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, TextInput } from '../../term/prim';
import { focusedNode, getByRole, semanticsOf } from '../../term/prim/semantics';
import { DecidedLine, GateCard, type GateChoice, type GateView } from './GateCard';
import { withGateArm } from './gateArm';

const GATE: GateView = { kind: 'confirm', risk: 'writes files', tool: 'bash', params: { command: 'rm -rf build && npm run build', cwd: '/home/ada/dash' }, offerSession: true };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

/** Tab until the focused node is named `name` (at most 6 presses); fails when it never is. */
async function tabTo(t: TestTerm, name: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    t.mockInput.pressTab();
    await t.settle();
    if (focusedNode(semanticsOf(t.renderer as never))?.name === name) return;
  }
  throw new Error(`Tab never reached "${name}"`);
}

function Harness({ typing, decided }: { typing: boolean; decided: Array<[GateChoice, string | undefined]> }) {
  const [draft, setDraft] = useState('');
  return (
    <FocusRoot>
      <Box dir="column" width={78}>
        <GateCard gate={GATE} pending={false} unknown={false} agentUrl="" typing={typing}
          onDecide={(c, r) => decided.push([c, r])} onAnswer={() => {}} onCheck={() => {}} />
        <TextInput value={draft} onChange={setDraft} autoFocus={typing} sem={{ name: 'Message' }} />
      </Box>
    </FocusRoot>
  );
}

test('the card: framed, titled, the exact command, Deny first and focused on arrival', async () => {
  restore = withGateArm(0);
  const decided: Array<[GateChoice, string | undefined]> = [];
  const t = await drawTest(<Harness typing={false} decided={decided} />, { width: 80, height: 20 });
  const f = await t.settle();
  expect(f).toContain('! Needs you');
  expect(f).toContain('Allow this action?');
  expect(f).toContain('Run a command');
  expect(f).toContain('rm -rf build && npm run build');
  expect(f).toContain('in /home/ada/dash');
  expect(f.indexOf('[Deny n]')).toBeLessThan(f.indexOf('[Allow once y]'));
  // Enter on the arrival focus denies: the safe choice.
  t.mockInput.pressEnter();
  await t.settle();
  expect(decided).toEqual([['deny', undefined]]);
  t.renderer.destroy();
});

test('Allow needs an explicit press: Tab to it, Enter; or y inside the card', async () => {
  restore = withGateArm(0);
  const decided: Array<[GateChoice, string | undefined]> = [];
  const t = await drawTest(<Harness typing={false} decided={decided} />, { width: 80, height: 20 });
  await t.settle();
  t.mockInput.pressKey('y');
  await t.settle();
  expect(decided).toEqual([['once', undefined]]);
  t.renderer.destroy();
});

test('arming: presses in the first moment after the card appears do nothing', async () => {
  let now = 1_000;
  restore = withGateArm(600, () => now);
  const decided: Array<[GateChoice, string | undefined]> = [];
  const t = await drawTest(<Harness typing={false} decided={decided} />, { width: 80, height: 20 });
  expect(await t.settle()).toContain('a key already on its way');
  t.mockInput.pressEnter();
  t.mockInput.pressKey('y');
  t.mockInput.pressKey('n');
  await t.settle();
  expect(decided).toEqual([]);
  now += 600;
  await wait(650);
  const f = await t.settle();
  expect(f).not.toContain('a key already on its way');
  t.mockInput.pressKey('n');
  await t.settle();
  expect(decided).toEqual([['deny', undefined]]);
  t.renderer.destroy();
});

test('typing in the composer: focus stays there, y and Enter are text, nothing is decided', async () => {
  restore = withGateArm(0);
  const decided: Array<[GateChoice, string | undefined]> = [];
  const t = await drawTest(<Harness typing decided={decided} />, { width: 80, height: 20 });
  await t.settle();
  await t.mockInput.typeText('yes');
  t.mockInput.pressEnter();
  await t.settle();
  expect(decided).toEqual([]);
  t.renderer.destroy();
});

test('pending, lost and decided', async () => {
  restore = withGateArm(0);
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column" width={78}>
        <GateCard gate={GATE} pending unknown={false} agentUrl="" typing={false} onDecide={() => {}} onAnswer={() => {}} onCheck={() => {}} />
        <GateCard gate={GATE} pending={false} unknown gone sent="once" agentUrl="" typing onDecide={() => {}} onAnswer={() => {}} onCheck={() => {}} onDismiss={() => {}} />
        <DecidedLine d={{ kind: 'deny', tool: 'bash', text: 'rm -rf /' }} />
        <DecidedLine d={{ kind: 'once', tool: 'bash', text: 'npm test' }} />
      </Box>
    </FocusRoot>,
    { width: 80, height: 40 },
  );
  const f = await t.settle();
  expect(f).toContain('[… Allow once y]');
  expect(f).toContain('We lost the answer to your Allow');
  expect(f).toContain('[Check again]');
  expect(f).toContain('✗ Denied');
  expect(f).toContain('✓ Allowed once · Run a command · npm test');
  t.renderer.destroy();
});

test('a question: pick an option, send the answer', async () => {
  restore = withGateArm(0);
  const got: unknown[] = [];
  const q: GateView = { kind: 'question', risk: '', question: 'Which port?', options: ['3000', '8080'] };
  const t = await drawTest(
    <FocusRoot><Box width={60}><GateCard gate={q} pending={false} unknown={false} agentUrl="" typing={false} onDecide={() => {}} onAnswer={(a) => got.push(a)} onCheck={() => {}} /></Box></FocusRoot>,
    { width: 62, height: 20 },
  );
  let f = await t.settle();
  expect(f).toContain('Which port?');
  expect(f).toContain('3000');
  // This test once sent nothing and asserted only the words. Nothing picked: Send answer is off
  // (GateCard.term.tsx line 308, `!ready`); ↓ in the options picks 8080, Tab reaches Send answer, Enter sends "8080"
  // (lines 272-283: value() and send()).
  getByRole(semanticsOf(t.renderer as never), 'button', { name: 'Send answer', disabled: true });
  t.mockInput.pressTab(); // the options: one stop
  await t.settle();
  t.mockInput.pressArrow('down');
  f = await t.settle();
  expect(f).toContain('(•) 8080');
  expect(got).toEqual([]);
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(got).toEqual(['8080']);
  t.renderer.destroy();
});

// Catches the "Something else" branch (lines 272-276: the typed text is the answer; empty text is not ready).
test('a question: Something else opens a field; the typed words are the answer', async () => {
  restore = withGateArm(0);
  const got: unknown[] = [];
  const q: GateView = { kind: 'question', risk: '', question: 'Which port?', options: ['3000', '8080'] };
  const t = await drawTest(
    <FocusRoot><Box width={60}><GateCard gate={q} pending={false} unknown={false} agentUrl="" typing={false} onDecide={() => {}} onAnswer={(a) => got.push(a)} onCheck={() => {}} /></Box></FocusRoot>,
    { width: 62, height: 24 },
  );
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressArrow('up'); // from the first option back round to the last: Something else
  let f = await t.settle();
  expect(f).toContain('(•) Something else');
  expect(f).toContain('Your answer');
  getByRole(semanticsOf(t.renderer as never), 'button', { name: 'Send answer', disabled: true });
  t.mockInput.pressTab(); // the field
  await t.settle();
  await t.mockInput.typeText('9090 please');
  // Drawn before the Tab: typed keys land in one burst, and Send answer becomes a stop only once the render that holds
  // the typed text (`ready`) is done; a Tab before it would skip Send answer.
  f = await t.settle();
  expect(f).toContain('9090 please');
  t.mockInput.pressTab(); // Send answer
  await t.settle();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(got).toEqual(['9090 please']);
  t.renderer.destroy();
});

// The scenario file says "Stop tracking on a lost answer (terminal tests pin it)": nothing pressed it. Catches Lost
// (lines 118-127) and Unknown (lines 106-114) and the branches choosing them (lines 245, 307): the card offers only
// Check again and Stop tracking, never the choices again (a lost or unknown answer is never resent, C9).
test('a lost answer to a question: only Check again and Stop tracking; each press reports; Send answer is gone', async () => {
  restore = withGateArm(0);
  let checks = 0;
  let dismissed = 0;
  const got: unknown[] = [];
  const q: GateView = { kind: 'question', risk: '', question: 'Which port?', options: ['3000', '8080'] };
  const t = await drawTest(
    <FocusRoot><Box width={60}><GateCard gate={q} pending={false} unknown gone agentUrl="" typing={false} onDecide={() => {}} onAnswer={(a) => got.push(a)} onCheck={() => { checks += 1; }} onDismiss={() => { dismissed += 1; }} /></Box></FocusRoot>,
    { width: 62, height: 24 },
  );
  const f = await t.settle();
  expect(f).toContain('We lost your answer.');
  expect(f).toContain('[Check again]');
  expect(f).toContain('Stop tracking');
  expect(f).not.toContain('Send answer');
  await tabTo(t, 'Check again');
  t.mockInput.pressEnter();
  await t.settle();
  expect(checks).toBe(1);
  await tabTo(t, 'Stop tracking');
  t.mockInput.pressEnter();
  await t.settle();
  expect(dismissed).toBe(1);
  expect(checks).toBe(1);
  expect(got).toEqual([]);
  t.renderer.destroy();
});

test('an approval whose answer may have gone through: no Deny or Allow, Check again and Stop tracking report', async () => {
  restore = withGateArm(0);
  let checks = 0;
  let dismissed = 0;
  const decided: GateChoice[] = [];
  const t = await drawTest(
    <FocusRoot><Box width={78}><GateCard gate={GATE} pending={false} unknown agentUrl="" typing={false} onDecide={(c) => decided.push(c)} onAnswer={() => {}} onCheck={() => { checks += 1; }} onDismiss={() => { dismissed += 1; }} /></Box></FocusRoot>,
    { width: 80, height: 30 },
  );
  const f = await t.settle();
  expect(f).toContain('Your answer may have gone through');
  expect(f).not.toContain('[Deny');
  expect(f).not.toContain('[Allow once');
  await tabTo(t, 'Check again');
  t.mockInput.pressEnter();
  await t.settle();
  expect(checks).toBe(1);
  await tabTo(t, 'Stop tracking');
  t.mockInput.pressEnter();
  await t.settle();
  expect(dismissed).toBe(1);
  t.mockInput.pressKey('y');
  await t.settle();
  expect(decided).toEqual([]);
  t.renderer.destroy();
});
