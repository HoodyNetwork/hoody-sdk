// boot-token.ts: the agent sign-in boot token (HubBootToken.ensure, public/auth/hub-boot-token.js), for Ask's
// bootstrap and the Board's frame mounts.
//
// Contract, in plain words:
//   - agentBootToken(ctx) resolves the account's boot token only for the captured, still-alive account of a
//     signed-in account session; it rejects otherwise ({code: 'STALE'} when the context died before or after the
//     answer, 'NOT_ALLOWED' in a token session, 'BOOT_TOKEN_FAILED' when no usable token came back, 'BUSY' when a
//     press gave up waiting for an older ask's unsettled work (nothing was asked or sent),
//     'CANCELLED' when the 2FA code prompt for its mint was cancelled, 'UNAVAILABLE' when the producer could not
//     load). Errors carry no message and never the token.
//   - The producer is the auth pages' own module (reuse, one token per account per browser, unique
//     alias per mint, owner/epoch/sign-out fences, server validation of a cached token). Core loads
//     /auth/hub-boot-token.js once, on the first ask, on a live page. shared.js's sign-out
//     (endOutgoingSession) revokes the token through it, so a token minted here never outlives the sign-out.
//   - Three callers, all memory only (never stored, logged or shown):
//       Ask holds it for one request (POST /hoody/auth/bootstrap) and drops it once that settles.
//       agent-signin.ts (New script's "sign the agent in") does the same, for its one bootstrap.
//       The Board may ask for it on every frame mount and hand it to that frame's agent
//       bootstrap. It never goes into a Copy link, a new tab, an export or any URL that leaves the frame. A
//       STALE answer mounts nothing (the context moved: the frame waits for the next mount).
//   - 2FA: without help the producer mints through a plain apiCall, so an account behind 2FA gets BOOT_TOKEN_FAILED
//     unless a cached token is still valid. Only a caller that a person's press started passes {codePrompt: true}
//     (agent-signin.ts). That ask hands the producer its own mint for this ensure (ensure(uid, {mint})); nothing is
//     published, so no other script or later ask can use it. The mint is bound to the ask: its context (account,
//     realm), the producer's owner equal to that account, a body of the boot token's own shape, at most
//     MINT_ATTEMPTS sends (the producer retries once on an alias clash), and only until the ask settles; then every
//     call is refused unsent. It sends through api(), whose 2FA step asks core's code prompt (otp.ts) and retries.
//     A frame mount or any other background ask never opens a code prompt.
//   - Presses share one ask per account (the producer shares its work per account too): a press while another's ask
//     runs for the same account waits on that ask and reads its outcome. A cancelled prompt ends every press waiting on
//     that ask CANCELLED, even when the producer then recovers an older cached token: the person said no, so the
//     presses stop there and nothing is signed in. A press whose context differs from a running ask's (a realm change
//     since) does not join it, but waits until it settles and takes its cancel, because the producer's work is still
//     that ask's until then; it gives up (no key, nothing sent: 'BUSY') after PRESS_WAIT_MS, or once it is no longer live, and the
//     old ask keeps its place until its work settles. A press after the ask settled starts a new ask. A press may pass
//     still(), its own liveness (agent-signin.ts: the computer it is for is still the one shown, never left); the mint goes only while
//     at least one waiting press is still live, so a press that was left neither prompts nor mints for nobody.
//   - An ask that rides producer work already running (a Board mount's) brings no mint of its own: no prompt, and it
//     takes what that work gives. A background ask (no codePrompt) never joins or waits on a press's ask.
//   - Fixture mode answers FIXTURE_BOOT_TOKEN (not a credential) for a live context.
import { api, type HubError } from './api';
import { alive, identity, tokenSession, type Ctx } from './ctx';
import { defineRoute } from './routes';
import { fixtureModeActive } from './transport';

// Empty in a build (__HUB_FIXTURES__ false), so the fixture answer leaves the bundle with its branch below.
export const FIXTURE_BOOT_TOKEN = __HUB_FIXTURES__ ? 'fixture-boot-token' : '';
const SCRIPT = '/auth/hub-boot-token.js';
const LOAD_TIMEOUT_MS = 10_000;

type MintFn = (method: unknown, path: unknown, body: unknown, opts?: { owner?: unknown; bind?: unknown } | null) => Promise<unknown>;
interface Producer { ensure(uid: string, o?: { mint?: MintFn }): Promise<{ token?: unknown; state?: unknown }> }
type BootError = { code: 'STALE' | 'NOT_ALLOWED' | 'BOOT_TOKEN_FAILED' | 'BUSY' | 'CANCELLED' | 'UNAVAILABLE'; stale?: true };

const fail = (code: BootError['code']): BootError => (code === 'STALE' ? { code, stale: true } : { code });
const producer = (): Producer | null => {
  const p = (globalThis as { HubBootToken?: Producer }).HubBootToken;
  return p && typeof p.ensure === 'function' ? p : null;
};

