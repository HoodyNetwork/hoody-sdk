// Playwright helpers that prove the search rule (a typed search never reaches the URL, history state or a link; a link's search is
// adopted once and does not survive a reload) for a list page, re-exported from @app/e2e. The specs call them. Each
// helper that completes marks its test (annotation `l064`: S or R); the Playwright gate checks every row of the
// inventory (SEARCH_PROOF_TESTS, app/search-proofs.ts) against those marks in its report (app/search-proofs-run.ts).
//
// What they claim, exactly:
// - No forbidden text in the URL and history samples (one read every 50 ms, plus the read itself), and none on the
//   page-wide same-origin links at each checkpoint. The text is matched without case, on each value as written and on
//   every form URL decoding, `+` as a space and JSON `\uXXXX` escapes make of it, to a fixed point; a value still
//   changing after 8 rounds is red. No coverage while the sampler is stopped across a reload, nor while a navigation
//   has no document to read (those reads are skipped for up to 10 s); a run ends only on a read that started after the
//   stop and answered, and each read is judged in the phase it started in.
// - Readiness is the caller's: `searched` / `unsearched` are its own positive assertions. The helper adds the settle
//   signal: the view root carries `data-hub-busy` only while it loads (a test hook, never published), so "settled" is
//   the attribute's absence.
// - `searched` must not already hold before the search: it is run first and must fail within a second.
// The waits are plain polls (no Playwright `expect`), so the pure parts below also run under vitest.
import type { Locator, Page } from '@playwright/test';
import type { GotoOptions } from './e2e';

/** list: an ordinary view (keys `${param}q/sort/page`); cursor: Logs (a cursor key); status: Support (a status key);
 *  program: Logs' Program output (one program's snapshot: the `program` key, no sort, page or cursor); scroll: a list
 *  with no pager, one scrolled list (API, app/conformance.test.ts names the page): `${param}sort` only. */
export type SearchKind = 'list' | 'cursor' | 'status' | 'program' | 'scroll';

export interface SearchView {
  /** The view's useDataView param: '' for a plain list, 'acc', 'a', 'g', … The search key is `${param}q`. */
  param: string;
  /** The view's own search box. */
  box: Locator;
  kind?: SearchKind;
  /** The view root that carries `data-hub-busy` (default: the kit DataTable of this param, `[data-dataview="<param>q"]`). */
  root?: Locator;
  /** The view's search debounce in ms (default 300, useDataView's server default). */
  debounce?: number;
}

export interface SearchProof {
  /** At least 4 characters (a shorter one could sit in an opaque id by chance), on no surface before the search. */
  text: string;
  /** The caller's positive check that the rows answer the search. */
  searched: () => Promise<void>;
}

export interface ReloadProof extends SearchProof {
  /** The hash path, WITHOUT the search key and without the `keep` keys: the helper adds both. */
  path: string;
  goto?: GotoOptions;
  /** Keys that must survive the reload, value exact. The view's kind sets the required ones (keepProblem). */
  keep: Record<string, string>;
  /** The caller's positive check of the rows with no search (after the reload, and on the preflight open). */
  unsearched: () => Promise<void>;
  /** The test's own checks before the reload (row ids, the sort control, the pager), on the searched page. */
  before?: () => Promise<void>;
  /** The same after the reload. */
  after?: () => Promise<void>;
}

const WAIT = 10_000;
const SAMPLE_GAP = 50;
/** How long the sampler waits out a navigation (reads that find no document) before it gives up. */
const NAV_GRACE = WAIT;
const MIN_TEXT = 4;
const CURSOR_KEYS = ['before', 'after', 'cursor', 'at'];
/** The pages whose list has no pager (the API page's one scrolled list): the only ones a
 *  `scroll` reload proof may run on. app/conformance.test.ts checks each has its named no-`@page` exception, and that no
 *  other page's spec asks for `scroll`; a paged page that tries is refused here (keepProblem). */
