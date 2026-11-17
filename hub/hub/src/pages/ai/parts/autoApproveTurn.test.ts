// "Auto-approve this reply": the item hook alone. A disabled item never sends, even when called outside the menu (a key shortcut or
// another host running items); the reason names what blocks it.
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CapFacts } from '@kit';
import { useAutoApproveTurn } from './autoApproveTurn';
import strings from './Conversation.strings.en.json';

const FACTS: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const item = (f: Partial<CapFacts>, canSend: boolean, busy: boolean, send = vi.fn()) =>
  renderHook(() => useAutoApproveTurn({ ...FACTS, ...f }, canSend, busy, send)).result.current;

describe('useAutoApproveTurn', () => {
  it('offered on an idle Default chat; one call is one send', () => {
    const send = vi.fn();
    const i = item({}, true, false, send)!;
    expect(i.isDisabled).toBe(false);
    i.onAction();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['a lock', { approval: 'locked' as const }, true, false, 'conv.aat.why.locked_by_policy'],
    ['an unknown mode', { approval: 'unknown' as const }, true, false, 'conv.aat.why.approval_unknown'],
    ['a closed chat', { state: 'closed' as const }, true, false, 'conv.aat.why.closed'],
    ['a running turn', {}, true, true, 'conv.aat.why.later'],
    ['nothing to send', {}, false, false, 'conv.aat.why.send'],
  ])('%s: disabled with its reason, and calling it sends nothing', (_n, f, canSend, busy, why) => {
    const send = vi.fn();
    const i = item(f, canSend, busy, send)!;
    expect(i.isDisabled).toBe(true);
    // A disabled menu item always says why (the menu reports one without a reason as an error).
    expect(i.disabledReason).toBeTruthy();
    expect(i.disabledReason).toBe((strings as Record<string, string>)[why]);
    i.onAction();
    expect(send).not.toHaveBeenCalled();
  });
});