// ---- the key mint, with 2FA ----
/** Codes a mint refusal may keep (the codes the token routes really return); anything else arrives without one. */
export const TOKEN_MINT_CODES = ['DUPLICATE_ALIAS', 'AUTH_TOKEN_LIMIT_REACHED', 'TOKEN_CEILING_EXCEEDED', 'TOKEN_NOT_FOUND', 'OTP_REQUIRED', 'TWOFACTOR_RATE_LIMIT'] as const;
/** POST /auth/tokens, one route for every mint (the Keys page's and the boot token's). Secret: the answer holds the
 *  key; a refusal keeps only its code. A change: never retried or resent; a lost answer is read back by its caller. */
export const tokenMintRoute = defineRoute<{ data?: unknown }, Record<string, unknown>>({
  method: 'POST', path: '/auth/tokens', scope: 'base', baseOnly: true, secret: true, codes: TOKEN_MINT_CODES,
  body: ['alias', 'realm_ids', 'allow_no_realm', 'permissions', 'permission_template', 'vault_access', 'event_access', 'expires_at', 'ip_whitelist', 'deny_reauthorization'],
});
// The boot token's own body (hub-boot-token.js mintOnce): the ask's mint refuses any other key unsent, and the values
// it can check without re-deriving the producer's permission tree (the template part stays the producer's): the three
// access flags on, the producer's alias prefix, an expiry within MAX_DAYS, a permissions object that grants no money
// (only the producer's read-only financial leaves, MONEY_READ) and nothing under admin. A narrower producer tree still
// passes; a wider one is refused unsent (the press then reads "could not make the key"), never minted.
const BOOT_MINT_KEYS: readonly string[] = ['alias', 'permissions', 'vault_access', 'event_access', 'allow_no_realm', 'expires_at'];
const ALIAS_PREFIX = 'hoody-agent auto ';
const MAX_DAYS = 400;
export const MINT_ATTEMPTS = 2;
const notSent = (code: string): HubError => ({ kind: 'not_sent', code, notSent: true });
const isRec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

const MONEY_READ: readonly string[] = ['financial.wallet.read', 'financial.billing.read', 'financial.server_rental.view_marketplace'];
function onLeaves(x: unknown, at: string, out: string[]): string[] {
  if (x === true) out.push(at);
  else if (isRec(x)) for (const [k, v] of Object.entries(x)) onLeaves(v, `${at}.${k}`, out);
  return out;
}
const grantsTooMuch = (perms: Record<string, unknown>): boolean =>
  onLeaves(perms.financial, 'financial', []).some((l) => !MONEY_READ.includes(l)) || onLeaves(perms.admin, 'admin', []).length > 0;

function bootBody(body: unknown): boolean {
  if (!isRec(body) || Object.keys(body).some((k) => !BOOT_MINT_KEYS.includes(k))) return false;
  if (body.vault_access !== true || body.event_access !== true || body.allow_no_realm !== true) return false;
  if (typeof body.alias !== 'string' || !body.alias.startsWith(ALIAS_PREFIX) || !isRec(body.permissions) || grantsTooMuch(body.permissions)) return false;
  const exp = typeof body.expires_at === 'string' ? Date.parse(body.expires_at) : NaN;
  return Number.isFinite(exp) && exp > Date.now() && exp - Date.now() <= MAX_DAYS * 86_400_000;
}

interface MintAsk { readonly ctx: Ctx; readonly owner: string; live: boolean; sends: number; cancelled: boolean; readonly stills: Set<() => boolean> }
const anyStill = (ask: MintAsk): boolean => [...ask.stills].some((f) => { try { return f(); } catch { return false; } });

/** The mint one press-started ask hands the producer (see the contract). */
function mintFor(ask: MintAsk): MintFn {
  return (method, path, body, opts) => {
    if (!ask.live || !alive(ask.ctx) || !anyStill(ask)) return Promise.reject(notSent('NOT_ALLOWED'));
    if (method !== 'POST' || path !== '/auth/tokens') return Promise.reject(notSent('ROUTE_NOT_ALLOWED'));
    if (!bootBody(body)) return Promise.reject(notSent('ROUTE_BODY'));
    const shown = identity();
    const owner = opts && opts.owner != null ? String(opts.owner) : '';
    if (tokenSession() || owner !== ask.owner || !shown || String(shown.id) !== ask.owner) return Promise.reject(notSent('NOT_ALLOWED'));
    if (ask.sends >= MINT_ATTEMPTS) return Promise.reject(notSent('NOT_ALLOWED'));
    ask.sends++;
    // A producer that keeps its own record of this mint hands it to this one call (CallInput.bind); the web passes none.
    const bind = opts && typeof opts.bind === 'object' && opts.bind !== null ? opts.bind : undefined;
    return api(tokenMintRoute, { ctx: ask.ctx, body: body as Record<string, unknown>, still: () => ask.live && anyStill(ask), ...(bind ? { bind } : {}) }).catch((e: unknown) => {
      if (isRec(e) && e.cancelled === true && e.kind !== 'pending') ask.cancelled = true;
      throw e;
    });
  };
}

