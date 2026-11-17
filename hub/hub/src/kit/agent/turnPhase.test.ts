// The working row's one state function: every phase from the facts a source always has, the host's own `activity` when it says more,
// and the two states that must never read as working (a saved copy, a chat still being read).
import { describe, expect, it } from 'vitest';
import type { CapFacts } from './capability';
import type { ConvBlock, ConvSnapshot, GateEntry } from './source';
import { turnPhase } from './turnPhase';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const user: ConvBlock = { k: 'user', key: 'u', text: 'Fix it', at: 1 };
const snap = (o: Partial<ConvSnapshot> = {}, f: Partial<CapFacts> = {}): ConvSnapshot => ({ facts: { ...facts, ...f }, title: null, blocks: [user], gates: [], ...o });
const gate = (decision: GateEntry['decision']): GateEntry => ({ key: 'g', ref: { id: 'g', generation: 1 }, gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: {} }, helper: false, addressing: false, held: null, decision });
const steps = (state: 'running' | 'ok', rows: readonly { state: 'running' | 'ok'; verb: string; summary?: string }[]): ConvBlock => ({ k: 'steps', key: 't', label: 'steps', state, rows: rows.map((r, i) => ({ id: String(i), ...r })) });

describe('turnPhase', () => {
  it('nothing runs: idle', () => {
    expect(turnPhase(snap({}, { turn: false, state: 'idle' }))).toEqual({ k: 'idle' });
  });
  it('a turn runs and nothing came back yet: working, with no step', () => {
    expect(turnPhase(snap())).toEqual({ k: 'working' });
  });
  it('the running step of the newest trail is named; a finished trail names none', () => {
    expect(turnPhase(snap({ blocks: [user, steps('running', [{ state: 'ok', verb: 'Read', summary: 'a.ts' }, { state: 'running', verb: 'Run', summary: 'npm test' }])] }))).toEqual({ k: 'working', step: { verb: 'Run', summary: 'npm test' } });
    expect(turnPhase(snap({ blocks: [user, steps('ok', [{ state: 'ok', verb: 'Read' }])] }))).toEqual({ k: 'working' });
  });
  it("an earlier turn's running trail is never this turn's step", () => {
    expect(turnPhase(snap({ blocks: [steps('running', [{ state: 'running', verb: 'Run' }]), user] }))).toEqual({ k: 'working' });
  });
  it('a streaming reply is writing', () => {
    expect(turnPhase(snap({ blocks: [user, { k: 'reply', key: 'r', text: 'So', streaming: true, final: false, cost: null, at: null }] }))).toEqual({ k: 'working', writing: true });
  });
  it('a gate that waits for the person is waiting; one whose decision is on its way is not', () => {
    expect(turnPhase(snap({ gates: [gate(null)] }, { gate: 'confirm' }))).toEqual({ k: 'waiting' });
    expect(turnPhase(snap({ gates: [gate('sending')] }, { gate: 'confirm', decisionPending: true }))).toEqual({ k: 'working' });
  });
  it("the host's unresolved Stop is stopping, only while the turn runs", () => {
    expect(turnPhase(snap(), { stopping: true })).toEqual({ k: 'stopping' });
    expect(turnPhase(snap({}, { turn: false, state: 'idle' }), { stopping: true })).toEqual({ k: 'idle' });
  });
  it('a running turn whose connection is being opened again is reconnecting', () => {
    expect(turnPhase(snap({ meta: { computer: 'atlas', realm: 'Personal', status: 'loading' } }))).toEqual({ k: 'reconnecting' });
  });
  it('a turn on a computer that stopped answering is lost, never working; with no turn it is idle', () => {
    expect(turnPhase(snap({}, { reach: 'unreachable' }))).toEqual({ k: 'lost' });
    expect(turnPhase(snap({}, { reach: 'unreachable', turn: false }))).toEqual({ k: 'idle' });
  });
  it('a saved copy and a chat still being read are never working', () => {
    expect(turnPhase(snap({ saved: { at: 1 } }))).toEqual({ k: 'idle' });
    expect(turnPhase(snap({}, { state: 'loading' }))).toEqual({ k: 'idle' });
  });
  it("the host's own activity wins over the derived phase, and carries its step", () => {
    expect(turnPhase(snap({ activity: { phase: 'sending' } }, { turn: false, state: 'idle' }))).toEqual({ k: 'sending' });
    expect(turnPhase(snap({ activity: { phase: 'working', step: { verb: 'Run', summary: 'make' } } }))).toEqual({ k: 'working', step: { verb: 'Run', summary: 'make' } });
    expect(turnPhase(snap({ activity: { phase: 'working' } }), { stopping: true })).toEqual({ k: 'stopping' });
    expect(turnPhase(snap({ activity: { phase: 'reconnecting' } }))).toEqual({ k: 'reconnecting' });
  });
  it("the host's activity is read before the facts: a source that reports loading and no turn while it reconnects, catches up or lost its turn still says so", () => {
    const quiet = { state: 'loading', turn: false } as const;
    expect(turnPhase(snap({ activity: { phase: 'reconnecting' } }, quiet))).toEqual({ k: 'reconnecting' });
    expect(turnPhase(snap({ activity: { phase: 'catching_up' } }, quiet))).toEqual({ k: 'catching_up' });
    expect(turnPhase(snap({ activity: { phase: 'lost' } }, { ...quiet, reach: 'unreachable' }))).toEqual({ k: 'lost' });
  });
  it('a saved copy is idle whatever the host says', () => {
    expect(turnPhase(snap({ saved: { at: 1 }, activity: { phase: 'reconnecting' } }))).toEqual({ k: 'idle' });
  });
});
