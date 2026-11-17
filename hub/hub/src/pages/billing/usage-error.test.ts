// Vitest: the AI usage read's refusals in words are core's one rule (the Servers cards read the same).
import { describe, expect, it } from 'vitest';
import { usageError } from './data';

describe('usageError', () => {
  it('says no access for a forbidden read, throttled for the fixture/429 kind, and a plain failure otherwise', () => {
    expect(usageError('forbidden')).toBe('aiu.noAccess');
    expect(usageError('bad_request')).toBe('aiu.throttle');
    expect(usageError('server')).toBe('aiu.loadErr');
    expect(usageError(undefined)).toBe('aiu.loadErr');
  });
});
