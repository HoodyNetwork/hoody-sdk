// FirstRun.tsx "Sign out first": "Sign out here" ends only the session storage held when the card was drawn, through
// shared.js's sign-out purge (purgeOutgoingSession, reason 'signout') named with that session. A session another tab
// stored since (another account, or the same one signed in again) is kept; the page reloads either way and draws
// whatever is stored then. Storage is stood in through installShared (its purgeOutgoingSession decides as shared.js
// does: purged only while storage holds the session named), so core/session.ts readPage runs as it does on the page.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installShared, shared, type PageIdentity, type StoredSession } from '@core/session';
import type { Start } from './boot';
import { FirstRun } from './FirstRun';

const ORIGIN = 'https://api.hoody.test';
const START: Exclude<Start, { kind: 'app' }> = { kind: 'first-run', step: 'blocked', why: 'signed_in', choice: { origin: ORIGIN, asked: 'default' } };
const A: StoredSession = Object.freeze({ kind: 'account', uid: '64f0c0ffee0000000000aaaa', sid: 'sid-a', bearer: 'token-a' });
const A_REFRESHED: StoredSession = Object.freeze({ ...A, bearer: 'token-a2' });
const A_AGAIN: StoredSession = Object.freeze({ ...A, sid: 'sid-a2', bearer: 'token-a3' });
const B: StoredSession = Object.freeze({ kind: 'account', uid: '64f0c0ffee0000000000bbbb', sid: 'sid-b', bearer: 'token-b' });
const B_TOKEN: StoredSession = Object.freeze({ kind: 'token', uid: '64f0c0ffee0000000000bbbb', sid: 'sid-t', bearer: 'hdy_b', realm: 'all' });

/** What storage holds now; the purge empties it. */
let now: StoredSession | null = null;
const purge = vi.fn(() => { now = null; });
const reload = vi.fn();
/** Each sign-out purge the page asked for: the session it named and the reason. */
let asked: Array<{ s: PageIdentity | null; reason: unknown }> = [];
/** Set: the purge answers this and changes nothing; null: it decides as shared.js does. */
let answer: 'purged' | 'kept' | 'failed' | null = null;
const idOf = (x: StoredSession) => ({ kind: x.kind, uid: x.uid, sid: x.sid });

beforeEach(() => {
  now = null;
  asked = [];
  answer = null;
  purge.mockClear();
  reload.mockReset();
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  installShared({
    ...shared(),
    storedSession: () => now,
    holdsIdentity: (id) => !!now && now.kind === id.kind && now.uid === id.uid && now.sid === id.sid,
    readAccessToken: () => (now && now.kind === 'account' ? now.bearer : null),
    sessionTokenUid: (t) => (now && t === now.bearer ? now.uid : null),
    sessionTokenSid: (t) => (now && t === now.bearer ? now.sid : null),
    isFramedPage: () => false,
    clearAuthTokens: purge,
    purgeOutgoingSession: (s, o) => {
      asked.push({ s, reason: o?.reason });
      if (answer) return answer;
      if (!s || !now || now.kind !== s.kind || now.uid !== s.uid || now.sid !== s.sid) return 'kept';
      purge();
      return 'purged';
    },
  });
});
afterEach(cleanup);

/** Draws the card while storage holds `drawn`, then lets storage change to `pressed` before the press. */
async function signOutHere(drawn: StoredSession | null, pressed: StoredSession | null) {
  now = drawn;
  render(<FirstRun start={START} />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign out first');
  now = pressed;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Sign out here$/ })); });
  expect(reload).toHaveBeenCalledTimes(1);
}

describe('"Sign out here" purges only the session shown', () => {
  it('control: the session shown is still stored: purged once, then the page reloads', async () => {
    await signOutHere(A, A);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(now).toBeNull();
    expect(asked).toEqual([{ s: idOf(A), reason: 'signout' }]);
  });

  it('a refresh of that session (same user and sid, a new token) is still it: purged', async () => {
    await signOutHere(A, A_REFRESHED);
    expect(purge).toHaveBeenCalledTimes(1);
  });

  for (const [what, later] of [
    ['another account signed in in another tab', B],
    ['the same account signed in again (a new sid)', A_AGAIN],
    ['an access key session stored in another tab', B_TOKEN],
  ] as const) {
    it(`${what} after the card was drawn: nothing is purged, the page reloads`, async () => {
      await signOutHere(A, later);
      expect(purge).not.toHaveBeenCalled();
      expect(now).toBe(later);
      // The purge is named with the session drawn, never the one stored at the press.
      expect(asked).toEqual([{ s: idOf(A), reason: 'signout' }]);
    });
  }

  it('a purge that leaves a credential stored (failed): the page still reloads', async () => {
    answer = 'failed';
    await signOutHere(A, A);
    expect(asked).toEqual([{ s: idOf(A), reason: 'signout' }]);
  });

  it('nothing usable stored when drawn (a stray credential): purged while still nothing usable', async () => {
    await signOutHere(null, null);
    expect(purge).toHaveBeenCalledTimes(1);
    expect(asked).toEqual([]);
  });

  it('nothing usable stored when drawn, a session stored since: kept', async () => {
    await signOutHere(null, B);
    expect(purge).not.toHaveBeenCalled();
    expect(now).toBe(B);
    expect(asked).toEqual([]);
  });
});
