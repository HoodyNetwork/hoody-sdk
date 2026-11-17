// Vitest: readSessionImage, the one read of a picture a person attached to a chat message. What goes out (the chat's agent, the
// chat's realm, a GET, no bearer), what comes back as a picture and what does not, the size bound, the abort, a page whose
// context died, a framed page and a session opened with an access key.
import { afterEach, describe, expect, it } from 'vitest';
import { bump, setIdentity } from '@core/ctx';
import { resetToken } from '@core/token';
import { installTransport, type Transport } from '@core/transport';
import { AGENT, boot, R1, R2, TARGET, UID } from '@core/test/env';
import { SESSION_IMAGE_MAX, readSessionImage, sessionImageId, sessionImageRoute } from './sessionImage';

const ID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const SID = 'sess-1';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]);
const text = (v: string) => new TextEncoder().encode(v);

type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let answer: (r: Req) => { status?: number; type?: string; body?: Uint8Array; hold?: boolean } = () => ({ body: PNG });
const transport: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch(url, init) {
    const r = { url, init };
    reqs.push(r);
    const a = answer(r);
    if (a.hold) {
      return new Promise<Response>((_res, rej) => { init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); });
    }
    return Promise.resolve(new Response((a.body ?? new Uint8Array()) as BodyInit, { status: a.status ?? 200, headers: { 'content-type': a.type ?? 'image/png' } }));
  },
};
function page(o: { framed?: boolean } = {}) {
  boot({ realm: R1, framed: o.framed });
  reqs = [];
  answer = () => ({ body: PNG });
  installTransport(transport);
}
const settled = <T,>(p: Promise<T>) => p.then((v) => ({ ok: v, e: undefined as never }), (e) => ({ ok: undefined, e: e as { kind?: string; code?: string; status?: number } }));
afterEach(() => { installTransport(null); });

describe('readSessionImage: the request', () => {
  it('is one GET to the chat\'s agent, in the chat\'s realm, with no bearer and no Hoody header', async () => {
    page();
    const got = await readSessionImage(TARGET, R2, SID, ID);
    expect(got && [...got]).toEqual([...PNG]);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.url).toBe(`${AGENT}/sessions/${SID}/images/${ID}?realm=${R2}`);
    expect(reqs[0]!.init.method ?? 'GET').toBe('GET');
    const sent: Record<string, string> = {};
    new Headers(reqs[0]!.init.headers ?? {}).forEach((v, k) => { sent[k.toLowerCase()] = v; });
    expect(Object.keys(sent).filter((k) => k === 'authorization' || k.startsWith('x-hoody-'))).toEqual([]);
    expect(reqs[0]!.init.body ?? null).toBeNull();
  });
  it('the route is the declared one: a GET on the agent, bounded, with no query or body key of its own', () => {
    expect(sessionImageRoute).toMatchObject({ method: 'GET', path: '/sessions/:id/images/:image', scope: 'agent', maxBytes: SESSION_IMAGE_MAX });
    expect(SESSION_IMAGE_MAX).toBe(16 * 1024 * 1024);
  });
  it('an id that is not 64 lower-case hex, or no chat id, asks nothing', async () => {
    page();
    for (const bad of ['', 'abc', ID.toUpperCase(), ID + '0', ID.slice(1), `../${ID}`, `${ID}?x=1`, ID.replace('9', 'g')]) {
      expect(sessionImageId(bad)).toBeNull();
      expect(await readSessionImage(TARGET, R1, SID, bad)).toBeNull();
    }
    expect(await readSessionImage(TARGET, R1, '', ID)).toBeNull();
    expect(reqs).toHaveLength(0);
  });
});

