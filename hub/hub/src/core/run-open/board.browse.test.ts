// Outside links: the Board opens an outside address in a computer's running browser as a
// new tab. boardRoute() admits GET /api/v1/browser/browse only with start=false, no tab of any kind, waitUntil commit,
// a bounded timeout and an address outsideUrl() admits exactly as it writes it.
import { describe, expect, it } from 'vitest';
import { boardFixtureRoute } from './board';
import { BOARD_BROWSER_IDS, boardRoute, outsideUrl } from './kitRoutes';

const BROWSE = '/api/v1/browser/browse';
const ok = { url: 'https://example.org/', start: false, waitUntil: 'commit', timeoutMs: 15000 };
const browse = (query: Record<string, unknown>, n = 1) => boardRoute('browser', n, 'GET', BROWSE, query, undefined);

describe('outsideUrl', () => {
  it('admits public http and https addresses, written as the URL parser writes them', () => {
    expect(outsideUrl('https://example.org')).toEqual({ url: 'https://example.org/', host: 'example.org' });
    expect(outsideUrl('http://news.example.co.uk/a?b=1#c')).toEqual({ url: 'http://news.example.co.uk/a?b=1#c', host: 'news.example.co.uk' });
    expect(outsideUrl('https://EXAMPLE.org/Path')).toEqual({ url: 'https://example.org/Path', host: 'example.org' });
    expect(outsideUrl('https://8.8.8.8/')).toEqual({ url: 'https://8.8.8.8/', host: '8.8.8.8' });
  });
  it('refuses every other scheme: data:, javascript:, file:, ftp:, blob: and a scheme without its //', () => {
    for (const u of ['data:text/html,<b>x</b>', 'javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.org/', 'blob:https://example.org/x', 'https:example.org', 'about:blank']) {
      expect([u, outsideUrl(u)]).toEqual([u, null]);
    }
  });
  it('refuses this machine and private networks, in every spelling the parser turns into one', () => {
    for (const u of [
      'http://localhost/', 'http://localhost:8080/', 'http://LOCALHOST./', 'http://app.localhost/', 'http://printer.local/', 'http://db.internal/',
      'http://nas.lan/', 'http://router.home.arpa/', 'http://intranet/', 'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f.1/',
      'http://0177.0.0.1/', 'http://10.0.0.5/', 'http://172.16.3.4/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/',
      'http://100.64.0.1/', 'http://0.0.0.0/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://example.123/',
    ]) {
      expect([u, outsideUrl(u)]).toEqual([u, null]);
    }
  });
  it('refuses a user or password, control characters, spaces and an address past 2048 characters', () => {
    for (const u of ['https://me:pw@example.org/', 'https://me@example.org/', 'https://example.org/a b', 'https://example.org/\u0007', ' https://example.org/']) {
      expect([u, outsideUrl(u)]).toEqual([u, null]);
    }
    expect(outsideUrl('https://example.org/' + 'a'.repeat(2048))).toBeNull();
    expect(outsideUrl(42)).toBeNull();
  });
});

describe('boardRoute: browser browse', () => {
  it('admits a new tab on browser 1-7500 with start=false (as a boolean or its word)', () => {
    expect(browse(ok)).toBeNull();
    expect(browse({ ...ok, start: 'false', timeoutMs: '15000' })).toBeNull();
    for (const n of [BOARD_BROWSER_IDS[0], BOARD_BROWSER_IDS[1]]) expect(browse(ok, n)).toBeNull();
    expect(browse(ok, 0)).toBe('ROUTE_REFUSED');
    expect(browse(ok, BOARD_BROWSER_IDS[1] + 1)).toBe('ROUTE_REFUSED');
  });
  it('never starts a browser: start missing or true is refused', () => {
    expect(browse({ url: ok.url })).toBe('ROUTE_REFUSED');
    expect(browse({ ...ok, start: true })).toBe('ROUTE_REFUSED');
    expect(browse({ ...ok, start: 'true' })).toBe('ROUTE_REFUSED');
  });
  it('never names a tab or reuses one: tabId, onlyIfNotExists and every other key are refused', () => {
    for (const k of ['tabId', 'onlyIfNotExists', 'instanceGeneration', 'browser_id', 'x']) {
      expect([k, browse({ ...ok, [k]: '1' })]).toEqual([k, 'ROUTE_REFUSED']);
    }
  });
  it('sends only an address outsideUrl admits, exactly as it writes it', () => {
    expect(browse({ ...ok, url: 'https://example.org' })).toBe('ROUTE_REFUSED');
    for (const url of ['http://127.0.0.1/', 'http://localhost/', 'data:text/html,x', 'http://192.168.1.1/', 'http://[::1]/']) {
      expect([url, browse({ ...ok, url })]).toEqual([url, 'ROUTE_REFUSED']);
    }
    expect(browse({ start: false })).toBe('ROUTE_REFUSED');
  });
  it('waitUntil commit and a timeout of 1-30 s, both always sent; no body, no other method', () => {
    expect(browse({ ...ok, waitUntil: 'load' })).toBe('ROUTE_REFUSED');
    expect(browse({ url: ok.url, start: false })).toBe('ROUTE_REFUSED');
    expect(browse({ url: ok.url, start: false, waitUntil: 'commit' })).toBe('ROUTE_REFUSED');
    expect(browse({ url: ok.url, start: false, timeoutMs: 15000 })).toBe('ROUTE_REFUSED');
    for (const t of [999, 30001, '15s', 1.5]) expect([t, browse({ ...ok, timeoutMs: t })]).toEqual([t, 'ROUTE_REFUSED']);
    expect(boardRoute('browser', 1, 'GET', BROWSE, ok, {})).toBe('ROUTE_REFUSED');
    expect(boardRoute('browser', 1, 'POST', BROWSE, ok, {})).toBe('ROUTE_REFUSED');
  });
  it('is a declared change route, refused in a framed page', () => {
    const r = boardFixtureRoute('browser', 'GET', BROWSE) as unknown as { change?: boolean; framed?: boolean };
    expect(r.change).toBe(true);
    expect(r.framed).toBe(false);
  });
});
