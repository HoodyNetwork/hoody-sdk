// A new browser's options: only what differs from the kit's defaults is sent, every value is one core's Board
// route admits, and a field core would refuse is named before anything is sent.
import { describe, expect, it } from 'vitest';
import { boardRoute } from '@core/run-open/kitRoutes';
import { BROWSER_DEFAULTS, browserProblems, startQuery, type BrowserOptions } from './browserOptions';

const o = (x: Partial<BrowserOptions> = {}): BrowserOptions => ({ ...BROWSER_DEFAULTS, ...x });
const admitted = (q: Record<string, unknown>) => boardRoute('browser', 3, 'GET', '/api/v1/browser/start', q, undefined);

describe('startQuery', () => {
  it('nothing changed: only start and showBrowser (the kit\'s own defaults)', () => {
    expect(startQuery(o())).toEqual({ start: true, showBrowser: true });
  });
  it('every option set: each maps to its kit key, and core admits the whole query', () => {
    const q = startQuery(o({
      fingerprint: 'kiosk-1080p', stealth: false, sessionName: ' Shop ', userAgent: 'UA/1', locale: 'de-DE', timezone: 'Europe/Berlin',
      width: 1280, height: 800, latitude: 52.5, longitude: 13.4, accuracy: 30,
      proxyServer: 'socks5://10.0.0.2:1080', proxyUser: 'me', proxyPassword: 'pw', proxyBypass: 'localhost', quic: true, dohUrl: 'https://dns.example/q',
      storeIds: 'aaaa, bbbb', extensionDirs: '/ext/a\n/ext/b', devtools: true, chromiumVersion: '131',
    }));
    expect(q).toEqual({
      start: true, showBrowser: true, fingerprintId: 'kiosk-1080p', stealth: false, sessionName: 'Shop', userAgent: 'UA/1', locale: 'de-DE',
      timezoneId: 'Europe/Berlin', viewport: '{"width":1280,"height":800}', geolocation: '{"latitude":52.5,"longitude":13.4,"accuracy":30}',
      proxyServer: 'socks5://10.0.0.2:1080', proxyUsername: 'me', proxyPassword: 'pw', proxyBypass: 'localhost', enableQuic: true,
      dnsOverHttpsUrl: 'https://dns.example/q', extensionsStoreIds: 'aaaa,bbbb', extensions: '/ext/a,/ext/b', showDevtools: true,
      chromiumVersion: '131',
    });
    expect(admitted(q!)).toBeNull();
  });
  it('Firefox: the engine is sent, Chromium-only options are not', () => {
    const q = startQuery(o({ engine: 'firefox', stealth: false, devtools: true, storeIds: 'aaaa', chromiumVersion: '131', fitTile: true, doh: false, dohUrl: 'https://x/q' }));
    expect(q).toEqual({ start: true, showBrowser: true, browser: 'firefox', noViewport: true, enableDnsOverHttps: false });
    expect(admitted(q!)).toBeNull();
  });
  it('proxy user, password and bypass go only with a proxy address', () => {
    expect(startQuery(o({ proxyUser: 'me', proxyPassword: 'pw', proxyBypass: 'x' }))).toEqual({ start: true, showBrowser: true });
  });
  it('options with a problem build no request', () => {
    expect(startQuery(o({ proxyServer: 'ftp://x' }))).toBeNull();
  });
});

describe('browserProblems', () => {
  it('names each field core would refuse', () => {
    expect(browserProblems(o())).toEqual({});
    expect(browserProblems(o({ proxyServer: 'ftp://x' }))).toEqual({ proxyServer: 'proxyScheme' });
    expect(browserProblems(o({ dohUrl: 'http://dns/q' }))).toEqual({ dohUrl: 'dohScheme' });
    expect(browserProblems(o({ doh: false, dohUrl: 'http://dns/q' }))).toEqual({});
    expect(browserProblems(o({ userAgent: 'a\tb' }))).toEqual({ userAgent: 'line' });
    expect(browserProblems(o({ locale: 'x'.repeat(2049) }))).toEqual({ locale: 'line' });
    expect(browserProblems(o({ width: 1280 }))).toEqual({ height: 'sizeBoth' });
    expect(browserProblems(o({ width: 50, height: 800 }))).toEqual({ width: 'size' });
    expect(browserProblems(o({ width: 50, fitTile: true }))).toEqual({});
    expect(browserProblems(o({ latitude: 91, longitude: 0 }))).toEqual({ latitude: 'latitude' });
    expect(browserProblems(o({ longitude: 10 }))).toEqual({ latitude: 'placeBoth' });
    expect(browserProblems(o({ extensionDirs: 'ext/a' }))).toEqual({ extensionDirs: 'absolute' });
    expect(browserProblems(o({ storeIds: 'a\u0007' }))).toEqual({ storeIds: 'line' });
  });
  it('the proxy password goes exactly as typed: spaces kept, all spaces kept, empty left out; checked as typed', () => {
    const p = (proxyPassword: string) => startQuery(o({ proxyServer: 'socks5://h:1', proxyPassword }));
    expect(p(' secret ')?.proxyPassword).toBe(' secret ');
    expect(p('   ')?.proxyPassword).toBe('   ');
    expect(p('') && 'proxyPassword' in p('')!).toBe(false);
    expect(browserProblems(o({ proxyServer: 'socks5://h:1', proxyPassword: 'a\nb' }))).toEqual({ proxyPassword: 'line' });
    expect(browserProblems(o({ proxyServer: 'socks5://h:1', proxyPassword: ' '.repeat(2049) }))).toEqual({ proxyPassword: 'line' });
  });
  it('a field the start leaves out never blocks it: Chromium-only on Firefox, proxy fields with no proxy, the resolver with DNS over HTTPS off', () => {
    const cases: Partial<BrowserOptions>[] = [
      { engine: 'firefox', storeIds: 'a\u0007' }, { engine: 'firefox', chromiumVersion: 'x'.repeat(2049) }, { engine: 'firefox', extensionDirs: 'not/absolute' },
      { proxyServer: '', proxyUser: 'a\tb', proxyPassword: 'p\u0000', proxyBypass: 'x'.repeat(2049) },
      { doh: false, dohUrl: 'x'.repeat(2049) }, { accuracy: -1 },
    ];
    for (const c of cases) {
      expect([c, browserProblems(o(c))]).toEqual([c, {}]);
      expect(startQuery(o(c))).not.toBeNull();
    }
    expect(browserProblems(o({ storeIds: 'a\u0007' }))).toEqual({ storeIds: 'line' });
  });
  it('Firefox: extension folders are Chromium-only and never sent (the kit refuses them there)', () => {
    expect(startQuery(o({ engine: 'firefox', extensionDirs: '/ext/a' }))).toEqual({ start: true, showBrowser: true, browser: 'firefox' });
    expect(startQuery(o({ extensionDirs: '/ext/a' }))?.extensions).toBe('/ext/a');
  });
  it('every query built from options without problems is one core admits', () => {
    const samples: Partial<BrowserOptions>[] = [
      { userAgent: 'x'.repeat(2048) }, { width: 100, height: 7680 }, { latitude: -90, longitude: 180 }, { proxyServer: 'HTTPS://p:1' },
      { sessionName: '"quoted" \\y' }, { fingerprint: 'my profile' }, { engine: 'firefox', extensionDirs: '/a' },
    ];
    for (const s of samples) {
      const q = startQuery(o(s));
      expect([s, q !== null && admitted(q)]).toEqual([s, null]);
    }
  });
});
