// token.ts: the standalone Hub's "use an access key" sign-in: the rules of the login page's shared-access sign-in
// (public/auth/token-login.js), on the chosen Hoody.
//
// Contract (same as token-login.js; change both together):
//   - The pasted key lives only in the caller's memory and a masked field; never in a URL, storage, the DOM text or a
//     log, except the one installTokenSession write (token-auth.js) behind Open.
//   - Every request is shared.js apiCall with the key as explicit bearer (no refresh, no owner binding, 15 s):
//     GET /auth/tokens/me on the chosen Hoody's API, then GET /users/auth/me on the pinned realm's host (the base host
//     for `all`). Errors map from status and code, never server prose.
//   - Where the key goes: one realm → that realm; several → the person picks one; none and account-wide → the person
//     picks everything or one realm (nothing preselected); none and not account-wide → a realm must be named. A realm
//     found in the pasted message counts as named.
//   - The key must read computers and projects (the Hub needs both), and be enabled.
//   - A session exists only after Open: installTokenSession is conditional on the auth revision read before the first
//     request, so a sign-in, sign-out or change of the chosen Hoody elsewhere in between makes it refuse ('stale'),
//     and it never removes an account session. Open also refuses while storage names another Hoody than this page's.
//   - A page shown inside another page sends no key and installs none ('framed', before any request and again at Open).
const TOKEN_RE_G = /hdy_[0-9a-f]{24}_[0-9a-f]{48}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/;
const HEX24_G = /(?<![0-9a-f])[0-9a-f]{24}(?![0-9a-f])/gi;
const HEX24 = /^[0-9a-f]{24}$/;
const MAX_PASTE = 4096;
const TIMEOUT_MS = 15_000;
const MIN_LEAVES = ['computers.read', 'projects.read'];

export type TokenError =
  | 'empty' | 'jwt' | 'shape' | 'two' | 'invalid' | 'noComputers' | 'realmNeeded' | 'realmMismatch' | 'realmShape'
  | 'realmUnsupported' | 'offline' | 'network' | 'unavailable' | 'retry' | 'storage' | 'stale' | 'signedIn' | 'framed';

export interface Intro {
  readonly id: string;
  readonly alias: string;
  readonly perms: Record<string, unknown>;
  readonly expiresAt: number | null;
  readonly realmIds: readonly string[];
  readonly allowNoRealm: boolean;
  readonly isEnabled: boolean;
}

/** The whole pasted message (or a bare key) → the key and a realm named in it ('' unless exactly one). */
export function parseShareText(text: string): { token: string; realm: string } | { error: TokenError } {
  const s = text.slice(0, MAX_PASTE);
  if (!s.trim()) return { error: 'empty' };
  const tokens = [...new Set((s.match(TOKEN_RE_G) ?? []).map((t) => t.toLowerCase()))];
  if (tokens.length === 0) return { error: JWT_RE.test(s) ? 'jwt' : 'shape' };
  if (tokens.length > 1) return { error: 'two' };
  const realms = [...new Set((s.replace(TOKEN_RE_G, ' ').match(HEX24_G) ?? []).map((r) => r.toLowerCase()))];
  return { token: tokens[0] as string, realm: realms.length === 1 ? (realms[0] as string) : '' };
}

function leaf(perms: Record<string, unknown>, path: string): boolean {
  let node: unknown = perms;
  for (const p of path.split('.')) {
    if (!node || typeof node !== 'object' || !Object.hasOwn(node, p)) return false;
    node = (node as Record<string, unknown>)[p];
  }
  return node === true;
}

export type Where = { pin: string } | { error: TokenError } | { choose: 'multi'; realms: readonly string[] } | { choose: 'dest' };

/** Where the key goes; `wanted` is the realm the person named ('' when none). */
export function resolveRealm(intro: Intro, wanted: string): Where {
  const ids = intro.realmIds;
  if (ids.length === 1) return !wanted || wanted === ids[0] ? { pin: ids[0] as string } : { error: 'realmMismatch' };
  if (ids.length > 1) {
    if (!wanted) return { choose: 'multi', realms: ids };
    return ids.includes(wanted) ? { pin: wanted } : { error: 'realmMismatch' };
  }
  if (wanted) return { pin: wanted };
  if (!intro.allowNoRealm) return { error: 'realmNeeded' };
  return { choose: 'dest' };
}

