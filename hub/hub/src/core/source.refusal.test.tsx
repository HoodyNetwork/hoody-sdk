// A coreSource read that core refused before sending reads not_sent,
// with the refusal's code (and a token's missing leaf), never 'stale' ("the answer came after you moved on"). A read
// whose context died keeps 'stale' (source.errorof.test.tsx). reachability reads both as 'unknown'.
import { QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { errorInfo } from './errors';
import { bootLive, configureLifecycle, initLive } from './lifecycle';
import { queryClient } from './query';
import { reachOf } from './reachability';
import { defineRoute } from './routes';
import { coreSource, SourceError } from './source';
import { boot, calls, onFetch, R1, settle, UID, type Call } from './test/env';
import { removeTestLocks } from './test/locks';
import { resetToken } from './token';

const todos = defineRoute({ method: 'GET', path: '/todos', scope: 'agent', realm: 'realm' });
const botLinks = defineRoute({ method: 'GET', path: '/bot-urls', scope: 'realm' });
const list = defineRoute({ method: 'GET', path: '/computers', scope: 'realm' });
const table = {
  reads: {
    todos: { route: todos },
    links: { route: botLinks },
    computers: { route: list },
  },
};

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
function read(key: string): () => UseQueryResult<unknown, SourceError> {
  let last!: UseQueryResult<unknown, SourceError>;
  const src = coreSource('refusal', table);
  function Probe() { last = src.useQuery<unknown>(key); return null; }
  render(<Probe />, { wrapper: wrap });
  return () => last;
}

afterEach(() => { resetToken(); removeTestLocks(); });

describe('a coreSource read core refused before sending', () => {
  it('an agent read that needs one realm, under All realms: not_sent AGENT_REALM_REQUIRED, nothing sent', async () => {
    boot({ realm: 'all' });
    queryClient.clear();
    const q = read('todos');
    await act(flush);
    const e = q().error;
    expect(e).toBeInstanceOf(SourceError);
    expect(e).toMatchObject({ kind: 'not_sent', code: 'AGENT_REALM_REQUIRED' });
    expect(calls).toHaveLength(0);
    const info = errorInfo(e);
    expect(info).toMatchObject({ outcome: 'not_sent', code: 'AGENT_REALM_REQUIRED' });
    expect(reachOf(e)).toBe('unknown');
  });

  it('a shared link read its token lacks: not_sent TOKEN_LACKS, and the leaf is kept for the words', async () => {
    const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
    const record = JSON.stringify({ v: 1, token: TOKEN, realm: R1, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
    boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: record } });
    resetToken();
    configureLifecycle({ navigate: () => undefined, loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    const perms = { computers: { read: true }, projects: { read: true } };
    onFetch((c: Call) => c.url.endsWith('/api/v1/auth/tokens/me')
      ? { status: 200, body: { data: { token: { id: 'tok1', alias: 'shared-1', realm_ids: [R1], allow_no_realm: false, permissions: perms, expires_at: null } } } }
      : c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : { status: 200, body: { data: [] } });
    await bootLive();
    queryClient.clear();
    const q = read('links');
    await act(flush);
    const e = q().error;
    expect(e).toMatchObject({ kind: 'not_sent', code: 'TOKEN_LACKS', perm: 'resources.bot_urls' });
    expect(calls.filter((c) => c.url.includes('/bot-urls'))).toHaveLength(0);
    expect(errorInfo(e)).toMatchObject({ outcome: 'not_sent', code: 'TOKEN_LACKS', perm: 'resources.bot_urls' });
    expect(reachOf(e)).toBe('unknown');
  });

  it('a stale SourceError and a not_sent one both read as unknown reachability (reachability.ts)', () => {
    expect(reachOf(new SourceError('stale'))).toBe('unknown');
    expect(reachOf(new SourceError('not_sent', 'NO_KIT_URL'))).toBe('unknown');
    // even with a no-answer code, a refusal before sending says nothing about the computer
    expect(reachOf(new SourceError('not_sent', 'NETWORK'))).toBe('unknown');
    // nor with a status no answer gave (reachability.ts:37): a stale or not-sent SourceError is never 'reachable'
    expect(reachOf(new SourceError('stale', 'X', 401))).toBe('unknown');
    expect(reachOf(new SourceError('not_sent', 'TOKEN_LACKS', 403))).toBe('unknown');
    expect(reachOf(new SourceError('forbidden', 'FORBIDDEN', 403))).toBe('reachable');
    expect(reachOf(new SourceError('network', 'NETWORK'))).toBe('unreachable');
  });
});