export const SCROLL_PAGES: readonly string[] = ['api'];
// The page a link opens, as the browser resolves it (dot segments and percent-escapes of them collapsed first).
const pageIdOf = (path: string) => new URL(path || '/', 'http://hub.invalid').pathname.replace(/^\//, '').split('/')[0] ?? '';

// ── pure parts (vitest: e2e-search.test.ts) ──────────────────────────────────────────────────────────────────────────

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Every query key and value of a URL (the real query and the hash's), decoded the way URLSearchParams reads them. */
export function queryPairs(href: string): [string, string][] {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return [];
  }
  const at = url.hash.indexOf('?');
  const hashQuery = at >= 0 ? url.hash.slice(at + 1) : '';
  return [url.search.slice(1), hashQuery].flatMap((q) => [...new URLSearchParams(q)]);
}

/** Every readable part of a URL: each query key and value, and the decoded path and hash path. */
export function decodeAll(href: string): string[] {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return [safeDecode(href)];
  }
  const at = url.hash.indexOf('?');
  const hashPath = at >= 0 ? url.hash.slice(0, at) : url.hash;
  return [...queryPairs(href).flat(), safeDecode(url.pathname), safeDecode(hashPath)];
}

const has = (hay: string, text: string) => hay.toLowerCase().includes(text.toLowerCase());

