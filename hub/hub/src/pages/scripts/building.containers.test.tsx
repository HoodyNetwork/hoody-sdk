// Vitest over core's real request path, only the network replaced: Being built's computers read (useContainersRead)
// sends GET /computers while the section is shown, and nothing while it is not (the New script view).
import { CoreQueryProvider, queryClient } from '@core';
import { act, renderHook, waitFor } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, calls, onFetch, R1, type Call, type Reply } from '@core/test/env';

vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), fixtureModeActive: () => false }));

import { useContainersRead } from './data';

const lists = (): Call[] => calls.filter((c) => c.method === 'GET' && new URL(c.url).pathname.endsWith('/computers'));

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch((c): Reply => (c.method === 'GET' && new URL(c.url).pathname.endsWith('/computers')
    ? { status: 200, body: { data: { computers: [] } } }
    : { status: 404, body: { code: 'not_found' } }));
});

describe("Being built's computers read", () => {
  it('sends nothing while the section is not shown, and reads once it is', async () => {
    const r = renderHook(({ on }: { on: boolean }) => useContainersRead(on), { wrapper: CoreQueryProvider, initialProps: { on: false } });
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
    expect(lists()).toHaveLength(0);
    r.rerender({ on: true });
    await waitFor(() => expect(lists().length).toBeGreaterThan(0));
  });
});
