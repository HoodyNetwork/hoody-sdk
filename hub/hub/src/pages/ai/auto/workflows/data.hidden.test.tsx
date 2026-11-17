// Whether a listed workflow is hidden is read only on an agent that reports the
// workflow_hidden capability (GET /version); absent, reported unavailable, still loading or a failed version read all
// read as today (no row says hidden).
import { act, renderHook } from '@testing-library/react';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, onFetch, settle, R1 } from '@core/test/env';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkflowHiddenCap, useWorkflowList } from './data';

const path = (u: string) => new URL(u).pathname;
const LIST = { items: [{ name: 'shown', system: true }, { name: 'gone', system: true, hidden: true }] };
let version: unknown = null;

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  version = null;
  onFetch((c) => {
    const p = path(c.url);
    if (p.endsWith('/agent/version')) return version === 'fail' ? { status: 500, body: { error: 'boom', code: 'internal' } } : { status: 200, body: version };
    if (p.endsWith('/agent/workflows')) return { status: 200, body: LIST };
    return { status: 404, body: { error: 'not here', code: 'not_found' } };
  });
});

const caps = (o: Record<string, unknown>) => ({ capabilities: [{ name: 'workflow_hidden', supported: true, ...o }] });
async function read() {
  const h = renderHook(() => ({ cap: useWorkflowHiddenCap(), list: useWorkflowList(R1) }), { wrapper: CoreQueryProvider });
  for (let i = 0; i < 10; i++) await act(async () => { await settle(); });
  return h;
}

describe('workflows: the workflow_hidden capability', () => {
  it('reported available: the rows say which workflow is hidden', async () => {
    version = caps({ available: true });
    const h = await read();
    expect(h.result.current.cap).toBe(true);
    expect(h.result.current.list.data?.map((w) => [w.name, w.hidden])).toEqual([['shown', false], ['gone', true]]);
  });

  it('absent, reported unavailable, or a failed version read: no row says hidden, even one the agent marks', async () => {
    for (const v of [{ capabilities: [] }, caps({ available: false }), caps({ supported: false }), 'fail']) {
      queryClient.clear();
      version = v;
      const h = await read();
      expect(h.result.current.cap).toBe(false);
      expect(h.result.current.list.data?.map((w) => w.name)).toEqual(['shown', 'gone']);
      for (const w of h.result.current.list.data ?? []) expect(w).not.toHaveProperty('hidden');
      h.unmount();
    }
  });
});
