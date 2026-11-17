// Test environment for core: the real shared.js (loaded from public/auth), a recorded fetch, the page
// metas and a fresh core state. Vitest with happy-dom.
import sharedSource from '../../../../public/auth/shared.js?raw';
import { setOtpPrompt } from '../api';
import { forgetSendsOutForTests } from '../changes';
import { memoryVault } from '../crypt/memory-vault';
import { bump, initCore, setIdentity, setTarget, type Target } from '../ctx';
import { resetCoreSteps } from '../dispose';
import { setProxyDomain } from '../hosts';
import { resetOtp } from '../otp';
import { hookPurge, initRealm } from '../realm';
import { installShared, readPage, tokenRealmOf, type Shared } from '../session';
import { resetTickets } from '../ticket';
import { installTransport } from '../transport';
import { installTestLocks } from './locks';

// Tests run without the default prompt (an OTP_REQUIRED is a cancel) unless they install one; boot() keeps
// what a test installed, as some install it before booting.
setOtpPrompt(null);

export const UID = '64f0c0ffee0000000000c0de';
export const OTHER = '64f0c0ffee0000000000beef';
export const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
export const R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
export const DOMAIN = 'api.hoody.test';
export const PROXY = 'computers.hoody.test';
export const TARGET: Target = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
export const AGENT = `https://p1-c1-agent-1.sv1.${PROXY}/api/v1/agent`;

const NAMES = [
  'storedSession', 'holdsIdentity', 'holdsSession', 'sessionTokenUid', 'sessionTokenSid', 'apiCall', 'isFramedPage',
  'framedSensitiveRoute', 'framedRefusedError', 'supersededAuthError', 'isSupersededAuthError', 'realmApiDomain',
  'clearAuthTokens', 'purgeOutgoingSession', 'endOutgoingSession', 'onBeforeAuthPurge', 'authStorageEntry',
  'authSessionSuperseded', 'adoptReissuedSession', 'holdsRemnantOf',
];

export const env = { framed: false };

/** The real shared.js, its top-level functions returned as the Shared adapter. isFramedPage follows env.framed. */
export function loadShared(): Shared {
  const src = sharedSource.replace(/^'use strict';/, '');
  const tail = `\n;isFramedPage = function () { return __env.framed; };\nreturn { ${NAMES.map((n) => `${n}: ${n}`).join(', ')} };`;
  const make = new Function('__env', src + tail) as (e: typeof env) => Shared;
  return make(env);
}

