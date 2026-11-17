// signin.ts: password sign-in before any session exists. The one pre-sign-in helper: api()
// needs a session context, so the calls made as nobody go through here, and nowhere else.
//
// Contract:
//   - Endpoints: POST /users/auth/login and /users/auth/2fa/verify; POST /auth/signup, /auth/forgot-password and
//     /auth/resend-verification (no session: each asks for an email); GET /auth/config (is sign-up open, which sign-in
//     providers Hoody offers). All sent
//     through shared.js apiCall as nobody ({anonymous: true}: no stored bearer, no refresh, no retry), so shared.js's
//     own rules hold (the chosen Hoody on the one-file Hub, the framed-page refusal). Never a `code_challenge`: every origin gets the plain session pair.
//   - Answers are typed outcomes only. A rejection's message, data and body never leave this file; the password, the
//     2FA temp token and the session pair are never in an outcome, a log or storage other than the session writer.
//   - The temp token lives in a TwoFactorStep's private field; pages hold the object, never the token.
//   - Install contract: an attempt captures the Hoody origin when it starts (apiOrigin(): '' served, the chosen origin
//     standalone, null when none may be sent to) and re-reads it right before it stores the pair; a changed origin
//     stores nothing ('no-api'), as standalone/device.ts does; the same check runs again right after the write, and a
//     changed origin then takes back this attempt's own pair (ownPair.ts) and ends 'no-api'. Only the newest attempt
//     may store: starting another attempt, or cancelSignIn(), turns every earlier one 'stale'.
//   - An attempt also notes what storage held when it began (classifyStoredAuth); if another tab stored a session
//     meanwhile, that session is kept and this tab opens with it ('signed-in'), the new pair is dropped.
//   - It notes the auth revision too (hub_auth_rev, which every sign-in, sign-out and purge renews). If it moved
//     meanwhile (another tab signed in and out), the pair is dropped and the tab reloads into what storage holds
//     ('signed-in'), so a sign-out elsewhere stays a sign-out.
//   - The pair is stored through shared.js storeAccessTokens (the login page's own writer) and counts only once
//     classifyStoredAuth() reads 'account'.
import { lockoutSeconds } from './lockout';
import { apiOrigin } from './origin';
import { dropOwnPair, type OwnPair } from './ownPair';
import { shared } from './session';

export type SignInRefusal =
  | 'credentials' // wrong address/name or password
  | 'unverified' // the address is not confirmed yet (EMAIL_NOT_VERIFIED)
  | 'banned'
  | 'otp' // wrong or used 2FA code: the same step may try again
  | 'expired' // the 2FA step ran out (it was refused at five minutes old or more): start again with the password
  | 'ended' // the 2FA step can no longer be completed for another reason (its token was used, the session was revoked): sign in again
  | 'retry' // too many tries: wait retryAfter seconds when named
  | 'network' // no answer
  | 'unavailable' // the Hoody answered with a fault
  | 'framed' // this page is in a frame: nothing is sent from it
  | 'storage' // signed in, but this browser did not keep it
  | 'no-api' // this page has no Hoody to send to, or it changed meanwhile
  | 'stale'; // a newer attempt, or leaving the screen, ended this one; nothing was stored

export type SignInResult =
  | { readonly kind: 'signed-in' }
  | { readonly kind: 'two-factor'; readonly step: TwoFactorStep }
  | { readonly kind: 'refused'; readonly why: SignInRefusal; readonly retryAfter?: number };

/** What signin.ts needs from the world; tests pass their own. */
export interface SignInDeps {
  /** One anonymous JSON call to the Hoody API base ('/users/auth/login'): a POST with `body`, a GET without one.
   *  Resolves with the body, rejects with shared.js's rejection. */
  call(path: string, body?: Record<string, unknown>): Promise<unknown>;
  /** Waits (the signup check's retry interval). */
  sleep?(ms: number): Promise<void>;
  now?(): number;
  /** origin.ts apiOrigin(). */
  origin(): string | null;
  /** Stores the pair; true when an account session is stored. */
  store(pair: Readonly<Record<string, string>>): boolean;
  /** ownPair.ts dropOwnPair: takes back the pair this attempt stored, each key only while it still holds its value. */
  dropOwn?(pair: OwnPair): void;
  /** shared.js classifyStoredAuth(): 'account' | 'token' | 'none' | 'unreadable'. */
  stored(): string;
  /** The auth revision (localStorage hub_auth_rev): '' when none is stored, null when storage cannot be read. */
  rev?(): string | null;
}

