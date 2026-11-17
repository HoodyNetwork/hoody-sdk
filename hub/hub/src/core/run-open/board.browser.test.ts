// The Board's browser requests: a new browser-N started with the person's options, and the DevTools
// address read without starting anything. boardRoute() admits only these two GETs, on browser ids 1-7500, with a closed
// query; boardSend() sends them to browser-N.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, onPending, outcomeOf, type HubError, type PendingNotice } from '../api';
import { bump } from '../ctx';
import { errorInfo } from '../errors';
import { download } from '../kit-io';
import { admit } from '../kit';
import { defineQuery } from '../query';
import { buildRequest, defineRoute } from '../routes';
import { coreSource } from '../source';
import { boot, calls, env, onFetch, PROXY, R1, TARGET } from '../test/env';
import { boardFixtureRoute, boardSend } from './board';
import { BOARD_BROWSER_IDS, boardRoute } from './kitRoutes';

const START = '/api/v1/browser/start';
const DEVTOOLS = '/api/v1/browser/devtools-url';
const SHOWN = { showBrowser: true };
const start = (query: Record<string, unknown>, n = 3) => boardRoute('browser', n, 'GET', START, { ...SHOWN, ...query }, undefined);
const devtools = (query: Record<string, unknown>, n = 3) => boardRoute('browser', n, 'GET', DEVTOOLS, query, undefined);

describe('boardRoute: browser start', () => {
  it('admits every offered option, booleans as booleans or their words', () => {
    expect(start({})).toBeNull();
    expect(start({ showBrowser: 'true' })).toBeNull();
    expect(start({
      start: true, browser: 'chromium', chromiumVersion: '131', stealth: true, showDevtools: 'false', fingerprintId: 'kiosk-1080p',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', locale: 'de-DE', timezoneId: 'Europe/Berlin',
      geolocation: '{"latitude":52.5,"longitude":13.4,"accuracy":50}', viewport: '{"width":1280,"height":800}',
      proxyServer: 'socks5h://10.0.0.2:1080', proxyUsername: 'me', proxyPassword: 'p a$$', proxyBypass: '*.local,localhost',
      enableQuic: 'true', enableDnsOverHttps: false, dnsOverHttpsUrl: 'https://dns.example/dns-query',
      extensionsStoreIds: 'abcdefghijklmnopabcdefghijklmnop', extensions: '/home/me/ext', sessionName: 'Shop test', showBrowser: 'true',
    })).toBeNull();
    expect(start({ browser: 'firefox', noViewport: true })).toBeNull();
    for (const n of [BOARD_BROWSER_IDS[0], BOARD_BROWSER_IDS[1]]) expect(start({}, n)).toBeNull();
  });
  it('refuses what the Board never sends: other keys, the instance selector, a hidden browser, debugging and frame options', () => {
    for (const k of ['launchArguments', 'browser_id', 'browser_host', 'remoteDebuggingPort', 'remoteDebuggingAddress', 'useRemoteDebuggingPort', 'display', 'iframe', 'iframe_url', 'maximize_new_windows', 'firefoxExecutablePath', 'firefoxVersion', 'userProfile', 'x']) {
      expect([k, start({ [k]: '1' })]).toEqual([k, 'ROUTE_REFUSED']);
    }
    expect(start({ showBrowser: false })).toBe('ROUTE_REFUSED');
    // showBrowser=true always: a fingerprint profile may default to a hidden browser.
    expect(boardRoute('browser', 3, 'GET', START, {}, undefined)).toBe('ROUTE_REFUSED');
    expect(boardRoute('browser', 3, 'GET', START, { fingerprintId: 'custom-headless' }, undefined)).toBe('ROUTE_REFUSED');
    expect(start({ start: false })).toBe('ROUTE_REFUSED');
  });
  it('refuses a malformed value', () => {
    const bad: Record<string, unknown>[] = [
      { browser: 'chrome' }, { browser: 'webkit' }, { stealth: 'yes' }, { enableQuic: 1 }, { noViewport: 'TRUE' },
      { viewport: '[1280,800]' }, { viewport: 'null' }, { viewport: '{bad' }, { geolocation: '42' },
      { viewport: '{"width":1}', noViewport: true },
      { proxyServer: 'ftp://x' }, { proxyServer: 'socks5://a b' }, { dnsOverHttpsUrl: 'http://dns.example/q' },
      { userAgent: 'a\nb' }, { sessionName: 'x\u0085' }, { locale: 'x'.repeat(2049) }, { fingerprintId: { a: 1 } }, { locale: '' },
    ];
    for (const q of bad) expect([q, start(q)]).toEqual([q, 'ROUTE_REFUSED']);
  });
  it('only on browser ids 1-7500 (browser N shows on display 500 + N, which must stay below the launch band), and never with a body', () => {
    for (const n of [0, BOARD_BROWSER_IDS[1] + 1, 8001, '3', 1.5]) expect([n, start({}, n as number)]).toEqual([n, 'ROUTE_REFUSED']);
    expect(boardRoute('browser', 3, 'GET', START, SHOWN, {})).toBe('ROUTE_REFUSED');
    expect(boardRoute('browser', 3, 'POST', START, SHOWN, {})).toBe('ROUTE_REFUSED');
    expect(boardRoute('browser', 3, 'GET', '/api/v1/browser/stop', {}, undefined)).toBe('ROUTE_REFUSED');
  });
});

