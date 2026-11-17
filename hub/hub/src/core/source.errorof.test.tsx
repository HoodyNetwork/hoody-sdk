// How a coreSource read's rejection becomes its SourceError, shape by
// shape. api() is stood in so each rejection core can give a read is checked on its own: a refusal before sending is
// not_sent (code and a token's leaf kept); a dead context, a cancel and a stale answer stay 'stale'.
import { QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from './api';

const rejectWith = vi.hoisted(() => ({ value: {} as unknown, onAbort: false, aborted: false }));
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof ApiModule>()),
  api: (_route: unknown, input: { signal: AbortSignal }) => (rejectWith.onAbort
    ? new Promise((_ok, no) => input.signal.addEventListener('abort', () => { rejectWith.aborted = true; no(rejectWith.value); }))
    : Promise.reject(rejectWith.value)),
}));

import { errorInfo } from './errors';
import { queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceError } from './source';
import { boot, R1, settle } from './test/env';

const list = defineRoute({ method: 'GET', path: '/computers', scope: 'realm' });
const src = coreSource('errorof', { reads: { computers: { route: list } } });
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

async function errorFor(rejection: unknown): Promise<SourceError | null> {
  rejectWith.value = rejection;
  queryClient.clear();
  let last!: UseQueryResult<unknown, SourceError>;
  function Probe() { last = src.useQuery<unknown>('computers'); return null; }
  render(<Probe />, { wrapper: wrap });
  await act(async () => { for (let i = 0; i < 20; i++) await settle(); });
  return last.error;
}

beforeEach(() => boot({ realm: R1 }));

describe('coreSource read rejections', () => {
  it('a refusal before sending (api refusal(): kind not_sent, notSent): not_sent with its code', async () => {
    const e = await errorFor({ kind: 'not_sent', code: 'AGENT_REALM_REQUIRED', notSent: true });
    expect(e).toMatchObject({ kind: 'not_sent', code: 'AGENT_REALM_REQUIRED', status: null, perm: null });
    expect(errorInfo(e).outcome).toBe('not_sent');
  });
  it('a kit-io refusal (kind not_sent, status 0, notSent): not_sent with its code', async () => {
    const e = await errorFor({ kind: 'not_sent', status: 0, code: 'NO_KIT_URL', notSent: true });
    expect(e).toMatchObject({ kind: 'not_sent', code: 'NO_KIT_URL' });
  });
  it('notSent alone, with no kind: not_sent', async () => {
    expect(await errorFor({ notSent: true, code: 'TICKET_REFUSED' })).toMatchObject({ kind: 'not_sent', code: 'TICKET_REFUSED' });
  });
  it("a token's missing leaf rides along, a leaf routePerms.ts knows only in errorInfo", async () => {
    const e = await errorFor({ kind: 'not_sent', code: 'TOKEN_LACKS', notSent: true, perm: 'resources.bot_urls' });
    expect(e).toMatchObject({ kind: 'not_sent', code: 'TOKEN_LACKS', perm: 'resources.bot_urls' });
    expect(errorInfo(e).perm).toBe('resources.bot_urls');
    expect((await errorFor({ kind: 'not_sent', notSent: true, perm: 42 }))?.perm).toBeNull();
  });
  it('a dead context (api gone(): kind not_sent with stale) stays stale', async () => {
    const e = await errorFor({ kind: 'not_sent', stale: true, notSent: true });
    expect(e).toMatchObject({ kind: 'stale' });
    expect(errorInfo(e).outcome).toBe('stale');
  });
  it('a session that ended before sending (api gone(): superseded, not_sent) stays stale; sent, it stays an answered 401', async () => {
    const e = await errorFor({ status: 401, superseded: true, kind: 'not_sent', notSent: true });
    expect(e).toMatchObject({ kind: 'stale', status: 401 });
    expect(errorInfo(e).outcome).toBe('stale');
    expect(await errorFor({ status: 401, superseded: true })).toMatchObject({ kind: 'forbidden', status: 401 });
  });
  it("a caller's abort before sending (kit notSentRejection, kit-io refused) stays stale", async () => {
    expect(await errorFor({ kind: 'not_sent', status: 0, code: 'aborted', notSent: true })).toMatchObject({ kind: 'stale' });
    expect(await errorFor({ kind: 'aborted', status: 0, code: 'aborted', notSent: true })).toMatchObject({ kind: 'stale' });
  });
  it('a dropped answer (kind stale) and a stale flag stay stale', async () => {
    expect(await errorFor({ kind: 'stale' })).toMatchObject({ kind: 'stale' });
    expect(await errorFor({ stale: true, status: 200 })).toMatchObject({ kind: 'stale' });
  });
  it('a cancelled read stays stale, sent or not', async () => {
    expect(await errorFor({ cancelled: true })).toMatchObject({ kind: 'stale' });
    expect(await errorFor({ cancelled: true, notSent: true, kind: 'not_sent' })).toMatchObject({ kind: 'stale' });
  });
  it("a read whose own signal aborted shows no error at all: the query discards it, a secret route's bare refusal included", async () => {
    // api()'s bareRejection clears a secret route's unlisted code, so such an abort rejects as a plain refusal. Only the
    // query's own cancel aborts this signal, and the query drops what the read rejects with after that.
    rejectWith.value = { kind: 'not_sent', status: 0, code: null, notSent: true };
    rejectWith.onAbort = true;
    rejectWith.aborted = false;
    queryClient.clear();
    let last!: UseQueryResult<unknown, SourceError>;
    function Probe() { last = src.useQuery<unknown>('computers'); return null; }
    try {
      render(<Probe />, { wrapper: wrap });
      await act(async () => { for (let i = 0; i < 5; i++) await settle(); });
      await act(async () => { await queryClient.cancelQueries(); for (let i = 0; i < 20; i++) await settle(); });
      expect(rejectWith.aborted).toBe(true);
      expect(last.error).toBeNull();
      expect(last.fetchStatus).toBe('idle');
    } finally { rejectWith.onAbort = false; }
  });
  it('answered failures keep their classes', async () => {
    expect(await errorFor({ kind: 'private', status: 403, code: 'FORBIDDEN' })).toMatchObject({ kind: 'forbidden', status: 403 });
    expect(await errorFor({ kind: 'unreachable', status: 0, code: 'NETWORK' })).toMatchObject({ kind: 'network' });
    expect(await errorFor({ status: 404, code: 'NOT_FOUND' })).toMatchObject({ kind: 'not_found' });
    expect(await errorFor({ status: 500 })).toMatchObject({ kind: 'server' });
  });
});
