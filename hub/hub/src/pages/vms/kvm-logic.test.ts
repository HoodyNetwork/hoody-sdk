// Vitest: the KVM switch's pure rules (kvm-logic.ts) over the fixture rows: on and off gated apart, what a press does by
// the computer's status, the read that proves a change, and the page's words for each refusal the API gives.
import { describe, expect, it } from 'vitest';
import { FX } from './fixtures';
import { kvmAction, kvmFactsOf, kvmRefusal, kvmStep, kvmVerdict, turnOnBlock, type KvmFacts } from './kvm-logic';

const C = FX.COMPUTERS;
const facts = (row: Record<string, unknown>, kind: 'paid' | 'bare_metal' | 'free' | null = 'bare_metal'): KvmFacts => {
  const f = kvmFactsOf(row, 'running', kind);
  if (!f) throw new Error('row');
  return f;
};

describe('kvmFactsOf', () => {
  it('keeps the raw status (paused is not stopped for the API)', () => {
    expect(facts({ ...C.bareMetal, status: 'Paused' }).status).toBe('paused');
    expect(facts({ ...C.bareMetal, status: 7 }).status).toBe('');
  });
  it('an unreadable row is no facts', () => {
    expect(kvmFactsOf({ name: 'x' }, 'running', null)).toBeNull();
  });
});

describe('turning on and off are gated apart', () => {
  it('turning on is refused on what the row proves: expired, shared, a server that says no', () => {
    expect(turnOnBlock(facts(C.expired))).toBe('expired');
    expect(turnOnBlock(facts(C.shared, 'free'))).toBe('shared');
    expect(turnOnBlock(facts(C.sharedPaid, 'paid'))).toBe('shared');
    expect(turnOnBlock(facts(C.serverNo))).toBe('notAllowed');
  });
  it('a kind or support that is not known never blocks: the API decides', () => {
    expect(turnOnBlock(facts(C.serverUnchecked))).toBeNull();
    expect(turnOnBlock(facts({ ...C.kvmOff }, null))).toBeNull();
    expect(kvmAction(facts({ ...C.kvmOff, status: 'stopped' }, null))).toEqual({ kind: 'turn', want: true, step: 'set' });
  });
  it('turning off is offered whatever the support facts say, expired included', () => {
    expect(kvmAction(facts({ ...C.serverNo, kvm: true, status: 'stopped' }))).toEqual({ kind: 'turn', want: false, step: 'set' });
    expect(kvmAction(facts(C.expired))).toEqual({ kind: 'turn', want: false, step: 'set' });
    expect(kvmAction(facts({ ...C.shared, kvm: true, status: 'stopped' }, 'free'))).toEqual({ kind: 'turn', want: false, step: 'set' });
  });
  it('a row that does not say whether KVM is on offers nothing', () => {
    expect(kvmAction(facts(C.kindUnknown, null))).toEqual({ kind: 'none' });
  });
});

describe('what a press does by the status', () => {
  it('stopped acts; running or paused stops first; anything else waits', () => {
    expect(kvmStep('stopped')).toBe('set');
    expect(kvmStep('running')).toBe('stopFirst');
    expect(kvmStep('paused')).toBe('stopFirst');
    for (const s of ['starting', 'creating', 'failed', 'stopping', '']) expect(kvmStep(s)).toBe('wait');
    expect(kvmAction(facts(C.kvmOff))).toEqual({ kind: 'turn', want: true, step: 'stopFirst' });
  });
});

describe('kvmVerdict: the computers list proves a change only by showing the asked value', () => {
  const id = String(C.bareMetal.id);
  it('applied when the row shows the asked value', () => {
    expect(kvmVerdict({ computer: id, op: 'kvm', kvm: true }, [{ id, kvm: true }])).toBe('applied');
    expect(kvmVerdict({ computer: id, op: 'kvm', kvm: false }, [{ id: 'other', kvm: true }, { id, kvm: false }])).toBe('applied');
  });
  it('the old value, a missing row, a row without kvm, or another identity prove nothing', () => {
    expect(kvmVerdict({ computer: id, op: 'kvm', kvm: true }, [{ id, kvm: false }])).toBeUndefined();
    expect(kvmVerdict({ computer: id, op: 'kvm', kvm: true }, [])).toBeUndefined();
    expect(kvmVerdict({ computer: id, op: 'kvm', kvm: true }, [{ id }, null, 'x'])).toBeUndefined();
    expect(kvmVerdict({ computer: id, op: 'stop' }, [{ id, kvm: true }])).toBeUndefined();
    expect(kvmVerdict(undefined, [{ id, kvm: true }])).toBeUndefined();
  });
});

describe('kvmRefusal: every refusal the API gives, in plain words', () => {
  const e = (status: number, code: string | null) => ({ kind: 'failed', status, code });
  it.each([
    [409, 'OPERATION_STATE_CONFLICT', 'notStopped'],
    [409, 'COMPUTER_OPERATION_IN_PROGRESS', 'busy'],
    [409, 'KVM_CHANGE_IN_PROGRESS', 'busy'],
    [409, 'KVM_HOST_STATE_UNKNOWN', 'unchecked'],
    [409, 'KVM_NOT_AVAILABLE', 'notAvailable'],
    [409, 'KVM_HOST_UPGRADE_REQUIRED', 'upgrade'],
    [409, 'COMPUTER_CHANGED_DURING_REQUEST', 'moved'],
    [409, 'COMPUTER_EXPIRED', 'expired'],
    [409, 'ACCESS_SUSPENDED_TARGET', 'suspended'],
    [404, 'COMPUTER_NOT_FOUND', 'gone'],
    [404, null, 'gone'],
    [400, 'Bad Request', 'notSetUp'],
  ] as const)('%i %s → %s', (status, code, want) => {
    expect(kvmRefusal(e(status, code), true)).toBe(want);
  });
  it('the general 403 reads by direction: turning on names what it needs, turning off names the owner', () => {
    expect(kvmRefusal(e(403, 'INSUFFICIENT_PERMISSIONS'), true)).toBe('forbiddenOn');
    expect(kvmRefusal(e(403, 'INSUFFICIENT_PERMISSIONS'), false)).toBe('forbidden');
    expect(kvmRefusal(e(403, null), true)).toBe('forbiddenOn');
  });
  it("the Hub's own refusals and a rate limit keep the kit's words", () => {
    expect(kvmRefusal({ kind: 'not_sent', status: 0, code: 'TOKEN_LACKS' }, true)).toBeNull();
    expect(kvmRefusal({ kind: 'not_sent', status: 0, code: 'FRAMED_ACTION_REFUSED' }, true)).toBeNull();
    expect(kvmRefusal(e(429, 'RATE_LIMITED'), true)).toBeNull();
    expect(kvmRefusal(e(403, 'TOKEN_SESSION_REFUSED'), true)).toBeNull();
    expect(kvmRefusal(undefined, true)).toBeNull();
  });
});
