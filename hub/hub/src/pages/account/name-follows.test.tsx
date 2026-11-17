// Vitest: the greeting and the account menu show the account's display name (alias)
// from the boot's /users/auth/me answer. A rename is proven by the account page's profile read; that answer now also
// updates the shown identity, so the new name shows without a reload. Another account's profile changes nothing.
import { queryClient } from '@core';
import { identity, setIdentity } from '@core/ctx';
import { boot, onFetch, OTHER, settle, signIn, UID } from '@core/test/env';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useProfile } from './data';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
// The profile each render saw: the negative case waits for the other account's answer before judging.
let seenId: string | undefined;
function P() {
  seenId = useProfile().data?.id;
  return null;
}
const mountWith = async (me: Record<string, unknown>) => {
  seenId = undefined;
  boot();
  signIn();
  queryClient.clear();
  setIdentity({ id: UID, username: 'sample-user', alias: 'Old', banned: false });
  onFetch((c) => (c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: me } } : { status: 404, body: {} }));
  await act(async () => {
    render(<P />, { wrapper: wrap });
    await flush();
  });
};

afterEach(cleanup);

describe('the shown display name follows the profile', () => {
  it('a profile with a new name (a proven rename) updates the greeting\'s name', async () => {
    await mountWith({ id: UID, username: 'sample-user', alias: 'New Name', email: 'a@b.c' });
    await waitFor(() => expect(identity()).toMatchObject({ id: UID, username: 'sample-user', alias: 'New Name' }));
  });
  it('another account\'s profile changes nothing', async () => {
    await mountWith({ id: OTHER, username: 'someone', alias: 'Someone', email: 'o@b.c' });
    await waitFor(() => expect(seenId).toBe(OTHER));
    expect(identity()?.alias).toBe('Old');
  });
});
