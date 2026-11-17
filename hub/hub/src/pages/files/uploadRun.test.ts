// The batch run (uploadRun.ts) on its own: core's hold and sendFile played, so each rule is pinned (the
// file stored in the hold before its send, stop at the first unknown, the gate read before and after the hold and
// before each file, what the hold keeps when the batch ends, Check again from reads only).
import { renderHook } from '@testing-library/react';
import { holdAttempt, sendFile } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type * as Data from './data';
import type { UploadMeta } from './upload';

type Out = { outcome: string; [k: string]: unknown };
const answers: (Out | (() => Promise<Out>))[] = [];
const seen: { path: string; signal: AbortSignal }[] = [];
const SHA = 'a'.repeat(64);
const hold = { id: 'h1', update: vi.fn(async (..._a: unknown[]) => true), sent: vi.fn(), free: vi.fn(async (..._a: unknown[]) => 'freed') };
const gate = vi.fn((..._a: unknown[]): string | null => null);
const held: { current: Data.HeldUpload[] } = { current: [] };
vi.mock('@core', async (orig) => ({
  ...(await orig<typeof Core>()),
  holdAttempt: vi.fn(async () => ({ ok: true, hold })),
  attemptFor: vi.fn(() => hold),
  sendFile: vi.fn(async (_route: unknown, input: { params: { path: string }; signal: AbortSignal; beforeSend: (x: { sha256: string; size: number }) => Promise<void>; onPhase: (p: string) => void }) => {
    input.onPhase('queued');
    input.onPhase('hashing');
    // As core: a record that does not land sends nothing.
    try { await input.beforeSend({ sha256: SHA, size: 3 }); } catch { return { outcome: 'not_sent', code: 'RECORD_FAILED', sha256: SHA }; }
    input.onPhase('sending');
    seen.push({ path: input.params.path, signal: input.signal });
    const a = answers.shift() ?? { outcome: 'done', status: 201, data: {} };
    return typeof a === 'function' ? a() : a;
  }),
}));
vi.mock('./data', async (orig) => ({
  ...(await orig<typeof Data>()),
  uploadGate: (c: string) => gate(c),
  uploadCall: (_c: unknown, path: string) => ({ route: 'r', target: {}, params: { path } }),
  uploadsOn: () => held.current,
  refreshFolders: vi.fn(),
  freshListing: vi.fn(async () => ({ entries: [] as never[], whole: true })),
  freshHash: vi.fn(async () => 'failed'),
}));
const data = await import('./data');
const { useBatches, useUpload, resetUploads } = await import('./uploadRun');
const C = { id: 'c1', name: 'atlas' } as never;
const file = (s = 'abc') => new Blob([s]);
const picks = (...names: string[]) => names.map((as) => ({ as, file: file() }));
const metas = () => hold.update.mock.calls.map((c) => c[0] as UploadMeta);
const later = (o: Out, ms = 20) => () => new Promise<Out>((r) => setTimeout(() => r(o), ms));
const up = () => renderHook(() => useUpload()).result.current;

beforeEach(() => {
  resetUploads(); answers.length = 0; seen.length = 0; held.current = []; gate.mockReset().mockReturnValue(null);
  hold.update.mockReset().mockResolvedValue(true); hold.sent.mockReset(); hold.free.mockReset().mockResolvedValue('freed');
  vi.mocked(holdAttempt).mockClear(); vi.mocked(sendFile).mockClear();
  vi.mocked(data.freshListing).mockReset().mockResolvedValue({ entries: [], whole: true }); vi.mocked(data.freshHash).mockReset().mockResolvedValue('failed');
});

