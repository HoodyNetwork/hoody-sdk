// Every kit hold draws its two ways out in one shape (HeldBand's): `[Check again]`, then `[Stop tracking]` as a
// bracketed button on the same row. A bare "Stop tracking" beside a bracketed "[Check again]" reads as plain text
// although it is focusable. Fails if Outcome, the pending OutcomeBanner or GateCard's unknown-decision line draws
// Stop tracking (or Check again) without brackets, or in the other order.
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Outcome } from '../forms/Outcome';
import { OutcomeBanner } from './States';
import { GateCard, type GateView } from '../agent/GateCard';
import { withGateArm } from '../agent/gateArm';

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

async function frame(node: ReactNode, width: number, height: number): Promise<string> {
  const t = await drawTest(<FocusRoot><OverlayHost>{node}</OverlayHost></FocusRoot>, { width, height });
  const f = await t.settle();
  t.renderer.destroy();
  return f;
}

/** The row holding both buttons, bracketed, Check again first. */
function holdRow(f: string): string | undefined {
  return f.split('\n').find((l) => /\[[^\]]*Check again\][^[]*\[Stop tracking\]/.test(l));
}

test('Outcome pending: [Check again] then [Stop tracking]', async () => {
  const f = await frame(<Outcome outcome="pending" onCheck={() => true} onStop={() => {}} />, 120, 6);
  expect(holdRow(f), f).toBeDefined();
});

test('OutcomeBanner pending: [Check again] then [Stop tracking]', async () => {
  const f = await frame(<OutcomeBanner kind="pending" onCheck={() => {}} onDismiss={() => {}} />, 100, 14);
  expect(holdRow(f), f).toBeDefined();
});

test('GateCard, a decision that may have gone through: [Check again] then [Stop tracking]', async () => {
  restore = withGateArm(0);
  const gate: GateView = { kind: 'confirm', risk: 'writes files', tool: 'bash', params: { command: 'npm run build' }, offerSession: true };
  const f = await frame(
    <Box width={78}><GateCard gate={gate} pending={false} unknown agentUrl="" typing={false} onDecide={() => {}} onAnswer={() => {}} onCheck={() => {}} onDismiss={() => {}} /></Box>,
    80, 30,
  );
  expect(holdRow(f), f).toBeDefined();
});