describe('boardRoute: browser DevTools address', () => {
  it('only with start=false (a read never starts the browser)', () => {
    expect(devtools({ start: false })).toBeNull();
    expect(devtools({ start: 'false' })).toBeNull();
    for (const q of [{}, { start: true }, { start: 'true' }, { start: 'false', browser: 'chromium' }, { start: 0 }]) expect([q, devtools(q)]).toEqual([q, 'ROUTE_REFUSED']);
  });
});

describe('boardSend: browser', () => {
  it('sends to browser-N, credentials omitted; the fixture route names each request', async () => {
    boot();
    onFetch(() => ({ status: 200, body: { ok: true } }));
    await boardSend({ kit: 'browser', index: 3 }, 'GET', START, { target: TARGET, query: { start: true, showBrowser: true, browser: 'firefox' } });
    await boardSend({ kit: 'browser', index: 3 }, 'GET', DEVTOOLS, { target: TARGET, query: { start: false } });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET https://p1-c1-browser-3.sv1.${PROXY}${START}?start=true&showBrowser=true&browser=firefox`,
      `GET https://p1-c1-browser-3.sv1.${PROXY}${DEVTOOLS}?start=false`,
    ]);
    expect(calls.every((c) => c.credentials === 'omit')).toBe(true);
    expect(boardFixtureRoute('browser', 'GET', START)).not.toBe(boardFixtureRoute('browser', 'GET', DEVTOOLS));
  });
  it('the start waits as long as the kit\'s own launch timeout (600 s) plus a minute; the DevTools read keeps core\'s default', () => {
    expect(boardFixtureRoute('browser', 'GET', START).timeoutMs).toBe(660_000);
    expect(boardFixtureRoute('browser', 'GET', DEVTOOLS).timeoutMs).toBeUndefined();
  });
  it('a refused request rejects unsent', async () => {
    boot();
    onFetch(() => ({ status: 200, body: {} }));
    await expect(boardSend({ kit: 'browser', index: 3 }, 'GET', START, { target: TARGET, query: { showBrowser: true, remoteDebuggingPort: 9222 } })).rejects.toEqual({ notSent: true, code: 'ROUTE_REFUSED' });
    await expect(boardSend({ kit: 'browser', index: 3 }, 'GET', START, { target: TARGET, query: { showBrowser: true, launchArguments: '["--headless=new"]' } })).rejects.toEqual({ notSent: true, code: 'ROUTE_REFUSED' });
    await expect(boardSend({ kit: 'browser', index: 9000 }, 'GET', DEVTOOLS, { target: TARGET, query: { start: false } })).rejects.toEqual({ notSent: true, code: 'ROUTE_REFUSED' });
    expect(calls).toHaveLength(0);
  });
  it('the start (it creates an instance) and the DevTools read (its address grants access) are refused unsent in a framed page', async () => {
    boot({ framed: true });
    onFetch(() => ({ status: 200, body: {} }));
    const start = boardFixtureRoute('browser', 'GET', START);
    await expect(boardSend({ kit: 'browser', index: 3 }, 'GET', START, { target: TARGET, query: SHOWN })).rejects.toMatchObject({ notSent: true });
    await expect(api(start, { target: TARGET, index: 3, query: SHOWN })).rejects.toMatchObject({ notSent: true });
    expect(calls).toHaveLength(0);
    boot();
    onFetch(() => ({ status: 200, body: {} }));
    env.framed = true;
    await expect(boardSend({ kit: 'browser', index: 3 }, 'GET', DEVTOOLS, { target: TARGET, query: { start: false } })).rejects.toMatchObject({ notSent: true });
    env.framed = false;
    expect(calls).toHaveLength(0);
  });
  it('a refused start keeps only its code: a message or details echoing the proxy password never survive', async () => {
    boot();
    onFetch(() => ({ status: 400, body: { code: 'VALIDATION_ERROR', message: 'bad proxyPassword s3cr3t', details: { proxyPassword: 's3cr3t' } } }));
    const e = await boardSend({ kit: 'browser', index: 3 }, 'GET', START, { target: TARGET, query: { ...SHOWN, proxyServer: 'http://p:1', proxyPassword: 's3cr3t' } }).catch((x: unknown) => x);
    expect(JSON.stringify(e)).not.toContain('s3cr3t');
    expect((e as { code?: unknown }).code).toBe('VALIDATION_ERROR');
  });
});

