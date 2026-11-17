// Hooks in the computer's settings hold the agent's steps until
// someone trusts them. The column shows one card after the last turn whose step a hook held: it says so and points
// to the Agent app, where the hooks are shown and trusted. The Hub reads no hooks and sends no trust.
import { act, render, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column } from './Column';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type Beat, type FakeOptions } from './fake';
import type { AskStore } from './logic';
import strings from './strings.en.json';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
const held: Beat[] = [{ k: 'tool', name: 'bash', summary: '$ make', input: { command: 'make' }, fail: true, code: 'hook_held', output: 'Blocked' }, { k: 'text', text: 'A hook blocks me.' }];

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(o: Partial<FakeOptions>, script: Beat[][] = [held]) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], script, ...o }, clock);
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await act(async () => {
      await drain();
      for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
    });
  };
  eng.open();
  await flush();
  eng.send('Build it');
  await flush(2000);
  const view = (agentUrl = '') => render(<Live eng={eng} agentUrl={agentUrl} />);
  return { agent, eng, flush, view };
}
function Live({ eng, agentUrl }: { eng: AskEngine; agentUrl: string }) {
  const snap = useSyncExternalStore(eng.subscribe, () => eng.getSnapshot());
  return <Column eng={eng} snap={snap} agentUrl={agentUrl} typing empty={null} />;
}

const AGENT = 'https://agent-c0a715.example.test/';
// Anything the fake hears about hooks (a read of GET /hooks, a trust ack): none may happen.
const hookCalls = (agent: FakeAgent) => agent.log.filter((x) => /hook|trust/i.test(x[0]));

describe('the card for hooks that hold the agent', () => {
  // The request boundary too: nothing about hooks leaves the page by any other way (a direct fetch, a beacon).
  let sent: string[] = [];
  beforeEach(() => {
    sent = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((u: RequestInfo | URL) => { sent.push(String(u instanceof Request ? u.url : u)); return Promise.reject(new Error('no network in tests')); });
    if (typeof navigator.sendBeacon === 'function') vi.spyOn(navigator, 'sendBeacon').mockImplementation((u: string | URL) => { sent.push(String(u)); return false; });
  });
  afterEach(() => {
    expect(sent.filter((u) => /hook|trust/i.test(u))).toEqual([]);
    vi.restoreAllMocks();
  });
  it('no held step: no card', async () => {
    const t = await setup({}, [[{ k: 'text', text: 'Done.' }]]);
    t.view(AGENT);
    expect(screen.queryByText(strings['ask.hooksTitle'])).toBeNull();
    expect(screen.queryByRole('link', { name: strings['ask.hooksOpenAgent'] })).toBeNull();
  });

  it('a held step: says a hook waits for trust and opens the Agent app, with no read and no trust sent', async () => {
    const t = await setup({});
    t.view(AGENT);
    expect(screen.getByRole('region', { name: strings['ask.hooksTitle'] })).toBeTruthy();
    expect(screen.getByText(strings['ask.hooksBody'])).toBeTruthy();
    const link = screen.getByRole('link', { name: strings['ask.hooksOpenAgent'] });
    expect(link.getAttribute('href')).toBe(AGENT);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    // No trust control at all, and nothing about hooks went to the agent.
    expect(screen.queryByRole('button', { name: /trust/i })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await t.flush(1000);
    expect(hookCalls(t.agent)).toEqual([]);
  });

  it('without an Agent address: the sentence stays, no dead link', async () => {
    const t = await setup({});
    t.view('');
    expect(screen.getByText(strings['ask.hooksBody'])).toBeTruthy();
    expect(screen.queryByRole('link', { name: strings['ask.hooksOpenAgent'] })).toBeNull();
  });

  it('two held turns: one card, after the last of them', async () => {
    const t = await setup({}, [held, held]);
    t.eng.send('Again');
    await t.flush(2000);
    t.view(AGENT);
    expect(screen.getAllByRole('region', { name: strings['ask.hooksTitle'] })).toHaveLength(1);
    expect(hookCalls(t.agent)).toEqual([]);
  });

  it('a step that failed for another reason: no hooks card', async () => {
    const t = await setup({}, [[{ k: 'tool', name: 'bash', summary: '$ make', input: { command: 'make' }, fail: true, output: 'make: *** No rule' }, { k: 'text', text: 'It failed.' }]]);
    t.view(AGENT);
    expect(screen.queryByText(strings['ask.hooksTitle'])).toBeNull();
  });
});
