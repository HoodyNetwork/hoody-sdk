// captureDisplay on the REAL core (download, admit, send) over a recorded transport: what goes out, what is never a File, how a
// press ends, and the framed page. From the first code read of this feature (reader 1), kept as tests.
import { afterEach, describe, expect, it } from 'vitest';
import { bump } from '../../core/ctx';
import { endAccount } from '../../core/realm';
import { installTransport, fixtureTransport, answers, reply, type Transport } from '../../core/transport';
import { boot, PROXY, R1, TARGET } from '../../core/test/env';
import { captureDisplay, displaysOf, shotCtx, shotRoutes, ShotError } from './displayShot';

type Ans = { status?: number; type?: string; body?: Uint8Array | string; hold?: boolean; redirect?: boolean };
type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let answer: () => Ans = () => ({});
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const t: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch(url, init) {
    reqs.push({ url, init });
    const a = answer();
    if (a.redirect) return Promise.resolve(new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/x.png' } }));
    const signal = init.signal;
    if (a.hold) return new Promise((_r, rej) => { signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); });
    return Promise.resolve(new Response((a.body ?? PNG) as BodyInit, { status: a.status ?? 200, headers: { 'content-type': a.type ?? 'image/png' } }));
  },
};
function page(framed = false) { boot({ realm: R1, framed }); reqs = []; answer = () => ({}); installTransport(t); }
afterEach(() => { installTransport(null); });
const why = (p: Promise<unknown>) => p.then(() => 'RESOLVED', (e: unknown) => (e instanceof ShotError ? e.why : 'not-a-ShotError'));

describe('the request', () => {
  it('goes to display N of the target, no query, no credentials, redirect manual, GET', async () => {
    page();
    const f = await captureDisplay(TARGET, 7, { ctx: shotCtx(TARGET) });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.url).toBe(`https://p1-c1-display-7.sv1.${PROXY}/api/v1/display/screenshot`);
    expect(reqs[0]!.init.method).toBe('GET');
    expect(reqs[0]!.init.credentials).toBe('omit');
    expect(reqs[0]!.init.redirect).toBe('manual');
    expect(reqs[0]!.init.body).toBeUndefined();
    expect(Object.keys(reqs[0]!.init.headers as object).map((k) => k.toLowerCase())).toEqual(['accept']);
    expect(f.type).toBe('image/png');
  });
  it('an index outside 1..9999 or not an integer is refused unsent', async () => {
    page();
    for (const n of [0, -1, 10000, 1.5, Number.NaN]) expect(await why(captureDisplay(TARGET, n, { ctx: shotCtx(TARGET) }))).toBe('failed');
    expect(reqs).toHaveLength(0);
  });
});

describe('what is not a PNG is never a File', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  it.each([
    ['html as text/html', { type: 'text/html', body: enc('<html><script>alert(1)</script></html>') }],
    ['html labelled image/png', { type: 'image/png', body: enc('<html><script>alert(1)</script></html>') }],
    ['svg as image/svg+xml', { type: 'image/svg+xml', body: enc('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') }],
    ['svg labelled image/png', { type: 'image/png', body: enc('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>') }],
    ['json (the base64 form)', { type: 'application/json', body: enc('{"image":{"data":"iVBORw0KGgo=","mimeType":"image/png"}}') }],
    ['empty body', { type: 'image/png', body: new Uint8Array(0) }],
    ['7 of 8 signature bytes', { type: 'image/png', body: PNG.slice(0, 7) }],
    ['jpeg', { type: 'image/jpeg', body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0]) }],
    ['gif', { type: 'image/gif', body: enc('GIF89a........') }],
  ] as const)('%s -> notImage', async (_n, a) => {
    page();
    answer = () => a as Ans;
    expect(await why(captureDisplay(TARGET, 1, { ctx: shotCtx(TARGET) }))).toBe('notImage');
  });
  it('PNG bytes labelled text/html ARE accepted (the header is not read): the File is typed image/png', async () => {
    page();
    answer = () => ({ type: 'text/html' });
    const r = await captureDisplay(TARGET, 1, { ctx: shotCtx(TARGET) }).then((f) => f.type, () => 'refused');
    expect(r).toBe('image/png');
  });
  it('a redirect is never followed and adds nothing', async () => {
    page();
    answer = () => ({ redirect: true });
    expect(await why(captureDisplay(TARGET, 1, { ctx: shotCtx(TARGET) }))).toBe('failed');
    expect(reqs).toHaveLength(1);
  });
  it.each([[401, 'private'], [403, 'private'], [503, 'gone'], [500, 'failed'], [429, 'failed'], [400, 'failed'], [404, 'failed']] as const)('status %i -> %s', async (status, w) => {
    page();
    answer = () => ({ status, type: 'application/json', body: new TextEncoder().encode('{"error":"x","code":"Y"}') });
    expect(await why(captureDisplay(TARGET, 1, { ctx: shotCtx(TARGET) }))).toBe(w);
  });
});

