// Vitest: outside fixture mode a row's history answer belongs to that row. On the render after
// the inspector switches to another row, the old row's runs never read as the new row's (pending instead), and an old
// answer that lands late is dropped.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { useHistory } from './data';
import type { SchedRow } from './logic';

const calls = vi.hoisted(() => [] as { entry: string; answer: (v: unknown) => void }[]);
vi.mock('@core', async (orig) => ({
  ...(await orig<typeof Core>()),
  fixtureModeActive: () => false,
  useCore: () => ({ gen: 1 }),
  useCurrentComputer: () => null,
  capture: () => ({}),
  api: (_route: unknown, input: { query: { entry_id: string } }) =>
    new Promise((answer) => {
      calls.push({ entry: input.query.entry_id, answer });
    }),
}));

afterEach(() => {
  calls.length = 0;
});

const row = (entry: string): SchedRow => ({ key: `cron:${entry}`, src: 'cron', ref: { user: 'user', entry }, can: { history: true } }) as unknown as SchedRow;
const runs = (id: string) => ({ runs: [{ run_id: id, started_at: '2026-10-25T08:00:00Z', status: 'done', exit_code: 1 }] });

// Every render's answer, with the row it was rendered for: the committed renders are what a person can see.
const seen: { key: string; id: string | undefined; pending: boolean }[] = [];
const mount = () =>
  renderHook(
    ({ r }) => {
      const h = useHistory(r);
      seen.push({ key: r.key, id: h.data?.runs[0]?.id, pending: h.isPending });
      return h;
    },
    { initialProps: { r: row('a') } },
  );
afterEach(() => {
  seen.length = 0;
});

describe('useHistory (live): an answer belongs to its row', () => {
  it('reads each row once, and no render for the next row shows the old runs', async () => {
    const { result, rerender } = mount();
    expect(calls.map((c) => c.entry)).toEqual(['a']);
    await act(async () => calls[0]!.answer(runs('run-of-a')));
    expect(result.current.data?.runs[0]?.id).toBe('run-of-a');
    rerender({ r: row('b') });
    expect(calls.map((c) => c.entry)).toEqual(['a', 'b']);
    const forB = seen.filter((x) => x.key === 'cron:b');
    expect(forB.length).toBeGreaterThan(0);
    expect(forB.every((x) => x.id === undefined && x.pending)).toBe(true);
    await act(async () => calls[1]!.answer(runs('run-of-b')));
    expect(result.current.data?.runs[0]?.id).toBe('run-of-b');
  });

  it('drops a late answer of the row it left', async () => {
    const { result, rerender } = mount();
    rerender({ r: row('b') });
    await act(async () => calls[0]!.answer(runs('run-of-a')));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
    await act(async () => calls[1]!.answer(runs('run-of-b')));
    expect(result.current.data?.runs[0]?.id).toBe('run-of-b');
    expect(seen.filter((x) => x.key === 'cron:b').some((x) => x.id === 'run-of-a')).toBe(false);
  });
});
