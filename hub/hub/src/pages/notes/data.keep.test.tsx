// Vitest: a list already shown stays when the set of computers changes. Another computer starting, stopping or joining the
// shown set leaves a running computer's list (and the open note's frame with it) as it is, and reads only what has no list.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Api } from './api';
import { useNotes } from './data';
import type { Computer, Loaded } from './types';

const pc = (id: string, state: Computer['state'] = 'running'): Computer => ({ id, projectId: 'p1', name: id, state });
const ok = { state: 'ok', me: {}, recent: { items: [] } } as unknown as Loaded;
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('useNotes keeps a list already shown', () => {
  it('another computer stopping, starting or joining never reads a running computer again nor shows it as being read', async () => {
    const loads: string[] = [];
    const api = { load: async (c: Computer) => { loads.push(c.id); return ok; } } as unknown as Api;
    const h = renderHook(({ shown }) => useNotes(shown, api), { initialProps: { shown: [pc('a'), pc('b')] } });
    await act(flush);
    expect(loads.sort()).toEqual(['a', 'b']);
    const first = h.result.current.loads.a;
    expect(first?.state).toBe('ok');
    loads.length = 0;
    // b stops: a stays as it was, b's list goes.
    h.rerender({ shown: [pc('a'), pc('b', 'stopped')] });
    expect(h.result.current.loads.a).toBe(first);
    await act(flush);
    expect(loads).toEqual([]);
    expect(h.result.current.loads.b).toBeUndefined();
    // b starts again and c joins: only they are read.
    h.rerender({ shown: [pc('a'), pc('b'), pc('c')] });
    expect(h.result.current.loads.a).toBe(first);
    await act(flush);
    expect(loads.sort()).toEqual(['b', 'c']);
    expect(h.result.current.loads.a).toBe(first);
  });

  it('a list whose read is still out when the set changes is read again, never left loading', async () => {
    let release: (v: Loaded) => void = () => {};
    const calls: string[] = [];
    const api = { load: (c: Computer) => { calls.push(c.id); return c.id === 'a' && calls.filter((x) => x === 'a').length === 1 ? new Promise<Loaded>((r) => { release = r; }) : Promise.resolve(ok); } } as unknown as Api;
    const h = renderHook(({ shown }) => useNotes(shown, api), { initialProps: { shown: [pc('a'), pc('b')] } });
    await act(flush);
    expect(h.result.current.loads.a?.state).toBe('loading');
    h.rerender({ shown: [pc('a'), pc('b', 'stopped')] });
    await act(flush);
    // The earlier read answers late: it is not this generation's, so it records nothing; the new read already did.
    await act(async () => { release({ state: 'cantTell' } as Loaded); await flush(); });
    expect(h.result.current.loads.a?.state).toBe('ok');
    expect(calls.filter((x) => x === 'a')).toHaveLength(2);
  });
});