const TIMEOUT_MS = 20_000;
/** How long a 2FA step's temp token lasts. */
const STEP_LIFE_MS = 5 * 60_000;
const CLIENT = 'web';
const PAIR_KEYS = ['token', 'refreshToken', 'expires_at', 'refresh_expires_at'] as const;

/** hub_auth_rev as shared.js reads it: '' when none is stored, null when storage throws. */
const liveRev = (): string | null => {
  try { return globalThis.localStorage.getItem('hub_auth_rev') ?? ''; } catch { return null; }
};

const liveDeps = (): SignInDeps => ({
  call: (path, body) => shared().apiCall(body ? 'POST' : 'GET', path, body, undefined, undefined, { anonymous: true, noRedirect: true, timeoutMs: TIMEOUT_MS }),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  origin: apiOrigin,
  store: (pair) => {
    const s = shared();
    if (typeof s.storeAccessTokens !== 'function' || typeof s.classifyStoredAuth !== 'function') return false;
    s.storeAccessTokens(pair);
    return s.classifyStoredAuth() === 'account';
  },
  stored: () => shared().classifyStoredAuth?.() ?? 'unreadable',
  rev: liveRev,
  dropOwn: dropOwnPair,
});

let generation = 0;

/** Ends every attempt in flight: none of them stores anything (the screen was left, or the person started over). */
export function cancelSignIn(): void {
  generation++;
}

