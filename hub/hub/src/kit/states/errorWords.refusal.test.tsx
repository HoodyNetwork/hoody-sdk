// A read core refused before sending reads with the refusal's words,
// never err.stale ("the answer came after you moved on"). A read that needs one realm, made under All realms, gets
// its own sentence; a shared link's missing leaf is named; any other refusal reads "nothing was sent".
import { QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { coreSource, defineRoute, errorInfo, queryClient, type SourceError } from '@core';
import { boot, calls, settle } from '@core/test/env';
import { ERROR_WORD_KEYS, errorWords } from './errorWords';
import { ErrorState } from './States';
import strings from './strings.en.json';

const REALM_WORDS = "This can't be shown for all realms at once. Pick one realm to see it.";
const key = (e: Record<string, unknown>) => errorWords(errorInfo(e)).key;

afterEach(cleanup);

describe('errorWords for refusals before sending', () => {
  it('AGENT_REALM_REQUIRED has its own sentence', () => {
    expect(key({ kind: 'not_sent', notSent: true, code: 'AGENT_REALM_REQUIRED' })).toBe('err.realmRequired');
    expect((strings as Record<string, string>)['err.realmRequired']).toBe(REALM_WORDS);
    expect(ERROR_WORD_KEYS).toContain('err.realmRequired');
  });
  it('only as a refusal: the same code on an outcome that is not not_sent keeps that outcome\'s words', () => {
    expect(key({ kind: 'stale', stale: true, code: 'AGENT_REALM_REQUIRED' })).toBe('err.stale');
    expect(key({ kind: 'pending', code: 'AGENT_REALM_REQUIRED' })).toBe('err.pending');
  });
  it('a shared link\'s missing leaf, refused unsent, is named', () => {
    expect(key({ kind: 'not_sent', notSent: true, code: 'TOKEN_LACKS', perm: 'resources.bot_urls' })).toBe('err.tokenLacks');
  });
});

describe('ErrorState over a coreSource read refused under All realms', () => {
  it('shows the realm sentence, not "the answer came after you moved on"', async () => {
    boot({ realm: 'all' });
    queryClient.clear();
    const todos = defineRoute({ method: 'GET', path: '/todos', scope: 'agent', realm: 'realm' });
    const src = coreSource('refusal-words', { reads: { todos: { route: todos } } });
    let last!: UseQueryResult<unknown, SourceError>;
    function Page() {
      last = src.useQuery<unknown>('todos');
      return last.error ? <ErrorState title="TODOs could not be read" error={last.error} /> : null;
    }
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    render(<Page />, { wrapper: wrap });
    await act(async () => { for (let i = 0; i < 20; i++) await settle(); });
    expect(calls).toHaveLength(0);
    expect(screen.getByText(REALM_WORDS)).toBeTruthy();
    expect(screen.queryByText((strings as Record<string, string>)['err.stale']!)).toBeNull();
  });
});