/** Decoding rounds before a value that still changes is red (an exhausted budget is not absence). */
export const DECODE_ROUNDS = 8;
/** Distinct forms kept per value; more is red like a value that still changes. */
const DECODE_FORMS = 256;
const JSON_SHORT: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
/** Every JSON string escape, in one pass: `\uXXXX` and the short ones (a missed `\t` would hide a search). */
const jsonUnescape = (s: string) =>
  s.replace(/\\(?:u([0-9a-fA-F]{4})|(["\\/bfnrt]))/g, (_, h: string | undefined, c: string | undefined) =>
    h !== undefined ? String.fromCharCode(parseInt(h, 16)) : JSON_SHORT[c ?? ''] ?? '',
  );
const utf8 = new TextDecoder();
/** URL decoding that a stray `%` cannot stop (whole-string decodeURIComponent gives up on
 *  `%256bestrel%25` and would read it as absent): each run of `%XX` escapes is decoded as UTF-8 on its own (an invalid
 *  sequence as U+FFFD), and a `%` that starts no escape stays as it is, so `100%` reads `100%`. */
const lenientDecode = (s: string) =>
  s.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => utf8.decode(Uint8Array.from(run.slice(1).split('%'), (h) => parseInt(h, 16))));

/** A string and every form decoding makes of it, to a fixed point: each round applies URL decoding (lenientDecode),
 *  `+` as a space and JSON escapes to every form found so far, so a `+` or an escape that one decoding exposes is read by the
 *  next. `undecodable`: still changing after DECODE_ROUNDS rounds (or past DECODE_FORMS forms). */
export function decodings(s: string): { forms: string[]; undecodable: boolean } {
  const out = new Set([s]);
  let fresh = [s];
  for (let round = 0; fresh.length > 0; round++) {
    const next: string[] = [];
    for (const f of fresh) {
      for (const g of [lenientDecode(f), f.replace(/\+/g, ' '), jsonUnescape(f)]) {
        if (!out.has(g)) {
          out.add(g);
          next.push(g);
        }
      }
    }
    if (next.length > 0 && (round >= DECODE_ROUNDS || out.size > DECODE_FORMS)) return { forms: [...out], undecodable: true };
    fresh = next;
  }
  return { forms: [...out], undecodable: false };
}

const UNDECODABLE = ` (still changing after ${DECODE_ROUNDS} decoding rounds)`;
/** `has` on the string and every decoding of it (an encoded copy is still the text): 'hit', or
 *  'undecodable' (a value the decoding never settles is red, not absent), or null. */
function deep(hay: string, text: string): 'hit' | 'undecodable' | null {
  const d = decodings(hay);
  if (d.forms.some((h) => has(h, text))) return 'hit';
  return d.undecodable ? 'undecodable' : null;
}
const hasDeep = (hay: string, text: string) => deep(hay, text) !== null;
/** The leak text for a surface, with the reason when the value never settled. */
const onDeep = (hays: readonly string[], text: string, on: string): string | null => {
  const r = hays.map((h) => deep(h, text));
  if (r.includes('hit')) return on;
  return r.includes('undecodable') ? on + UNDECODABLE : null;
};

/** The values a link's own search key may hold while it is adopted: the text, and the router's JSON-quoted form when
 *  the text reads as JSON (a number, true, …), which is how the router writes such a string. */
export function adoptedForms(text: string): string[] {
  try {
    JSON.parse(text);
    return [text, JSON.stringify(text)];
  } catch {
    return [text];
  }
}

/** Why the URL leaks the search, or null. `exempt`: the adoption phase of a link, where exactly one `${param}q=<text>`
 *  in the hash's query may stay (not in the real query, not twice, not quoted unless the router
 *  quotes it). */
export function urlLeak(href: string, text: string, param: string, exempt = false): string | null {
  const qKey = `${param}q`;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return hasDeep(href, text) ? 'the address' : null;
  }
  const at = url.hash.indexOf('?');
  const hashPath = at >= 0 ? url.hash.slice(0, at) : url.hash;
  const real = [...new URLSearchParams(url.search.slice(1))];
  let hash = [...new URLSearchParams(at >= 0 ? url.hash.slice(at + 1) : '')];
  const allowed = exempt ? hash.findIndex(([k, v]) => k === qKey && adoptedForms(text).includes(v)) : -1;
  if (allowed >= 0) hash = hash.filter((_, i) => i !== allowed);
  const pairs = [...real, ...hash];
  if (pairs.some(([k]) => k === qKey)) return `the ${qKey} key`;
  for (const [k, v] of pairs) {
    const on = onDeep([k, v], text, `the ${k} key`);
    if (on) return on;
  }
  const path = onDeep([url.pathname, hashPath], text, 'the path');
  if (path) return path;
  // The whole address with only the one allowed pair taken out (user info stays in): an unparsed
  // fragment, credentials, anything else. The fragment starts at the first '#'.
  const cut = href.indexOf('#');
  const rest = allowed < 0 ? href : `${cut >= 0 ? href.slice(0, cut) : href}${hashPath}${hash.length ? `?${new URLSearchParams(hash)}` : ''}`;
  return onDeep([rest], text, 'the address');
}

/** Every string leaf of a value, object keys included. */
export function stringLeaves(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringLeaves(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      stringLeaves(x, out);
    }
  }
  return out;
}

/** Why history.state (as its JSON) leaks the search, or null. */
export function stateLeak(json: string, text: string): string | null {
  let st: unknown;
  try {
    st = JSON.parse(json);
  } catch {
    return onDeep([json], text, 'history state');
  }
  return onDeep([json, ...stringLeaves(st)], text, 'history state');
}

/** Why a proof cannot be run as asked (a test error, thrown before acting), or null. */
export function textProblem(text: string): string | null {
  if (text.trim().length < MIN_TEXT) return `the search text must be at least ${MIN_TEXT} characters, got "${text}"`;
  return null;
}

