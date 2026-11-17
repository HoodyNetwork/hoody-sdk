// session.purge.test.ts: core/session.ts purgeOutgoingSession(s, opts) is shared.js's own purgeOutgoingSession, passed
// through: it purges only while storage still holds session `s`, keeps a session another tab stored since, and hands
// the reason to the purge hooks. Run on the real shared.js (test/env loadShared) and on a stand-in that records calls.
import { beforeEach, describe, expect, it } from 'vitest';
import { installShared, onBeforeAuthPurge, purgeOutgoingSession, readPage, shared, type AuthPurgeInfo, type PageIdentity } from './session';
import { loadShared, OTHER, signIn, UID } from './test/env';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  installShared(loadShared());
  signIn();
});
const hooks = (): Array<AuthPurgeInfo | undefined> => {
  const seen: Array<AuthPurgeInfo | undefined> = [];
  onBeforeAuthPurge((i) => { seen.push(i); });
  return seen;
};

describe('purgeOutgoingSession (core/session.ts)', () => {
  it('purges the session it names while storage still holds it; the hooks get the reason', () => {
    const page = readPage();
    expect(page?.uid).toBe(UID);
    const seen = hooks();
    expect(purgeOutgoingSession(page, { reason: 'signout' })).toBe('purged');
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(seen.map((i) => i?.reason)).toEqual(['signout']);
  });

  it('without a reason it purges as an expiry (shared.js default)', () => {
    const seen = hooks();
    expect(purgeOutgoingSession(readPage())).toBe('purged');
    expect(seen.map((i) => i?.reason)).toEqual(['expiry']);
  });

  it('keeps a session stored since the view read it: another account, or the same account with a new sid', () => {
    for (const [uid, sid] of [[OTHER, 'sid0000000000002'], [UID, 'sid0000000000003']] as const) {
      localStorage.clear();
      signIn();
      const page = readPage();
      signIn(uid, sid);
      const stored = localStorage.getItem('access_token');
      const seen = hooks();
      expect(purgeOutgoingSession(page, { reason: 'signout' })).toBe('kept');
      expect(localStorage.getItem('access_token')).toBe(stored);
      expect(seen).toEqual([]);
    }
  });

  it('null names "no session": it purges only while none is stored', () => {
    expect(purgeOutgoingSession(null, { reason: 'signout' })).toBe('kept');
    expect(localStorage.getItem('access_token')).not.toBeNull();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    expect(purgeOutgoingSession(null, { reason: 'signout' })).toBe('purged');
  });

  it('adds nothing of its own: the arguments go to shared.js unchanged and its answer comes back', () => {
    const real = shared();
    const asked: Array<[PageIdentity | null, unknown]> = [];
    installShared({ ...real, purgeOutgoingSession: (s, o) => { asked.push([s, o]); return 'failed'; } });
    const page = readPage();
    const opts = { reason: 'signout' as const };
    expect(purgeOutgoingSession(page, opts)).toBe('failed');
    expect(asked).toHaveLength(1);
    expect(asked[0]![0]).toEqual(page);
    expect(asked[0]![1]).toBe(opts);
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });
});
