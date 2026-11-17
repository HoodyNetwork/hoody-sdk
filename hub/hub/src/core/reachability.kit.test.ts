// The kit.ts `answered` mark: through the real send leg, a computer that never answered reads
// unreachable, one whose answer arrived but whose body was lost does not.
import { afterEach, describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { reachOf } from './reachability';
import { defineRoute } from './routes';
import { boot, onFetch } from './test/env';

const read = defineRoute({ method: 'GET', path: '/unreach-1/probe', scope: 'kit', kit: 'files', index: 1, timeoutMs: 1000 });
const fail = (p: Promise<unknown>) => p.then(() => { throw new Error('resolved'); }, (e: HubError) => e);
const saved = globalThis.fetch;
afterEach(() => { globalThis.fetch = saved; });

/** A fetch whose answer arrives (headers, status 200) and whose body then breaks or never ends. */
function answerThen(body: 'breaks' | 'hangs'): void {
  const inner = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    await inner(url, init); // keeps the env's call log
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"a":'));
        if (body === 'breaks') c.error(new TypeError('connection reset'));
        else init?.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

describe('kit.ts answered mark, read by reachOf', () => {
  it('no answer at all: not answered, unreachable', async () => {
    boot();
    onFetch(() => ({ status: 0, network: true }));
    const e = await fail(api(read));
    expect(e).toMatchObject({ kind: 'unreachable', status: 0, code: 'NETWORK' });
    expect((e as { answered?: unknown }).answered).toBeUndefined();
    expect(reachOf(e)).toBe('unreachable');
  });

  it('an answer arrived, then its body broke: answered, never unreachable', async () => {
    boot();
    onFetch(() => ({ status: 200, body: {} }));
    answerThen('breaks');
    const e = await fail(api(read));
    expect(e).toMatchObject({ kind: 'unreachable', status: 0, code: 'NETWORK', answered: true });
    expect(reachOf(e)).toBe('unknown');
  });

  it('an answer arrived, then its body outlasted the timeout: answered TIMEOUT, never unreachable', async () => {
    boot();
    onFetch(() => ({ status: 200, body: {} }));
    answerThen('hangs');
    const e = await fail(api(read));
    expect(e).toMatchObject({ kind: 'unreachable', status: 0, code: 'TIMEOUT', answered: true });
    expect(reachOf(e)).toBe('unknown');
  });

  it('no answer before the timeout: not answered, unreachable', async () => {
    boot();
    onFetch(() => ({ status: 200, body: {}, delayMs: 5000 }));
    const e = await fail(api(read));
    expect(e).toMatchObject({ kind: 'unreachable', status: 0, code: 'TIMEOUT' });
    expect((e as { answered?: unknown }).answered).toBeUndefined();
    expect(reachOf(e)).toBe('unreachable');
  });
});
