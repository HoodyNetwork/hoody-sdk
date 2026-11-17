import { describe, expect, it } from 'vitest';
import { agentSignedOut } from './agent';

describe('agentSignedOut', () => {
  it('reads the agent\'s restriction_unknown refusal as signed out', () => {
    expect(agentSignedOut({ status: 503, code: 'restriction_unknown' })).toBe(true);
  });
  it('reads nothing else as signed out', () => {
    for (const e of [{ status: 503 }, { status: 503, code: 'unavailable' }, { status: 403, code: 'realm_not_allowed' }, null, 'restriction_unknown', undefined]) {
      expect(agentSignedOut(e)).toBe(false);
    }
  });
});
