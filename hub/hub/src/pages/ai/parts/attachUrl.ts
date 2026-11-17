// From a URL… of the chat composer's add menu: a web page read by the chat's own computer and handed to the composer's own add
// path as a file. Nothing else is contacted: the Hub calls two programs on that computer, and the computer opens the address.
//   - As Markdown: the computer's browser program reads the page as clean Markdown (GET /api/v1/browser/markdown). A read with
//     an address navigates the browser's active tab, so the Hub never uses a browser the person works in: it reads through its
//     own hidden one, READER_BROWSER (headless, so no screen). The read never starts a browser (start=false); when none runs
//     there, the hidden one is started (showBrowser=false, a create-or-get) and the page is read again. The start is a change
//     on the person's computer: refused unsent in a frame (core), and when its answer is lost the computer is held (`startHeld`):
//     until a read proves the reader runs, every press only reads again, never a second start. The kit stops the reader after an
//     hour without use. A page that ends, after the browser's redirects, on an address that is not public is not attached.
//     The reader's strategy is the one function `readMarkdown`: reading in a new tab of the person's visible browser instead
//     changes that function only.
//   - As it is: the computer's curl program fetches the address (GET /api/v1/curl/request, response=json) and the body is kept as
//     sent: text (HTML, JSON, plain text) as a text file, image bytes as an image. Anything else is refused here. The program's
//     own guard blocks only the computer itself (loopback, link-local, metadata) and follows redirects to private ranges by
//     design, so the Hub asks it never to follow (follow_redirects=false) and walks each redirect itself (at most REDIRECTS),
//     checking every next address like the first.
//   - Only a public http(s) address goes (core outsideUrl, the Board's rule for outside links: no local or private address, no
//     user or password); every route's guard checks it again, so a refused address is never sent.
//   - Every answer is parsed here (`markdownAnswer`, `curlAnswer`): a field missing or of another type is a failed read.
//   - The text is a file for the agent to read, never shown as a page or run. A text longer than one text file may hold is never
//     cut silently: the read says `long`, and only the person's "Attach the first part" keeps the first part (`fitText`), which
//     ends with a line saying the rest was left out.
import { api, defineRoute, outcomeOf, outsideUrl, type Target } from '@core';
import { attach as A } from '@ask/io';

/** The hidden browser the Hub reads pages with (browser-N on the chat's computer). Program ids stop at 9999. The Board starts
 *  browsers 1-7500, and a launch's display band 8001-9999 is also addressed as browser-7501..9499 (display 500 + N); browsers
 *  9500-9999 would show on displays above 9999, which never exist, so nothing else names this one. */
export const READER_BROWSER = 9999;
/** How many redirects the Hub follows for As it is. */
export const REDIRECTS = 5;
/** How long the curl program may take to fetch the address, in seconds. */
export const CURL_TIMEOUT_S = 20;
const MIB = 1 << 20;

/** What the person chose to attach. */
export type UrlMode = 'markdown' | 'asis';

interface MarkdownAnswer { markdown: string; title: string; url: string; httpStatus: number | null; truncated: boolean }
interface CurlAnswer { status: number; type: string; body: string; binary: boolean; location: string | null }

const exactPublic = (v: unknown): boolean => { const o = outsideUrl(v); return !!o && o.url === v; };

