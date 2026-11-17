// UNREACH-1 through coreSource: a source read keeps kit.ts's `answered` mark (source.ts errorOf), so a read whose
// answer arrived but whose body was lost never reads unreachable; a read nothing answered does.
import { QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { queryClient } from './query';
import { reachOf } from './reachability';
import { defineRoute } from './routes';
import { coreSource, type SourceError } from './source';
import { boot, onFetch, settle } from './test/env';

const probe = defineRoute({ method: 'GET', path: '/unreach-1/source-probe', scope: 'kit', kit: 'files', index: 1, timeoutMs: 1000 });
const src = coreSource('unreach1', { reads: { probe: { route: probe } } });
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const saved = globalThis.fetch;
afterEach(() => { globalThis.fetch = saved; });

async function readOnce(): Promise<SourceError | null> {
  let last!: UseQueryResult<unknown, SourceError>;
  function Probe() { last = src.useQuery<unknown>('probe'); return null; }
  render(<Probe />, { wrapper: wrap });
  for (let i = 0; i < 40 && !last.error; i++) await act(settle);
  return last.error;
}

describe('coreSource keeps the answered mark for reachOf', () => {
  it('no answer: SourceError network NETWORK, unreachable', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 0, network: true }));
    const e = await readOnce();
    expect(e).toMatchObject({ kind: 'network', code: 'NETWORK' });
    expect(reachOf(e)).toBe('unreachable');
  });

  it('an answer arrived, then its body broke: never unreachable', async () => {
    boot();
    queryClient.clear();
    onFetch(() => ({ status: 200, body: {} }));
    const inner = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      await inner(url, init);
      const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('{"a":')); c.error(new TypeError('reset')); } });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const e = await readOnce();
    expect(e).toMatchObject({ kind: 'network' });
    expect(reachOf(e)).toBe('unknown');
  });
});
