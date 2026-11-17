// The broadcast's pure parts: names, browser checks, the capture narrowing, the sender, the pipe status, the link.
import { describe, expect, it, vi } from 'vitest';
import { canStreamUpload, pickMime, unsupported, type BrowserEnv } from './capability';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FRAME_CHECK_MS, captureOptions, confine, frameArrives } from './capture';
import { LINK_TTL_MS, RENEW_EVERY_MS, aliasBody, aliasListOf, aliasOf, createProves, expired, removeProves, renewBody, renewProves, usable, CREATE_SETTLE_MS } from './link';
import { PIPE_NAME, nameOfTarget, newPipeName, newTransferId, targetPathOf, token } from './name';
import { FIRST_DATA_MS, MAX_QUEUE_BYTES, STOP_ANSWER_MS, errorLine, startSender, type SenderEnd } from './sender';
import { initialStatus, onProgressEvent, viewersUnknown } from './status';
import { FakeRecorder, FakeTrack, Recorder, fakeStream, fakeUpload, flush } from './test/fakes';

describe('names', () => {
  it('the pipe name is bc- and 32 symbols from crypto.getRandomValues (192 bits); every draw differs', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const names = new Set(Array.from({ length: 200 }, () => newPipeName()));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(names.size).toBe(200);
    for (const n of names) expect(n).toMatch(PIPE_NAME);
    expect(newTransferId()).toMatch(/^bc-[A-Za-z0-9_-]{24}$/);
  });
  it('each symbol is one random byte mod 64 (no bias, the whole alphabet)', () => {
    expect(token(4, (b) => b.set([0, 63, 64, 255]))).toBe('A_A_');
  });
  it('the alias target pins the live player of exactly one broadcast name', () => {
    const n = 'bc-' + 'a'.repeat(32);
    expect(targetPathOf(n)).toBe(`/api/v1/pipe/${n}?video=1&live=1`);
    expect(nameOfTarget(targetPathOf(n))).toBe(n);
    for (const other of [`/api/v1/pipe/${n}`, `/api/v1/pipe/${n}?video=1`, `/api/v1/pipe/bc-short?video=1&live=1`, `/api/v1/pipe/x/${n}?video=1&live=1`, null, 7]) expect(nameOfTarget(other)).toBeNull();
  });
});

describe('capability', () => {
  class Req { headers: Headers; constructor(_u: string, init: RequestInit & { duplex?: string }) { void init.duplex; this.headers = new Headers(); } }
  class OldReq { headers: Headers; constructor() { this.headers = new Headers({ 'content-type': 'text/plain' }); } }
  const ok: BrowserEnv = {
    framed: false, isSecureContext: true, mediaDevices: { getDisplayMedia: () => null }, MediaRecorder: FakeRecorder,
    Request: Req as unknown as typeof Request, ReadableStream, crypto: globalThis.crypto,
  };
  it('a Chromium-like browser may broadcast', () => expect(unsupported(ok)).toBeNull());
  it('says why not, first reason first', () => {
    expect(unsupported({ ...ok, framed: true })).toBe('framed');
    expect(unsupported({ ...ok, isSecureContext: false })).toBe('insecure');
    expect(unsupported({ ...ok, mediaDevices: {} })).toBe('no-capture');
    expect(unsupported({ ...ok, mediaDevices: undefined })).toBe('no-capture');
    expect(unsupported({ ...ok, MediaRecorder: undefined })).toBe('no-recorder');
    expect(unsupported({ ...ok, Request: OldReq as unknown as typeof Request })).toBe('no-stream-upload');
    expect(unsupported({ ...ok, MediaRecorder: { isTypeSupported: () => false } })).toBe('no-webm');
    expect(unsupported({ ...ok, crypto: undefined })).toBe('no-crypto');
  });
  it('a stream upload needs the duplex option read and no text Content-Type', () => {
    expect(canStreamUpload({ Request: Req as unknown as typeof Request, ReadableStream })).toBe(true);
    expect(canStreamUpload({ Request: OldReq as unknown as typeof Request, ReadableStream })).toBe(false);
    expect(canStreamUpload({ Request: undefined, ReadableStream })).toBe(false);
  });
  it('records WebM only, VP8 first, declaring audio only when the capture has it', () => {
    expect(pickMime(FakeRecorder, false)).toBe('video/webm;codecs=vp8');
    expect(pickMime(FakeRecorder, true)).toBe('video/webm;codecs=vp8,opus');
    expect(pickMime({ isTypeSupported: (t) => t === 'video/mp4' }, false)).toBe('');
    expect(pickMime({ isTypeSupported: (t) => t === 'video/webm;codecs=vp9,opus' }, true)).toBe('video/webm;codecs=vp9,opus');
  });
});