export const urlRoutes = {
  /** The curl program fetches the address once and answers its status, headers and body (text, or base64 bytes). */
  asIs: defineRoute<unknown>({
    method: 'GET', path: '/api/v1/curl/request', scope: 'kit', kit: 'curl', index: 1, query: ['url', 'response', 'timeout', 'follow_redirects'],
    maxBytes: 8 * MIB, timeoutMs: (CURL_TIMEOUT_S + 10) * 1000,
    guard: (r) => exactPublic(r.query.url) && r.query.response === 'json' && r.query.timeout === String(CURL_TIMEOUT_S) && r.query.follow_redirects === 'false',
  }),
  /** The hidden browser opens the address and answers the page as Markdown; never starts a browser. */
  markdown: defineRoute<unknown>({
    method: 'GET', path: '/api/v1/browser/markdown', scope: 'kit', kit: 'browser', index: READER_BROWSER, query: ['url', 'start', 'maxChars', 'frontmatter'],
    maxBytes: MIB, timeoutMs: 100_000,
    guard: (r) => exactPublic(r.query.url) && r.query.start === 'false' && r.query.maxChars === String(A.TXT_BYTES) && r.query.frontmatter === 'true',
  }),
  /** Starts the hidden browser (create-or-get: a running one is returned unchanged). Always headless. */
  readerStart: defineRoute<unknown>({
    method: 'GET', path: '/api/v1/browser/start', scope: 'kit', kit: 'browser', index: READER_BROWSER, query: ['showBrowser'], change: true,
    timeoutMs: 200_000,
    guard: (r) => r.query.showBrowser === 'false' && Object.keys(r.query).length === 1,
  }),
};