/** A rejected apiCall → the error shown (never the server's text). */
export function errorFor(e: unknown): { key: TokenError; retryAfter?: number } {
  const x = e && typeof e === 'object' ? (e as { status?: unknown; code?: unknown; retryAfter?: unknown }) : null;
  if (!x || typeof x.status !== 'number') return { key: 'offline' };
  if (x.code === 'BAD_API_BASE') return { key: 'realmUnsupported' };
  if (x.status === 401) return { key: 'invalid' };
  if (x.status === 403) return { key: x.code === 'IP_NOT_ALLOWED' ? 'network' : x.code === 'ACCOUNT_BANNED' ? 'unavailable' : 'invalid' };
  if (x.status === 429) return { key: 'retry', retryAfter: typeof x.retryAfter === 'number' && x.retryAfter > 0 ? x.retryAfter : 30 };
  if (x.status === 0 || x.status >= 500) return { key: 'offline' };
  return { key: 'invalid' };
}

/** The shared.js / token-auth.js globals this flow uses (the login page's own). */
export interface TokenGlobals {
  apiCall(method: string, path: string, body: undefined, bearer: string, retried: undefined, opts: { timeoutMs: number; base?: string }): Promise<unknown>;
  parseTokenIntrospection(body: unknown): Intro | null;
  installTokenSession(rec: { token: string; realm: string; owner: { id: string; username: string } }, rev0: string | null): { ok: boolean; why?: string };
  readAuthRev(): string | null;
  classifyStoredAuth(): string;
  realmApiDomain(): string;
  standaloneApiHeld(): boolean;
  /** shared.js: this page is shown inside another page. */
  isFramedPage(): boolean;
}

export function liveGlobals(): TokenGlobals | null {
  const g = globalThis as unknown as Record<string, unknown>;
  const names = ['apiCall', 'parseTokenIntrospection', 'installTokenSession', 'readAuthRev', 'classifyStoredAuth', 'realmApiDomain', 'standaloneApiHeld', 'isFramedPage'];
  return names.every((n) => typeof g[n] === 'function') ? (g as unknown as TokenGlobals) : null;
}

/** What the confirm card shows; `token` and `rev0` stay in memory for Open. */
export interface Checked {
  readonly token: string;
  readonly rev0: string | null;
  readonly intro: Intro;
  readonly pin: string;
  readonly owner: { id: string; username: string };
}

export type CheckResult = { ok: true; checked: Checked } | { ok: false; error: TokenError; retryAfter?: number } | { ok: false; choose: Exclude<Where, { pin: string } | { error: TokenError }>; token: string; rev0: string | null; intro: Intro };

function refused(e: unknown): CheckResult {
  const { key, retryAfter } = errorFor(e);
  return retryAfter === undefined ? { ok: false, error: key } : { ok: false, error: key, retryAfter };
}

/** A page shown inside another page neither sends a key nor installs one; a check that throws counts as framed. */
function framed(g: TokenGlobals): boolean {
  try {
    return g.isFramedPage();
  } catch {
    return true;
  }
}

/** Before the first request: not framed, storage readable and no session already held. */
function startBlock(g: TokenGlobals): TokenError | null {
  if (framed(g)) return 'framed';
  const c = g.classifyStoredAuth();
  if (c === 'unreadable') return 'storage';
  return c === 'none' ? null : 'signedIn';
}

/** Continue: checks the key on the chosen Hoody and finds where it goes. `chosen` answers an earlier choice. */
/** `live` (optional): false once the screen dropped this check (Back, a newer check, unmounted); the owner read
 *  GET /users/auth/me is then not sent with the key, and the check ends 'stale'. */
