// Vitest (New script): Build it's own rules, at the hook. A fix is sent with its literal secrets masked
// and applied only with this tab's map; the next attempt follows the attempt this tab holds, never one another tab moved
// on to; "start a new one anyway" ends the old attempt only once the new one is admitted; an answer is applied only while
// the stored record still names it after attemptUsable's own awaits; Build again over edited code asks once first.
import { act, render, renderHook, screen, userEvent, waitFor } from '@app/testing';
import type { DraftRecord } from '@core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type * as Records from './records';

type Answer = { outcome: string; data?: { reply: string }; code?: string };
const io = vi.hoisted(() => ({
  starts: [] as Array<{ n: number; text: string; values: unknown }>,
  ends: new Map<number, (a: Answer) => void>(),
  cancel: (): Promise<boolean | 'unknown'> => Promise.resolve(true),
  discards: [] as number[],
  afterUsable: null as null | (() => Promise<void>),
  afterNext: null as null | (() => void),
  failRetain: false,
  checkAnswer: null as Answer | null,
  storedPrompt: 'unreadable' as { text: string } | 'none' | 'unreadable',
}));

// The retention write (attemptUsable's move to retained = n) can be refused by the store, as a full one does.
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return { ...real, putDraftRecord: (rec: DraftRecord, prev: DraftRecord | null) => (io.failRetain && prev && rec.retained !== prev.retained ? Promise.resolve('full' as const) : real.putDraftRecord(rec, prev)) };
});

vi.mock('../data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    useBuildApi: () => ({
      start: (_b: unknown, _d: string, n: number, text: string, values?: unknown) => { io.starts.push({ n, text, values }); return new Promise((res) => io.ends.set(n, res)); },
      check: async () => io.checkAnswer,
      cancel: async () => io.cancel(),
      discard: async (_b: unknown, _d: string, n: number) => { io.discards.push(n); return 'ok'; },
    }),
    // The stored prompt of an attempt this tab did not start (the settle reads its kind from it).
    attemptPrompt: async () => io.storedPrompt,
  };
});
// attemptUsable awaits its own writes; the test lets another tab act right after them, before the answer is applied.
vi.mock('./records', async (orig) => {
  const real = await orig<typeof Records>();
  return { ...real,
    // The draft can be dropped right after the next attempt was allocated, before its admission ends.
    nextAttempt: async (...a: Parameters<typeof real.nextAttempt>) => { const r = await real.nextAttempt(...a); const f = io.afterNext; io.afterNext = null; f?.(); return r; },
    attemptUsable: async (...a: Parameters<typeof real.attemptUsable>) => { const r = await real.attemptUsable(...a); const f = io.afterUsable; io.afterUsable = null; if (f) await f(); return r; } };
});

import strings from '../strings.en.json';
import { clearScriptStore } from './flowfix';
import { nextAttempt, openRecord, readDraftRecord } from './records';
import { buildPrompt } from './prompt';
import { StepBuild, forgetRepairs, useBuild, type UseBuild } from './StepBuild';
import type { BuiltWith } from './draft';

// A fresh draft id per test: a tab's fix attempts are kept per draft for the tab's life (StepBuild), as draft ids are.
let seq = 0;
let ID = 'cccccccccc';
const B = { target: { project: { id: 'p1' }, container: { id: 'c0a7150000000000000000a1' } }, realm: 'global', owner: 'fp1', exec: 1 };
const KEY = 'sk-abcdefghijklmnopqrstuvwx1234';
const rec = (): DraftRecord => readDraftRecord(ID) as DraftRecord;
const reply = (code: string) => `Summary: done\n\`\`\`ts\n${code}\`\`\`\n`;
const end = async (n: number, a: Answer) => { await act(async () => { io.ends.get(n)?.(a); await Promise.resolve(); }); };

