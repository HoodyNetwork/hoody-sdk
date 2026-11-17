// SessionView.term and a turn whose end could not be read: the web's rule (SessionView.tsx, the 'line' block). A line marked
// `recheck` on an active source that has recheckOutcome offers Check again, which reads the chat again and sends nothing; a
// read-only source, or one without the read, shows the line alone.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { act, queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { SessionView } from './SessionView';
import { can, type CapFacts } from './capability';
import type { ActiveSource, ConversationSource, ConvSnapshot } from './source';

const FACTS: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const LINE = "Couldn't tell how this task ended: it may have failed or finished.";
/** The line's start: short enough never to wrap at 80 columns. */
const SAYS = "Couldn't tell how this task ended";
const SNAP: ConvSnapshot = {
  facts: FACTS, title: 'Chat', gates: [],
  blocks: [
    { k: 'user', key: 'u1', text: 'Restart the web service', at: 1000 },
    { k: 'line', key: 'q0', text: LINE, tone: 'info', recheck: true },
  ],
};

function source(o: { active: boolean; recheck: boolean }) {
  const calls = { recheck: 0, send: 0 };
  const base = { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => SNAP, subscribe: () => () => undefined, watch: () => undefined, can: (a: Parameters<ActiveSource['can']>[0]) => can(a, FACTS) };
  const src = (o.active
    ? {
      ...base,
      send: async () => { calls.send++; return { k: 'done' as const }; }, stop: () => undefined, decide: async () => undefined, answer: async () => undefined,
      check: async () => ({ k: 'done' as const }), dismissDecision: () => undefined, canDismiss: () => false,
      ...(o.recheck ? { recheckOutcome: () => { calls.recheck++; } } : {}),
    }
    : base) as unknown as ConversationSource;
  return { src, calls };
}

const mount = (src: ConversationSource) => (
  <FocusRoot>
    <Box dir="column" width={80} height={24}><SessionView source={src} size="l" typing={false} /></Box>
  </FocusRoot>
);
const checkAgain = (t: Awaited<ReturnType<typeof drawTest>>) => queryAllByRole(semanticsOf(t.renderer), 'button', { name: 'Check again' });

test('an active source that can read it again: the line, then Check again; pressing it reads, nothing is sent', async () => {
  const { src, calls } = source({ active: true, recheck: true });
  const t = await drawTest(mount(src), { width: 80, height: 24 });
  try {
    const f = await t.settle();
    expect(f).toContain(SAYS);
    const b = checkAgain(t);
    expect(b.length, f).toBe(1);
    act(b[0]!, 'press');
    await t.settle();
    expect(calls).toEqual({ recheck: 1, send: 0 });
  } finally { t.renderer.destroy(); }
});

test('an active source without the read: the line alone', async () => {
  const { src } = source({ active: true, recheck: false });
  const t = await drawTest(mount(src), { width: 80, height: 24 });
  try {
    const f = await t.settle();
    expect(f).toContain(SAYS);
    expect(checkAgain(t)).toHaveLength(0);
  } finally { t.renderer.destroy(); }
});

test('a read-only source: the line alone', async () => {
  const { src } = source({ active: false, recheck: false });
  const t = await drawTest(mount(src), { width: 80, height: 24 });
  try {
    const f = await t.settle();
    expect(f).toContain(SAYS);
    expect(checkAgain(t)).toHaveLength(0);
  } finally { t.renderer.destroy(); }
});

test('a failure line with the page of its next step: the line, then a link to that page', async () => {
  const snap: ConvSnapshot = { ...SNAP, blocks: [SNAP.blocks[0]!, { k: 'line', key: 'o1', text: 'No usable model is set on this computer.', tone: 'bad', link: { label: 'Open AI models', href: '/ai/models' } }] };
  const src = { ...source({ active: true, recheck: true }).src, snapshot: () => snap } as ConversationSource;
  const t = await drawTest(mount(src), { width: 80, height: 24 });
  try {
    const f = await t.settle();
    expect(f).toContain('No usable model is set on this computer.');
    const sem = semanticsOf(t.renderer);
    expect([...queryAllByRole(sem, 'link', { name: 'Open AI models' }), ...queryAllByRole(sem, 'button', { name: 'Open AI models' })].length, f).toBe(1);
    expect(checkAgain(t).length).toBe(0);
  } finally { t.renderer.destroy(); }
});

test('a next step in the Agent app: a link to the address the host gives, none without one', async () => {
  const snap: ConvSnapshot = { ...SNAP, blocks: [SNAP.blocks[0]!, { k: 'line', key: 'h1', text: 'A hook is holding the agent.', tone: 'info', agentApp: 'Open the Agent app' }] };
  const src = { ...source({ active: true, recheck: false }).src, snapshot: () => snap } as ConversationSource;
  for (const agentUrl of ['https://agent.example', '']) {
    const t = await drawTest(<FocusRoot><Box dir="column" width={80} height={24}><SessionView source={src} size="l" typing={false} agentUrl={agentUrl} /></Box></FocusRoot>, { width: 80, height: 24 });
    try {
      const f = await t.settle();
      expect(f).toContain('A hook is holding the agent.');
      const sem = semanticsOf(t.renderer);
      const n = [...queryAllByRole(sem, 'link', { name: 'Open the Agent app' }), ...queryAllByRole(sem, 'button', { name: 'Open the Agent app' })].length;
      expect(n, f).toBe(agentUrl ? 1 : 0);
    } finally { t.renderer.destroy(); }
  }
});