describe('boardSend: the start is a change although a GET (C9), the DevTools read is a read', () => {
  let notices: PendingNotice[] = [];
  let off: () => void = () => {};
  beforeEach(() => { notices = []; off = onPending((x) => notices.push(x)); });
  afterEach(() => off());
  const send = (path: string, query: Record<string, string | boolean>) =>
    boardSend({ kit: 'browser', index: 3 }, 'GET', path, { target: TARGET, query }).then(() => ({}) as HubError, (e: HubError) => e);
  for (const [what, reply] of [
    ['a 503', { status: 503, body: { code: 'UNAVAILABLE' } }],
    ['a 502', { status: 502, body: {} }],
    ['no answer', { status: 0, network: true }],
  ] as const) {
    it(`start, ${what}: pending (one notice), sent once, never failed`, async () => {
      boot({ realm: R1 });
      onFetch(() => reply);
      const e = await send(START, SHOWN);
      expect(e).toMatchObject({ kind: 'pending', pending: true });
      expect(outcomeOf(e)).toBe('pending');
      expect(errorInfo(e).outcome).toBe('pending');
      expect(notices).toHaveLength(1);
      expect(calls).toHaveLength(1);
    });
  }
  it('start answered after its context died: pending, never stale; a 200 included', async () => {
    for (const status of [200, 400]) {
      boot({ realm: R1 });
      onFetch(() => { bump('switch'); return { status, body: status === 200 ? { ok: true } : { code: 'VALIDATION_ERROR' } }; });
      const e = await send(START, SHOWN);
      expect([status, e]).toMatchObject([status, { kind: 'pending', pending: true }]);
      expect(calls).toHaveLength(1);
    }
  });
  it('start, a definite 400 while the context lives: a refusal with its code, not pending; the rejection reads as a change', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 400, body: { code: 'VALIDATION_ERROR' } }));
    const e = await send(START, SHOWN);
    expect(outcomeOf(e, true)).toBe('failed');
    expect(e).toMatchObject({ code: 'VALIDATION_ERROR', change: true });
    expect(errorInfo(e)).toMatchObject({ outcome: 'failed', code: 'VALIDATION_ERROR' });
    expect(notices).toHaveLength(0);
  });
  it('start, a scrub failure: errorInfo reads it pending (the answer arrived), as a change\'s', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { ok: true } }));
    const e = await api(boardFixtureRoute('browser', 'GET', START), { target: TARGET, index: 3, query: SHOWN, scrub: () => { throw new Error('x'); } })
      .then(() => ({}) as HubError, (x: HubError) => x);
    expect(e).toMatchObject({ code: 'SCRUB_FAILED', change: true });
    expect(errorInfo(e).outcome).toBe('pending');
  });
  it('the DevTools read stays a read: a 503 is unavailable, no notice, no change mark', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 503, body: {} }));
    const e = await send(DEVTOOLS, { start: false });
    expect(e).not.toMatchObject({ kind: 'pending' });
    expect((e as { change?: unknown }).change).toBeUndefined();
    expect(outcomeOf(e)).not.toBe('pending');
    expect(notices).toHaveLength(0);
  });
});

