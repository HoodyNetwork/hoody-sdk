// boot.ts: what the standalone Hub (the Hub built as one HTML file, hub:build-single) shows when it loads.
//
// Contract:
//   - Runs before anything renders, after the inline shared.js. Nothing here sends a request.
//   - The file knows its Hoody: shared.js's standaloneChoice() names it (STANDALONE_ORIGIN, or what the page's `hoody`
//     query parameter chose from the file's own list; any other value is refused there and the default used). Nobody
//     types an address.
//   - A stored session keeps its Hoody: the stored record (origin.ts setStandaloneApi, which re-checks it) is used
//     whatever the link asks, and the Hub loads. A session with no usable record (none, malformed, or naming an origin
//     this file does not list) is not adopted: the screen asks to sign out of this browser first, and the record is
//     left as it is.
//   - With no session the link's choice is used, and nothing is named yet: the sign-in card names it only once that
//     Hoody answered its config read (FirstRun.tsx), whatever record is stored.
//   - A page opened as a file keeps everything in memory (fileMemory.ts). When the build could not make it do so, the
//     page reads no store and offers no sign-in (why 'memory'): a sign-in would land where other local files read it.
import { fileMemoryState, type FileMemory } from './fileMemory';
import { setStandaloneApi, standaloneApi, standaloneChoice, STANDALONE_API_KEY, type StandaloneApi, type StandaloneApiSet, type StandaloneChoice } from '@core/origin';

/** The query parameter shared.js reads the link's choice from (shared.js STANDALONE_PARAM). */
export const CHOICE_PARAM = 'hoody';

/** This page's address without the `hoody` parameter (raw keys, as shared.js reads them): the same file on its
 *  built-in Hoody. */
export function defaultChoiceUrl(href: string): string {
  const hash = href.indexOf('#');
  const head = hash < 0 ? href : href.slice(0, hash);
  const tail = hash < 0 ? '' : href.slice(hash);
  const q = head.indexOf('?');
  if (q < 0) return href;
  const kept = head.slice(q + 1).split('&').filter((p) => p !== '' && (p.indexOf('=') < 0 ? p : p.slice(0, p.indexOf('='))) !== CHOICE_PARAM);
  return head.slice(0, q) + (kept.length ? '?' + kept.join('&') : '') + tail;
}

/** host[:port] of an origin, for a sentence. */
export function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/** The site a person knows for an API origin: its host without a leading `api.` label (api.example.com → example.com;
 *  localhost:3000 stays). */
export function siteOf(origin: string): string {
  const host = hostOf(origin);
  return /^api\.[^.]+\.[^.]+/.test(host) ? host.slice(4) : host;
}

/** shared.js's storage table (classifyStoredAuth): what the boot gate of the served Hub also decides on. */
export type StoredAuth = 'account' | 'token' | 'none' | 'unreadable';

export type Start =
  | { kind: 'app'; api: StandaloneApi }
  /** No sign-in can be offered: a session this page cannot place, unreadable storage, a file page without memory-only
   *  storage, or no Hoody this file lists (a page that did not load completely). `choice` as for 'sign-in', when there
   *  is one. */
  | { kind: 'first-run'; step: 'blocked'; why: 'signed_in' | 'storage' | 'memory' | 'invalid'; choice: StandaloneChoice | null }
  /** Sign in to `choice.origin`, once it answered its config read. */
  | { kind: 'first-run'; step: 'sign-in'; choice: StandaloneChoice };

/** The stored choice as shared.js wrote it ({v: 1, origin, realm, proxy}), or null. Domains are checked by shared.js. */
export function storedApi(read: (k: string) => string | null): StandaloneApi | null {
  let raw: string | null;
  try {
    raw = read(STANDALONE_API_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const r: unknown = JSON.parse(raw);
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const o = r as { v?: unknown; origin?: unknown; realm?: unknown; proxy?: unknown };
    if (o.v !== 1 || typeof o.origin !== 'string') return null;
    return { origin: o.origin, realmApiDomain: typeof o.realm === 'string' ? o.realm : '', proxyDomain: typeof o.proxy === 'string' ? o.proxy : '' };
  } catch {
    return null;
  }
}

export interface BootDeps {
  read: (k: string) => string | null;
  storedAuth: () => StoredAuth;
  set: (cfg: StandaloneApi) => StandaloneApiSet;
  /** The Hoody shared.js now holds for this page (origin.ts standaloneApi). */
  current: () => StandaloneApi | null;
  /** The Hoody this page's link chose (origin.ts standaloneChoice). */
  choice: () => StandaloneChoice | null;
  /** fileMemory.ts's state of this page. */
  memory: () => FileMemory;
}

const liveDeps = (): BootDeps => ({
  read: (k) => globalThis.localStorage.getItem(k),
  storedAuth: () => {
    const f = (globalThis as { classifyStoredAuth?: () => unknown }).classifyStoredAuth;
    const v = typeof f === 'function' ? f() : 'unreadable';
    return v === 'account' || v === 'token' || v === 'none' ? v : 'unreadable';
  },
  set: setStandaloneApi,
  current: standaloneApi,
  choice: standaloneChoice,
  memory: () => fileMemoryState(),
});

/** Names this page's Hoody and decides what loads. Call once, before rendering. */
export function decideStart(deps: BootDeps = liveDeps()): Start {
  const choice = deps.choice();
  const blocked = (why: 'signed_in' | 'storage' | 'memory' | 'invalid'): Start => ({ kind: 'first-run', step: 'blocked', why, choice });
  if (deps.memory() === 'failed') return blocked('memory');
  const auth = deps.storedAuth();
  if (auth === 'account' || auth === 'token') {
    // The session's Hoody, whatever the link asks.
    const stored = storedApi(deps.read);
    const r = stored ? deps.set(stored) : 'signed_in';
    const api = r === 'set' ? deps.current() : null;
    if (api) return { kind: 'app', api };
    return blocked(r === 'storage' ? 'storage' : 'signed_in');
  }
  if (auth === 'unreadable') return blocked('storage');
  if (!choice) return blocked('invalid');
  return { kind: 'first-run', step: 'sign-in', choice };
}