describe('aborts', () => {
  it('the caller signal mid-capture -> stale (nothing said, nothing added)', async () => {
    page();
    answer = () => ({ hold: true });
    const ac = new AbortController();
    const p = why(captureDisplay(TARGET, 1, { ctx: shotCtx(TARGET), signal: ac.signal }));
    await new Promise((r) => setTimeout(r, 5));
    expect(reqs).toHaveLength(1);
    ac.abort();
    expect(await p).toBe('stale');
    expect(reqs[0]!.init.signal!.aborted).toBe(true);
  });
  it('a generation bump (realm switch) mid-capture -> stale and the fetch is aborted', async () => {
    page();
    answer = () => ({ hold: true });
    const p = why(captureDisplay(TARGET, 1, { ctx: shotCtx(TARGET) }));
    await new Promise((r) => setTimeout(r, 5));
    bump('test');
    expect(await p).toBe('stale');
    expect(reqs[0]!.init.signal!.aborted).toBe(true);
  });
  it('the account ending mid-capture: the answer that arrives later is dropped as stale', async () => {
    page();
    let release!: (r: Response) => void;
    installTransport({ ...t, fetch: (url, init) => { reqs.push({ url, init }); return new Promise((r) => { release = r; }); } });
    const p = why(captureDisplay(TARGET, 1, { ctx: shotCtx(TARGET) }));
    await new Promise((r) => setTimeout(r, 5));
    try { await Promise.resolve(endAccount('test' as never)); } catch { /* reported by the outcome */ }
    release(new Response(PNG as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } }));
    expect(await p).toBe('stale');
  });
  it('an already-dead context sends nothing', async () => {
    page();
    const ctx = shotCtx(TARGET);
    bump('test');
    expect(await why(captureDisplay(TARGET, 1, { ctx }))).toBe('stale');
    expect(reqs).toHaveLength(0);
  });
});

describe('the framed page', () => {
  it('a capture in a Hub shown inside another page is refused by core\'s own admit, unsent', async () => {
    page(true);
    expect((shotRoutes.capture as { framed?: unknown }).framed).toBe(false);
    expect(await why(captureDisplay(TARGET, 1, { ctx: shotCtx(TARGET) }))).toBe('framed');
    expect(reqs).toHaveLength(0);
  });
});

describe('fixture transport bytes', () => {
  it('answers.bytes reaches download byte for byte; a string raw answer and a JSON answer are as before', async () => {
    page();
    const ft = fixtureTransport([reply(shotRoutes.capture, answers.bytes(PNG, 'image/png'))]);
    installTransport(ft);
    const f = await captureDisplay(TARGET, 1, { ctx: shotCtx(TARGET) });
    expect(new Uint8Array(await f.arrayBuffer())).toEqual(PNG);
    const res = await ft.fetch('https://x.test/', {}, { route: shotRoutes.capture, method: 'GET', path: '/api/v1/display/screenshot', query: {}, body: null, target: TARGET } as never);
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});

describe('which displays', () => {
  const rt = (displays: unknown) => ({ data: { runtime_info: { displays } } });
  it('parked, x-live, stateless and unknown states never; live yes', () => {
    expect(displaysOf(rt([{ display: 1, state: 'parked' }, { display: 2, state: 'x-live' }, { display: 3, state: 'live' }, { display: 4 }, { display: 5, state: null }, { display: 6, state: 'LIVE' }])).map((d) => d.n)).toEqual([3]);
  });
  it('bidi controls, zero-width and control characters leave a window title', () => {
    const got = displaysOf(rt([{ display: 1, state: 'live', windows: [{ title: 'safe\u202egnp.exe\u2066\u200b\u0000\u0007<b>x</b>' }] }]))[0]!.titles[0]!;
    expect(got).toBe('safegnp.exe<b>x</b>');
  });
});
