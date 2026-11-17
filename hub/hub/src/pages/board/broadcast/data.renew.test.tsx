// The broadcast link's renew (data.ts aliasRenew) goes through core's alias edit, the one route for PATCH
// /proxy/aliases/:id, and sends only the new expiry: never the alias's name or port.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { aliasRoutes, answers, bootFixtureCore, queryClient, reply } from '@core';
import { useRenewLink } from './data';

const sent: { method: string; path: string; body: unknown }[] = [];
let renew!: ReturnType<typeof useRenewLink>;
function Probe() {
  renew = useRenewLink();
  return null;
}

describe('board broadcast: a link renew', () => {
  afterEach(() => {
    cleanup();
    sent.length = 0;
    queryClient.clear();
  });

  it('is one send of core\'s alias edit carrying only expires_at', async () => {
    bootFixtureCore({
      rules: [
        reply(aliasRoutes.edit, (r) => {
          sent.push({ method: r.method, path: r.path, body: r.body });
          return answers.ok({});
        }),
        reply(aliasRoutes.list, answers.ok({ data: { aliases: [] } })),
      ],
    });
    render(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>);
    const until = '2026-11-13T17:00:00Z';
    await act(async () => { await renew.mutateAsync({ computer: 'c1', alias: 'al-1', until }); });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe('PATCH');
    expect(sent[0]!.path).toMatch(/\/proxy\/aliases\/al-1$/);
    expect(sent[0]!.body).toEqual({ expires_at: until });
  });
});
