// Vitest: the token-gate switch turned on and refused. The banner says what the refusal was (too many tries, the
// account changed meanwhile, an earlier try to check first), as turning it off does; only a refusal with no known
// reason gets the general sentence.
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

const answer = vi.hoisted(() => ({ outcome: 'failed' as string, code: undefined as string | undefined, status: undefined as number | undefined }));
vi.mock('./data', async (orig) => {
  const data = await orig<typeof Data>();
  return {
    ...data,
    // The change hook as core answers a definite refusal: nothing is held.
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
const press = async (a: { outcome: string; code?: string; status?: number }) => {
  answer.outcome = a.outcome;
  answer.code = a.code;
  answer.status = a.status;
  boot();
  signIn();
  queryClient.clear();
  locks.clear();
  onFetch(() => ({ status: 200, body: { data: { enabled: true, verified: true, backup_codes_remaining: 8, require_for_tokens: false } } }));
  const view = render(<TwoFactorSection onOpen={() => undefined} />, { wrapper: wrap });
  await act(flush);
  await act(async () => {
    fireEvent.click(await screen.findByRole('switch', { name: strings['2fa.gateSwitch'] }));
    await flush();
  });
  return view;
};

describe('the token-gate switch turned on and refused', () => {
  it('too many tries says so, not the general sentence', async () => {
    const view = await press({ outcome: 'failed', status: 429 });
    expect(await screen.findByText(strings['err.tooMany'])).toBeInTheDocument();
    expect(screen.queryByText(strings['err.generic'])).toBeNull();
    expect(locks.get('gate')).toBeUndefined();
    view.unmount();
  });

  it('an account that changed meanwhile says so', async () => {
    const view = await press({ outcome: 'failed', status: 409 });
    expect(await screen.findByText(strings['err.changed'])).toBeInTheDocument();
    expect(screen.queryByText(strings['err.generic'])).toBeNull();
    view.unmount();
  });

  it('a refusal with no known reason keeps the general sentence', async () => {
    const view = await press({ outcome: 'failed', status: 400, code: 'SOMETHING_ELSE' });
    expect(await screen.findByText(strings['err.generic'])).toBeInTheDocument();
    view.unmount();
  });
});