/** A web address the chat's computer may open: the address as the parser writes it, or why not. */
export function checkAddress(raw: string): { ok: true; url: string; host: string } | { ok: false; why: 'empty' | 'scheme' | 'local' } {
  const s = raw.trim();
  if (!s) return { ok: false, why: 'empty' };
  if (!/^https?:\/\//i.test(s)) return { ok: false, why: 'scheme' };
  const o = outsideUrl(s);
  return o ? { ok: true, url: o.url, host: o.host } : { ok: false, why: 'local' };
}

/** What a read gave: text (with whether it is longer than one text file may hold) or image bytes; else why not. */
export type UrlRead =
  | { ok: true; kind: 'text'; name: string; type: string; text: string; long: boolean; cut: boolean; from: string }
  | { ok: true; kind: 'image'; name: string; type: string; bytes: Uint8Array; from: string }
  | { ok: false; why: 'status'; status: number }
  | { ok: false; why: 'notText' | 'tooBig' | 'starting' | 'redirected' | 'dropped' }
  | { ok: false; why: 'failed'; error: unknown };

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The browser program's /markdown answer, or null when a field read is missing or of another type. */
export function markdownAnswer(v: unknown): MarkdownAnswer | null {
  if (!isRec(v) || typeof v.markdown !== 'string' || typeof v.truncated !== 'boolean' || typeof v.url !== 'string') return null;
  if (v.title !== null && v.title !== undefined && typeof v.title !== 'string') return null;
  const st = v.httpStatus;
  if (st !== null && !(typeof st === 'number' && Number.isInteger(st) && st >= 100 && st <= 599)) return null;
  return { markdown: v.markdown, title: typeof v.title === 'string' ? v.title : '', url: v.url, httpStatus: st, truncated: v.truncated };
}

/** The curl program's JSON answer, or null when a field read is missing or of another type. */
export function curlAnswer(v: unknown): CurlAnswer | null {
  if (!isRec(v) || typeof v.body !== 'string' || typeof v.is_binary !== 'boolean' || !isRec(v.headers)) return null;
  const st = v.status_code;
  if (!(typeof st === 'number' && Number.isInteger(st) && st >= 0 && st <= 999)) return null;
  const ct = v.headers['content-type'];
  if (ct !== undefined && typeof ct !== 'string') return null;
  const loc = v.headers.location;
  if (loc !== undefined && typeof loc !== 'string') return null;
  return { status: st, type: (ct ?? '').split(';')[0]!.trim().toLowerCase(), body: v.body, binary: v.is_binary, location: loc ?? null };
}

const EXT: Readonly<Record<string, string>> = {
  'text/html': 'html', 'application/xhtml+xml': 'html', 'application/json': 'json', 'text/plain': 'txt', 'text/markdown': 'md', 'text/csv': 'csv',
  'application/xml': 'xml', 'text/xml': 'xml', 'application/rss+xml': 'xml', 'application/atom+xml': 'xml', 'text/css': 'css', 'text/javascript': 'js',
  'application/javascript': 'js', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
};

/** The attached file's name. Markdown: the page title (else the host) with ".md". As it is: the address's last part when it has
 *  an ending, else the host with the ending of what the site sent. */
export function urlFileName(url: string, mode: UrlMode, title: string, type: string): string {
  const u = new URL(url);
  if (mode === 'markdown') return A.safeName(`${(title.trim() || u.hostname).replace(/[\\/]+/gu, '-')}.md`, `${u.hostname}.md`);
  let last = '';
  try { last = decodeURIComponent(u.pathname.split('/').pop() ?? ''); } catch { last = ''; }
  const name = /\.[A-Za-z0-9]{1,8}$/u.test(last) ? last : `${last || u.hostname}.${EXT[type] ?? 'txt'}`;
  return A.safeName(name, `${u.hostname}.txt`);
}

/** Where the file came from, for its chip: the host and path, never the query (it may hold a key). */
export function urlFrom(url: string): string {
  const u = new URL(url);
  return `${u.hostname}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 120);
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** The first part of `text` that fits in `max` bytes with `note` after it: cut at the last line end in it (else at a character
 *  boundary), then a blank line and the note. Text that fits is returned whole, unless `cut` says it is already only the first
 *  part of the page (the reader's maxChars): then it keeps the note too. */
export function fitText(text: string, max: number, note: string, cut = false): string {
  if (!cut && utf8(text).length <= max) return text;
  const tail = `\n\n${note}\n`;
  const budget = Math.max(0, max - utf8(tail).length);
  const b = utf8(text);
  let n = Math.min(budget, b.length);
  if (n === b.length) return `${text.trimEnd()}${tail}`;
  // Never inside a character: step back over UTF-8 continuation bytes.
  while (n > 0 && ((b[n] as number) & 0xc0) === 0x80) n--;
  let head = new TextDecoder().decode(b.subarray(0, n));
  const nl = head.lastIndexOf('\n');
  if (nl > 0) head = head.slice(0, nl);
  return `${head.trimEnd()}${tail}`;
}

function fromBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  } catch { return null; }
}

const statusOf = (e: unknown): number | undefined => (isRec(e) && typeof e.status === 'number' ? e.status : undefined);
const codeOf = (e: unknown): string | undefined => (isRec(e) && typeof e.code === 'string' ? e.code : undefined);
const kindOf = (e: unknown): string | undefined => (isRec(e) && typeof e.kind === 'string' ? e.kind : undefined);
/** A rejection as a read's failure: a context that died adds nothing; an answer over the bound or a page too large to convert is too big. */
function failure(e: unknown): UrlRead {
  if (outcomeOf(e) === 'stale') return { ok: false, why: 'dropped' };
  if (kindOf(e) === 'too_large' || codeOf(e) === 'PAGE_TOO_LARGE') return { ok: false, why: 'tooBig' };
  return { ok: false, why: 'failed', error: e };
}
const BAD_ANSWER = { kind: 'unavailable', status: 200, code: 'BAD_ANSWER' };

// Computers whose reader start went out and whose answer was lost: until a read proves the reader runs, nothing starts it again.
const startHeld = new Set<string>();
const holdKey = (t: Target) => `${t.project.id}/${t.container.id}`;
/** Whether a start of this computer's reader may have gone through and is not proven yet. */
export const readerStartHeld = (t: Target): boolean => startHeld.has(holdKey(t));
/** Tests only: forget every held start (a page reload). */
export function resetReaderHoldsForTests(): void { startHeld.clear(); }
const notRunning = (e: unknown) => statusOf(e) === 404 || codeOf(e) === 'NOT_FOUND';

async function readMarkdown(target: Target, url: string): Promise<UrlRead> {
  const read = async () => {
    const r = await api(urlRoutes.markdown, { target, query: { url, start: false, maxChars: A.TXT_BYTES, frontmatter: true } });
    // An answer proves the reader runs: a held start is settled.
    startHeld.delete(holdKey(target));
    return r;
  };
  let raw: unknown;
  try {
    raw = await read();
  } catch (e) {
    if (!notRunning(e)) return failure(e);
    // No reader runs there. A start that may have gone through is only read back, never sent again.
    if (readerStartHeld(target)) return { ok: false, why: 'starting' };
    try {
      await api(urlRoutes.readerStart, { target, query: { showBrowser: false }, recovers: true });
    } catch (s) {
      const k = outcomeOf(s, true);
      if (k === 'stale') return { ok: false, why: 'dropped' };
      if (k === 'pending') { startHeld.add(holdKey(target)); return { ok: false, why: 'starting' }; }
      return { ok: false, why: 'failed', error: s };
    }
    try { raw = await read(); } catch (e2) { return failure(e2); }
  }
  const m = markdownAnswer(raw);
  if (!m) return { ok: false, why: 'failed', error: BAD_ANSWER };
  // Where the browser ended after the site's redirects: a page of a local or private address is not attached.
  if (!outsideUrl(m.url)) return { ok: false, why: 'redirected' };
  if (m.httpStatus !== null && m.httpStatus >= 400) return { ok: false, why: 'status', status: m.httpStatus };
  return { ok: true, kind: 'text', name: urlFileName(url, 'markdown', m.title, 'text/markdown'), type: 'text/markdown', text: m.markdown, long: m.truncated || utf8(m.markdown).length > A.TXT_BYTES, cut: m.truncated, from: urlFrom(url) };
}

async function readAsIs(target: Target, first: string): Promise<UrlRead> {
  let url = first;
  let c: CurlAnswer | null = null;
  for (let hop = 0; ; hop++) {
    let raw: unknown;
    try {
      raw = await api(urlRoutes.asIs, { target, query: { url, response: 'json', timeout: CURL_TIMEOUT_S, follow_redirects: false } });
    } catch (e) { return failure(e); }
    c = curlAnswer(raw);
    if (!c) return { ok: false, why: 'failed', error: BAD_ANSWER };
    if (c.status < 300 || c.status > 399 || c.location === null) break;
    // A redirect: the next address is checked like the first, and only so many are followed.
    let next: ReturnType<typeof outsideUrl> = null;
    try { next = outsideUrl(new URL(c.location, url).href); } catch { next = null; }
    if (!next || hop + 1 > REDIRECTS) return { ok: false, why: 'redirected' };
    url = next.url;
  }
  if (c.status < 200 || c.status > 299) return { ok: false, why: 'status', status: c.status };
  const from = urlFrom(url);
  if (c.binary) {
    const b = fromBase64(c.body);
    if (!b) return { ok: false, why: 'failed', error: BAD_ANSWER };
    const img = A.sniff(b);
    if (img) return { ok: true, kind: 'image', name: urlFileName(url, 'asis', '', img), type: img, bytes: b, from };
    const text = A.decodeText(b);
    if (text === null) return { ok: false, why: 'notText' };
    return { ok: true, kind: 'text', name: urlFileName(url, 'asis', '', c.type), type: c.type || 'text/plain', text, long: b.length > A.TXT_BYTES, cut: false, from };
  }
  return { ok: true, kind: 'text', name: urlFileName(url, 'asis', '', c.type), type: c.type || 'text/plain', text: c.body, long: utf8(c.body).length > A.TXT_BYTES, cut: false, from };
}

/** Reads `url` through the chat's computer, as Markdown or as it is. `url` must be checkAddress's. */
export function readUrl(target: Target, url: string, mode: UrlMode): Promise<UrlRead> {
  return mode === 'markdown' ? readMarkdown(target, url) : readAsIs(target, url);
}