/** The survival policy: each kind's own keys, prefixed by the view's param, are required. */
export function keepProblem(kind: SearchKind, param: string, keep: Record<string, string>, text: string, path = ''): string | null {
  const keys = Object.keys(keep);
  if (keys.length === 0) return 'keep is empty: a reload proof needs the keys that must survive';
  const need = kind === 'list' ? [`${param}sort`, `${param}page`] : kind === 'scroll' ? [`${param}sort`] : kind === 'status' ? ['status'] : kind === 'program' ? ['program'] : [];
  if (kind === 'scroll' && !SCROLL_PAGES.includes(pageIdOf(path))) return `a scroll view is only for a page with no pager (${SCROLL_PAGES.join(', ')}); ${path || 'this path'} pages, so it keeps ${param}page`;
  for (const k of need) if (!(k in keep)) return `required keep key ${k} missing for a ${kind} view`;
  if (kind === 'cursor' && !CURSOR_KEYS.some((k) => `${param}${k}` in keep)) return `a cursor view must keep one of ${CURSOR_KEYS.map((k) => param + k).join(', ')}`;
  if (`${param}q` in keep) return `keep names the search key ${param}q`;
  for (const [k, v] of Object.entries(keep)) {
    if (v === '') return `keep ${k} is empty`;
    if (hasDeep(k, text) || hasDeep(v, text)) return `precondition: "${text}" is already on keep ${k}`;
  }
  if (hasDeep(path, text)) return `precondition: "${text}" is already on the path`;
  return null;
}

/** The link the reload proof opens: `path` plus the kept keys (and the search key when `q` is given). */
export function linkPath(path: string, keep: Record<string, string>, param: string, q?: string): string {
  const at = path.indexOf('?');
  const base = at >= 0 ? path.slice(0, at) : path;
  const sp = new URLSearchParams(at >= 0 ? path.slice(at + 1) : '');
  for (const [k, v] of Object.entries(keep)) {
    if (sp.has(k) && sp.get(k) !== v) throw new Error(`the path sets ${k}=${sp.get(k)}, keep says ${v}`);
    sp.set(k, v);
  }
  if (q !== undefined) sp.set(`${param}q`, q);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export interface Sample {
  href: string;
  state: string;
  exempt: boolean;
  step: string;
}

/** The first leak in a run of samples, as the error text, or null. */
export function firstSampleLeak(samples: readonly Sample[], text: string, param: string): string | null {
  for (const s of samples) {
    const on = urlLeak(s.href, text, param, s.exempt) ?? stateLeak(s.state, text);
    if (on) return `leak: "${text}" appeared on ${on} after ${s.step}`;
  }
  return null;
}

// ── browser parts ────────────────────────────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function until(what: string, fn: () => Promise<boolean>, ms = WAIT): Promise<void> {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error(what);
    await sleep(SAMPLE_GAP);
  }
}

const destroyed = (e: unknown) => /Execution context was destroyed|navigat/i.test(String((e as Error)?.message ?? e));

/** One helper call's sampler: one read at a time, 50 ms apart, until stopped; end() never leaves a read pending. */
export class Sampler {
  samples: Sample[] = [];
  step = 'start';
  exempt: boolean;
  private stop = false;
  private error: unknown;
  private loop: Promise<void>;
  /** When the current run of skipped reads began (0: the last read answered). */
  private since = 0;
  /** Reads started, the last one that answered, and the first read number that may end the run. */
  private started = 0;
  private answered = 0;
  private lastNeeded = Infinity;
  constructor(
    private page: Pick<Page, 'evaluate'>,
    exempt = false,
    private grace = NAV_GRACE,
  ) {
    this.exempt = exempt;
    this.loop = this.run();
  }
  private async run() {
    // Stopping waits for a read that started after the stop and answered: a navigation in the
    // gap after a good read, or a stretch of skipped reads, is seen by that last read.
    while (!this.stop || this.answered < this.lastNeeded) {
      // The phase a read is judged in is the one it started in: the caller may switch it while the
      // read is pending.
      const seq = ++this.started;
      const exempt = this.exempt;
      const step = this.step;
      try {
        const r = await this.page.evaluate(() => ({ href: location.href, state: JSON.stringify(history.state ?? null) }));
        this.samples.push({ ...r, exempt, step });
        this.answered = seq;
        this.since = 0;
      } catch (e) {
        // A navigation ends the document under a read: skip such reads until the next document answers. On a loaded host
        // a navigation can take several reads; a document that stays gone past the grace ends the sampler with an error.
        const now = Date.now();
        if (!destroyed(e)) {
          this.error = e;
          return;
        }
        if (this.since !== 0 && now - this.since >= this.grace) {
          this.error = new Error(`the page did not come back within ${this.grace} ms of a navigation (step: ${this.step})`);
          return;
        }
        this.since ||= now;
      }
      await sleep(SAMPLE_GAP);
    }
  }
  async end(text: string, param: string): Promise<void> {
    this.lastNeeded = this.started + 1;
    this.stop = true;
    await this.loop;
    if (this.error) throw this.error;
    const leak = firstSampleLeak(this.samples, text, param);
    if (leak) throw new Error(leak);
  }
}