export async function checkToken(g: TokenGlobals, input: { text: string; realm?: string } | { token: string; rev0: string | null; intro: Intro; pin: string }, live: () => boolean = () => true): Promise<CheckResult> {
  if (framed(g)) return { ok: false, error: 'framed' };
  let token: string, rev0: string | null, intro: Intro, pin: string;
  if ('text' in input) {
    const p = parseShareText(input.text);
    if ('error' in p) return { ok: false, error: p.error };
    const manual = (input.realm ?? '').trim().toLowerCase();
    if (manual && !HEX24.test(manual)) return { ok: false, error: 'realmShape' };
    const block = startBlock(g);
    if (block) return { ok: false, error: block };
    try { rev0 = g.readAuthRev(); } catch { return { ok: false, error: 'storage' }; }
    token = p.token;
    let body: unknown;
    try { body = await g.apiCall('GET', '/auth/tokens/me', undefined, token, undefined, { timeoutMs: TIMEOUT_MS }); } catch (e) { return refused(e); }
    if (g.readAuthRev() !== rev0) return { ok: false, error: 'stale' };
    const read = g.parseTokenIntrospection(body);
    if (!read) return { ok: false, error: 'offline' };
    if (!read.isEnabled) return { ok: false, error: 'invalid' };
    if (!MIN_LEAVES.every((l) => leaf(read.perms, l))) return { ok: false, error: 'noComputers' };
    intro = read;
    const where = resolveRealm(intro, manual || p.realm);
    if ('error' in where) return { ok: false, error: where.error };
    if ('choose' in where) return { ok: false, choose: where, token, rev0, intro };
    pin = where.pin;
  } else {
    ({ token, rev0, intro, pin } = input);
    if (pin !== 'all' && !HEX24.test(pin)) return { ok: false, error: 'realmShape' };
    if (pin !== 'all' && intro.realmIds.length > 0 && !intro.realmIds.includes(pin)) return { ok: false, error: 'realmMismatch' };
    if (pin === 'all' && !(intro.realmIds.length === 0 && intro.allowNoRealm)) return { ok: false, error: 'invalid' };
  }
  let base: string | undefined;
  if (pin !== 'all') {
    const d = g.realmApiDomain();
    if (!d) return { ok: false, error: 'realmUnsupported' };
    base = `https://${pin}.${d}/api/v1`;
  }
  if (!live()) return { ok: false, error: 'stale' };
  let me: unknown;
  try { me = await g.apiCall('GET', '/users/auth/me', undefined, token, undefined, { timeoutMs: TIMEOUT_MS, ...(base ? { base } : {}) }); } catch (e) { return refused(e); }
  const d = me && typeof me === 'object' ? (me as { data?: unknown }).data : null;
  const u = d && typeof d === 'object' ? (d as { id?: unknown; username?: unknown }) : null;
  if (!u || typeof u.id !== 'string' || !HEX24.test(u.id)) return { ok: false, error: 'offline' };
  if (typeof u.username !== 'string' || u.username.length < 1 || u.username.length > 254) return { ok: false, error: 'invalid' };
  if (g.readAuthRev() !== rev0) return { ok: false, error: 'stale' };
  return { ok: true, checked: { token, rev0, intro, pin, owner: { id: u.id, username: u.username } } };
}

/** Open: the conditional install. 'ok' → the caller reloads; anything else is shown and nothing is stored. */
export function openToken(g: TokenGlobals, c: Checked): 'ok' | TokenError {
  const block = startBlock(g);
  if (block === 'framed' || block === 'storage') return block;
  let rev: string | null;
  try { rev = g.readAuthRev(); } catch { return 'storage'; }
  if (rev !== c.rev0 || block) return 'stale';
  // The key was checked on this page's Hoody: storage must still name it (another tab may have chosen another).
  if (!g.standaloneApiHeld()) return 'stale';
  const r = g.installTokenSession({ token: c.token, realm: c.pin, owner: c.owner }, c.rev0);
  if (r && r.ok) return 'ok';
  return r && r.why === 'stale' ? 'stale' : r && r.why === 'invalid' ? 'invalid' : 'storage';
}
