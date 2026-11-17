// The shell's account is core's shown identity only: never a fixture account when there is none.
import { describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { setIdentity } from '@core/ctx';
import { shownUid } from './uid';

describe('shownUid', () => {
  it('is the shown identity', () => {
    const a = fixtureWorld.account;
    setIdentity({ id: a.id, username: a.username, email: a.email, banned: false });
    expect(shownUid()).toBe(a.id);
  });
  it('is null with no identity (no fixture fallback) and for a suspended account', () => {
    setIdentity(null);
    expect(shownUid()).toBeNull();
    const a = fixtureWorld.account;
    setIdentity({ id: a.id, banned: true });
    expect(shownUid()).toBeNull();
  });
});