/** Run `body` under one sampler and check its samples (also for kit/e2e-search/helpers.spec.ts, the sampler's own cases). */
export async function withSampler<R>(page: Pick<Page, 'evaluate'>, text: string, param: string, exempt: boolean, body: (s: Sampler) => Promise<R>, grace = NAV_GRACE): Promise<R> {
  const s = new Sampler(page, exempt, grace);
  let out: R;
  try {
    out = await body(s);
  } catch (e) {
    // The body's own error wins; the sampler still stops before it is thrown (no read left pending).
    await s.end(text, param).catch(() => {});
    throw e;
  }
  await s.end(text, param);
  return out;
}

/** The mark the gate reads (app/search-proofs-run.ts): `"<h> <testId>"`, test `<testId>` completed helper `h`. The gate
 *  accepts a mark only on the test whose id it names: Playwright copies a beforeAll hook's annotations onto every later
 *  test of its describe, and a copy names the test it was first made on. Loaded at run time, so
 *  the pure parts above stay importable under vitest. */
export const PROOF_ANNOTATION = 'l064';

/** What a mark is bound to: Playwright's TestInfo of one try of one test (`duration` is 0 until its body ends; `testId`
 *  is the id the JSON report gives the test's spec). */
export interface ProofOwner {
  annotations: { type: string; description?: string }[];
  duration: number;
  testId: string;
}

/** Mark helper `h` on `owner`, the test that started it, only if that test is still the one running and its body has
 *  not ended (test.info() read at the end names whichever test runs then, so a helper left running
 *  by test A would credit test B; a listed test's helper that ends after its body credits no one). `now` is test.info(),
 *  which throws between tests. True when marked. */
export function markProof(owner: ProofOwner | null, now: () => ProofOwner, h: 'S' | 'R'): boolean {
  if (!owner) return false;
  let current: ProofOwner;
  try {
    current = now();
  } catch {
    return false;
  }
  if (current !== owner || owner.duration !== 0) return false;
  owner.annotations.push({ type: PROOF_ANNOTATION, description: `${h} ${owner.testId}` });
  return true;
}

/** What the budget share needs of a TestInfo beyond the mark's owner. */
export interface BudgetOwner extends ProofOwner {
  timeout: number;
  setTimeout(ms: number): void;
}
/** Tests each helper has already extended: a TestInfo is one try of one test, so a retry is a new entry. */
const EXTENDED = { S: new WeakSet<object>(), R: new WeakSet<object>() };

/** Grow `owner`'s timeout by helper `h`'s share, once per test try per helper, and only for an owner markProof would
 *  accept now (its body still running; null and finished owners get nothing), never a timeout of 0 (no limit). The
 *  share is the helper's own fixed waits (settle windows, the one-second not-yet check, the sampler's reads), which
 *  come on top of the test's work: on a loaded host a whole run can take 2x and an @reload test pass the 30 s default.
 *  A second call of the same helper in one test adds nothing. Playwright sizes the
 *  after-hooks slot from the same timeout (max(project timeout, testInfo.timeout), as for any test.setTimeout or
 *  test.slow()), so a hang in afterEach or fixture teardown is red after the test's own timeout plus the shares of
 *  the helpers it called: S adds 15 s, R 30 s, both 45 s. With the 30 s default that is at most 75 s, or at most
 *  135 s (90 + 45 s) for a test that called test.slow() first. Still
 *  finite, still red, in the same test. True when extended. */
