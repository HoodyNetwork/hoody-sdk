// useAgentSettings: one operation at a time and one generation. While the reads, a change with its read-back, or a
// Check again run, nothing else starts; an answer from an older generation is dropped; an answer core reports stale
// while the hook stays ends the operation as "may have gone through" (never done or failed) and reads once more.
// Answers are held and released by the test.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type { Target } from '@core';
import { useAgentSettings } from './useAgentSettings';

const W = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  yolo: false,
  hold: false,
  held: [] as Array<{ name: string; go: () => void }>,
  sent: [] as string[],
  calls: [] as string[],
  // The next answers with these names come back stale (their core context ended).
  stale: [] as string[],
  models: [] as Array<Record<string, unknown>>,
  // GET /acp/agents: Claude Code on the computer.
  acp: {} as Record<string, unknown>,
}));

vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  const STALE = { ok: false as const, err: { kind: 'stale' as const, code: '', status: 0, retryAfter: null, details: {} } };
  // A read is a snapshot taken when it is called; held answers are released by the test in any order.
  const answer = (name: string, body: () => unknown) => {
    W.calls.push(name);
    const snap = body();
    const i = W.stale.indexOf(name);
    const out = i >= 0 ? (W.stale.splice(i, 1), STALE) : { ok: true as const, body: snap };
    return new Promise<typeof out>((resolve) => {
      if (W.hold) W.held.push({ name, go: () => resolve(out) });
      else resolve(out);
    });
  };
  const write = (k: string, v: unknown) => {
    W.sent.push(`${k}=${String(v)}`);
    if (k === 'yolo') W.yolo = v as boolean;
    else W.row[k] = v;
    return answer(`write ${k}`, () => ({ status: 'ok' }));
  };
  const fake: CoreMod.agent.AgentApi = {
    session: () => answer('session', () => ({ session: { ...W.row } })),
    approval: () => answer('approval', () => ({ mode: 'default', locked: false, revision: 0, yolo: W.yolo })),
    setEffort: (_id, e) => write('effort', e),
    setVerbosity: (_id, l) => write('verbosity', l),
    setYolo: (_id, on) => write('yolo', on),
    acp: () => answer('acp', () => W.acp),
  };
  return {
    ...real,
    agent: { ...real.agent, agentApi: () => fake },
    providers: {
      ...real.providers,
      providersApi: () => ({
        catalogue: () => answer('catalogue', () => real.providers.catalogue({ providers: [], models: { models: W.models } })),
      }),
    },
  };
});

const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'srv' } } as unknown as Target;
const take = () => W.held.splice(0);
const release = async (xs: Array<{ go: () => void }>) => {
  await act(async () => {
    for (const x of xs) x.go();
    await new Promise((r) => setTimeout(r, 0));
  });
};

beforeEach(() => {
  W.row = { id: 's1', model: 'hoody-ai/hoody-free', verbosity: 'normal' };
  W.yolo = false;
  W.hold = false;
  W.held = [];
  W.sent = [];
  W.calls = [];
  W.stale = [];
  W.models = [{ spec: 'a/one', display_name: 'One' }];
  W.acp = {};
});

async function ready() {
  const h = renderHook(() => useAgentSettings(TARGET, 's1', false));
  await waitFor(() => expect(h.result.current.settings?.yolo).toBe(false));
  await waitFor(() => expect(h.result.current.phase).toBe('done'));
  return h;
}

