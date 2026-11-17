// Vitest: the shared Run now (parts/runScript.ts,
// used by the list and the Overview's Schedule card) at core's real transport, with the real useTrigger. Counted here are the
// requests that reach the network, never mutateAsync calls:
// - a first press whose answer never comes (502) is pending, and a second press is refused unsent while the kit holds the first
//   one: ONE request, then the checking toast;
// - a script whose computer is not the one the shell shows is refused unsent: no request;
// - Try again after a refusal goes to the computer of the first press, even after the shell switched to another one.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { CoreQueryProvider, type Target } from '@core';
import { boot, calls, onFetch, R1, settle, TARGET } from '@core/test/env';
import strings from './strings.en.json';

type Shown = { tone?: string; title: string; body?: string; action?: { label: string; onAction: () => void }; retry?: { onAction: () => void } };
const shown = vi.hoisted(() => [] as Shown[]);
vi.mock('@kit', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useGo: () => () => undefined,
  showToast: (c: Shown) => { shown.push(c); return 'toast'; },
  showErrorToast: (title: string, _r: unknown, o?: { retry?: { onAction: () => void } }) => { shown.push({ tone: 'error', title, ...(o?.retry ? { retry: o.retry } : {}) }); return 'toast-e'; },
}));

import { useRunScript } from './parts/runScript';

const OTHER: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv2' } };
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const runs = () => calls.filter((c) => c.method === 'POST' && /scriptPath/.test(JSON.stringify(c.body ?? '')));
const JOB = { compId: 'c1', compHandle: 'atlas', path: 'default/1/job.ts' };

beforeEach(() => {
  shown.length = 0;
  boot({ realm: R1 });
  setTarget(TARGET);
});

describe('Run now at the transport', () => {
  it('a first send with no answer is pending; a second press while it is held sends nothing and says it is still being checked', async () => {
    onFetch(() => ({ status: 502, body: {} }));
    const { result } = renderHook(() => useRunScript(), { wrapper: CoreQueryProvider });
    await act(async () => { result.current(JOB); await flush(); });
    expect(runs()).toHaveLength(1);
    expect(shown[0]).toMatchObject({ tone: 'unknown', title: strings['run.pending'] });
    await act(async () => { result.current(JOB); await flush(); });
    expect(runs()).toHaveLength(1);
    expect(shown[1]).toMatchObject({ tone: 'unknown', title: strings['run.checking'], body: strings['run.checkingBody'] });
  });

  it('a script whose computer is not the one the shell shows is refused unsent', async () => {
    onFetch(() => ({ status: 200, body: { data: {} } }));
    const { result } = renderHook(() => useRunScript(), { wrapper: CoreQueryProvider });
    act(() => setTarget(OTHER));
    await act(async () => { result.current(JOB); await flush(); });
    expect(runs()).toHaveLength(0);
    expect(shown[0]).toMatchObject({ tone: 'info', title: strings['run.failed'], body: strings['run.notShown'] });
  });

  it('Try again after a refusal goes to the computer of the first press, after the shell switched', async () => {
    onFetch(() => ({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'no' } } }));
    const { result } = renderHook(() => useRunScript(), { wrapper: CoreQueryProvider });
    await act(async () => { result.current(JOB); await flush(); });
    expect(runs()).toHaveLength(1);
    const again = shown[0]?.retry ?? shown[0]?.action;
    if (!again) throw new Error(`no Try again on ${JSON.stringify(shown[0])}`);
    act(() => setTarget(OTHER));
    onFetch(() => ({ status: 200, body: { data: {} } }));
    await act(async () => { again.onAction(); await flush(); });
    expect(runs()).toHaveLength(2);
    expect(runs()[1]?.url).toMatch(/c1/);
    expect(runs()[1]?.url).not.toMatch(/c2/);
    expect(shown.at(-1)).toMatchObject({ tone: 'ok', title: strings['run.started'] });
  });
});
