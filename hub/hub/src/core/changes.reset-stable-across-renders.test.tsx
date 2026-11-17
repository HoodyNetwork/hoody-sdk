// coreSource's reset() keeps one identity across renders, as TanStack's own
// reset does, for a secret route and for any other route, so a page may list it in an effect's dependencies.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceMutation } from './source';
import { boot, onFetch, R1, settle } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 30; i++) await settle(); }
function harness<T>(use: () => T): { current: () => T } {
  let last!: T;
  function Probe() { last = use(); return null; }
  render(<Probe />, { wrapper: wrap });
  return { current: () => last };
}

afterEach(() => { cleanup(); });

type Vars = { pin: string; name: string };
for (const secret of [true, false]) {
  describe(`reset() is stable across renders (${secret ? 'secret': 'plain'} route)`, () => {
    const route = defineRoute<unknown, Vars>({ method: 'POST', path: `/p5/${secret ? 's' : 'p'}`, scope: 'agent', body: ['pin', 'name'], ...(secret ? { secret: true } : {}) });
    const src = coreSource(`p5reset${secret ? 's' : 'p'}`, { changes: { put: { route, input: (v: Vars) => ({ body: v }), lockKey: (v: Vars) => ({ name: v.name }) } } });

    it('the same function before a send, while it is pending, after it settles and after reset()', async () => {
      boot({ realm: R1 });
      queryClient.clear();
      onFetch(async () => ({ status: 200, body: { ok: true } }));
      const h = harness(() => src.useMutation<unknown, Vars>('put') as SourceMutation<unknown, Vars>);
      const first = h.current().reset;
      let p!: Promise<unknown>;
      await act(async () => { p = h.current().mutateAsync({ pin: '1', name: 'a' }); });
      expect(h.current().reset).toBe(first);
      await act(async () => { await p; await flush(); });
      expect(h.current().isSuccess).toBe(true);
      expect(h.current().reset).toBe(first);
      act(() => { h.current().reset(); });
      expect(h.current().isIdle).toBe(true);
      expect(h.current().reset).toBe(first);
    });
  });
}
