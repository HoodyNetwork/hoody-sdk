// The fixture shared.js purges as the real one does (purgeAuthStorage): its hooks get the outgoing
// account read before anything is removed, a token session's uid included, and purgeOutgoingSession without a
// reason is an expiry, never a sign-out.
import { describe, expect, it } from 'vitest';
import type { AuthPurgeInfo } from './session';
import { fixtureShared } from './transport';

const seen = (s: ReturnType<typeof fixtureShared>) => {
  const out: Array<AuthPurgeInfo | undefined> = [];
  s.onBeforeAuthPurge((i) => out.push(i));
  return out;
};

describe('fixture purge parity with shared.js', () => {
  it('a token session names its uid to the purge hooks, as an account session does', () => {
    for (const o of [{ uid: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, { uid: 'aaaaaaaaaaaaaaaaaaaaaaaa', token: { realm: 'r' } }]) {
      const s = fixtureShared(o);
      const out = seen(s);
      s.clearAuthTokens({ reason: 'expiry' });
      expect(out).toEqual([{ reason: 'expiry', uid: 'aaaaaaaaaaaaaaaaaaaaaaaa' }]);
    }
  });
  it('purgeOutgoingSession without a reason purges as an expiry; signed out, the hooks get no account', () => {
    const s = fixtureShared({ uid: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    const out = seen(s);
    expect(s.purgeOutgoingSession(null)).toBe('purged');
    s.purgeOutgoingSession(null, { reason: 'signout' });
    expect(out).toEqual([{ reason: 'expiry', uid: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, { reason: 'signout', uid: null }]);
  });
});