export function extendBudget(owner: BudgetOwner | null, h: 'S' | 'R', share: number, seen: Record<'S' | 'R', WeakSet<object>> = EXTENDED): boolean {
  if (!owner || owner.duration !== 0 || owner.timeout <= 0 || seen[h].has(owner)) return false;
  seen[h].add(owner);
  owner.setTimeout(owner.timeout + share);
  return true;
}

/** The running test, taken as the helper starts (null outside a test), and the reader for the end. Loaded at run time,
 *  so the pure parts above stay importable under vitest. The module is the spec's own, already loaded, so the owner is
 *  read within microtasks of the call: before the calling test's teardown, never in a later test. */
async function proofOwner(h: 'S' | 'R', share: number): Promise<{ owner: ProofOwner | null; now: () => ProofOwner }> {
  const { test } = await import('@playwright/test');
  const now = () => test.info();
  let owner: BudgetOwner;
  try {
    owner = now();
  } catch {
    return { owner: null, now };
  }
  extendBudget(owner, h, share);
  return { owner, now };
}

const rootOf = (page: Page, view: SearchView) => view.root ?? page.locator(`[data-dataview="${view.param}q"]`);

/** The view root is drawn and carries no data-hub-busy. */
async function settled(page: Page, view: SearchView, after: string): Promise<void> {
  const root = rootOf(page, view);
  await until(`the view root never settled after ${after} (data-hub-busy stayed, or no root)`, async () =>
    root.evaluateAll((els) => els.length > 0 && els.every((e) => !e.hasAttribute('data-hub-busy'))),
  );
}

/** The three surfaces at a checkpoint: the URL, history state, every same-origin link. */
async function scan(page: Page, text: string, param: string, word: 'precondition' | 'leak', after: string): Promise<void> {
  const got = await page.evaluate(() => ({
    href: location.href,
    state: JSON.stringify(history.state ?? null),
    links: Array.from(document.querySelectorAll('a[href]'))
      .map((a) => new URL(a.getAttribute('href') ?? '', location.href))
      .filter((u) => u.origin === location.origin)
      .map((u) => u.href),
  }));
  const say = (on: string) => (word === 'precondition' ? `precondition: "${text}" is already on ${on}` : `leak: "${text}" appeared on ${on} after ${after}`);
  const u = urlLeak(got.href, text, param);
  if (u) throw new Error(say(u));
  const st = stateLeak(got.state, text);
  if (st) throw new Error(say(st));
  const link = got.links.find((h) => decodeAll(h).some((p) => hasDeep(p, text)) || hasDeep(h, text));
  if (link) throw new Error(say(`a link (${link})`));
}

/** `searched` must not hold before the search: run it, and it must fail (or still be pending) after a second. */
async function mustNotHoldYet(searched: () => Promise<void>, text: string): Promise<void> {
  let held = false;
  const run = searched().then(
    () => {
      held = true;
    },
    () => {},
  );
  await Promise.race([run, sleep(1000)]);
  if (held) throw new Error(`precondition: searched already holds before "${text}" is searched`);
}

const windowOf = (view: SearchView) => Math.max(view.debounce ?? 300, 300) + 500;

async function boxIs(view: SearchView, value: string, what: string): Promise<void> {
  await until(what, async () => (await view.box.inputValue()) === value);
}