describe('useAgentSettings: one operation at a time', () => {
  it('while a change runs, no other change, read or check starts', async () => {
    const h = await ready();
    W.hold = true;
    act(() => h.result.current.save({ field: 'yolo', value: true }));
    expect(h.result.current.busy).toBe(true);
    W.calls = [];
    act(() => h.result.current.save({ field: 'verbosity', value: 'terse' }));
    act(() => h.result.current.retry());
    let checked = true;
    await act(async () => {
      checked = await h.result.current.check('yolo');
    });
    expect(checked).toBe(false);
    expect(W.calls).toEqual([]);
    expect(W.sent).toEqual(['yolo=true']);
    await release(take());
    await release(take());
    await waitFor(() => expect(h.result.current.fields.yolo?.kind).toBe('done'));
    expect(h.result.current).toMatchObject({ busy: false, settings: { yolo: true } });
  });

  it('a second Check again cannot start while one runs, so an older check never overwrites a newer outcome', async () => {
    const h = await ready();
    W.hold = true;
    act(() => h.result.current.save({ field: 'yolo', value: true }));
    W.yolo = false; // the change has not shown yet
    await release(take());
    await release(take());
    await waitFor(() => expect(h.result.current.fields.yolo?.kind).toBe('pending'));
    let first!: Promise<boolean>;
    act(() => {
      first = h.result.current.check('yolo');
    });
    const firstReads = take(); // snapshot: still off
    W.yolo = true;
    let second = true;
    await act(async () => {
      second = await h.result.current.check('yolo');
    });
    expect(second).toBe(false);
    expect(take()).toEqual([]);
    await release(firstReads);
    expect(await first).toBe(false);
    expect(h.result.current.fields.yolo?.kind).toBe('pending');
    // Now a check may run, and it proves the change.
    W.hold = false;
    let third = false;
    await act(async () => {
      third = await h.result.current.check('yolo');
    });
    expect(third).toBe(true);
    expect(h.result.current.fields.yolo?.kind).toBe('done');
    expect(W.sent).toEqual(['yolo=true']);
  });
});

describe('useAgentSettings: stale answers while the hook stays', () => {
  it('a stale read-back never leaves the field running: it may have gone through, Check again proves it', async () => {
    const h = await ready();
    W.stale = ['session'];
    act(() => h.result.current.save({ field: 'yolo', value: true }));
    await waitFor(() => expect(h.result.current.fields.yolo?.kind).toBe('pending'));
    await waitFor(() => expect(h.result.current.busy).toBe(false));
    // The reads ran once more and show the change.
    expect(h.result.current.settings?.yolo).toBe(true);
    let ok = false;
    await act(async () => {
      ok = await h.result.current.check('yolo');
    });
    expect(ok).toBe(true);
    expect(h.result.current.fields.yolo?.kind).toBe('done');
    expect(W.sent).toEqual(['yolo=true']);
  });

  it('a stale write answer is pending, never failed or done, and nothing is resent', async () => {
    const h = await ready();
    W.stale = ['write verbosity'];
    act(() => h.result.current.save({ field: 'verbosity', value: 'terse' }));
    await waitFor(() => expect(h.result.current.fields.verbosity?.kind).toBe('pending'));
    await waitFor(() => expect(h.result.current.busy).toBe(false));
    expect(W.sent).toEqual(['verbosity=terse']);
  });
});

describe('useAgentSettings: one generation', () => {
  it('Retry does not start while the first reads run, so an older catalogue never replaces a newer one', async () => {
    W.hold = true;
    const h = renderHook(() => useAgentSettings(TARGET, 's1', false));
    const first = take();
    act(() => h.result.current.retry());
    expect(take()).toEqual([]);
    await release(first);
    await waitFor(() => expect(h.result.current.cat?.models.map((m) => m.spec)).toEqual(['a/one']));
    W.models = [{ spec: 'a/two', display_name: 'Two' }];
    act(() => h.result.current.retry());
    await release(take());
    await waitFor(() => expect(h.result.current.cat?.models.map((m) => m.spec)).toEqual(['a/two']));
  });

  it('a change\'s read-back replaces what an earlier read showed (that read finished first)', async () => {
    const h = await ready();
    act(() => h.result.current.save({ field: 'verbosity', value: 'minimal' }));
    await waitFor(() => expect(h.result.current.fields.verbosity?.kind).toBe('done'));
    act(() => h.result.current.save({ field: 'yolo', value: true }));
    await waitFor(() => expect(h.result.current.fields.yolo?.kind).toBe('done'));
    expect(h.result.current.settings).toMatchObject({ verbosity: 'minimal', yolo: true });
  });

  it('a new conversation drops every answer of the old one, the catalogue included', async () => {
    const h = renderHook(({ s }) => useAgentSettings(TARGET, s, false), { initialProps: { s: 's1' } });
    await waitFor(() => expect(h.result.current.phase).toBe('done'));
    W.hold = true;
    act(() => h.result.current.save({ field: 'yolo', value: true }));
    const old = take();
    W.row = { id: 's2', model: 'x/y', verbosity: 'concise' };
    W.yolo = false;
    W.models = [{ spec: 'b/new', display_name: 'New' }];
    h.rerender({ s: 's2' });
    const fresh = take();
    await release(fresh);
    await waitFor(() => expect(h.result.current.settings?.id).toBe('s2'));
    await release(old);
    await release(take()); // anything the old answer would have started
    expect(h.result.current.fields.yolo).toBeNull();
    expect(h.result.current.settings).toMatchObject({ id: 's2', verbosity: 'concise', yolo: false });
    expect(h.result.current.cat?.models.map((m) => m.spec)).toEqual(['b/new']);
  });

  it('the first reads of another computer drop an older catalogue that answers late', async () => {
    const T2 = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'srv' } } as unknown as Target;
    W.hold = true;
    const h = renderHook(({ t }) => useAgentSettings(t, 's1', false), { initialProps: { t: TARGET } });
    const old = take();
    W.models = [{ spec: 'b/new', display_name: 'New' }];
    h.rerender({ t: T2 });
    await release(take());
    await waitFor(() => expect(h.result.current.cat?.models.map((m) => m.spec)).toEqual(['b/new']));
    await release(old);
    expect(h.result.current.cat?.models.map((m) => m.spec)).toEqual(['b/new']);
  });
});