describe('routes: change is a kit GET\'s only', () => {
  it('refuses change on a POST, a base or agent route, a run route, or any value but true', () => {
    expect(() => defineRoute({ method: 'POST', path: '/x', scope: 'kit', kit: 'browser', index: 1, body: [], change: true })).toThrow('ROUTE_INVALID: change');
    expect(() => defineRoute({ method: 'GET', path: '/x', scope: 'realm', change: true })).toThrow('ROUTE_INVALID: change');
    expect(() => defineRoute({ method: 'GET', path: '/x', scope: 'agent', change: true } as never)).toThrow('ROUTE_INVALID: change');
    expect(() => defineRoute({ method: 'GET', path: '/x', scope: 'kit', kit: 'browser', index: 1, change: false } as never)).toThrow('ROUTE_INVALID: change');
    const r = defineRoute({ method: 'GET', path: '/api/v1/browser/x-change-probe', scope: 'kit', kit: 'browser', index: 1, change: true });
    expect(r.change).toBe(true);
  });
});

describe('a change GET goes out only through api(), as a change', () => {
  const start = () => boardFixtureRoute('browser', 'GET', START);
  it('download() refuses the start unsent: no other leg skips its pending outcome or its secret refusal', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 503, body: {} }));
    await expect(download(start(), { target: TARGET, index: 3, query: SHOWN, maxBytes: 1024 })).rejects.toMatchObject({ notSent: true, code: 'ROUTE_NOT_ALLOWED' });
    expect(calls).toHaveLength(0);
  });
  it('kit admission: a change route needs api()\'s change marker, and a framed page refuses it without framed: false', () => {
    boot({ realm: R1 });
    const r = defineRoute({ method: 'GET', path: '/api/v1/browser/x-change-framed', scope: 'kit', kit: 'browser', index: 1, change: true });
    const built = buildRequest(r, {});
    if ('refused' in built) throw new Error(built.refused);
    expect(admit(r, built, { target: TARGET, index: 1 })).toEqual({ refused: 'ROUTE_NOT_ALLOWED' });
    expect(admit(r, built, { target: TARGET, index: 1, asChange: true })).not.toHaveProperty('refused');
    env.framed = true;
    try {
      expect(admit(r, built, { target: TARGET, index: 1, asChange: true })).toEqual({ refused: 'FRAMED_ACTION_REFUSED' });
    } finally { env.framed = false; }
  });
  it('never a read: defineQuery and a page source\'s reads refuse it (a refetch would send it again)', () => {
    expect(() => defineQuery(start(), { input: () => ({ target: TARGET, index: 3, query: SHOWN }) })).toThrow('defineQuery needs a read route');
    expect(() => coreSource('board-probe', { reads: { s: { route: start(), map: (x: unknown) => x } } } as never)).toThrow('coreSource reads need a read route');
    expect(() => defineQuery(boardFixtureRoute('browser', 'GET', DEVTOOLS))).not.toThrow();
  });
});
