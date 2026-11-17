// Vitest: the screenshot of a display behind the composer's add menu (displayShot.ts): which displays are offered, the one
// capture request and where it goes, the file it becomes, and how core's rejections read. No request leaves here: core's api and
// download are scripted.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type { Target } from '@core';
import { SHOT_BYTES, ShotError, captureDisplay, displaysOf, isDisplayNumber, listDisplays, shotCtx, shotName, shotRoutes, shotWhy } from './displayShot';

const core = vi.hoisted(() => ({ api: vi.fn(), download: vi.fn() }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return { ...real, api: (...a: unknown[]) => core.api(...a), download: (...a: unknown[]) => core.download(...a) };
});

const target: Target = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'sg1' } };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const runtime = (displays: unknown) => ({ data: { runtime_info: { displays } } });

beforeEach(() => { core.api.mockReset(); core.download.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('the capture route', () => {
  it('is one GET to the display program, named by the display number alone: no query, no body', () => {
    const r = shotRoutes.capture;
    expect(r).toMatchObject({ method: 'GET', path: '/api/v1/display/screenshot', scope: 'kit', kit: 'display', maxBytes: SHOT_BYTES });
    expect(r.query).toEqual([]);
    expect(r.body).toBeNull();
    const index = r.index as (n: number) => boolean;
    expect([1, 10, 1601, 9999].every(index)).toBe(true);
    expect([0, -1, 1.5, 10000, Number.NaN].some(index)).toBe(false);
    expect(isDisplayNumber('1')).toBe(false);
  });
});

describe('displaysOf', () => {
  it('offers the displays that run now, by number, with their windows', () => {
    const got = displaysOf(runtime([
      { display: 12, state: 'live', windows: [{ title: '  Firefox \n Nightly ' }, { title: 'Terminal' }, { title: 'Files' }] },
      { display: 1, state: 'live', windows: [] },
    ]));
    expect(got).toEqual([{ n: 1, windows: 0, titles: [] }, { n: 12, windows: 3, titles: ['Firefox Nightly', 'Terminal'] }]);
  });
  it('never offers a display that waits for its first use or runs without its viewer', () => {
    expect(displaysOf(runtime([{ display: 2, state: 'parked' }, { display: 3, state: 'x-live' }, { display: 4, state: 'other' }]))).toEqual([]);
  });
  it('never offers a display whose state is not said: a state this Hub does not know arrives without one, and a capture would start it', () => {
    expect(displaysOf(runtime([{ display: 1 }, { display: 2, state: null }, { display: 3, state: 'LIVE' }, { display: 4, state: 'live' }])).map((d) => d.n)).toEqual([4]);
  });
  it('leaves out anything that is not a display row, and a number named twice', () => {
    expect(displaysOf(runtime([null, 'x', { display: '1' }, { display: 0 }, { display: 10000 }, { display: 5, state: 'live' }, { display: 5, state: 'live', windows: [{}] }]))).toEqual([{ n: 5, windows: 0, titles: [] }]);
  });
  it('an answer that is not a list offers nothing', () => {
    for (const a of [null, {}, { data: {} }, { data: { runtime_info: {} } }, runtime('1')]) expect(displaysOf(a)).toEqual([]);
  });
  it('a long title is cut', () => {
    expect(displaysOf(runtime([{ display: 1, state: 'live', windows: [{ title: 'x'.repeat(200) }] }]))[0]?.titles[0]).toHaveLength(60);
  });
  it('a title loses control characters, zero-width marks and direction overrides before it is cut; markup stays text', () => {
    const title = (t: string) => displaysOf(runtime([{ display: 1, state: 'live', windows: [{ title: t }] }]))[0]?.titles[0];
    // The reader's string: a right-to-left override, an isolate, a zero-width space, NUL and BEL around ordinary text.
    expect(title('safe\u202egnp.exe\u2066\u200b\u0000\u0007<b>x</b>')).toBe('safegnp.exe<b>x</b>');
    expect(title('a\u0085b\u009fc\u200fd\u202ae\u2069f\u007fg')).toBe('abcdefg');
    expect(title('tab\there\nnext')).toBe('tab here next');
    // Hidden characters do not use up the 60: the cut counts what is shown.
    expect(title('\u200b'.repeat(100) + 'y'.repeat(70))).toBe('y'.repeat(60));
    // A title that is only hidden characters is no title.
    expect(displaysOf(runtime([{ display: 1, state: 'live', windows: [{ title: '\u202e\u200b\u0000' }] }]))[0]).toEqual({ n: 1, windows: 1, titles: [] });
  });
});

describe('shotName', () => {
  it('names the display and the local second it was taken', () => {
    expect(shotName(1, new Date(2026, 10, 16, 5, 30, 59))).toBe('display-1 2026-11-16 05-30-59.png');
    expect(shotName(1601, new Date(2026, 0, 2, 13, 4))).toBe('display-1601 2026-01-02 13-04-00.png');
  });
});

describe('shotWhy', () => {
  it('reads core\'s rejections', () => {
    expect(shotWhy({ kind: 'unavailable', status: 503, code: 'DISPLAY_NOT_AVAILABLE' })).toBe('gone');
    expect(shotWhy({ kind: 'unreachable', status: 0, code: 'TIMEOUT' })).toBe('unreachable');
    expect(shotWhy({ kind: 'private', status: 403 })).toBe('private');
    expect(shotWhy({ kind: 'refused', status: 401 })).toBe('private');
    expect(shotWhy({ kind: 'not_sent', status: 0, code: 'TOKEN_LACKS', perm: 'computers.read' })).toBe('private');
    expect(shotWhy({ kind: 'not_sent', status: 0, code: 'FRAMED_ACTION_REFUSED' })).toBe('framed');
    expect(shotWhy({ kind: 'too_large', status: 200 })).toBe('tooBig');
    expect(shotWhy({ kind: 'stale' })).toBe('stale');
    expect(shotWhy({ kind: 'aborted' })).toBe('stale');
    expect(shotWhy({ kind: 'unavailable', status: 500, code: 'SCREENSHOT_FAILED' })).toBe('failed');
    expect(shotWhy(null)).toBe('failed');
  });
});

describe('listDisplays', () => {
  it('reads the chat\'s computer once, by its id, with runtime', async () => {
    core.api.mockResolvedValue(runtime([{ display: 1, state: 'live' }]));
    const ctx = shotCtx(target);
    await expect(listDisplays(target, { ctx })).resolves.toEqual([{ n: 1, windows: 0, titles: [] }]);
    expect(core.api).toHaveBeenCalledTimes(1);
    const [route, input] = core.api.mock.calls[0] as [{ method: string; path: string; scope: string }, { params: unknown; query: unknown; ctx: unknown }];
    expect(route).toMatchObject({ method: 'GET', path: '/computers/:id', scope: 'realm' });
    expect(input).toMatchObject({ params: { id: target.container.id }, query: { runtime: true } });
    expect(input.ctx).toBe(ctx);
  });
  it('a failed read is a ShotError', async () => {
    core.api.mockRejectedValue({ kind: 'unreachable', status: 0 });
    await expect(listDisplays(target, { ctx: shotCtx(target) })).rejects.toMatchObject({ why: 'unreachable' });
  });
});

describe('captureDisplay', () => {
  it('asks the chat\'s computer for that display once and makes a PNG file of the bytes, storing nothing', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    core.download.mockResolvedValue({ parts: [new Blob([PNG])], bytes: PNG.length });
    const ctx = shotCtx(target);
    const file = await captureDisplay(target, 7, { ctx, now: new Date(2026, 10, 16, 5, 30) });
    expect(core.download).toHaveBeenCalledTimes(1);
    const [route, input] = core.download.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(route).toBe(shotRoutes.capture);
    expect(input).toMatchObject({ target, index: 7, maxBytes: SHOT_BYTES });
    expect(input.ctx).toBe(ctx);
    expect(Object.keys(input).sort()).toEqual(['ctx', 'index', 'maxBytes', 'signal', 'target']);
    expect(file.name).toMatch(/^display-7 2026-11-16 05-30-\d\d\.png$/);
    expect(file.type).toBe('image/png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG);
    expect(core.api).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it('an answer that is not a PNG attaches nothing', async () => {
    core.download.mockResolvedValue({ parts: [new Blob(['<html>'])], bytes: 6 });
    await expect(captureDisplay(target, 1, { ctx: shotCtx(target) })).rejects.toMatchObject({ why: 'notImage' });
  });
  it('a capture over the byte bound, a stopped display and a lost answer each read as their own reason', async () => {
    core.download.mockRejectedValueOnce({ kind: 'too_large', status: 200 });
    await expect(captureDisplay(target, 1, { ctx: shotCtx(target) })).rejects.toMatchObject({ why: 'tooBig' });
    core.download.mockRejectedValueOnce({ kind: 'unavailable', status: 503, code: 'DISPLAY_NOT_AVAILABLE' });
    await expect(captureDisplay(target, 1, { ctx: shotCtx(target) })).rejects.toMatchObject({ why: 'gone' });
    core.download.mockRejectedValueOnce({ kind: 'unreachable', status: 0, code: 'NETWORK' });
    const e = await captureDisplay(target, 1, { ctx: shotCtx(target) }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ShotError);
    expect((e as ShotError).why).toBe('unreachable');
  });
});

describe('a listing that does not list displays', () => {
  it.each([[{ data: { runtime_info: {} } }], [{ data: {} }], [{}], [null], [{ data: { runtime_info: { displays: 'none' } } }]])('%j was not read: it rejects as failed, never as "no display runs"', async (answer) => {
    core.api.mockResolvedValue(answer);
    await expect(listDisplays(target, { ctx: shotCtx(target) })).rejects.toMatchObject({ why: 'failed' });
  });
  it('an empty list is a read: no display runs', async () => {
    core.api.mockResolvedValue({ data: { runtime_info: { displays: [] } } });
    await expect(listDisplays(target, { ctx: shotCtx(target) })).resolves.toEqual([]);
  });
});