// The same guards with Claude Code read too (claudeCode=true): its read is one of the reads' operation, and its
// answer from an older computer is dropped like the catalogue's.
describe('useAgentSettings: the Claude Code read', () => {
  const claudeOn = (models: string[]) => ({ report: { agents: [{ name: 'claude', enabled: true, startable: true }] }, claude_code: { models } });
  const ids = (h: { result: { current: ReturnType<typeof useAgentSettings> } }) => h.result.current.claude?.models.map((m) => m.id);

  it('Retry does not start while the Claude Code read still runs, after the other reads answered', async () => {
    W.hold = true;
    W.acp = claudeOn(['claude-opus-5-5']);
    const h = renderHook(() => useAgentSettings(TARGET, 's1', true));
    const first = take();
    expect(first.map((x) => x.name).sort()).toEqual(['acp', 'approval', 'catalogue', 'session']);
    await release(first.filter((x) => x.name !== 'acp'));
    await waitFor(() => expect(h.result.current.phase).toBe('done'));
    expect(h.result.current.busy).toBe(true);
    act(() => h.result.current.retry());
    expect(take()).toEqual([]);
    await release(first.filter((x) => x.name === 'acp'));
    await waitFor(() => expect(h.result.current.busy).toBe(false));
    expect(ids(h)).toEqual(['claude-opus-5-5']);
    act(() => h.result.current.retry());
    expect(take().map((x) => x.name)).toContain('acp');
  });

  it('a catalogue read still out, with the Claude Code and conversation reads answered: busy stays true (one operation) but busyNoCat is false and the catalogue is reading', async () => {
    W.hold = true;
    W.acp = claudeOn(['claude-opus-5-5']);
    const h = renderHook(() => useAgentSettings(TARGET, 's1', true));
    const first = take();
    expect(h.result.current).toMatchObject({ busy: true, busyNoCat: true, catalogueReading: true });
    await release(first.filter((x) => x.name !== 'catalogue'));
    await waitFor(() => expect(ids(h)).toEqual(['claude-opus-5-5']));
    await waitFor(() => expect(h.result.current.busyNoCat).toBe(false));
    expect(h.result.current).toMatchObject({ busy: true, catalogueReading: true, claudeReading: false });
    // Another operation still waits for the catalogue read (one thing at a time).
    act(() => h.result.current.retry());
    expect(take()).toEqual([]);
    await release(first.filter((x) => x.name === 'catalogue'));
    await waitFor(() => expect(h.result.current).toMatchObject({ busy: false, busyNoCat: false, catalogueReading: false }));
  });

  it('with no conversation and no Claude Code, the catalogue read is the only operation: busyNoCat is false from the start', async () => {
    W.hold = true;
    const h = renderHook(() => useAgentSettings(TARGET, null, false));
    const first = take();
    expect(h.result.current).toMatchObject({ busy: true, busyNoCat: false, catalogueReading: true });
    await release(first);
    await waitFor(() => expect(h.result.current).toMatchObject({ busy: false, busyNoCat: false, catalogueReading: false }));
  });

  it('a change in flight is busyNoCat too (only a catalogue read that is the last thing running is exempt)', async () => {
    const h = await ready();
    W.hold = true;
    act(() => h.result.current.save({ field: 'verbosity', value: 'terse' }));
    expect(h.result.current).toMatchObject({ busy: true, busyNoCat: true });
    // The write answers, then its read-back is held too: released in turn.
    await release(take());
    await waitFor(() => expect(W.held.length).toBeGreaterThan(0));
    await release(take());
    await waitFor(() => expect(h.result.current.busy).toBe(false));
  });

  it('retryClaude reads Claude Code\'s set alone, while the catalogue read is still out: no catalogue, conversation or approval read, no change; one at a time', async () => {
    W.hold = true;
    W.acp = { report: { agents: [] } };
    const h = renderHook(() => useAgentSettings(TARGET, 's1', true));
    const first = take();
    await release(first.filter((x) => x.name !== 'catalogue'));
    await waitFor(() => expect(h.result.current.claudeReading).toBe(false));
    expect(h.result.current.claude?.state).toBe('absent');
    W.calls = [];
    W.acp = claudeOn(['claude-opus-5-5']);
    act(() => h.result.current.retryClaude());
    expect(h.result.current.claudeReading).toBe(true);
    // A second press while that read is out starts nothing.
    act(() => h.result.current.retryClaude());
    const held = take();
    expect(held.map((x) => x.name)).toEqual(['acp']);
    expect(W.calls).toEqual(['acp']);
    expect(W.sent).toEqual([]);
    await release(held);
    await waitFor(() => expect(ids(h)).toEqual(['claude-opus-5-5']));
    expect(h.result.current.claudeReading).toBe(false);
    await release(first.filter((x) => x.name === 'catalogue'));
    await waitFor(() => expect(h.result.current.busy).toBe(false));
  });

  it('retryClaude does nothing while the reads\' own Claude request is out; the reads\' answer then stands', async () => {
    W.hold = true;
    W.acp = claudeOn(['claude-old-1']);
    const h = renderHook(() => useAgentSettings(TARGET, 's1', true));
    const first = take();
    W.acp = claudeOn(['claude-new-1']);
    act(() => h.result.current.retryClaude());
    // The reads' own Claude request is still out: retryClaude does nothing then.
    expect(take()).toEqual([]);
    await release(first.filter((x) => x.name === 'acp'));
    await waitFor(() => expect(ids(h)).toEqual(['claude-old-1']));
    await release(first.filter((x) => x.name !== 'acp'));
    await waitFor(() => expect(h.result.current.busy).toBe(false));
    act(() => h.result.current.retryClaude());
    const second = take();
    expect(second.map((x) => x.name)).toEqual(['acp']);
    await release(second);
    await waitFor(() => expect(ids(h)).toEqual(['claude-new-1']));
  });

  it('an older Claude Code answer (retryClaude\'s) arriving after a newer full read\'s is dropped', async () => {
    W.acp = claudeOn(['claude-old-1']);
    const h = renderHook(() => useAgentSettings(TARGET, 's1', true));
    await waitFor(() => expect(h.result.current).toMatchObject({ busy: false, busyNoCat: false }));
    expect(ids(h)).toEqual(['claude-old-1']);
    // retryClaude's request goes out (held) with the old answer; a full read then asks again and gets the new one.
    W.hold = true;
    act(() => h.result.current.retryClaude());
    const older = take();
    expect(older.map((x) => x.name)).toEqual(['acp']);
    W.acp = claudeOn(['claude-new-1']);
    act(() => h.result.current.retry());
    const newer = take();
    expect(newer.map((x) => x.name)).toContain('acp');
    // The newer request answers first, then the older one: the older never replaces it.
    await release(newer);
    await waitFor(() => expect(ids(h)).toEqual(['claude-new-1']));
    await release(older);
    await waitFor(() => expect(h.result.current.claudeReading).toBe(false));
    expect(ids(h)).toEqual(['claude-new-1']);
    await waitFor(() => expect(h.result.current.busy).toBe(false));
  });

  it("an older computer's Claude Code answer, arriving after the new computer's, is dropped", async () => {
    const T2 = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'srv' } } as unknown as Target;
    W.hold = true;
    W.acp = claudeOn(['claude-old-1']);
    const h = renderHook(({ t }) => useAgentSettings(t, null, true), { initialProps: { t: TARGET } });
    const old = take();
    W.acp = claudeOn(['claude-new-1']);
    h.rerender({ t: T2 });
    await release(take());
    await waitFor(() => expect(ids(h)).toEqual(['claude-new-1']));
    await release(old);
    expect(ids(h)).toEqual(['claude-new-1']);
    expect(h.result.current.claude?.state).toBe('ready');
  });
});