describe('capture', () => {
  it('offers this tab first, never whole screens or switching, 15 fps at most', () => {
    const o = captureOptions(false) as Record<string, unknown>;
    expect(o).toMatchObject({ audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude' });
    expect((o.video as { frameRate: { max: number } }).frameRate.max).toBe(15);
    expect((captureOptions(true) as { audio: boolean }).audio).toBe(true);
  });
  const el = {} as Element;
  const target = { fromElement: vi.fn(async () => 'target') };
  it('Element Capture first, then Region Capture, then the whole tab', async () => {
    const t1 = new FakeTrack('video');
    t1.restrictTo = vi.fn(async () => {});
    t1.cropTo = vi.fn(async () => {});
    expect(await confine(t1 as unknown as MediaStreamTrack, el, { RestrictionTarget: target, CropTarget: target })).toBe('element');
    expect(t1.cropTo).not.toHaveBeenCalled();
    const t2 = new FakeTrack('video');
    t2.restrictTo = vi.fn(async () => { throw new Error('not isolated'); });
    t2.cropTo = vi.fn(async () => {});
    expect(await confine(t2 as unknown as MediaStreamTrack, el, { RestrictionTarget: target, CropTarget: target })).toBe('region');
    expect(await confine(new FakeTrack('video') as unknown as MediaStreamTrack, el, {})).toBe('tab');
  });
  it('a window is "other"; a refused crop is "wide" (the whole picked tab shows)', async () => {
    expect(await confine(new FakeTrack('video', { displaySurface: 'window' }) as unknown as MediaStreamTrack, el, {})).toBe('other');
    const t = new FakeTrack('video');
    t.cropTo = vi.fn(async () => { throw new Error('not self'); });
    expect(await confine(t as unknown as MediaStreamTrack, el, { CropTarget: target })).toBe('wide');
  });
  it('a refused Element Capture with no Region Capture to fall back on is "wide", never "tab" (it may be another tab)', async () => {
    const t = new FakeTrack('video');
    t.restrictTo = vi.fn(async () => { throw new Error('not self'); });
    expect(await confine(t as unknown as MediaStreamTrack, el, { RestrictionTarget: target })).toBe('wide');
  });
  it('an accepted Element Capture that gives no frame in FRAME_CHECK_MS is lifted for Region Capture (this tab only)', async () => {
    const asked: number[] = [];
    const none = vi.fn(async (_t: MediaStreamTrack, ms: number) => { asked.push(ms); return false; });
    const t = new FakeTrack('video');
    t.restrictTo = vi.fn(async () => {});
    t.cropTo = vi.fn(async () => {});
    expect(await confine(t as unknown as MediaStreamTrack, el, { RestrictionTarget: target, CropTarget: target }, none)).toBe('region');
    expect(asked).toEqual([FRAME_CHECK_MS]);
    expect(FRAME_CHECK_MS).toBe(1000);
    expect(t.restrictTo).toHaveBeenLastCalledWith(null);
    expect(t.cropTo).toHaveBeenCalledTimes(1);
    // A frame: the restriction stands, no crop.
    const ok = new FakeTrack('video');
    ok.restrictTo = vi.fn(async () => {});
    ok.cropTo = vi.fn(async () => {});
    expect(await confine(ok as unknown as MediaStreamTrack, el, { RestrictionTarget: target, CropTarget: target }, async () => true)).toBe('element');
    expect(ok.restrictTo).toHaveBeenCalledTimes(1);
    expect(ok.cropTo).not.toHaveBeenCalled();
  });
  it('no frame and no Region Capture: the whole tab (it was this tab); a refused crop is "wide"; a restriction that cannot be lifted stays "element"', async () => {
    const t = new FakeTrack('video');
    t.restrictTo = vi.fn(async () => {});
    expect(await confine(t as unknown as MediaStreamTrack, el, { RestrictionTarget: target }, async () => false)).toBe('tab');
    const c = new FakeTrack('video');
    c.restrictTo = vi.fn(async () => {});
    c.cropTo = vi.fn(async () => { throw new Error('no'); });
    expect(await confine(c as unknown as MediaStreamTrack, el, { RestrictionTarget: target, CropTarget: target }, async () => false)).toBe('wide');
    const k = new FakeTrack('video');
    k.restrictTo = vi.fn(async (x: unknown) => { if (x === null) throw new Error('stuck'); });
    k.cropTo = vi.fn(async () => {});
    expect(await confine(k as unknown as MediaStreamTrack, el, { RestrictionTarget: target, CropTarget: target }, async () => false)).toBe('element');
    expect(k.cropTo).not.toHaveBeenCalled();
  });
  it('frameArrives reads a clone: a frame is true, none in time (or an ended track) is false, no processor (or a failing one) is true; the clone stops', async () => {
    const clones: Array<{ stopped: boolean }> = [];
    const track = { clone: () => { const c = { stopped: false, stop() { c.stopped = true; } }; clones.push(c); return c; } } as unknown as MediaStreamTrack;
    const closed: number[] = [];
    const Proc = (gives: boolean) => class { readable = new ReadableStream<{ close(): void }>({ start(c) { if (gives) c.enqueue({ close: () => { closed.push(1); } }); } }); };
    expect(await frameArrives(track, 50, { MediaStreamTrackProcessor: Proc(true) })).toBe(true);
    expect(closed).toEqual([1]);
    expect(await frameArrives(track, 20, { MediaStreamTrackProcessor: Proc(false) })).toBe(false);
    expect(clones.map((c) => c.stopped)).toEqual([true, true]);
    // The track ended with no frame: false.
    expect(await frameArrives(track, 50, { MediaStreamTrackProcessor: class { readable = new ReadableStream({ start(c) { c.close(); } }); } })).toBe(false);
    expect(await frameArrives(track, 20, {})).toBe(true);
    expect(await frameArrives(track, 20, { MediaStreamTrackProcessor: class { constructor() { throw new Error('no'); } } })).toBe(true);
    expect(clones.length).toBe(4);
    expect(clones.every((c) => c.stopped)).toBe(true);
  });
  it('the Board\'s tile area is its own stacking context (Element Capture delivers no frame for an area that is not)', () => {
    const css = readFileSync(join(import.meta.dirname, '../parts/board.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const area = /\n\.area \{([^}]*)\}/.exec(css);
    expect(area, '.area rule').not.toBeNull();
    expect(area![1]).toMatch(/\bisolation:\s*isolate;/);
  });
});

describe('sender', () => {
  function run(o: { audio?: boolean } = {}) {
    const cap = fakeStream(o);
    const up = fakeUpload();
    const ends: SenderEnd[] = [];
    const timers: Array<{ fn: () => void; ms: number; dead: boolean }> = [];
    const s = startSender(cap.stream, 'video/webm;codecs=vp8', {
      MediaRecorder: Recorder, upload: up.upload,
      setTimeout: (fn, ms) => { const t = { fn, ms, dead: false }; timers.push(t); return t; },
      clearTimeout: (t) => { (t as { dead: boolean }).dead = true; },
    }, (e) => ends.push(e));
    const fire = (ms: number) => { for (const t of timers.filter((x) => x.ms === ms && !x.dead)) { t.dead = true; t.fn(); } };
    return { cap, up, ends, s, rec: FakeRecorder.last as FakeRecorder, timers, fire };
  }
  it('starts the upload and the recorder at once: 100 ms chunks, a keyframe every 2 s, the WebM type', async () => {
    const { up, rec } = run();
    expect(up.calls.length).toBe(1);
    expect(up.calls[0]!.mime).toBe('video/webm;codecs=vp8');
    expect(rec.state).toBe('recording');
    expect(rec.timeslice).toBe(100);
    expect(rec.opts).toMatchObject({ mimeType: 'video/webm;codecs=vp8', videoKeyFrameIntervalDuration: 2000 });
    expect(rec.opts.audioBitsPerSecond).toBeUndefined();
  });
  it('sends the chunks in order', async () => {
    const { up, rec, s } = run();
    rec.chunk([1, 2]); rec.chunk([3]); rec.chunk([4, 5, 6]);
    await flush();
    expect(up.calls[0]!.bytes).toEqual([1, 2, 3, 4, 5, 6]);
    expect(s.sent()).toBe(6);
  });
  it('stop: the recording ends, the body closes, the tracks stop; the pipe answer ends it as stopped, once', async () => {
    const { up, rec, s, ends, cap } = run();
    rec.chunk([1]);
    s.stop();
    await flush();
    expect(rec.state).toBe('inactive');
    expect(up.calls[0]!.closed).toBe(true);
    expect(cap.all.every((t) => t.stopped)).toBe(true);
    expect(ends).toEqual([]);
    up.calls[0]!.answer({ status: 200, text: '[INFO] Live: streaming. Viewers can join at any time.\n[INFO] Live stream ended (peak 3 viewers).\n' });
    await flush();
    s.stop();
    expect(ends).toEqual([{ kind: 'stopped' }]);
  });
  it('records the frame keeper\'s stream (a still Board keeps making frames) and ends the keeper at every end', async () => {
    for (const how of ['stop', 'cancel', 'track', 'answer', 'slow'] as const) {
      const cap = fakeStream({ audio: true });
      const up = fakeUpload();
      const kept = fakeStream({ audio: true });
      let stops = 0, keptFrom: MediaStream | null = null;
      const s = startSender(cap.stream, 'video/webm;codecs=vp8,opus', {
        MediaRecorder: Recorder, upload: up.upload, setTimeout: () => 0, clearTimeout: () => {},
        keepFrames: (st) => { keptFrom = st; return { stream: kept.stream, kept: true, stop: () => { stops++; } }; },
      }, () => {});
      const rec = FakeRecorder.last as FakeRecorder;
      expect(keptFrom).toBe(cap.stream);
      expect(rec.stream).toBe(kept.stream);
      expect(stops).toBe(0);
      if (how === 'stop') s.stop();
      else if (how === 'cancel') s.cancel();
      else if (how === 'track') cap.video!.end();
      else if (how === 'answer') up.calls[0]!.answer({ status: 200, text: '' });
      else rec.chunk(new Blob([new Uint8Array(MAX_QUEUE_BYTES + 1)]));
      await flush();
      expect(stops, how).toBe(1);
      // The browser's Stop sharing is watched on the source: the source's tracks are the ones stopped.
      expect(cap.all.every((t) => t.stopped), how).toBe(true);
    }
  });
  it('a keeper that can no longer pass video on ends the broadcast as recorder, once; not after a Stop', async () => {
    for (const after of ['live', 'stopping'] as const) {
      const cap = fakeStream();
      const up = fakeUpload();
      const ends: unknown[] = [];
      let fail: () => void = () => {};
      const s = startSender(cap.stream, 'video/webm;codecs=vp8', {
        MediaRecorder: Recorder, upload: up.upload, setTimeout: () => 0, clearTimeout: () => {},
        keepFrames: (st, onFail) => { fail = onFail; return { stream: st, kept: true, stop: () => {} }; },
      }, (e) => { ends.push(e); });
      if (after === 'stopping') s.stop();
      fail(); fail();
      await flush();
      if (after === 'live') {
        expect(ends).toEqual([{ kind: 'recorder' }]);
        expect(up.calls[0]!.signal.aborted).toBe(true);
        expect(cap.all.every((t) => t.stopped)).toBe(true);
      } else {
        expect(ends).toEqual([]);
        up.calls[0]!.answer({ status: 200, text: '' });
        await flush();
        expect(ends).toEqual([{ kind: 'stopped' }]);
      }
    }
  });
  it('by default the keeper is the browser one: with no frame APIs (here) the capture is recorded as it is', () => {
    const { cap, rec } = run();
    expect(rec.stream).toBe(cap.stream);
  });
  it('stop with no answer: the upload is cut after the stop wait, still stopped', async () => {
    const { up, s, ends, fire } = run();
    s.stop();
    await flush();
    expect(STOP_ANSWER_MS).toBe(5000);
    fire(STOP_ANSWER_MS);
    await flush();
    expect(up.calls[0]!.signal.aborted).toBe(true);
    expect(ends).toEqual([{ kind: 'stopped' }]);
  });
  it('no recorded byte within FIRST_DATA_MS: ends as no-picture at once, the upload aborted, the tracks stopped', async () => {
    const { up, ends, cap, fire, rec } = run();
    expect(FIRST_DATA_MS).toBe(6000);
    rec.chunk([]); // an empty chunk is no picture
    await flush();
    fire(FIRST_DATA_MS);
    await flush();
    expect(ends).toEqual([{ kind: 'no-picture' }]);
    expect(up.calls[0]!.signal.aborted).toBe(true);
    expect(rec.state).toBe('inactive');
    expect(cap.all.every((t) => t.stopped)).toBe(true);
  });
  it('the first recorded bytes clear the no-picture wait; a Stop before them still ends as stopped', async () => {
    const a = run();
    a.rec.chunk([1, 2]);
    await flush();
    expect(a.timers.find((t) => t.ms === FIRST_DATA_MS)!.dead).toBe(true);
    a.fire(FIRST_DATA_MS);
    await flush();
    expect(a.ends).toEqual([]);
    expect(a.up.calls[0]!.signal.aborted).toBe(false);
    const b = run();
    b.s.stop();
    b.fire(FIRST_DATA_MS);
    await flush();
    expect(b.ends).toEqual([]);
    b.up.calls[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(b.ends).toEqual([{ kind: 'stopped' }]);
  });
  it('the browser "Stop sharing" ends it as track-ended', async () => {
    const { up, cap, ends } = run();
    cap.video!.end();
    await flush();
    up.calls[0]!.answer({ status: 200, text: '' });
    await flush();
    expect(ends).toEqual([{ kind: 'track-ended' }]);
  });
  it('a refusal, a server end and a lost connection are told apart', async () => {
    const a = run();
    a.up.calls[0]!.answer({ status: 429, text: '[ERROR] Too many live streams. Try again later.\n' });
    await flush();
    expect(a.ends).toEqual([{ kind: 'refused', status: 429, line: 'Too many live streams. Try again later.' }]);
    expect(a.cap.all.every((t) => t.stopped)).toBe(true);
    const b = run();
    b.up.calls[0]!.answer({ status: 200, text: '[INFO] Live: streaming.\n[ERROR] Transfer aborted — idle timeout exceeded.\n' });
    await flush();
    expect(b.ends).toEqual([{ kind: 'server', line: 'Transfer aborted — idle timeout exceeded.' }]);
    const c = run();
    c.up.calls[0]!.fail();
    await flush();
    expect(c.ends).toEqual([{ kind: 'network' }]);
  });
  it('past the queue cap it ends as slow and aborts the upload at once (nothing more leaves)', async () => {
    const { rec, ends, up } = run();
    rec.chunk(new Blob([new Uint8Array(MAX_QUEUE_BYTES + 1)]));
    await flush();
    expect(ends).toEqual([{ kind: 'slow' }]);
    expect(up.calls[0]!.signal.aborted).toBe(true);
  });
  it('cancel aborts the upload at once and ends once as stopped', async () => {
    const { s, ends, up, cap } = run();
    s.cancel();
    await flush();
    expect(up.calls[0]!.signal.aborted).toBe(true);
    expect(cap.all.every((t) => t.stopped)).toBe(true);
    expect(ends).toEqual([{ kind: 'stopped' }]);
  });
  it('a chunk that cannot be read ends it as recorder (a lost chunk would break every viewer)', async () => {
    const { rec, ends } = run();
    const bad = new Blob([new Uint8Array([1])]);
    Object.defineProperty(bad, 'arrayBuffer', { value: () => Promise.reject(new Error('gone')) });
    rec.chunk(bad);
    await flush();
    expect(ends).toEqual([{ kind: 'recorder' }]);
  });
  it('errorLine: the last [ERROR] line without its tag', () => {
    expect(errorLine('[INFO] a\n[ERROR] one\n[ERROR]  two \n')).toBe('two');
    expect(errorLine('[INFO] fine\n')).toBe('');
  });
});

describe('status', () => {
  const T = 'bc-transfer-mine';
  const ev = (name: string, d: unknown, s = initialStatus, now = 1000) => onProgressEvent(s, name, JSON.stringify(d), T, now);
  it('not live until the pipe says streaming and live', () => {
    const waiting = ev('state', { state: 'waiting', hasSender: true, activeReceivers: 0 });
    expect(waiting).toMatchObject({ live: false, viewers: 0, since: null });
    const live = ev('state', { state: 'streaming', hasSender: true, activeReceivers: 2, live: true }, waiting, 5000);
    expect(live).toMatchObject({ live: true, viewers: 2, since: 5000 });
  });
  it('progress carries the viewers and the pipe elapsed', () => {
    const s = ev('progress', { activeReceivers: 7, elapsed: 12.5, live: true }, initialStatus, 100_000);
    expect(s).toMatchObject({ live: true, viewers: 7, since: 87_500 });
  });
  it('only this transfer done ends it; bad data changes nothing', () => {
    const live = ev('progress', { activeReceivers: 1, elapsed: 1, live: true });
    expect(ev('done', { state: 'failed', reason: 'Idle timeout', transferId: 'other' }, live)).toBe(live);
    expect(ev('done', { state: 'failed', reason: 'Idle timeout', transferId: T }, live)).toMatchObject({ live: false, done: { failed: true, reason: 'Idle timeout' } });
    expect(onProgressEvent(live, 'state', '{nope', T, 1)).toBe(live);
    expect(ev('progress', { activeReceivers: -1, live: true }, live).viewers).toBe(1);
  });
  it('a closed event stream makes the viewer count unknown, never 0', () => {
    const live = ev('progress', { activeReceivers: 4, elapsed: 1, live: true });
    expect(viewersUnknown(live).viewers).toBeNull();
  });
});

describe('link', () => {
  const name = 'bc-' + 'Z'.repeat(32);
  const row = (o: Record<string, unknown> = {}) => ({ id: 'al1', alias: 'f'.repeat(48), program: 'pipe', index: 1, target_path: targetPathOf(name), allow_path_override: false, enabled: true, expires_at: '2026-10-24T18:00:00.000Z', created_at: '2026-10-24T06:00:00.000Z', url: 'https://' + 'f'.repeat(48) + '.sv1.alias.hoody.test', ...o });
  it('the create body pins one path on pipe-1, lets the service draw the alias name, and expires in 15 min; a renew moves it 15 min on', () => {
    const b = aliasBody('c1', name, renewBody(Date.UTC(2026, 9, 24, 6)).expires_at);
    expect(b).toEqual({ computer_id: 'c1', program: 'pipe', index: 1, target_path: targetPathOf(name), allow_path_override: false, expires_at: '2026-10-24T06:15:00.000Z' });
    expect('alias' in b).toBe(false);
    expect(LINK_TTL_MS).toBe(15 * 60 * 1000);
    expect(RENEW_EVERY_MS).toBe(5 * 60 * 1000);
    expect(renewBody(Date.UTC(2026, 9, 24, 7))).toEqual({ expires_at: '2026-10-24T07:15:00.000Z' });
  });
  it('renewProves: the row expiring at or after the sent time proves it; the alias gone proves not applied; older proves nothing', () => {
    const id = { alias: 'al1', computer: 'c1', until: '2026-10-24T18:00:00.000Z' };
    // A fixed clock before the asked expiry: the real clock passes it (the earlier-expiry case is the next test's).
    const early = Date.parse(id.until) - 60_000;
    const ans = (rs: unknown[]) => [[aliasListOf({ data: { aliases: rs } }, 'c1')]];
    expect(renewProves(id, ans([row()]), early)).toBe('applied');
    expect(renewProves(id, ans([row({ expires_at: '2026-10-24T19:00:00.000Z' })]), early)).toBe('applied');
    expect(renewProves(id, ans([row({ expires_at: '2026-10-24T17:59:59.000Z' })]), early)).toBeUndefined();
    expect(renewProves(id, ans([row({ id: 'other' })]), early)).toBe('not_applied');
    expect(renewProves(id, ans([row({ id: 'al1', program: 'terminal' })]), early)).toBeUndefined();
    expect(renewProves(id, [[null]], early)).toBeUndefined();
    expect(renewProves({ alias: 'al1' }, ans([row()]), early)).toBeUndefined();
  });
  it('renewProves: listed with an earlier expiry once the asked one plus the settle window passed proves not applied (the link has expired either way)', () => {
    const id = { alias: 'al1', computer: 'c1', until: '2026-10-24T18:00:00.000Z' };
    const ans = [[aliasListOf({ data: { aliases: [row({ expires_at: '2026-10-24T17:55:00.000Z' })] } }, 'c1')]];
    const until = Date.parse(id.until);
    expect(renewProves(id, ans, until + CREATE_SETTLE_MS - 1)).toBeUndefined();
    expect(renewProves(id, ans, until + CREATE_SETTLE_MS)).toBe('not_applied');
  });
  it('renewProves: past the settle window, a listed row with no readable expiry, or an id whose row is not a broadcast alias, proves nothing', () => {
    const id = { alias: 'al1', computer: 'c1', until: '2026-10-24T18:00:00.000Z' };
    const late = Date.parse(id.until) + CREATE_SETTLE_MS + 1;
    const ans = (rs: unknown[]) => [[aliasListOf({ data: { aliases: rs } }, 'c1')]];
    expect(renewProves(id, ans([row({ expires_at: undefined })]), late)).toBeUndefined();
    expect(renewProves(id, ans([row({ expires_at: 'soon' })]), late)).toBeUndefined();
    expect(renewProves(id, ans([row({ program: 'terminal' })]), late)).toBeUndefined();
    expect(renewProves(id, ans([row({ id: 'other' })]), late)).toBe('not_applied');
  });
  it('shows only broadcast aliases (pipe, pinned, a broadcast target) but keeps every alias id', () => {
    const list = { data: { aliases: [row(), row({ id: 'x1', program: 'terminal' }), row({ id: 'x2', allow_path_override: true }), row({ id: 'x3', target_path: '/' }), row({ id: '' })] } };
    const l = aliasListOf(list, 'c1')!;
    expect(l.rows.map((a) => a.id)).toEqual(['al1']);
    expect(l.ids).toEqual(['al1', 'x1', 'x2', 'x3']);
    expect(aliasListOf({ data: {} }, 'c1')).toBeNull();
    expect(aliasOf(row())).toMatchObject({ id: 'al1', name, enabled: true });
    expect(aliasOf(row({ url: 'http://plain.test' }))?.url).toBe('');
    expect(aliasOf(row({ url: 'https://x.test/path?q' }))?.url).toBe('');
  });
  it('C9 verdicts read only lists of the change\'s own computer', () => {
    const a = aliasOf(row())!;
    const L = (rows: typeof a[], ids = rows.map((r) => r.id), computer = 'c1') => ({ computer, rows, ids });
    const until = '2026-10-24T06:15:00.000Z', t0 = Date.parse(until);
    expect(createProves({ computer: 'c1', name, until }, [[L([a])]], t0)).toBe('applied');
    expect(createProves({ computer: 'c1', name: 'bc-other', until }, [[L([a])]], t0)).toBeUndefined();
    // Absent: proves nothing until the create's own expiry (plus CREATE_SETTLE_MS) has passed, then not applied.
    expect(createProves({ computer: 'c1', name: 'bc-other', until }, [[L([a])]], t0 + CREATE_SETTLE_MS - 1)).toBeUndefined();
    expect(createProves({ computer: 'c1', name: 'bc-other', until }, [[L([a])]], t0 + CREATE_SETTLE_MS)).toBe('not_applied');
    expect(createProves({ computer: 'c1', name }, [], t0)).toBeUndefined();
    expect(createProves({ computer: 'c1', name, until }, [[L([a], undefined, 'c2')]], t0)).toBeUndefined();
    expect(createProves({ computer: 'c1', name: 'bc-other', until }, [[L([], [], 'c2')]], t0 + 10 * CREATE_SETTLE_MS)).toBeUndefined();
    expect(removeProves({ computer: 'c1', alias: 'al1' }, [[L([])]])).toBe('applied');
    expect(removeProves({ computer: 'c1', alias: 'al1' }, [[L([a])]])).toBeUndefined();
    // Another computer's empty list never proves this computer's remove.
    expect(removeProves({ computer: 'c1', alias: 'al1' }, [[L([], [], 'c2')]])).toBeUndefined();
    expect(removeProves({ alias: 'al1' }, [[L([])]])).toBeUndefined();
    // Edited into another shape (no longer shown as a broadcast alias) but still listed: not removed.
    expect(removeProves({ computer: 'c1', alias: 'al1' }, [[L([], ['al1'])]])).toBeUndefined();
    expect(removeProves({ computer: 'c1', alias: 'al1' }, [[]])).toBeUndefined();
    expect(removeProves({ computer: 'c1', alias: 'al1' }, [[null]])).toBeUndefined();
    expect(removeProves({ computer: 'c1', alias: '' }, [[L([])]])).toBeUndefined();
    expect(renewProves({ computer: 'c1', alias: 'al1', until: '2026-10-24T18:00:00.000Z' }, [[L([a], undefined, 'c2')]], Date.UTC(2026, 9, 24, 17))).toBeUndefined();
  });
  it('usable: an https url, enabled and not expired', () => {
    const a = aliasOf(row())!, now = Date.parse('2026-10-24T17:00:00Z');
    expect(usable(a, now)).toBe(true);
    expect(usable({ ...a, enabled: false }, now)).toBe(false);
    expect(usable({ ...a, url: '' }, now)).toBe(false);
    expect(usable(a, Date.parse('2026-10-24T18:00:00Z'))).toBe(false);
  });
  it('expired: past its expiry', () => {
    const a = aliasOf(row())!;
    expect(expired(a, Date.parse('2026-10-24T17:59:59Z'))).toBe(false);
    expect(expired(a, Date.parse('2026-10-24T18:00:00Z'))).toBe(true);
  });
});