/** The 2FA step of one sign-in. Its temp token is private; `verify` sends it with a code. */
export class TwoFactorStep {
  readonly #token: string;
  readonly #origin: string;
  readonly #gen: number;
  readonly #before: Before;
  readonly #deps: SignInDeps;
  readonly #at: number;
  constructor(token: string, origin: string, gen: number, before: Before, deps: SignInDeps) {
    this.#at = deps.now?.() ?? Date.now();
    this.#token = token;
    this.#origin = origin;
    this.#gen = gen;
    this.#before = before;
    this.#deps = deps;
  }
  /** Sends a 6-digit code or a backup code, without the spaces and hyphens people type between its groups (neither
   *  kind of code holds one). 'otp' keeps this step usable; 'expired' and 'ended' mean start again. */
  async verify(code: string): Promise<SignInResult> {
    const deps = this.#deps;
    if (this.#gen !== generation) return refused('stale');
    if (deps.origin() !== this.#origin) return refused('no-api');
    const r = await finish(deps, this.#origin, this.#gen, this.#before, () => deps.call('/users/auth/2fa/verify', { temp_token: this.#token, code: code.replace(/[\s-]/g, ''), client: CLIENT }), true);
    // The API refuses a timed-out token, a used one and a revoked session with the same answer. Only this step's own
    // age tells the first apart: the token lasts five minutes, so a younger step did not take too long.
    if (r.kind === 'refused' && r.why === 'ended' && (deps.now?.() ?? Date.now()) - this.#at >= STEP_LIFE_MS) return refused('expired');
    return r;
  }
  /** Not the token: a step printed or logged shows nothing. */
  toJSON(): string {
    return '[two-factor step]';
  }
}

/** Signs in with an email address or user name and a password. */
export async function passwordSignIn(login: string, password: string, deps: SignInDeps = liveDeps()): Promise<SignInResult> {
  const gen = ++generation;
  const origin = deps.origin();
  if (origin === null) return refused('no-api');
  const before: Before = { stored: deps.stored(), rev: deps.rev?.() ?? null };
  const id = login.trim();
  const body: Record<string, unknown> = id.includes('@') ? { email: id, password, client: CLIENT } : { username: id, password, client: CLIENT };
  return finish(deps, origin, gen, before, () => deps.call('/users/auth/login', body), false);
}

export type ResetResult =
  | { readonly kind: 'sent' } // the Hoody answers the same whether or not the address has an account
  | { readonly kind: 'refused'; readonly why: 'address' | 'retry' | 'network' | 'unavailable' | 'framed' | 'no-api'; readonly retryAfter?: number };

/** Asks the Hoody to email a password-reset link (POST /auth/forgot-password). The link opens the Hoody's own page. */
export async function requestPasswordReset(email: string, deps: SignInDeps = liveDeps()): Promise<ResetResult> {
  return requestEmail('/auth/forgot-password', email, deps);
}

async function requestEmail(path: string, email: string, deps: SignInDeps): Promise<ResetResult> {
  if (deps.origin() === null) return { kind: 'refused', why: 'no-api' };
  try {
    await deps.call(path, { email: email.trim() });
    return { kind: 'sent' };
  } catch (e) {
    const r = refusalOf(e, false);
    if (r.kind !== 'refused') return { kind: 'refused', why: 'unavailable' };
    const why = r.why === 'credentials' ? 'address' : r.why === 'retry' || r.why === 'network' || r.why === 'framed' || r.why === 'no-api' ? r.why : 'unavailable';
    return r.retryAfter !== undefined ? { kind: 'refused', why, retryAfter: r.retryAfter } : { kind: 'refused', why };
  }
}

function refused(why: SignInRefusal, retryAfter?: number): SignInResult {
  return retryAfter !== undefined ? { kind: 'refused', why, retryAfter } : { kind: 'refused', why };
}

const objectOf = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** What storage held when an attempt began: its auth class and its auth revision. */
interface Before {
  readonly stored: string;
  readonly rev: string | null;
}

async function finish(deps: SignInDeps, origin: string, gen: number, before: Before, send: () => Promise<unknown>, twoFactor: boolean): Promise<SignInResult> {
  let answer: unknown;
  try {
    answer = await send();
  } catch (e) {
    if (gen !== generation) return refused('stale');
    return refusalOf(e, twoFactor);
  }
  if (gen !== generation) return refused('stale');
  const data = objectOf(objectOf(answer)?.data);
  if (!data) return refused('unavailable');
  if (!twoFactor && data.requires_2fa === true) {
    return typeof data.temp_token === 'string' && data.temp_token ? { kind: 'two-factor', step: new TwoFactorStep(data.temp_token, origin, gen, before, deps) } : refused('unavailable');
  }
  const pair: Record<string, string> = {};
  for (const k of PAIR_KEYS) if (typeof data[k] === 'string') pair[k] = data[k] as string;
  if (!pair.token || !pair.refreshToken) return refused('unavailable');
  // The pair belongs to `origin`: another tab, or this page's Back, may have named another Hoody (or none) meanwhile.
  if (deps.origin() !== origin) return refused('no-api');
  // Another tab signed in while this attempt ran: its session is kept, never overwritten, and this tab opens with it
  // ('signed-in': the page reloads into what is stored). This attempt's own pair is dropped.
  const now = deps.stored();
  if (now !== before.stored && (now === 'account' || now === 'token')) return { kind: 'signed-in' };
  // Another tab signed in and out meanwhile (the revision moved): its sign-out stands, and this pair is dropped.
  if ((deps.rev?.() ?? null) !== before.rev) return { kind: 'signed-in' };
  if (!deps.store(pair)) {
    // A partial write, and another Hoody named meanwhile: what this attempt wrote is taken back as well.
    if (deps.origin() !== origin) (deps.dropOwn ?? dropOwnPair)({ token: pair.token, refreshToken: pair.refreshToken });
    return refused('storage');
  }
  // Another tab may have named another Hoody between that check and the write: take back only this attempt's pair.
  if (deps.origin() !== origin) {
    (deps.dropOwn ?? dropOwnPair)({ token: pair.token, refreshToken: pair.refreshToken });
    return refused('no-api');
  }
  return { kind: 'signed-in' };
}

/** shared.js's rejection → one refusal. Reads status, code, retryAfter and a lockout's seconds only. */
function refusalOf(e: unknown, twoFactor: boolean): SignInResult {
  const r = objectOf(e);
  const status = typeof r?.status === 'number' ? r.status : null;
  const code = typeof r?.code === 'string' ? r.code : '';
  if (code === 'FRAMED_ACTION_REFUSED') return refused('framed');
  if (code === 'BAD_API_BASE') return refused('no-api');
  if (status === null || status === 0) return refused('network');
  if (status === 429) {
    // The 2FA lockout names its wait in the body (data.lockout_seconds), with no Retry-After header.
    const after = typeof r?.retryAfter === 'number' && r.retryAfter > 0 ? r.retryAfter : lockoutSeconds(r);
    return refused('retry', after);
  }
  if (status >= 500) return refused('unavailable');
  if (code === 'ACCOUNT_BANNED') return refused('banned');
  // Any other 401 or 400 ends the step; whether it ran out of time is the step's to say (TwoFactorStep.verify).
  if (twoFactor) return refused(code === 'INVALID_OTP_CODE' ? 'otp' : status === 401 || status === 400 ? 'ended' : 'unavailable');
  if (code === 'EMAIL_NOT_VERIFIED') return refused('unverified');
  if (status === 401 || status === 400) return refused('credentials');
  return refused('unavailable');
}

// ---- sign-up (POST /auth/signup) ----
//   - A new account gets an email to confirm; nothing is stored here and the answer is the same for a new and a known
//     address. The person signs in after following the link.
//   - CHALLENGE_REQUIRED: the check opens on the Hoody's own page in a new tab (`url`, built here on the chosen Hoody
//     from the answer's fragment, never taken whole from the answer) with `matchCode` to compare; the same request is
//     repeated with challenge {token, secret} every `interval` s (2-30) until it passes, 31 minutes at most, as the
//     sign-up page does. PENDING waits; a new REQUIRED switches; INVALID
//     ends ('challenge-expired'); a busy check, no answer, 429 or a fault waits for the next round.
//   - The password is held only while that request is outstanding: the loop's closure, dropped when it ends or stops.

export interface SignupInput {
  email: string;
  password: string;
  inviteCode?: string;
  referralCode?: string;
}

export type SignupRefusal = 'invalid' | 'domain' | 'closed' | 'paused' | 'challenge-expired' | 'retry' | 'network' | 'unavailable' | 'framed' | 'no-api' | 'stopped';

export type SignupState =
  | { readonly kind: 'sending' }
  | { readonly kind: 'challenge'; readonly url: string; readonly matchCode: string }
  | { readonly kind: 'sent' }
  | { readonly kind: 'refused'; readonly why: SignupRefusal; readonly retryAfter?: number };

export interface SignupRun {
  stop(): void;
  readonly done: Promise<SignupState>;
}

/** The server's password rule: 12+ characters, at most 72 UTF-8 bytes,
 *  3 of 4 classes. A password that fails it is refused here, before anything is sent. */
export function passwordFitsRule(pw: string): boolean {
  if (pw.length < 12 || new TextEncoder().encode(pw).length > 72) return false;
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/].filter((re) => re.test(pw)).length;
  return classes >= 3;
}

// A check lives 15 minutes; a check page that was told "busy" may still start it up to 15 minutes later.
const MAX_CHALLENGE_MS = 31 * 60 * 1000;
// Token and secrets are base64url (as the API issues them); the fragment is `<token>.<browser secret>`.
const B64 = '[A-Za-z0-9_-]';
const FRAGMENT_RE = new RegExp(`^${B64}{8,4000}\\.${B64}{8,512}$`);
const SECRET_RE = new RegExp(`^${B64}{8,4000}$`);
const MATCH_RE = /^[A-Za-z0-9]{1,16}$/;

interface Challenge { token: string; secret: string; url: string; matchCode: string; intervalMs: number }

function challengeOf(e: unknown, origin: string): Challenge | null {
  const r = objectOf(e);
  const body = objectOf(r?.data);
  const c = objectOf(objectOf(body?.data)?.challenge) ?? objectOf(body?.challenge);
  if (!c) return null;
  const { token, secret, verification_url: vu, match_code: mc, interval } = c;
  if (typeof token !== 'string' || !SECRET_RE.test(token) || typeof secret !== 'string' || !SECRET_RE.test(secret)) return null;
  const hash = typeof vu === 'string' ? vu.indexOf('#') : -1;
  const fragment = hash >= 0 ? (vu as string).slice(hash + 1) : '';
  if (!FRAGMENT_RE.test(fragment)) return null;
  const s = typeof interval === 'number' && Number.isFinite(interval) ? interval : 5;
  return {
    token,
    secret,
    url: `${origin}/auth/challenge#${fragment}`,
    matchCode: typeof mc === 'string' && MATCH_RE.test(mc) ? mc : '',
    intervalMs: Math.max(2, Math.min(30, s)) * 1000,
  };
}

function signupRefusal(e: unknown): Extract<SignupState, { kind: 'refused' }> | 'transient' {
  const r = objectOf(e);
  const status = typeof r?.status === 'number' ? r.status : null;
  const code = typeof r?.code === 'string' ? r.code : '';
  if (code === 'FRAMED_ACTION_REFUSED') return { kind: 'refused', why: 'framed' };
  if (code === 'BAD_API_BASE') return { kind: 'refused', why: 'no-api' };
  if (code === 'CHALLENGE_INVALID') return { kind: 'refused', why: 'challenge-expired' };
  if (code === 'EMAIL_DOMAIN_NOT_ACCEPTED') return { kind: 'refused', why: 'domain' };
  if (code === 'SIGNUP_DISABLED') return { kind: 'refused', why: 'closed' };
  if (code === 'SIGNUP_DAILY_LIMIT_REACHED') return { kind: 'refused', why: 'paused' };
  if (status === null || status === 0 || status === 429 || status >= 500) return 'transient';
  if (status === 400) return { kind: 'refused', why: 'invalid' };
  return { kind: 'refused', why: 'unavailable' };
}

/** Starts one sign-up. `onState` gets each state; the last is 'sent' or 'refused'. */
export function startSignup(input: SignupInput, onState: (s: SignupState) => void, deps: SignInDeps = liveDeps()): SignupRun {
  let stopped = false;
  let wake: (() => void) | null = null;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const report = (s: SignupState): SignupState => { if (!stopped) onState(s); return s; };
  const nap = (ms: number) => new Promise<void>((res) => { wake = res; void sleep(ms).then(res); });
  const run = async (): Promise<SignupState> => {
    const origin = deps.origin();
    if (origin === null) return report({ kind: 'refused', why: 'no-api' });
    const body: Record<string, unknown> = { email: input.email.trim(), password: input.password, client: CLIENT };
    if (input.inviteCode?.trim()) body.invite_code = input.inviteCode.trim();
    if (input.referralCode?.trim()) { body.referral_code = input.referralCode.trim(); body.referral_source = 'typed'; }
    report({ kind: 'sending' });
    let challenge: Challenge | null = null;
    // 31 minutes from the FIRST check: a successor check does not restart it. Checked before every send.
    let deadline = Infinity;
    for (;;) {
      if (stopped) return { kind: 'refused', why: 'stopped' };
      if (now() >= deadline) return report({ kind: 'refused', why: 'challenge-expired' });
      let waitMs = 0;
      try {
        await deps.call('/auth/signup', challenge ? { ...body, challenge: { token: challenge.token, secret: challenge.secret } } : body);
        return report({ kind: 'sent' });
      } catch (e) {
        if (stopped) return { kind: 'refused', why: 'stopped' };
        const r = objectOf(e);
        const next = r?.code === 'CHALLENGE_REQUIRED' ? challengeOf(e, origin) : null;
        if (next) {
          if (!challenge) deadline = now() + MAX_CHALLENGE_MS;
          challenge = next;
          report({ kind: 'challenge', url: next.url, matchCode: next.matchCode });
        } else if (r?.code === 'CHALLENGE_PENDING' && challenge) {
          // not finished yet
        } else {
          const refusal = signupRefusal(e);
          if (refusal !== 'transient') return report(refusal);
          const after = typeof r?.retryAfter === 'number' && r.retryAfter > 0 ? r.retryAfter : undefined;
          if (!challenge) {
            if (r?.status === 429) return report(after !== undefined ? { kind: 'refused', why: 'retry', retryAfter: after } : { kind: 'refused', why: 'retry' });
            return report({ kind: 'refused', why: typeof r?.status === 'number' && r.status >= 500 ? 'unavailable' : 'network' });
          }
          // A busy or rate-limited Hoody named its wait: the next round waits at least that long.
          if (after !== undefined) waitMs = after * 1000;
        }
      }
      if (!challenge) return report({ kind: 'refused', why: 'unavailable' });
      const left = deadline - now();
      if (left <= 0) return report({ kind: 'refused', why: 'challenge-expired' });
      await nap(Math.min(Math.max(challenge.intervalMs, waitMs), left));
    }
  };
  const done = run();
  return {
    stop() { stopped = true; wake?.(); },
    done,
  };
}


/** A sign-in provider Hoody's own pages offer (GET /auth/config `githubEnabled`, `googleEnabled`). */
export type SignInProvider = 'github' | 'google';

/** Which sign-up the chosen Hoody offers (GET /auth/config), and which sign-in providers: a provider counts only when
 *  its flag is exactly true, GitHub first, as on Hoody's own pages. Null when it cannot be read: the screen offers
 *  sign-up and lets the request's own answer say no, and offers no provider. */
export async function readSignupConfig(deps: SignInDeps = liveDeps()): Promise<{ open: boolean; invite: boolean; providers: readonly SignInProvider[] } | null> {
  try {
    const data = objectOf(objectOf(await deps.call('/auth/config'))?.data);
    if (!data) return null;
    const providers: SignInProvider[] = [];
    if (data.githubEnabled === true) providers.push('github');
    if (data.googleEnabled === true) providers.push('google');
    return { open: data.signupEnabled !== false, invite: data.inviteRequired === true, providers };
  } catch {
    return null;
  }
}

/** POST /auth/resend-verification: the same answer for any address; only a refusal to send at all is reported. */
export async function resendVerification(email: string, deps: SignInDeps = liveDeps()): Promise<ResetResult> {
  return requestEmail('/auth/resend-verification', email, deps);
}