let loading: Promise<Producer | null> | null = null;
function load(): Promise<Producer | null> {
  const ready = producer();
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  loading = new Promise<Producer | null>((resolve) => {
    let el: HTMLScriptElement;
    try { el = document.createElement('script'); } catch { resolve(null); return; }
    const t = setTimeout(() => resolve(producer()), LOAD_TIMEOUT_MS);
    el.src = SCRIPT;
    el.onload = () => { clearTimeout(t); resolve(producer()); };
    el.onerror = () => { clearTimeout(t); resolve(null); };
    document.head.appendChild(el);
  }).then((p) => { if (!p) loading = null; return p; }); // a failed load may be tried again later
  return loading;
}

// The press-started asks running, by account: what a press joins (see the contract).
interface Asked { res?: { token?: unknown; state?: unknown }; failed?: true; busy?: true; cancelled: boolean }
const presses = new Map<string, { ask: MintAsk; done: Promise<Asked> }>();

// How long a press waits for an older ask of a dead context to settle (the producer's own reads carry no timeout).
export const PRESS_WAIT_MS = 20_000;
let pressWait = PRESS_WAIT_MS;
/** done's answer; 'busy' once `pressWait` passes, 'gone' once this press is no longer live (its context died, or still() is false). */
function waitOut(done: Promise<Asked>, ctx: Ctx, still: () => boolean): Promise<Asked | 'busy' | 'gone'> {
  return new Promise((resolve) => {
    const live = (): boolean => { try { return alive(ctx) && still(); } catch { return false; } };
    const end = (v: Asked | 'busy' | 'gone'): void => { clearInterval(poll); clearTimeout(cut); resolve(v); };
    const poll = setInterval(() => { if (!live()) end('gone'); }, 250);
    const cut = setTimeout(() => end('busy'), pressWait);
    void done.then(end);
  });
}

async function pressAsk(p: Producer, ctx: Ctx, uid: string, still: () => boolean): Promise<Asked> {
  for (let was = presses.get(uid); was; was = presses.get(uid)) {
    if (was.ask.live && alive(was.ask.ctx)) { was.ask.stills.add(still); return was.done; }
    // An ask whose context died (a realm change) still holds the account's producer work: a new ensure() now would ride that
    // same work with no record of its cancel. Wait until it settles; its cancel is this press's too. Then ask anew.
    const old = await waitOut(was.done, ctx, still);
    // Not settled in time ('BUSY'), or this press was left (the caller sees it stale): refused without a key. The old ask stays
    // in the map until its work settles, so a later press waits on it again and still takes its cancel.
    if (old === 'busy') return { failed: true, busy: true, cancelled: false };
    if (old === 'gone') return { failed: true, cancelled: false };
    if (old.cancelled) return { failed: true, cancelled: true };
    if (presses.get(uid) === was) break; // never spin on an entry that outlived its ask
  }
  const ask: MintAsk = { ctx, owner: uid, live: true, sends: 0, cancelled: false, stills: new Set([still]) };
  const done = p.ensure(uid, { mint: mintFor(ask) }).then(
    (res): Asked => ({ res, cancelled: ask.cancelled }),
    (): Asked => ({ failed: true, cancelled: ask.cancelled }),
  ).finally(() => {
    ask.live = false;
    if (presses.get(uid)?.ask === ask) presses.delete(uid);
  });
  presses.set(uid, { ask, done });
  return done;
}

/** The boot token for ctx's account (see the contract). */
export async function agentBootToken(ctx: Ctx, o?: { codePrompt?: boolean; still?: () => boolean }): Promise<string> {
  if (!alive(ctx) || !ctx.account) throw fail('STALE');
  if (tokenSession()) throw fail('NOT_ALLOWED');
  if (__HUB_FIXTURES__ && fixtureModeActive()) return FIXTURE_BOOT_TOKEN;
  const p = await load();
  if (!alive(ctx)) throw fail('STALE');
  if (!p) throw fail('UNAVAILABLE');
  const uid = String(ctx.account);
  let res: { token?: unknown; state?: unknown };
  if (o && o.codePrompt) {
    const got = await pressAsk(p, ctx, uid, o.still ?? (() => true));
    // The answer belongs to the account it was asked for: once the context died, it is dropped unseen.
    if (!alive(ctx)) throw fail('STALE');
    // A cancelled prompt stops every press of that ask, even when the producer recovered an older cached token.
    if (got.cancelled) throw fail('CANCELLED');
    if (got.busy) throw fail('BUSY');
    if (got.failed || !got.res) throw fail('BOOT_TOKEN_FAILED');
    res = got.res;
  } else {
    try { res = await p.ensure(uid); } catch {
      throw fail(alive(ctx) ? 'BOOT_TOKEN_FAILED' : 'STALE');
    }
    if (!alive(ctx)) throw fail('STALE');
  }
  if ((res.state === 'ok' || res.state === 'degraded') && typeof res.token === 'string' && res.token) return res.token;
  throw fail(res.state === 'skipped' ? 'NOT_ALLOWED' : 'BOOT_TOKEN_FAILED');
}

/** The boot-token load and presses forgotten and the press wait set (session disposal, dispose.ts; tests). */
export function resetBootToken(waitMs = PRESS_WAIT_MS): void { loading = null; presses.clear(); pressWait = waitMs; }
