// SessionView.term and an approval taller than its area. The cards sit in their own area under the transcript, at most 60%
// of the rows, scrolling past that. A card's controls below the area's last row must still be reachable: Tab stops on them
// and brings them into view, as the web's page scroll does for the next focused control. Before, the area's scroll did not
// follow the focus, so Tab skipped every control it clipped: Deny and Allow could not be reached from the keyboard. (The
// person is typing here, so the card does not take the focus on arrival; the web's arrival focus does not scroll either.)
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { SessionView } from './SessionView';
import { can, type CapFacts } from './capability';
import { withGateArm } from './gateArm';
import type { ConversationSource, ConvSnapshot, GateEntry } from './source';

const FACTS: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
// Forty lines: the card is far taller than 60% of a 20-row conversation, so its buttons start below the area.
const COMMAND = Array.from({ length: 40 }, (_, i) => `echo step-${i + 1}`).join('\n');
const GATE = { key: 'g1', ref: { id: 'g1', generation: 1 }, gate: { kind: 'confirm', risk: '', tool: 'bash', params: { command: COMMAND } }, helper: false, addressing: false, held: null, decision: null } as unknown as GateEntry;
const SNAP: ConvSnapshot = {
  facts: FACTS, title: 'Chat', gates: [GATE],
  blocks: [{ k: 'user', key: 'u1', text: 'Run the steps', at: 1000 }],
};
const DENY = 'Deny';

function source(): ConversationSource {
  return {
    kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => SNAP, subscribe: () => () => undefined, watch: () => undefined,
    can: (a: Parameters<ConversationSource['can']>[0]) => can(a, FACTS),
    send: async () => ({ k: 'done' as const }), stop: () => undefined, decide: async () => undefined, answer: async () => undefined,
    check: async () => ({ k: 'done' as const }), dismissDecision: () => undefined, canDismiss: () => false,
  } as unknown as ConversationSource;
}

let restore: (() => void) | null = null;
let t: TestTerm | null = null;
afterEach(() => {
  t?.renderer.destroy();
  t = null;
  restore?.();
  restore = null;
});

const draw = async (): Promise<TestTerm> => {
  restore = withGateArm(0);
  t = await drawTest(
    <FocusRoot><Box dir="column" width={80} height={20}><SessionView source={source()} size="l" typing /></Box></FocusRoot>,
    { width: 80, height: 20 },
  );
  return t;
};
const focused = (term: TestTerm) => focusedNode(semanticsOf(term.renderer))?.name ?? null;

test('Tab reaches the clipped Deny and brings it into view', async () => {
  const term = await draw();
  let f = await term.settle();
  expect(f).not.toContain('[' + DENY);
  const seen: (string | null)[] = [];
  for (let i = 0; i < 12 && focused(term) !== DENY; i++) {
    term.mockInput.pressTab();
    f = await term.settle();
    seen.push(focused(term));
  }
  expect(focused(term), seen.join(' | ') + '\n' + f).toBe(DENY);
  expect(f).toContain('[' + DENY);
});
