// A new browser's options: what the person sets in the picker's "New browser with options" form, checked as
// core's Board route checks them (core/run-open/kitRoutes.ts BROWSER_START_QUERY), and the start request they make.
//
// Contract:
//   - Defaults are the browser kit's own (Chromium, stealth on, DNS over HTTPS on, fingerprint profile "default"), so a
//     start with nothing changed equals the Board's start today. Only what differs from a default is sent, plus
//     start=true and showBrowser=true (the tile shows the browser's display).
//   - The fingerprint profile is a free id (a profile file on the computer; there is no list): the two shipped ones are
//     offered as suggestions.
//   - No launch arguments: they could hide the browser, move its display or open a debugging port, which core's
//     route refuses (core/run-open/kitRoutes.ts).
//   - Options apply only when the browser is created: a running browser-N keeps its own. Nothing here is stored: the
//     tile stays {program: browser, session}; the proxy password lives in the form only.
//   - browserProblems() names each field core would refuse, so the form says which; startQuery() is only built from
//     options without problems. A field the start leaves out (Chromium-only on Firefox, proxy fields with no proxy, the
//     resolver with DNS over HTTPS off) is not checked. The proxy password is sent and checked exactly as typed.
export type Engine = 'chromium' | 'firefox';

export interface BrowserOptions {
  engine: Engine;
  fingerprint: string;
  stealth: boolean;
  sessionName: string;
  userAgent: string;
  locale: string;
  timezone: string;
  /** Window size in CSS pixels; both empty: the profile's. */
  width: number;
  height: number;
  /** The page follows the tile's size (no fixed window). */
  fitTile: boolean;
  latitude: number;
  longitude: number;
  accuracy: number;
  proxyServer: string;
  proxyUser: string;
  proxyPassword: string;
  proxyBypass: string;
  quic: boolean;
  doh: boolean;
  dohUrl: string;
  storeIds: string;
  extensionDirs: string;
  devtools: boolean;
  chromiumVersion: string;
}

/** The two fingerprint profiles the browser kit ships. */
export const FINGERPRINT_SUGGESTIONS = ['default', 'kiosk-1080p'] as const;

export const BROWSER_DEFAULTS: BrowserOptions = {
  engine: 'chromium', fingerprint: '', stealth: true, sessionName: '', userAgent: '', locale: '', timezone: '',
  width: NaN, height: NaN, fitTile: false, latitude: NaN, longitude: NaN, accuracy: NaN,
  proxyServer: '', proxyUser: '', proxyPassword: '', proxyBypass: '', quic: false, doh: true, dohUrl: '',
  storeIds: '', extensionDirs: '', devtools: false, chromiumVersion: '',
};

export type BrowserField = keyof BrowserOptions;
/** Why a field would be refused: a key of browser.problem.* in strings.en.json. */
export type BrowserProblem = 'line' | 'proxyScheme' | 'dohScheme' | 'sizeBoth' | 'size' | 'placeBoth' | 'latitude' | 'longitude' | 'accuracy' | 'absolute';

const TEXT_MAX = 2048;
const lineOk = (v: string): boolean => v.length <= TEXT_MAX && !/[\u0000-\u001f\u007f-\u009f]/.test(v);
const set = (n: number): boolean => !Number.isNaN(n);
const lines = (v: string): string[] => v.split('\n').map((x) => x.trim()).filter(Boolean);
const list = (v: string): string[] => v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** Fields Firefox has no use for: the form disables them with the reason. */
export const CHROMIUM_ONLY: readonly BrowserField[] = ['stealth', 'storeIds', 'extensionDirs', 'devtools', 'chromiumVersion'];

/** A field the start leaves out with these options (Chromium-only on Firefox, proxy fields with no proxy, the resolver
 *  with DNS over HTTPS off, accuracy with no place): it is never checked, so a disabled field never blocks Start. */
const unsent = (o: BrowserOptions, k: BrowserField): boolean =>
  (o.engine !== 'chromium' && CHROMIUM_ONLY.includes(k)) ||
  ((k === 'proxyUser' || k === 'proxyPassword' || k === 'proxyBypass') && !o.proxyServer.trim()) ||
  (k === 'dohUrl' && !o.doh) ||
  ((k === 'width' || k === 'height') && o.fitTile) ||
  (k === 'accuracy' && !set(o.latitude));

