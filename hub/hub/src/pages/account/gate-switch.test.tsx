// Vitest: the token-gate switch pressed while an earlier send of the change (another mount, another tab) is still
// out: core answers READ_BACK_FIRST. That is pending here too, so the banner offers Check again; the press is
// never silent, and never a failure.
import { queryClient } from '@core';
import { boot, onFetch, settle, signIn } from '@core/test/env';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router for a part rendered without its page (its FaqLink reads the location), not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type * as Data from './data';
import { TwoFactorSection } from './parts/TwoFactorSection';
import { locks } from './parts/locks';
import strings from './strings.en.json';

const answer = vi.hoisted(() => ({ outcome: 'not_sent' as string, code: 'READ_BACK_FIRST' as string | undefined }));
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return {
    ...data,
    // The change hook as core answers it when an earlier send is still out: the press is refused, nothing is sent.
    useSetGate: () => ({ ...data.useSetGate(), pending: false, running: false, run: async () => ({ ...answer }) }),
  };
});

const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ['/account'] }) });
const wrap = ({ children }: { children: ReactNode }) => (
  <RouterContextProvider router={router}>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  </RouterContextProvider>
);
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const press = async () => {
  boot();
  signIn();
  queryClient.clear();
  locks.clear();
  onFetch(() => ({ status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: false } } }));
  render(<TwoFactorSection onOpen={() => undefined} />, { wrapper: wrap });
  await act(flush);
  await act(async () => {
    fireEvent.click(await screen.findByRole('switch', { name: strings['2fa.gateSwitch'] }));
    await flush();
  });
};

describe('the token-gate switch over a send that is still out', () => {
  it('READ_BACK_FIRST settles the lock as pending: the banner offers Check again, the press is not silent', async () => {
    answer.outcome = 'not_sent';
    answer.code = 'READ_BACK_FIRST';
    await press();
    expect(locks.get('gate')).toBe('pending');
    expect(await screen.findByRole('button', { name: strings['check.again'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['err.generic'])).toBeNull();
  });

  it('BUSY (this mount\'s own send is out) changes no lock and shows no failure', async () => {
    answer.outcome = 'not_sent';
    answer.code = 'BUSY';
    await press();
    expect(locks.get('gate')).toBe('sent');
    expect(screen.queryByText(strings['err.generic'])).toBeNull();
  });
});
