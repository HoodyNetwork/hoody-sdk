// source.ts SourceResult.retryAfter: a refused send keeps the server's wait, in whole
// seconds, from Retry-After or else the body's data.retry_after, on 'failed' only.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceResult } from './source';
import { boot, onFetch, R1, settle, type Reply } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }

async function send(reply: Reply, n: number): Promise<SourceResult<unknown>> {
  boot({ realm: R1 });
  queryClient.clear();
  const change = defineRoute<unknown, { name: string }>({ method: 'POST', path: '/servers/:id/reboot', scope: 'realm', body: ['name'] });
  onFetch(() => reply);
  const src = coreSource('retryAfter' + n, { reads: {}, changes: { go: { route: change, input: (v: { name: string }) => ({ params: { id: 's1' }, body: v }) } } });
  let m!: ReturnType<typeof src.useMutation<unknown, { name: string }>>;
  function Probe() { m = src.useMutation<unknown, { name: string }>('go'); return null; }
  render(<Probe />, { wrapper: wrap });
  let r!: SourceResult<unknown>;
  await act(async () => { r = await m.mutateAsync({ name: 'a' }); await flush(); });
  return r;
}

describe('SourceResult.retryAfter', () => {
  it('a 429 with Retry-After keeps its seconds', async () => {
    expect(await send({ status: 429, body: { error: 'RATE_LIMITED' }, headers: { 'Retry-After': '30' } }, 1)).toMatchObject({ outcome: 'failed', status: 429, code: 'RATE_LIMITED', retryAfter: 30 });
  });
  it('without the header, the body\'s data.retry_after, rounded up to whole seconds', async () => {
    expect(await send({ status: 429, body: { error: 'COOLDOWN', data: { retry_after: 12.2 } } }, 2)).toMatchObject({ outcome: 'failed', retryAfter: 13 });
  });
  it('the header wins over the body', async () => {
    expect(await send({ status: 429, body: { error: 'COOLDOWN', data: { retry_after: 99 } }, headers: { 'Retry-After': '5' } }, 3)).toMatchObject({ retryAfter: 5 });
  });
  it('a day at most; a negative, non-numeric or missing wait gives none', async () => {
    expect(await send({ status: 429, body: { data: { retry_after: 1e9 } } }, 4)).toMatchObject({ retryAfter: 86400 });
    const bad: readonly (readonly [number, unknown])[] = [[5, -1], [6, '30'], [7, null]];
    for (const [i, retryAfterBody] of bad) {
      const r = await send({ status: 429, body: { data: { retry_after: retryAfterBody } } }, i);
      expect(r.outcome).toBe('failed');
      expect(r).not.toHaveProperty('retryAfter');
    }
    expect(await send({ status: 429, body: {} }, 9)).not.toHaveProperty('retryAfter');
  });
  it('never on a pending answer (it may have applied) or a success', async () => {
    const p = await send({ status: 503, body: { data: { retry_after: 10 } }, headers: { 'Retry-After': '10' } }, 10);
    expect(p.outcome).toBe('pending');
    expect(p).not.toHaveProperty('retryAfter');
    const d = await send({ status: 200, body: { data: { retry_after: 10 } } }, 11);
    expect(d.outcome).toBe('done');
    expect(d).not.toHaveProperty('retryAfter');
  });
});