/** Each field core would refuse, with why (empty: none). Only fields the start sends are checked. */
export function browserProblems(o: BrowserOptions): Partial<Record<BrowserField, BrowserProblem>> {
  const p: Partial<Record<BrowserField, BrowserProblem>> = {};
  for (const k of ['fingerprint', 'sessionName', 'userAgent', 'locale', 'timezone', 'proxyServer', 'proxyUser', 'proxyBypass', 'dohUrl', 'chromiumVersion'] as const) {
    if (!lineOk(o[k].trim())) p[k] = 'line';
  }
  // The password goes exactly as typed (spaces are part of it), so it is checked as typed.
  if (!lineOk(o.proxyPassword)) p.proxyPassword = 'line';
  for (const k of ['storeIds', 'extensionDirs'] as const) {
    if (!lines(o[k]).every(lineOk) || o[k].length > TEXT_MAX) p[k] = 'line';
  }
  if (!p.proxyServer && o.proxyServer.trim() && !/^(?:https?|socks5h?):\/\/\S+$/i.test(o.proxyServer.trim())) p.proxyServer = 'proxyScheme';
  if (!p.dohUrl && o.doh && o.dohUrl.trim() && !/^https:\/\/\S+$/i.test(o.dohUrl.trim())) p.dohUrl = 'dohScheme';
  if (!p.extensionDirs && list(o.extensionDirs).some((d) => !d.startsWith('/'))) p.extensionDirs = 'absolute';
  if (!o.fitTile) {
    if (set(o.width) !== set(o.height)) p[set(o.width) ? 'height' : 'width'] = 'sizeBoth';
    for (const k of ['width', 'height'] as const) if (set(o[k]) && !(Number.isInteger(o[k]) && o[k] >= 100 && o[k] <= 7680)) p[k] = 'size';
  }
  if (set(o.latitude) !== set(o.longitude)) p[set(o.latitude) ? 'longitude' : 'latitude'] = 'placeBoth';
  if (set(o.latitude) && !(o.latitude >= -90 && o.latitude <= 90)) p.latitude = 'latitude';
  if (set(o.longitude) && !(o.longitude >= -180 && o.longitude <= 180)) p.longitude = 'longitude';
  if (set(o.accuracy) && !(o.accuracy >= 0 && o.accuracy <= 100000)) p.accuracy = 'accuracy';
  for (const k of Object.keys(p) as BrowserField[]) if (unsent(o, k)) delete p[k];
  return p;
}

/** The start request's query: what differs from the defaults, plus start and showBrowser. Options with problems: null. */
export function startQuery(o: BrowserOptions): Record<string, string | boolean> | null {
  if (Object.keys(browserProblems(o)).length) return null;
  const chromium = o.engine === 'chromium';
  const q: Record<string, string | boolean> = { start: true, showBrowser: true };
  const text = (key: string, v: string) => { if (v.trim()) q[key] = v.trim(); };
  if (!chromium) q.browser = 'firefox';
  text('fingerprintId', o.fingerprint);
  if (chromium && !o.stealth) q.stealth = false;
  text('sessionName', o.sessionName);
  text('userAgent', o.userAgent);
  text('locale', o.locale);
  text('timezoneId', o.timezone);
  if (o.fitTile) q.noViewport = true;
  else if (set(o.width)) q.viewport = JSON.stringify({ width: o.width, height: o.height });
  if (set(o.latitude)) q.geolocation = JSON.stringify({ latitude: o.latitude, longitude: o.longitude, ...(set(o.accuracy) ? { accuracy: o.accuracy } : {}) });
  text('proxyServer', o.proxyServer);
  if (o.proxyServer.trim()) {
    text('proxyUsername', o.proxyUser);
    // Exactly as typed: a password may start or end with spaces, or be only spaces. Empty: none.
    if (o.proxyPassword !== '') q.proxyPassword = o.proxyPassword;
    text('proxyBypass', o.proxyBypass);
  }
  if (o.quic) q.enableQuic = true;
  if (!o.doh) q.enableDnsOverHttps = false;
  else text('dnsOverHttpsUrl', o.dohUrl);
  if (chromium && list(o.storeIds).length) q.extensionsStoreIds = list(o.storeIds).join(',');
  if (chromium && list(o.extensionDirs).length) q.extensions = list(o.extensionDirs).join(',');
  if (chromium && o.devtools) q.showDevtools = true;
  if (chromium) text('chromiumVersion', o.chromiumVersion);
  return q;
}