export function sessionToken(id: string, extra: Record<string, unknown> = {}): string {
  const b64u = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ id, ...extra })}.sig`;
}

export function signIn(uid = UID, sid = 'sid0000000000001'): void {
  localStorage.setItem('access_token', sessionToken(uid, { sid, exp: Math.floor(Date.now() / 1000) + 3600 }));
  localStorage.setItem('refresh_token', sessionToken(uid, { sid, exp: Math.floor(Date.now() / 1000) + 86400 }));
}

export type Reply = { status: number; body?: unknown; delayMs?: number; network?: boolean; headers?: Record<string, string>; text?: string };
// Parsed JSON as sent; tests read nested fields directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Call = { url: string; method: string; body: any; headers: Record<string, string>; credentials?: string };

export const calls: Call[] = [];
const defaultHandler = (): Reply => ({ status: 200, body: { data: {} } });
let handler: (c: Call) => Reply | Promise<Reply> = defaultHandler;
/** The gateway a test plays when it sends a session create: a create reads /version first (ask/data.ts gatedCreate), so the handler of such a test
 *  answers that read with this (session protocol 3, the ask capabilities and computer_binding). `withGateway(h)` is that handler. Core's own tests keep
 *  the plain handler: nothing here answers /version for a test that did not ask. */
export const GATEWAY_VERSION = { api_version: '1.1.0', session_protocol_version: 3, pinned_realm: null,
  capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) };
export const isVersionRead = (c: Call): boolean => c.method === 'GET' && /\/api\/v1\/agent\/version(\?|$)/.test(c.url);
export const withGateway = (h: (c: Call) => Reply | Promise<Reply>): ((c: Call) => Reply | Promise<Reply>) => (c) => (isVersionRead(c) ? { status: 200, body: GATEWAY_VERSION } : h(c));

export function onFetch(h: (c: Call) => Reply | Promise<Reply>): void {
  handler = h;
}

async function fakeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  new Headers(init.headers || {}).forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const c: Call = { url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(String(init.body)) : null, headers, credentials: init.credentials };
  calls.push(c);
  const r = await handler(c);
  if (r.delayMs) {
    await new Promise<void>((res, rej) => {
      const t = setTimeout(res, r.delayMs);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); });
    });
  }
  if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  if (r.network) throw new TypeError('Failed to fetch');
  const h = new Headers({ 'content-type': 'application/json', ...(r.headers || {}) });
  const text = r.text !== undefined ? r.text : r.body === undefined ? '' : JSON.stringify(r.body);
  return new Response(r.status === 204 ? null : text, { status: r.status, headers: h });
}

function meta(name: string, content: string | null): void {
  document.head.querySelectorAll(`meta[name="${name}"]`).forEach((m) => m.remove());
  if (content === null) return;
  const m = document.createElement('meta');
  m.setAttribute('name', name);
  m.setAttribute('content', content);
  document.head.appendChild(m);
}

export interface BootOpts {
  realm?: string;
  framed?: boolean;
  domain?: string | null;
  signedIn?: boolean;
  identity?: boolean;
  target?: Target | null;
  storage?: Record<string, string>;
}

/** A fresh tab: storage cleared, shared.js loaded, signed in, core booted on `realm`. */
export function boot(o: BootOpts = {}): void {
  localStorage.clear();
  sessionStorage.clear();
  calls.length = 0;
  handler = defaultHandler;
  env.framed = !!o.framed;
  globalThis.fetch = fakeFetch as typeof fetch;
  meta('hx-api-realm-domain', o.domain === undefined ? DOMAIN : o.domain);
  setProxyDomain(PROXY);
  installTransport(null);
  // Every https browser has navigator.locks; the change store refuses every write without it. One a test set up
  // before booting (a lock it holds, a throwing one) is kept.
  if (!(globalThis.navigator as { locks?: unknown }).locks) installTestLocks();
  installShared(loadShared());
  resetOtp();
  if (o.signedIn !== false) signIn();
  resetTickets(); // a mint or ticket an earlier test made is retired
  bump('test-boot'); // drops what earlier tests left in module state (kit proofs, queries)
  forgetSendsOutForTests(); // a send an earlier test left unanswered is not out in this fresh tab
  // The same per-session resets the terminal's disposeCoreSession runs (dispose.ts), over a memory vault: happy-dom has
  // no IndexedDB. A stream group or a remembered agent without the mux route from an earlier test is gone with them.
  resetCoreSteps(memoryVault());
  if (o.realm && o.realm !== 'all') localStorage.setItem('hub_realm_v1', o.realm);
  for (const [k, v] of Object.entries(o.storage ?? {})) localStorage.setItem(k, v);
  const page = readPage();
  initCore({ page, tokenRealm: tokenRealmOf(page) });
  hookPurge();
  initRealm();
  if (o.identity !== false && page) setIdentity({ id: page.uid, banned: false });
  setTarget(o.target === undefined ? TARGET : o.target);
}

export const hostOf = (url: string) => (/^https:\/\/([^/]+)/.exec(url) || [, 'base'])[1];
export const tick = () => new Promise((r) => setTimeout(r, 0));
export async function settle(n = 30) { for (let i = 0; i < n; i++) await tick(); }
/** Microtasks only (safe under fake timers): enough for a change free's store-lock turn (changes.ts settleChange) to
 *  run and its result to settle. */
export async function microFlush(n = 50) { for (let i = 0; i < n; i++) await Promise.resolve(); }
export function deferred<T = void>() {
  let res!: (v: T) => void;
  const p = new Promise<T>((r) => { res = r; });
  return { p, res };
}