describe('a batch run', () => {
  it('each file is sent once; its SHA-256 is in the hold (phase sending) before the PUT, then gone; the hold goes at the end', async () => {
    const b = await up().start(C, '/tmp', picks('a.txt', 'b.txt'));
    expect(b.phase).toBe('ended');
    expect(seen.map((s) => s.path).sort()).toEqual(['/tmp/a.txt', '/tmp/b.txt']);
    expect(b.items.map((x) => x.state)).toEqual(['done', 'done']);
    // admitted with left 2; each send stored (left - 1) before it left, removed after
    const adds = metas().filter((m) => m.files.some((f) => f.phase === 'sending'));
    expect(adds.length).toBeGreaterThanOrEqual(2);
    expect(metas()[0]).toMatchObject({ left: 1, files: [{ path: expect.stringMatching(/^\/tmp\/[ab]\.txt$/), sha256: SHA, phase: 'sending', size: 3 }] });
    expect(hold.update.mock.calls[0]![2]).toEqual({ sending: true });
    expect(metas().at(-1)).toMatchObject({ files: [], left: 0 });
    expect(hold.sent).toHaveBeenCalledTimes(1);
    expect(hold.free).toHaveBeenCalledWith('done', { metaVersion: hold.update.mock.calls.length });
    expect(vi.mocked(holdAttempt).mock.calls[0]![1]).toMatchObject({ by: 'files:upload', meta: { v: 1, batch: b.id, computer: 'c1', folder: '/tmp', files: [], left: 2 } });
    expect(vi.mocked(holdAttempt).mock.calls[0]![0]).toBe('files.upload:c1');
  });

  it('a record that does not land sends nothing for that file', async () => {
    hold.update.mockResolvedValue(false);
    const b = await up().start(C, '/tmp', picks('a.txt'));
    expect(seen).toEqual([]);
    expect(b.items[0]).toMatchObject({ state: 'notSent', code: 'RECORD_FAILED' });
  });

  it('stops at the first unknown: files no worker took are not sent; the hold stays with the unknown file', async () => {
    answers.push({ outcome: 'unknown', why: 'network' }, later({ outcome: 'done', status: 201 }), later({ outcome: 'done', status: 201 }));
    const b = await up().start(C, '/tmp', picks('a', 'b', 'c', 'd', 'e'));
    expect(seen).toHaveLength(3);
    expect(b.phase).toBe('paused');
    expect(b.code).toBe('STOPPED');
    expect(b.items.map((x) => x.state)).toEqual(['unknown', 'done', 'done', 'notSent', 'notSent']);
    expect(metas().at(-1)).toMatchObject({ files: [{ path: '/tmp/a', phase: 'unknown' }], left: 2 });
    expect(hold.free).not.toHaveBeenCalled();
  });

  it('the answers: 412 taken, 403 refused, 500 unknown; a refusal does not stop the others', async () => {
    answers.push({ outcome: 'refusal', rejection: { status: 412, code: 'P' } }, { outcome: 'refusal', rejection: { status: 403, code: 'ACCESS_FORBIDDEN' } });
    const b = await up().start(C, '/tmp', picks('a', 'b', 'c'));
    expect(b.items.map((x) => x.state)).toEqual(['taken', 'refused', 'done']);
    expect(b.items[1]!.code).toBe('ACCESS_FORBIDDEN');
    expect(b.phase).toBe('ended');
    answers.push({ outcome: 'refusal', rejection: { status: 500, code: 'X' } });
    const c = await up().start(C, '/tmp', picks('z'));
    expect(c.items[0]!.state).toBe('unknown');
  });

  it('the gate: refused before the hold (no hold asked), after the hold (hold freed), or before a file (the rest not sent)', async () => {
    gate.mockReturnValueOnce('HELD_OVERLAP');
    let b = await up().start(C, '/tmp', picks('a'));
    expect(b).toMatchObject({ phase: 'notSent', code: 'HELD_OVERLAP' });
    expect(holdAttempt).not.toHaveBeenCalled();
    gate.mockReturnValueOnce(null).mockReturnValueOnce('HELD_OVERLAP');
    b = await up().start(C, '/tmp', picks('a'));
    expect(b).toMatchObject({ phase: 'notSent', code: 'HELD_OVERLAP' });
    expect(hold.free).toHaveBeenCalledWith('done', { metaVersion: 0 });
    // holdAttempt's sending stamp ends before the free (core refuses a free while a stamp of the hold beats).
    expect(hold.sent).toHaveBeenCalledTimes(1);
    expect(hold.sent.mock.invocationCallOrder[0]!).toBeLessThan(hold.free.mock.invocationCallOrder[0]!);
    expect(seen).toEqual([]);
    // Admission passes (2 reads), then the first file's read refuses: nothing at all is sent.
    gate.mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValue('HELD_OVERLAP');
    b = await up().start(C, '/tmp', picks('a', 'b'));
    expect(seen).toEqual([]);
    expect(b.items.every((x) => x.state === 'notSent' && x.code === 'HELD_OVERLAP')).toBe(true);
  });

  it('the gate is read again inside beforeSend: changes turned off while a file hashed send nothing, before or after its record', async () => {
    // admission (2 reads) and the file's own read pass; the read before the record refuses.
    gate.mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValue('CHANGES_OFF');
    let b = await up().start(C, '/tmp', picks('a'));
    expect(seen).toEqual([]);
    expect(b.items[0]).toMatchObject({ state: 'notSent', code: 'CHANGES_OFF' });
    expect(metas().some((m) => m.files.length)).toBe(false);
    // ...or the read right after the record lands refuses: the record is taken out again, nothing sent.
    hold.update.mockClear();
    gate.mockReset().mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValue('CHANGES_OFF');
    b = await up().start(C, '/tmp', picks('a'));
    expect(seen).toEqual([]);
    expect(b.items[0]).toMatchObject({ state: 'notSent', code: 'CHANGES_OFF' });
    expect(metas()[0]!.files).toHaveLength(1);
    expect(metas().at(-1)!.files).toEqual([]);
  });

  it('Cancel while the hold is being admitted: nothing is sent, the hold goes (its stamp ended first)', async () => {
    let release!: () => void;
    vi.mocked(holdAttempt).mockImplementationOnce(() => new Promise((r) => { release = () => r({ ok: true, hold } as never); }));
    const api = up();
    const p = api.start(C, '/tmp', picks('a', 'b'));
    const { result } = renderHook(() => useBatches('c1'));
    const id = result.current.at(-1)!.id;
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    api.cancel(id);
    release();
    const b = await p;
    expect(seen).toEqual([]);
    expect(b).toMatchObject({ phase: 'notSent', code: 'CANCELLED' });
    expect(hold.sent).toHaveBeenCalledTimes(1);
    expect(hold.free).toHaveBeenCalledWith('done', { metaVersion: 0 });
    expect(hold.sent.mock.invocationCallOrder[0]!).toBeLessThan(hold.free.mock.invocationCallOrder[0]!);
  });

  it('another batch held on the computer (HELD) reads as HELD_OVERLAP', async () => {
    vi.mocked(holdAttempt).mockResolvedValueOnce({ ok: false, code: 'HELD' } as never);
    expect(await up().start(C, '/tmp', picks('a'))).toMatchObject({ phase: 'notSent', code: 'HELD_OVERLAP' });
    vi.mocked(holdAttempt).mockResolvedValueOnce({ ok: false, code: 'FULL' } as never);
    expect(await up().start(C, '/tmp', picks('a'))).toMatchObject({ phase: 'notSent', code: 'FULL' });
  });

  it('a batch that only remembers files never sent is superseded by a new pick; one that can not be freed refuses', async () => {
    const leftOnly = { hold: { id: 'old', inFlight: false, metaVersion: 4 }, meta: { v: 1, batch: 'old', computer: 'c1', computerName: 'atlas', folder: '/tmp', files: [], left: 3 } } as never;
    held.current = [leftOnly];
    await up().start(C, '/tmp', picks('a'));
    expect(hold.free).toHaveBeenNthCalledWith(1, 'dismissed', { metaVersion: 4 });
    expect(seen).toHaveLength(1);
    hold.free.mockReset().mockResolvedValueOnce('refused');
    seen.length = 0;
    expect(await up().start(C, '/tmp', picks('a'))).toMatchObject({ phase: 'notSent', code: 'HELD_OVERLAP' });
    expect(seen).toEqual([]);
  });

  it('a batch with unknown files, or a send out, is never superseded: the new pick is refused, the hold kept', async () => {
    for (const blocking of [
      { hold: { id: 'old', inFlight: false, metaVersion: 4 }, meta: { v: 1, batch: 'old', computer: 'c1', computerName: 'atlas', folder: '/tmp', left: 0, files: [{ id: 'e', path: '/tmp/x', size: 1, sha256: SHA, phase: 'unknown' }] } },
      { hold: { id: 'old', inFlight: 'elsewhere', metaVersion: 4 }, meta: { v: 1, batch: 'old', computer: 'c1', computerName: 'atlas', folder: '/tmp', left: 2, files: [] } },
      { hold: { id: 'old', inFlight: false, metaVersion: 4 }, meta: null },
    ]) {
      held.current = [blocking as never];
      hold.free.mockClear();
      vi.mocked(holdAttempt).mockResolvedValueOnce({ ok: false, code: 'HELD' } as never);
      expect(await up().start(C, '/tmp', picks('a'))).toMatchObject({ phase: 'notSent', code: 'HELD_OVERLAP' });
      expect(hold.free).not.toHaveBeenCalled();
    }
    expect(seen).toEqual([]);
  });

  it('nothing unknown but files left: the hold stays (a reload says pick them again); a cancel frees it', async () => {
    // b's answer is not sent (refused before leaving: core's own refusal), stopping nothing; the gate then stops c.
    gate.mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValue('HELD_OVERLAP');
    const b = await up().start(C, '/tmp', picks('a', 'b', 'c', 'd'));
    expect(b.items.filter((x) => x.state === 'notSent').length).toBeGreaterThan(0);
    expect(metas().at(-1)!.files).toEqual([]);
    expect(metas().at(-1)!.left).toBe(b.items.filter((x) => x.state === 'notSent').length);
    expect(hold.free).not.toHaveBeenCalled();
    expect(b.phase).toBe('paused');
  });

  it('Cancel: the request that left is unknown; files not taken yet are not sent; the hold stays only for the unknown', async () => {
    answers.push(() => new Promise<Out>((r) => { const s = seen.at(-1)!.signal; s.addEventListener('abort', () => r({ outcome: 'unknown', why: 'aborted' })); }));
    const u = up();
    const p = u.start(C, '/tmp', picks('a', 'b', 'c', 'd'));
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1));
    const view = renderHook(() => useBatches('c1')).result;
    u.cancel(view.current.find((x) => x.phase === 'running')!.id);
    const b = await p;
    expect(b.items.find((x) => x.as === 'a')!.state).toBe('unknown');
    expect(b.items.filter((x) => x.state === 'notSent').every((x) => x.code === 'CANCELLED')).toBe(true);
    expect(b.phase).toBe('paused');
  });
});