/** @search: type `text`; once `searched` holds and the view is settled, watch for a late write, then scan everything. */
export async function expectSearchStaysOutOfUrl(page: Page, view: SearchView, proof: SearchProof): Promise<void> {
  const mark = await proofOwner('S', 15_000);
  const { text, searched } = proof;
  const bad = textProblem(text);
  if (bad) throw new Error(bad);
  await settled(page, view, 'the open');
  await scan(page, text, view.param, 'precondition', 'the open');
  await mustNotHoldYet(searched, text);
  await withSampler(page, text, view.param, false, async (s) => {
    s.step = 'typing';
    await view.box.fill(text);
    s.step = 'the search';
    await searched();
    await settled(page, view, 'the search');
    s.step = 'the settle window';
    await sleep(windowOf(view));
    await boxIs(view, text, `the box no longer holds "${text}" after the settle window`);
    await scan(page, text, view.param, 'leak', 'the settle window');
  });
  markProof(mark.owner, mark.now, 'S');
}

const valueOf = (href: string, key: string) => queryPairs(href).find(([k]) => k === key)?.[1];

async function kept(page: Page, keep: Record<string, string>, after: string): Promise<void> {
  for (const [k, v] of Object.entries(keep)) {
    await until(`${k} is not ${v} after ${after} (it is ${valueOf(page.url(), k) ?? 'absent'})`, async () => valueOf(page.url(), k) === v);
  }
}

/** @reload: open a link that carries the search with the kept keys, prove it is adopted and out of the URL, reload, and
 *  prove the search is gone while every kept key survives. */
export async function expectLinkSearchDroppedOnReload(page: Page, view: SearchView, proof: ReloadProof): Promise<void> {
  const mark = await proofOwner('R', 30_000);
  const { text, path, goto, keep, searched, unsearched, before, after } = proof;
  const kind = view.kind ?? 'list';
  const bad = textProblem(text) ?? keepProblem(kind, view.param, keep, text, path);
  if (bad) throw new Error(bad);
  const { gotoHub } = await import('./e2e');
  // A fresh document first: a link on the page the caller is on would be a hash change only, and a same-path move
  // carries the box's search (the box keeps its search on a same-path move), so the preflight would not open the page unsearched.
  await page.goto('about:blank');
  // Preflight: the same page with no search. The text is on no surface, the caller's unsearched holds, searched does not.
  await gotoHub(page, linkPath(path, keep, view.param), goto);
  await unsearched();
  await settled(page, view, 'the preflight open');
  await scan(page, text, view.param, 'precondition', 'the preflight open');
  await mustNotHoldYet(searched, text);
  // The link, sampled from before it opens. Until the box holds the text and the key has left the
  // URL, only one `${param}q=<text>` in the hash's query is allowed.
  await withSampler(page, text, view.param, true, async (s) => {
    s.step = 'the link';
    await gotoHub(page, linkPath(path, keep, view.param, text), goto);
    const qKey = `${view.param}q`;
    await until('link search never adopted', async () => (await view.box.inputValue()) === text && valueOf(page.url(), qKey) === undefined);
    s.exempt = false;
    s.step = 'the adoption';
    await searched();
    await settled(page, view, 'the adoption');
    await before?.();
    await kept(page, keep, 'the adoption');
    s.step = 'the settle window';
    await sleep(windowOf(view));
    await scan(page, text, view.param, 'leak', 'the adoption');
    // The search still holds right before the reload: a view that dropped it on its own would make
    // the reload prove nothing.
    s.step = 'before the reload';
    await boxIs(view, text, `the box no longer holds "${text}" before the reload`);
    await searched();
    await settled(page, view, 'the settle window');
  });
  // No sample spans the reload: a new sampler starts once the shell is back.
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await withSampler(page, text, view.param, false, async (s) => {
    s.step = 'the reload';
    await boxIs(view, '', `the box still holds "${text}" after the reload`);
    await unsearched();
    await settled(page, view, 'the reload');
    await after?.();
    s.step = 'the settle window';
    await sleep(windowOf(view));
    await boxIs(view, '', `the box holds a search again after the reload`);
    await scan(page, text, view.param, 'leak', 'the reload');
    await kept(page, keep, 'the reload');
  });
  markProof(mark.owner, mark.now, 'R');
}