function hook(attempt = 0, builtWith: BuiltWith | null = null) {
  const codes: string[] = [];
  const baselines: BuiltWith[] = [];
  const h = renderHook(() => useBuild({
    binding: B as never, draftId: ID, attempt, builtWith, onBuiltWith: (w) => { baselines.push(w); },
    input: () => ({ description: 'Count sign-ups', block: { address: '/signups', schedule: null, exec: 1 }, with: { description: 'Count sign-ups', route: '/signups', schedule: null, compId: B.target.container.id } }),
    onAttempt: () => undefined, onCode: (c) => { codes.push(c); },
  }));
  return { ...h, codes, baselines };
}

beforeEach(() => { ID = `ccccccc${String(seq++).padStart(3, '0')}`; io.checkAnswer = null; io.starts.length = 0; io.ends.clear(); io.discards.length = 0; io.cancel = () => Promise.resolve(true); io.afterUsable = null; io.afterNext = null; io.failRetain = false; io.storedPrompt = 'unreadable'; });
afterEach(async () => { await clearScriptStore(); });

describe('Build it: a fix', () => {
  it('sends the code and problems with the literal secret masked, and applies the answer with this attempt\'s map', async () => {
    const h = hook();
    await act(async () => { void h.result.current.run({ code: `const token = "${KEY}";\nexport default token.length;\n`, problems: [`line 1: "${KEY}" is not used`] }); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    expect(io.starts[0]!.text).not.toContain(KEY);
    expect(io.starts[0]!.text).toContain('__HOODY_SECRET_0__');
    expect(io.starts[0]!.values).toEqual([{ ph: '__HOODY_SECRET_0__', value: KEY }]);
    await end(1, { outcome: 'done', data: { reply: reply('const token = "__HOODY_SECRET_0__";\nexport default 1;\n') } });
    await waitFor(() => expect(h.result.current.build.k).toBe('ready'));
    expect(h.codes[0]).toContain(KEY);
    expect(h.codes[0]).not.toContain('__HOODY_SECRET_0__');
  });

  it('code that already holds a placeholder-like text is not sent for a fix', async () => {
    const h = hook();
    await act(async () => { await h.result.current.run({ code: 'const a = "__HOODY_SECRET_0__";\n', problems: [] }); });
    expect(io.starts).toEqual([]);
    expect(h.result.current.build).toEqual({ k: 'refused', why: 'placeholder' });
    expect(strings['flow.built.refused.placeholder']).toBeTruthy();
  });

  it('an answer with a placeholder its attempt\'s map does not know is never applied', async () => {
    const h = hook();
    await act(async () => { void h.result.current.run({ code: `const token = "${KEY}";\n`, problems: [] }); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    await end(1, { outcome: 'done', data: { reply: reply('const t = "__HOODY_SECRET_7__";\n') } });
    await waitFor(() => expect(h.result.current.build).toEqual({ k: 'no_script', n: 1, why: 'unknown_placeholder' }));
    expect(h.codes).toEqual([]);
  });

  it('coming back to the draft keeps the fix\'s map: its answer is applied with the secret, never as a plain build', async () => {
    const h = hook();
    await act(async () => { void h.result.current.run({ code: `const token = "${KEY}";\n`, problems: [] }); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    h.unmount();
    io.checkAnswer = { outcome: 'done', data: { reply: reply('const token = "__HOODY_SECRET_0__";\nexport default 2;\n') } };
    const again = hook(1);
    await act(async () => { await again.result.current.checkAgain(); });
    await waitFor(() => expect(again.result.current.build.k).toBe('ready'));
    expect(again.codes[0]).toContain(KEY);
  });

  it('a fix whose map is gone is refused as map lost, even for an answer without placeholders', async () => {
    const h = hook();
    await act(async () => { void h.result.current.run({ code: `const token = "${KEY}";\n`, problems: [] }); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    h.unmount();
    // The draft's memory is dropped (an account change): its maps go with it.
    forgetRepairs(() => false);
    io.checkAnswer = { outcome: 'done', data: { reply: reply('export default 3;\n') } };
    const again = hook(1);
    await act(async () => { await again.result.current.checkAgain(); });
    await waitFor(() => expect(again.result.current.build).toEqual({ k: 'no_script', n: 1, why: 'map_lost' }));
    expect(again.codes).toEqual([]);
  });

  it('a fix whose draft is dropped while its attempt is being allocated keeps no map and starts nothing', async () => {
    const h = hook();
    let dropped = false;
    io.afterNext = () => { forgetRepairs(() => false); dropped = true; };
    await act(async () => { void h.result.current.run({ code: `const token = "${KEY}";\n`, problems: [] }); });
    await waitFor(() => expect(dropped).toBe(true));
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
    expect(io.starts).toEqual([]);
    expect(h.result.current.build.k).not.toBe('running');
    // Coming back to the attempt finds no map: a placeholder answer is never filled with the secret.
    h.unmount();
    io.checkAnswer = { outcome: 'done', data: { reply: reply('const token = "__HOODY_SECRET_0__";\n') } };
    const again = hook(1);
    await act(async () => { await again.result.current.checkAgain(); });
    expect(again.codes.join('')).not.toContain(KEY);
  });

  it('dropping other drafts while a fix is being allocated keeps this one: it starts with its map', async () => {
    const h = hook();
    io.afterNext = () => { forgetRepairs((id) => id === ID); };
    await act(async () => { void h.result.current.run({ code: `const token = "${KEY}";\n`, problems: [] }); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    await end(1, { outcome: 'done', data: { reply: reply('const token = "__HOODY_SECRET_0__";\n') } });
    await waitFor(() => expect(h.result.current.build.k).toBe('ready'));
    expect(h.codes[0]).toContain(KEY);
  });
});

describe('Build it: whose attempt', () => {
  it('Build again after another tab started the next attempt is refused, never adopting the other tab\'s attempt', async () => {
    const h = hook();
    await act(async () => { void h.result.current.run(); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    await end(1, { outcome: 'done', data: { reply: reply('export default 1;\n') } });
    await waitFor(() => expect(h.result.current.build.k).toBe('ready'));
    await act(async () => { await nextAttempt(rec(), true); });
    await act(async () => { await h.result.current.run(); });
    expect(io.starts.map((s) => s.n)).toEqual([1]);
    expect(h.result.current.build).toEqual({ k: 'refused', why: 'stale' });
  });

  it('"start a new one anyway" that is refused ends nothing: the old attempt is ended only after the new one is admitted', async () => {
    const h = hook();
    await act(async () => { void h.result.current.run(); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    io.cancel = async () => 'unknown';
    await act(async () => { await h.result.current.stop(); });
    await act(async () => { await h.result.current.run(); });
    expect(h.result.current.askReplace).toBe(true);
    await act(async () => { await nextAttempt(rec(), false); });
    await act(async () => { await h.result.current.confirmReplace(); });
    expect(io.discards).toEqual([]);
    expect(io.starts.map((s) => s.n)).toEqual([1]);
  });

  it('a usable answer is not applied when another tab moves the draft on while attemptUsable is still writing', async () => {
    const h = hook();
    await act(async () => { void h.result.current.run(); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    io.afterUsable = async () => { await nextAttempt(rec(), true); };
    await end(1, { outcome: 'done', data: { reply: reply('export default 1;\n') } });
    await waitFor(() => expect(h.result.current.build).toEqual({ k: 'refused', why: 'stale' }));
    expect(h.codes).toEqual([]);
  });

  it('a usable answer whose retention write the store refuses is not applied: the record stays open at that attempt', async () => {
    const h = hook();
    await act(async () => { void h.result.current.run(); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    io.failRetain = true;
    await end(1, { outcome: 'done', data: { reply: reply('export default 1;\n') } });
    await waitFor(() => expect(h.result.current.build).toEqual({ k: 'refused', why: 'full' }));
    expect(rec()).toMatchObject({ state: 'open', current: 1, retained: null });
    expect(h.codes).toEqual([]);
  });
});

describe('Build it: edited code', () => {
  it('Build again over code the person edited asks once, then builds', async () => {
    const run = vi.fn(async () => undefined);
    const api = { build: { k: 'ready', n: 1, code: 'x', summary: '' }, run, stop: async () => undefined, checkAgain: async () => undefined, askReplace: false, confirmReplace: async () => undefined, cancelReplace: () => undefined, builtWith: null, keep: () => undefined } as unknown as UseBuild;
    render(<StepBuild b={B as never} draftId={ID} computer="atlas" description="d" api={api} code="edited" codeEdited onWriteMyself={() => undefined} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: strings['flow.built.again'] }));
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(strings['flow.check.replaceEdited']);
    await user.click(screen.getByRole('button', { name: strings['flow.built.again'] }));
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('Build it: the kind of an attempt this tab did not start comes from its stored prompt', () => {
  const stored = async () => {
    const o = await openRecord(ID, 'ai', B as never);
    expect(o.ok).toBe(true);
    const n = await nextAttempt(rec(), false);
    expect(n.ok).toBe(true);
  };
  const fixPrompt = () => { const p = buildPrompt('Count sign-ups', { address: '/signups', schedule: null, exec: 1, fix: { problems: ['x'], code: 'return 1;' } }); if (!p.ok) throw new Error(p.why); return p.text; };
  const plainPrompt = () => { const p = buildPrompt('Count sign-ups', { address: '/signups', schedule: null, exec: 1 }); if (!p.ok) throw new Error(p.why); return p.text; };

  it('a reload after a fix: its answer reads map_lost, never applied as a plain build', async () => {
    await stored();
    io.storedPrompt = { text: fixPrompt() };
    io.checkAnswer = { outcome: 'done', data: { reply: reply('export default 3;\n') } };
    const h = hook(1);
    await act(async () => { await h.result.current.checkAgain(); });
    await waitFor(() => expect(h.result.current.build).toEqual({ k: 'no_script', n: 1, why: 'map_lost' }));
    expect(h.codes).toEqual([]);
  });

  it('a stored prompt that is not the Hub\'s shape, or one that cannot be read, settles as a fix too', async () => {
    for (const p of [{ text: 'no block' }, 'unreadable' as const]) {
      await clearScriptStore();
      ID = `rld${String(++seq).padStart(7, '0')}`;
      await stored();
      io.storedPrompt = p;
      io.checkAnswer = { outcome: 'done', data: { reply: reply('export default 3;\n') } };
      const h = hook(1);
      await act(async () => { await h.result.current.checkAgain(); });
      await waitFor(() => expect(h.result.current.build).toEqual({ k: 'no_script', n: 1, why: 'map_lost' }));
      h.unmount();
    }
  });

  it('a stored plain build is applied as one', async () => {
    await stored();
    io.storedPrompt = { text: plainPrompt() };
    io.checkAnswer = { outcome: 'done', data: { reply: reply('export default 4;\n') } };
    const h = hook(1);
    await act(async () => { await h.result.current.checkAgain(); });
    await waitFor(() => expect(h.result.current.build.k).toBe('ready'));
    expect(h.codes[0]).toContain('export default 4;');
  });
});

describe('Build it: the build baseline is the draft\'s', () => {
  it('builtWith is the draft\'s own (a restore\'s inputs survive a remount); Keep this code and a new attempt store into the draft', async () => {
    const was = { description: 'Mail the digest', route: '/digest', schedule: null, compId: B.target.container.id };
    const r = hook(1, was);
    expect(r.result.current.builtWith).toEqual(was);
    r.unmount();
    // A remount (the wizard left and opened again) reads the same baseline, never the inputs as edited since.
    expect(hook(1, was).result.current.builtWith).toEqual(was);
    const k = hook(0, null);
    act(() => { k.result.current.keep({ ...was, route: '/kept' }); });
    expect(k.baselines).toEqual([{ ...was, route: '/kept' }]);
    const s = hook(0, null);
    await act(async () => { void s.result.current.run(); });
    await waitFor(() => expect(io.starts.length).toBe(1));
    expect(s.baselines).toEqual([{ description: 'Count sign-ups', route: '/signups', schedule: null, compId: B.target.container.id }]);
  });
});
