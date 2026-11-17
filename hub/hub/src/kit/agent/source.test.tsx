// Vitest: the source seam. A read-only source has no send/stop/decide/answer/check at all; the size hook
// keeps its class until the element has a width; every refusal reason has words.
import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACTIONS, can, type CapFacts, type Reason } from './capability';
import { convKey, isActive, type ConversationSource } from './source';
import { useSizeClass } from './useSizeClass';
import { useWhy } from './why';
import strings from './SessionView.strings.en.json';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: false,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'notNeeded' },
};

describe('a read-only source', () => {
  const src: ConversationSource = { kind: 'session', ref: { computer: 'a.1234', realm: 'global', sid: 's' }, snapshot: () => ({ facts, title: null, blocks: [], gates: [] }), subscribe: () => () => {}, watch: () => {}, can: (a) => can(a, facts) };
  it('is not active: no method sends, stops, decides, answers or checks', () => {
    expect(isActive(src)).toBe(false);
    for (const m of ['send', 'stop', 'decide', 'answer', 'check']) expect((src as unknown as Record<string, unknown>)[m]).toBeUndefined();
  });
  it('reports every action unavailable', () => {
    for (const a of ACTIONS) expect(src.can(a).ok, a).toBe(false);
  });
  it('a ref is keyed by computer, realm and session', () => {
    expect(convKey(src.ref as { computer: string; realm: string; sid: string })).toBe('a.1234|global|s');
    expect(convKey({ computer: 'a.1234', realm: 'global', sid: 't' })).not.toBe(convKey({ computer: 'a.1234', realm: 'global', sid: 's' }));
  });
  it('an object with a send method is active', () => {
    expect(isActive({ ...src, send: async () => ({ k: 'done' as const }) } as unknown as ConversationSource)).toBe(true);
  });
});

describe('useSizeClass', () => {
  it('keeps the initial class when the element has no width (hidden, or no layout)', () => {
    function Probe() { const [ref, c] = useSizeClass<HTMLDivElement>('m'); return <div ref={ref} data-c={c} data-testid="p" />; }
    render(<Probe />);
    expect(screen.getByTestId('p').dataset.c).toBe('m');
  });
  it('is the initial class with nothing attached', () => {
    const { result } = renderHook(() => useSizeClass('xl'));
    expect(result.current[1]).toBe('xl');
  });
});

describe('useWhy', () => {
  const REASONS: Reason[] = ['loading', 'unreachable', 'forbidden', 'missing', 'gone', 'closed', 'open', 'read_only', 'prerequisites', 'approver_elsewhere', 'turn_running', 'no_turn', 'turn_in_flight', 'gate_parked', 'session_busy', 'no_gate', 'gate_policy', 'gate_helper', 'gate_addressing', 'gate_held', 'decision_pending', 'nothing_to_check', 'images_wait', 'strict_refuses_automatic', 'strict_refuses_rules', 'locked_by_policy', 'approval_unknown', 'fixed_after_start', 'bot', 'no_completed_turn', 'no_later_turn', 'unsupported', 'asleep'];
  it('every reason has a sentence, an allowed action has none', () => {
    const { result } = renderHook(() => useWhy());
    for (const r of REASONS) expect(result.current({ ok: false, reason: r }), r).toMatch(/\S/);
    expect(result.current({ ok: true })).toBe('');
    expect(Object.keys(strings).filter((k) => k.startsWith('sv.why.')).sort()).toEqual(REASONS.map((r) => `sv.why.${r}`).sort());
  });
  it('every refusal is one sentence', () => {
    for (const [k, v] of Object.entries(strings).filter(([k]) => k.startsWith('sv.why.'))) {
      expect(v.replace(/\{\{[^}]+\}\}/g, 'x').match(/[.!?](\s|$)/g)?.length, k).toBe(1);
    }
  });
  it('prerequisites name what is missing', () => {
    const { result } = renderHook(() => useWhy());
    expect(result.current({ ok: false, reason: 'prerequisites', missing: ['journal', 'approver'] })).toBe('Sending is not ready yet: the record that keeps sends safe, this window\'s hold on the approvals.');
  });
});
