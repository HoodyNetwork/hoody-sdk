// Vitest on the live Run now (the real useTrigger, core's real transport): a run bound to the computer it was pressed for
// goes there even after the shell switched to another computer (Try again keeps its computer); an unbound one follows the
// shell, as every page change does.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTarget } from '@core/ctx';
import { CoreQueryProvider, type Target } from '@core';
import { boot, calls, onFetch, R1, settle, TARGET } from '@core/test/env';
import { useTrigger } from './data';

const OTHER: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv2' } };
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const runs = () => calls.filter((c) => c.method === 'POST' && /scriptPath/.test(JSON.stringify(c.body ?? '')));

beforeEach(() => {
  boot({ realm: R1 });
  setTarget(TARGET);
  onFetch(() => ({ status: 200, body: { data: {} } }));
});

describe('Run now: the computer it goes to', () => {
  it('a run bound to its computer goes there after a switch; an unbound one follows the switch', async () => {
    const { result } = renderHook(() => useTrigger(), { wrapper: CoreQueryProvider });
    act(() => setTarget(OTHER));
    await act(async () => { await result.current.mutateAsync({ compId: 'c1', path: 'default/1/job.ts', target: TARGET }); await flush(); });
    await act(async () => { await result.current.mutateAsync({ compId: 'c1', path: 'default/1/other.ts' }); await flush(); });
    const [bound, unbound] = runs();
    expect(bound?.url).toMatch(/c1/);
    expect(bound?.url).not.toMatch(/c2/);
    expect(unbound?.url).toMatch(/c2/);
    expect(runs()).toHaveLength(2);
  });
});