describe('readSessionImage: what counts as a picture', () => {
  it('PNG, JPEG, GIF and WebP bytes are handed on', async () => {
    page();
    for (const b of [PNG, JPEG, GIF, WEBP]) {
      answer = () => ({ body: b });
      const got = await readSessionImage(TARGET, R1, SID, ID);
      expect(got && [...got]).toEqual([...b]);
    }
  });
  it('anything else is no picture, whatever content type the answer claims: SVG, HTML, JSON, an empty body', async () => {
    page();
    for (const [body, type] of [
      [text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml'],
      [text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/png'],
      [text('<!doctype html><script>alert(1)</script>'), 'image/png'],
      [text('{"error":"nope"}'), 'application/json'],
      [new Uint8Array(), 'image/png'],
      [new Uint8Array([0x42, 0x4d, 0, 0]), 'image/bmp'],
    ] as const) {
      answer = () => ({ body, type });
      expect(await readSessionImage(TARGET, R1, SID, ID)).toBeNull();
    }
  });
  it('real picture bytes under a wrong content type are still judged by the bytes (the type header is never what gets drawn)', async () => {
    page();
    answer = () => ({ body: PNG, type: 'application/octet-stream' });
    expect(await readSessionImage(TARGET, R1, SID, ID)).not.toBeNull();
  });
});

describe('readSessionImage: refusals', () => {
  it('a picture the agent no longer has (404) rejects after ONE request: nothing here asks again', async () => {
    page();
    answer = () => ({ status: 404, type: 'application/json', body: text('{"code":"not_found"}') });
    const r = await settled(readSessionImage(TARGET, R1, SID, ID));
    expect(r.e.status).toBe(404);
    expect(reqs).toHaveLength(1);
  });
  it('an answer larger than the bound is refused, not drawn', async () => {
    page();
    const big = new Uint8Array(SESSION_IMAGE_MAX + 1);
    big.set(PNG);
    answer = () => ({ body: big });
    const r = await settled(readSessionImage(TARGET, R1, SID, ID));
    expect(r.ok).toBeUndefined();
    expect(r.e.kind).toBe('too_large');
  });
  it('the caller\'s abort ends the read: it rejects, and nothing is handed on', async () => {
    page();
    answer = () => ({ hold: true });
    const stop = new AbortController();
    const p = settled(readSessionImage(TARGET, R1, SID, ID, stop.signal));
    await new Promise((r) => setTimeout(r, 5));
    expect(reqs).toHaveLength(1);
    stop.abort();
    const r = await p;
    expect(r.ok).toBeUndefined();
    expect(r.e.kind).toBe('aborted');
  });
  it('a page whose context died while the read was out gets nothing (stale), even though the bytes arrived', async () => {
    page();
    let release: (v: Response) => void = () => {};
    installTransport({ ...transport, fetch: (url, init) => { reqs.push({ url, init }); return new Promise<Response>((res) => { release = res; }); } });
    const p = settled(readSessionImage(TARGET, R1, SID, ID));
    await new Promise((r) => setTimeout(r, 5));
    bump('another account');
    release(new Response(PNG as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } }));
    const r = await p;
    expect(r.ok).toBeUndefined();
    expect(r.e.kind).toBe('stale');
  });
});

describe('readSessionImage: a framed page and an access-key session', () => {
  // The AI page is `sensitive`: inside a frame the router draws a refusal and never loads its view, so no chat row asks. The read
  // itself is judged as the transcript read of the same chat is (an agent GET that changes nothing).
  it('in a frame the read is judged like the transcript read of the same chat', async () => {
    page({ framed: true });
    const r = await settled(readSessionImage(TARGET, R1, SID, ID));
    expect(r.ok && [...r.ok]).toEqual([...PNG]);
    expect(reqs).toHaveLength(1);
  });
  const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
  const keyTab = (pin: string) => {
    boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: JSON.stringify({ v: 1, token: TOKEN, realm: pin, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } }) } });
    resetToken();
    setIdentity({ id: UID, banned: false });
    reqs = [];
    answer = () => ({ body: PNG });
    installTransport(transport);
  };
  it('an access key pinned to one realm: the read goes in the pinned realm whatever the chat names, still with no bearer (the agent decides)', async () => {
    keyTab(R1);
    await readSessionImage(TARGET, R2, SID, ID);
    expect(reqs.map((x) => x.url)).toEqual([`${AGENT}/sessions/${SID}/images/${ID}?realm=${R1}`]);
    const sent: string[] = [];
    new Headers(reqs[0]!.init.headers ?? {}).forEach((_v, k) => { sent.push(k.toLowerCase()); });
    expect(sent.filter((k) => k === 'authorization' || k.startsWith('x-hoody-'))).toEqual([]);
  });
  it('an access key with no realm limit: the read goes in the chat\'s own realm', async () => {
    keyTab('all');
    await readSessionImage(TARGET, R2, SID, ID);
    expect(reqs.map((x) => x.url)).toEqual([`${AGENT}/sessions/${SID}/images/${ID}?realm=${R2}`]);
  });
});
