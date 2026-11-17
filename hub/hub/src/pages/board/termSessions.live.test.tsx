// Vitest: useLiveSessions keeps an answer only for the read that got it (termSessions.ts contract): leaving a computer
// (another one, none, a stop) drops its answer, coming back shows nothing until a new read answers, and a failed or
// still pending read shows nothing. core's boardSend is driven here: each read waits until the test answers it.
import type * as Core from '@core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from './computers';
import { useLiveSessions } from './termSessions';

interface Pending { readonly id: string; resolve(v: unknown): void; reject(e: unknown): void }
const H = vi.hoisted(() => ({ reads: [] as Pending[] }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    boardSend: ((_kit: unknown, _m: unknown, _p: unknown, o: { target: { container: { id: string } } }) =>
      new Promise((resolve, reject) => { H.reads.push({ id: o.target.container.id, resolve, reject }); })) as unknown as typeof real.boardSend,
  };
});

const pc = (id: string, status = 'running'): BoardComputer => ({ id, name: id, project_id: 'p1', server_name: 's1', status } as BoardComputer);
const row = (n: number) => ({ id: String(n), terminal_id: n, shell: 'bash', is_active: true, daemon_program: false, is_ephemeral: false, client_count: 0 });
const last = (id: string) => [...H.reads].reverse().find((r) => r.id === id)!;
const answer = (id: string, body: unknown) => act(async () => { last(id).resolve(body); await Promise.resolve(); });
const fail = (id: string) => act(async () => { last(id).reject({ code: 'NETWORK' }); await Promise.resolve(); });
const band = (v: ReturnType<typeof useLiveSessions>) => (v ? [...v.band] : null);

beforeEach(() => { H.reads.length = 0; });

describe('useLiveSessions', () => {
  it('shows a read\'s answer, and nothing again after leaving and coming back to the same computer until a new read answers', async () => {
    const A = pc('a');
    const h = renderHook(({ c }) => useLiveSessions(c), { initialProps: { c: A as BoardComputer | null } });
    expect(h.result.current).toBeNull();
    await answer('a', [row(8502)]);
    expect(band(h.result.current)).toEqual([8502]);
    h.rerender({ c: null });
    expect(h.result.current).toBeNull();
    h.rerender({ c: A });
    expect(h.result.current).toBeNull();
    await answer('a', [row(8600)]);
    expect(band(h.result.current)).toEqual([8600]);
  });

  it('A then B then A: the first answer for A never comes back; only the new read of A counts', async () => {
    const h = renderHook(({ c }) => useLiveSessions(c), { initialProps: { c: pc('a') as BoardComputer | null } });
    await answer('a', [row(8502)]);
    h.rerender({ c: pc('b') });
    expect(h.result.current).toBeNull();
    await answer('b', [row(8700)]);
    expect(band(h.result.current)).toEqual([8700]);
    h.rerender({ c: pc('a') });
    expect(h.result.current).toBeNull();
    await answer('a', []);
    expect(band(h.result.current)).toEqual([]);
  });

  it('a replacement read still pending, or one that failed, shows nothing; a stopped computer is not read', async () => {
    const h = renderHook(({ c }) => useLiveSessions(c), { initialProps: { c: pc('a') as BoardComputer | null } });
    await answer('a', [row(8502)]);
    h.rerender({ c: pc('a', 'stopped') });
    expect(h.result.current).toBeNull();
    const before = H.reads.length;
    h.rerender({ c: pc('a') });
    expect(H.reads.length).toBe(before + 1);
    expect(h.result.current).toBeNull();
    await fail('a');
    expect(h.result.current).toBeNull();
  });

  it('an answer that arrives after leaving is dropped', async () => {
    const h = renderHook(({ c }) => useLiveSessions(c), { initialProps: { c: pc('a') as BoardComputer | null } });
    const first = last('a');
    h.rerender({ c: pc('b') });
    await act(async () => { first.resolve([row(8502)]); await Promise.resolve(); });
    expect(h.result.current).toBeNull();
  });
});