describe('Continue and Check again', () => {
  const ownHold = (batch: string, files: number, inFlight: false | 'here' | 'elsewhere' = false, left = 1) => ({
    hold: { id: 'h1', inFlight, metaVersion: 7 },
    meta: { v: 1, batch, computer: 'c1', computerName: 'atlas', folder: '/tmp', left, files: Array.from({ length: files }, (_, k) => ({ id: `e${k}`, path: `/tmp/u${k}`, size: 3, sha256: SHA, phase: 'unknown' as const })) },
  }) as never;

  async function pausedBatch() {
    answers.push({ outcome: 'unknown', why: 'network' });
    // Admission (2 reads), a's own read, a's read before its record, then b's own read (refused: the batch stops
    // taking files); a's read after its record passes.
    gate.mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce('HELD_OVERLAP').mockReturnValue(null);
    const b = await up().start(C, '/tmp', picks('a', 'b'));
    gate.mockReset().mockReturnValue(null);
    seen.length = 0; hold.update.mockClear(); hold.free.mockClear(); hold.sent.mockClear();
    return b;
  }

  it('Continue under its own hold sends the files left; never with 10 unknown, never while a send is out', async () => {
    const b = await pausedBatch();
    held.current = [ownHold(b.id, 10)];
    expect(await up().resume(C, b.id)).toMatchObject({ phase: 'paused', code: 'TOO_MANY_UNKNOWN' });
    expect(seen).toEqual([]);
    // Refused before anything runs under the hold: nothing is written to it.
    expect(hold.update).not.toHaveBeenCalled();
    expect(hold.sent).not.toHaveBeenCalled();
    held.current = [ownHold(b.id, 1)];
    gate.mockReturnValue('HELD_OVERLAP');
    expect(await up().resume(C, b.id)).toMatchObject({ phase: 'paused', code: 'HELD_OVERLAP' });
    expect(hold.update).not.toHaveBeenCalled();
    expect(hold.sent).not.toHaveBeenCalled();
    gate.mockReturnValue('CHANGES_OFF');
    expect(await up().resume(C, b.id)).toMatchObject({ phase: 'paused', code: 'CHANGES_OFF' });
    gate.mockReturnValue(null);
    held.current = [ownHold(b.id, 1, 'elsewhere')];
    expect(await up().resume(C, b.id)).toMatchObject({ code: 'HELD_OVERLAP' });
    held.current = [ownHold('another', 1)];
    expect(await up().resume(C, b.id)).toMatchObject({ code: 'HELD_OVERLAP' });
    expect(seen).toEqual([]);
    held.current = [ownHold(b.id, 9)];
    const r = await up().resume(C, b.id);
    expect(seen.map((s) => s.path)).toEqual(['/tmp/b']);
    expect(r!.items.find((x) => x.as === 'b')!.state).toBe('done');
    expect(vi.mocked(holdAttempt)).toHaveBeenCalledTimes(1);
  });

  it('Continue on a hold that only remembers files: its sending stamp lands, then the gate is read again; a change admitted meanwhile sends nothing', async () => {
    const b = await pausedBatch();
    held.current = [ownHold(b.id, 0)];
    let changeHeld = false;
    gate.mockImplementation(() => (changeHeld ? 'HELD_OVERLAP' : null));
    // Another tab's Files change is admitted while the stamp write is on its way (it read no blocking upload).
    hold.update.mockImplementationOnce(async () => { await new Promise((r) => setTimeout(r, 10)); changeHeld = true; return true; });
    const r = await up().resume(C, b.id);
    expect(seen).toEqual([]);
    expect(r).toMatchObject({ phase: 'paused', code: 'HELD_OVERLAP' });
    expect(hold.update.mock.calls[0]![2]).toEqual({ sending: true });
    expect(hold.sent).toHaveBeenCalled(); // the batch's end stops the stamp it took
    // A stamp write that does not land sends nothing either.
    seen.length = 0; hold.update.mockReset().mockResolvedValue(false); changeHeld = false;
    expect(await up().resume(C, b.id)).toMatchObject({ code: 'HELD_OVERLAP' });
    expect(seen).toEqual([]);
  });

  it('the 10-unknown cap is hard: with 9 unknown, workers at once take only one more file', async () => {
    answers.push({ outcome: 'unknown', why: 'network' });
    // As pausedBatch: b's own read refuses, so c and d are never taken.
    gate.mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce('HELD_OVERLAP').mockReturnValue(null);
    const b = await up().start(C, '/tmp', picks('a', 'b', 'c', 'd'));
    gate.mockReset().mockReturnValue(null);
    seen.length = 0; hold.update.mockClear(); hold.free.mockClear(); hold.sent.mockClear();
    expect(b.items.filter((x) => x.state === 'notSent')).toHaveLength(3);
    held.current = [ownHold(b.id, 9)];
    answers.push(later({ outcome: 'unknown', why: 'network' }), later({ outcome: 'unknown', why: 'network' }), later({ outcome: 'unknown', why: 'network' }));
    const r = await up().resume(C, b.id);
    expect(seen).toHaveLength(1);
    expect(Math.max(...metas().map((m) => m.files.length))).toBe(10);
    expect(r).toMatchObject({ phase: 'paused', code: 'TOO_MANY_UNKNOWN' });
    expect(r!.items.filter((x) => x.state === 'notSent').every((x) => x.code === 'TOO_MANY_UNKNOWN')).toBe(true);
  });

  it('Continue with no hold left admits a new one first', async () => {
    const b = await pausedBatch();
    held.current = [];
    vi.mocked(holdAttempt).mockClear();
    await up().resume(C, b.id);
    expect(vi.mocked(holdAttempt).mock.calls[0]![1]).toMatchObject({ meta: { batch: b.id, left: 1 } });
    expect(seen.map((s) => s.path)).toEqual(['/tmp/b']);
  });

  it('Check again: reads only; settled files leave the hold, all settled frees it (proved); a failed read writes nothing', async () => {
    const h = ownHold('x', 2, false, 0);
    vi.mocked(data.freshListing).mockResolvedValueOnce('failed');
    expect(await up().check(C, h)).toBe(false);
    expect(hold.update).not.toHaveBeenCalled();
    // u0 absent, u1 there with the same SHA-256
    vi.mocked(data.freshListing).mockResolvedValueOnce({ entries: [{ name: 'u1', dir: false } as never], whole: true });
    vi.mocked(data.freshHash).mockResolvedValueOnce(SHA);
    expect(await up().check(C, h)).toBe(true);
    expect(hold.free).toHaveBeenCalledWith('proved', { metaVersion: 7 });
    expect(seen).toEqual([]);
    // only one settled: the other stays (update at the shown version)
    hold.free.mockClear();
    vi.mocked(data.freshListing).mockResolvedValueOnce({ entries: [{ name: 'u1', dir: false } as never], whole: true });
    vi.mocked(data.freshHash).mockResolvedValueOnce('failed');
    expect(await up().check(C, h)).toBe(true);
    expect(hold.update).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ id: 'e1' })] }), 7);
    expect(hold.free).not.toHaveBeenCalled();
  });

  it('Check again on a listing that leaves an entry out: a file it does not show is not absent, the hold stays', async () => {
    const h = ownHold('x', 2, false, 0);
    vi.mocked(data.freshListing).mockResolvedValueOnce({ entries: [], whole: false });
    expect(await up().check(C, h)).toBe(false);
    expect(hold.update).not.toHaveBeenCalled();
    expect(hold.free).not.toHaveBeenCalled();
    // What it shows still settles: u1 there with the same SHA-256 leaves the hold, u0 stays in it.
    vi.mocked(data.freshListing).mockResolvedValueOnce({ entries: [{ name: 'u1', dir: false } as never], whole: false });
    vi.mocked(data.freshHash).mockResolvedValueOnce(SHA);
    expect(await up().check(C, h)).toBe(true);
    expect(hold.update).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ id: 'e0' })] }), 7);
    expect(hold.free).not.toHaveBeenCalled();
  });

  it('Check again settling the last unknown file keeps a hold for files never sent (left): a reload still says pick them again', async () => {
    vi.mocked(data.freshListing).mockResolvedValueOnce({ entries: [], whole: true });
    expect(await up().check(C, ownHold('x', 1, false, 3))).toBe(true);
    expect(hold.free).not.toHaveBeenCalled();
    expect(hold.update).toHaveBeenCalledWith(expect.objectContaining({ files: [], left: 3 }), 7);
  });

  it('Check again refuses while a send is out, on an unreadable hold, or another computer', async () => {
    expect(await up().check(C, ownHold('x', 1, 'here'))).toBe(false);
    expect(await up().check(C, { hold: { id: 'h1', inFlight: false, metaVersion: 1 }, meta: null } as never)).toBe(false);
    expect(await up().check({ id: 'c2', name: 'b' } as never, ownHold('x', 1))).toBe(false);
    expect(data.freshListing).not.toHaveBeenCalled();
  });

  it('Stop tracking frees only the version shown', async () => {
    expect(await up().stopTracking(ownHold('x', 1))).toBe(true);
    expect(hold.free).toHaveBeenCalledWith('dismissed', { metaVersion: 7 });
    hold.free.mockResolvedValueOnce('refused');
    expect(await up().stopTracking(ownHold('x', 1))).toBe(false);
  });
});

describe('uploadBlocks (what holds other Files changes back)', () => {
  it('a send out, an unknown file or an unreadable hold blocks; a batch that only remembers files never sent does not', () => {
    const m = { v: 1, batch: 'b', computer: 'c', computerName: 'n', folder: '/', left: 2, files: [] };
    expect(data.uploadBlocks({ hold: { inFlight: false }, meta: m } as never)).toBe(false);
    expect(data.uploadBlocks({ hold: { inFlight: 'elsewhere' }, meta: m } as never)).toBe(true);
    expect(data.uploadBlocks({ hold: { inFlight: false }, meta: null } as never)).toBe(true);
    expect(data.uploadBlocks({ hold: { inFlight: false }, meta: { ...m, files: [{}] } } as never)).toBe(true);
  });
});
