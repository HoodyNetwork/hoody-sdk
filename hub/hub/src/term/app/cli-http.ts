// The HoodyClient over the hoody CLI's own HTTP client. The CLI's
// `HttpClient` (hoody-sdk cli/http-client.ts) keeps what it already owns: the saved sign-in of the profile (flags >
// environment > profile), the refresh of an expired access token under its refresh lock, the rotated pair written back,
// the proxy rule of its transport. This file adds only the Hub's call rules, which cli-client.ts holds once:
//
//   - every attempt goes through cliHoodyClient (beforeWire right before it, canonical body bytes, no redirect, the
//     bearer only to the API origin and realm API hosts), on the CLI client's own transport (`getFetch()`);
//   - the bearer is the CLI's token, read again before each call: an access token past its expiry is renewed first
//     (`forceRefreshToken`), and a call answered 401 renews once and is sent again: a 401 is a definite refusal, so the
//     resend is a new attempt through beforeWire with the same request, never a blind repeat of an unknown outcome.
//     Only a 401 about the credential does: one that refuses what was typed (a wrong 2FA code or password) is the
//     call's answer, sent once, and never ends the session (session-401.ts);
//   - a renewal the platform did not answer refuses only the call that needed it; a renewal that is refused ends the
//     session: onAuthEnded tells the mount ('expired'), and every later call is refused
//     unsent (401 superseded). So does a renewed token of ANOTHER account (the identity never changes in a mount);
//   - a pair the API reissued for this session (2FA turned on or off ends every other one) replaces the bearer at
//     once and is handed to the CLI to keep (`adoptReissuedSession`), so the saved sign-in goes on working.
//
// Duck-typed (CliHttp): no SDK import, so the Hub tree builds without the CLI; the CLI hands in its client.
import type { HoodyClient } from '../host-types';
import { cliHoodyClient, type WireRequest } from './cli-client';
import { carriesTyped, sessionRefusal } from '../session-401';
import { resolveStartRealm, type StartRealm, type StartRealmInput } from './start-realm';

/** The part of the CLI's HttpClient this adapter uses. */
export interface CliHttp {
  /** The profile's credential (the saved token; signs in with saved username/password when there is no token). */
  getAuthToken(): Promise<string | undefined>;
  /** Renews the access token (saved refresh token, else saved credentials); undefined when it could not. */
  forceRefreshToken(): Promise<string | undefined>;
  /** Why the last renewal renewed nothing: `unanswered` may work on a later try; any other value, or none, is final. */
  getRefreshFailure(): string | undefined;
  /** The CLI's transport (its proxy rule applied). */
  getFetch(): (input: string, init?: RequestInit) => Promise<Response>;
  /** Optional: keeps a pair the API reissued for this session (2FA turned on or off): in the CLI's own memory and
   *  where it saved the sign-in, so its next renewal spends the new refresh token. Resolves true when kept. */
  adoptReissuedSession?(pair: { token: string; refreshToken: string }): Promise<boolean>;
}

export interface CliHubPlaces {
  readonly apiOrigin: string;
  readonly realmApiDomain: string;
  readonly proxyDomain?: string;
}

export type CliHubOpen =
  | {
    readonly ok: true; readonly client: HoodyClient; readonly kind: 'account' | 'token';
    /** An access key limited to exactly one realm: that realm (already in the identity). */
    readonly realm?: string;
    /** An access key: the realms it is limited to (introspection's realm_ids; empty = none). */
    readonly realms?: readonly string[];
    /** An access key: whether it may work outside any realm (introspection's allow_no_realm), which All realms needs. */
    readonly allowNoRealm?: boolean;
  }
  /** `unanswered`: the platform did not answer (no answer, 429 or 5xx) or another hoody process is renewing the
   *  sign-in: try again, the sign-in may be fine. `needs-2fa`: the saved sign-in needs a second factor it cannot give.
   *  `untrusted`: the transport refused the platform's certificate, so nothing was sent and nothing is known about
   *  the sign-in. */
  | { readonly ok: false; readonly why: 'signed-out' | 'expired' | 'unreadable' | 'unanswered' | 'needs-2fa' | 'untrusted' };

/** A read of the key's own records that did not answer 200: 401 the key no longer works, a busy or failing platform
 *  did not answer, anything else cannot be used. */
const notOpened = (status: number): 'expired' | 'unanswered' | 'unreadable' =>
  status === 401 ? 'expired' : status === 429 || status >= 500 ? 'unanswered' : 'unreadable';

/** Transport failures: no answer from the platform, whatever the cause. */
const NO_ANSWER = /^(NETWORK_ERROR|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|EHOSTDOWN|EPIPE|UND_ERR_[A-Z_]+)$/;

/** A certificate the transport refused (expired, not yet valid, unknown issuer, self-signed, wrong name, a failed handshake). */
const UNTRUSTED = /^(CERT_[A-Z_]+|UNABLE_TO_[A-Z_]+|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|ERR_TLS_[A-Z_]+|ERR_SSL_[A-Z_]+)$/;

/**
 * What a failed read or renewal of the CLI's sign-in means, from the error's code, status and name only (never its
 * text): a second factor the saved sign-in cannot give, a certificate the transport refused, no answer from the
 * platform (try again), or anything else (signed out).
 * An answer decides before any transport code: an error that carries a status was answered, so a 401 or 403 beside a
 * connection code (the connection dropped after the refusal arrived) is a refusal, never "no answer". A failure with
 * no status counts as "no answer" only for a known transport code (its own or its cause's), a timeout or an abort:
 * any other error, a TypeError with some other cause included, is not evidence that the platform did not answer.
 */
export function signInFailure(e: unknown): 'needs-2fa' | 'untrusted' | 'unanswered' | 'signed-out' {
  if (!e || typeof e !== 'object') return 'signed-out';
  const o = e as { code?: unknown; status?: unknown; cause?: unknown; name?: unknown };
  if (o.code === 'TWO_FACTOR_REQUIRED') return 'needs-2fa';
  const status = typeof o.status === 'number' ? o.status : 0;
  if (status === 429 || status >= 500) return 'unanswered';
  if (status === 401 || status === 403) return 'signed-out';
  const causeCode = o.cause && typeof o.cause === 'object' ? (o.cause as { code?: unknown }).code : undefined;
  const codes = [o.code, causeCode].filter((c): c is string => typeof c === 'string');
  if (codes.some((c) => UNTRUSTED.test(c))) return 'untrusted';
  if (codes.some((c) => NO_ANSWER.test(c)) || o.name === 'TimeoutError' || o.name === 'AbortError') return 'unanswered';
  return 'signed-out';
}

/** A request of the key's own records that threw: a refused certificate, else no answer. */
const notSent = (thrown: unknown): 'untrusted' | 'unanswered' => (signInFailure(thrown) === 'untrusted' ? 'untrusted' : 'unanswered');

/**
 * A renewal that renewed nothing: may it work on a later try? From what it threw, else the CLI's recorded reason. A
 * refused certificate is such a case too: nothing was sent, so the sign-in was not refused.
 */
const renewalUnanswered = (http: CliHttp, thrown: unknown): boolean => {
  if (thrown === undefined) return http.getRefreshFailure() === 'unanswered';
  const failure = signInFailure(thrown);
  return failure === 'unanswered' || failure === 'untrusted';
};

const RE24 = /^[0-9a-f]{24}$/;
/** Renew this long before the access token's own expiry, so a call does not leave with a token about to lapse. */
export const RENEW_EARLY_MS = 30_000;

interface Claims { readonly uid: string; readonly sid: string; readonly exp: number | null }

/** An account JWT's who and when, or null when the token is not one (an access key, or unreadable). */
export function jwtClaims(token: string): Claims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>;
    const uid = typeof c.id === 'string' ? c.id : typeof c.sub === 'string' ? c.sub : '';
    const sid = typeof c.sid === 'string' && c.sid ? c.sid : uid;
    if (!uid) return null;
    return { uid, sid, exp: typeof c.exp === 'number' ? c.exp * 1000 : null };
  } catch {
    return null;
  }
}

/** The CLI's transport as the Hub's wire: one request, never following a redirect. */
export function cliWire(http: CliHttp): (req: WireRequest) => Promise<Response> {
  const send = http.getFetch();
  return (req) => send(req.url, { method: req.method, headers: req.headers, body: req.body as BodyInit | null, signal: req.signal, redirect: 'manual' });
}

/**
 * Opens the CLI's signed-in session as a HoodyClient. Sends at most: one renewal (an expired saved access token) and,
 * for an access key, its own introspection (GET /auth/tokens/me, base host) to learn its realms, then its owner
 * (GET /users/auth/me with the key, on the host of its first realm, else the base host): core's token boot requires
 * the session's uid to be the record's owner (core/token.ts bootToken), never the key's own id.
 */
export async function openCliHub(http: CliHttp, places: CliHubPlaces, o: { now?: () => number } = {}): Promise<CliHubOpen> {
  const now = o.now ?? Date.now;
  let token: string | undefined;
  try { token = await http.getAuthToken(); } catch (e) { return { ok: false, why: signInFailure(e) }; }
  if (!token) return { ok: false, why: 'signed-out' };
  const wire = cliWire(http);

  const first = jwtClaims(token);
  if (first) {
    // An account session: its access token is renewed before it lapses.
    let claims = first;
    if (claims.exp !== null && claims.exp - RENEW_EARLY_MS <= now()) {
      let thrown: unknown;
      const renewed = await http.forceRefreshToken().catch((e: unknown) => { thrown = e ?? new Error('renewal failed'); return undefined; });
      const c = renewed ? jwtClaims(renewed) : null;
      if (!renewed) {
        // Nothing renewed: try again later when the platform did not answer; a second factor it cannot give; else ended.
        const failure = thrown !== undefined ? signInFailure(thrown) : undefined;
        if (failure === 'needs-2fa' || failure === 'untrusted') return { ok: false, why: failure };
        return { ok: false, why: renewalUnanswered(http, thrown) ? 'unanswered' : 'expired' };
      }
      if (!c || c.uid !== first.uid) return { ok: false, why: 'expired' };
      token = renewed;
      claims = c;
    }
    return { ok: true, kind: 'account', client: renewingClient(http, wire, places, { kind: 'account', uid: claims.uid, sid: claims.sid, source: 'login' }, token, claims.exp, now) };
  }

  // An access key: what it is comes from its own introspection (its realm pins the mount, core's rule).
  let me: unknown;
  let res: Response;
  try {
    res = await wire({ method: 'GET', url: places.apiOrigin + '/api/v1/auth/tokens/me', headers: { accept: 'application/json', authorization: `Bearer ${token}` }, body: null, signal: AbortSignal.timeout(20_000), redirect: 'manual' });
  } catch (e) {
    return { ok: false, why: notSent(e) };
  }
  if (res.status !== 200) return { ok: false, why: notOpened(res.status) };
  try { me = await res.json(); } catch { return { ok: false, why: 'unreadable' }; }
  const t = (me as { data?: { token?: { id?: unknown; realm_ids?: unknown; allow_no_realm?: unknown } } } | null)?.data?.token;
  const id = typeof t?.id === 'string' && RE24.test(t.id) ? t.id : null;
  if (!id) return { ok: false, why: 'unreadable' };
  const realms = Array.isArray(t!.realm_ids) ? [...new Set((t!.realm_ids as unknown[]).filter((r): r is string => typeof r === 'string' && RE24.test(r)))] : [];
  const realm = realms.length === 1 ? realms[0] : undefined;

  // The key's owner, asked with the key where it is allowed to ask (a realm-limited key is refused on the base host).
  let owner: string | null;
  const host = realms.length ? `https://${realms[0]}.${places.realmApiDomain}` : places.apiOrigin;
  try {
    res = await wire({ method: 'GET', url: host + '/api/v1/users/auth/me', headers: { accept: 'application/json', authorization: `Bearer ${token}` }, body: null, signal: AbortSignal.timeout(20_000), redirect: 'manual' });
  } catch (e) {
    return { ok: false, why: notSent(e) };
  }
  if (res.status !== 200) return { ok: false, why: notOpened(res.status) };
  try {
    const d = ((await res.json()) as { data?: { id?: unknown } } | null)?.data;
    owner = typeof d?.id === 'string' && RE24.test(d.id) ? d.id : null;
  } catch {
    return { ok: false, why: 'unreadable' };
  }
  if (!owner) return { ok: false, why: 'unreadable' };
  return {
    ok: true, kind: 'token', ...(realm ? { realm } : {}), realms, allowNoRealm: t!.allow_no_realm === true,
    client: renewingClient(http, wire, places, { kind: 'token', uid: owner, sid: id, source: 'key', ...(realm ? { realm } : {}) }, token, null, now),
  };
}

/** The session's client with the start realm bound into a token identity (core pins a token session to it). */
function boundTo(client: HoodyClient, realm: string): HoodyClient {
  return client.identity.realm === realm ? client : { ...client, identity: { ...client.identity, realm } };
}

function renewingClient(http: CliHttp, wire: (req: WireRequest) => Promise<Response>, places: CliHubPlaces, identity: HoodyClient['identity'], start: string, startExp: number | null, now: () => number): HoodyClient {
  let token = start;
  let exp = startExp;
  let ended = false;
  const listeners = new Set<(e: { sid: string; reason: 'expired' | 'signed-out' | 'revoked' }) => void>();
  const end = (reason: 'expired' | 'revoked'): void => {
    if (ended) return;
    ended = true;
    for (const l of [...listeners]) { try { l({ sid: identity.sid, reason }); } catch { /* the mount's own */ } }
  };
  // One renewal at a time; the CLI's client also single-flights and limits itself to one a minute. A renewal the
  // platform did not answer (or that another hoody process held) refuses only the call that needed it: the session
  // stays, and the next call that needs a token tries again (at most one renewal per call, never a loop here).
  let renewing: Promise<boolean> | null = null;
  // The CLI keeping a reissued pair (adoptSession below): a renewal waits for it, so it never spends the refresh
  // token that pair replaced.
  let keeping: Promise<unknown> | null = null;
  // How many pairs were adopted. A renewal asked before an adoption spent the refresh token that pair replaced: its
  // answer, a renewed token of the session as it was or a refusal, says nothing about the adopted pair and is dropped.
  let adoptions = 0;
  const renew = (): Promise<boolean> => {
    if (identity.kind !== 'account') return Promise.resolve(false);
    renewing ??= (async () => {
      if (keeping) await keeping;
      const asked = adoptions;
      let thrown: unknown;
      const t = await http.forceRefreshToken().catch((e: unknown) => { thrown = e ?? new Error('renewal failed'); return undefined; });
      // A pair was adopted while this renewal was out: the adopted token stays the bearer, the session goes on.
      if (adoptions !== asked) return !ended;
      if (!t && renewalUnanswered(http, thrown)) return false;
      const c = t ? jwtClaims(t) : null;
      if (!t || !c || c.uid !== identity.uid) { end('expired'); return false; }
      token = t;
      exp = c.exp;
      return true;
    })().finally(() => { renewing = null; });
    return renewing;
  };
  const inner = cliHoodyClient({
    identity, apiOrigin: places.apiOrigin, realmApiDomain: places.realmApiDomain,
    ...(places.proxyDomain !== undefined ? { proxyDomain: places.proxyDomain } : {}),
    currentSid: () => (ended ? null : identity.sid),
    bearer: () => (ended ? null : token),
    wire,
  });
  // Does the API refuse this bearer right now? One read of the account's own record on the base host, the client's
  // own question about its credential (as a renewal is): true only for an answered 401.
  const refusedNow = async (bearer: string, signal: AbortSignal): Promise<boolean> => {
    try {
      const res = await wire({ method: 'GET', url: places.apiOrigin + '/api/v1/users/auth/me', headers: { accept: 'application/json', authorization: `Bearer ${bearer}` }, body: null, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), redirect: 'manual' });
      try { await res.body?.cancel(); } catch { /* nothing to drain */ }
      return res.status === 401;
    } catch {
      return false;
    }
  };
  return {
    identity,
    apiOrigin: places.apiOrigin,
    realmApiDomain: places.realmApiDomain,
    ...(places.proxyDomain !== undefined ? { proxyDomain: places.proxyDomain } : {}),
    onAuthEnded(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    // Turning 2FA on or off ends every session of the account; the API answers this one a new pair. Taken only as
    // this session's own (both tokens name this account and this session), used at once for every later call, and
    // handed to the CLI to keep. A CLI that cannot keep it leaves the mount working until this access token runs
    // out; the renewal then fails and the mount ends 'expired'. The pair is never logged or stored here.
    adoptSession(pair) {
      if (ended || identity.kind !== 'account' || !pair || typeof pair !== 'object') return false;
      const t = pair.token;
      const r = pair.refreshToken;
      if (typeof t !== 'string' || typeof r !== 'string') return false;
      const c = jwtClaims(t);
      const rc = jwtClaims(r);
      if (!c || !rc || c.uid !== identity.uid || rc.uid !== identity.uid || c.sid !== identity.sid || rc.sid !== identity.sid) return false;
      if (pair.session_id !== undefined && pair.session_id !== identity.sid) return false;
      token = t;
      exp = c.exp;
      adoptions++;
      if (http.adoptReissuedSession) {
        const kept = Promise.resolve().then(() => http.adoptReissuedSession!({ token: t, refreshToken: r })).catch(() => false);
        keeping = kept;
        void kept.finally(() => { if (keeping === kept) keeping = null; });
      }
      return true;
    },
    async request(method, path, body, o) {
      if (!ended && exp !== null && exp - RENEW_EARLY_MS <= now()) await renew();
      const sentWith = token;
      try {
        return await inner.request(method, path, body, o);
      } catch (e) {
        // Only a 401 about the credential is renewed and asked again (session-401.ts): a 401 naming a code of the
        // route's own (a wrong 2FA code) refuses what was typed and stands as it came, sent once.
        if (!sessionRefusal(e) || ended || o.signal.aborted) throw e;
        // A request carrying a password or a code: the API answers a wrong password like a dead token, and a second
        // send would spend another try of the route's budget. One read says which it was: the session still works
        // (the 401 stands, nothing renewed, nothing sent again) or it does not (the call was refused before the
        // route saw it, so it goes on as any other 401). A read that got no answer decides nothing: the 401 stands.
        let judged = sentWith;
        if (carriesTyped(body)) {
          judged = token;
          if (!(await refusedNow(judged, o.signal)) || ended || o.signal.aborted) throw e;
        }
        // A 401 is the API refusing the credential: nothing of the call was applied. Renewed, it is asked once more
        // (through beforeWire again); a failed renewal ends the session and the 401 stands.
        // A 401 for a token another call has renewed since: send again with the current one, no second renewal
        // (the CLI refuses a second renewal within a minute, which would end a session that is still good).
        if (token === judged && !(await renew())) throw e;
        return inner.request(method, path, body, o);
      }
    },
    fetch: (url, init, o) => inner.fetch(url, init, o),
  };
}

/** Where realms and computers live (GET /api/v1/hub/config, public, as the web Hub learns it), on the CLI's transport
 *  with no credential; null with no usable answer. */
export async function readHubPlaces(http: Pick<CliHttp, 'getFetch'>, apiOrigin: string): Promise<CliHubPlaces | null> {
  try {
    const res = await http.getFetch()(apiOrigin + '/api/v1/hub/config', { redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (res.status !== 200) return null;
    const d = ((await res.json()) as { data?: { realm_api_domain?: unknown; proxy_domain?: unknown } } | null)?.data ?? {};
    if (typeof d.realm_api_domain !== 'string' || d.realm_api_domain === '') return null;
    return { apiOrigin, realmApiDomain: d.realm_api_domain, ...(typeof d.proxy_domain === 'string' && d.proxy_domain !== '' ? { proxyDomain: d.proxy_domain } : {}) };
  } catch { return null; }
}

/** What the CLI hands in for the start realm: what was typed and its own realm-name rules. */
export interface CliStartRealmInput {
  readonly flag?: string | undefined;
  readonly env: StartRealmInput['env'];
  readonly profile?: string | undefined;
  /** The realm the last run ended in (the launcher's resume record), used only while GET /realms still lists it. */
  readonly saved?: string | undefined;
  /** The CLI's `idsForAlias(map, alias, { fold })`, rules bound. */
  readonly idsForAlias: (map: Readonly<Record<string, string>>, alias: string) => readonly string[];
  /** The CLI's `parseRealmAliases` (lib/realm-aliases.ts): the vault value as an id → name map. */
  readonly parseAliases: (value: unknown) => Record<string, string>;
}

/** A start realm, with the client to mount: for an access key, bound to that realm. */
export type CliStart = Extract<StartRealm, { ok: false }> | (Extract<StartRealm, { ok: true }> & { readonly client: HoodyClient });

/**
 * The start realm of an opened session (start-realm.ts), its reads sent on the base host with the session's client.
 * An access key limited to several realms starts only in one of them (the last run's while listed, else its first):
 * another realm, or All realms, is refused before the mount, and the chosen one is bound into the token identity
 * (core checks a token session against its pinned realm, and `all` against a key with no realms).
 */
export async function cliStartRealm(opened: Extract<CliHubOpen, { ok: true }>, i: CliStartRealmInput): Promise<CliStart> {
  const client = opened.client;
  const keyRealms = opened.kind === 'token' && !opened.realm ? opened.realms ?? [] : [];
  const pre = () => ({ session: { sid: client.identity.sid, generation: 0 }, signal: AbortSignal.timeout(20_000), beforeWire: () => true });
  const input: StartRealmInput = {
    ...(i.flag !== undefined ? { flag: i.flag } : {}),
    env: i.env,
    ...(i.profile !== undefined ? { profile: i.profile } : {}),
    ...(opened.kind === 'token' ? { keyRealm: opened.realm ?? null } : {}),
    ...(i.saved ? { saved: i.saved } : {}),
    names: async () => {
      try {
        const v = (await client.request('GET', '/vault/keys/hoody.realm-aliases', null, pre())) as { data?: { value?: unknown } } | null;
        return { ok: true as const, map: i.parseAliases(v?.data?.value) };
      } catch (e) {
        const status = (e as { status?: unknown } | null)?.status;
        if (status === 404) return { ok: true as const, map: {} };
        return { ok: false as const, line: status === 403 ? 'This token cannot read realm aliases; pass the realm id (--realm <24-hex id>).' : 'error: could not read the realm names; pass the realm id (--realm <24-hex id>).' };
      }
    },
    idsForAlias: i.idsForAlias,
    // A key limited to several realms may not list realms on the base host: its own list is what it can start in.
    realms: keyRealms.length ? async () => keyRealms.map((id) => ({ id })) : async () => {
      const r = (await client.request('GET', '/realms?include_usage=true', null, pre())) as { data?: { realm_ids?: unknown; usage?: unknown } } | null;
      const usage = (r?.data?.usage && typeof r.data.usage === 'object' ? r.data.usage : {}) as Record<string, { computers?: unknown } | undefined>;
      const ids = r?.data?.realm_ids;
      return (Array.isArray(ids) ? ids : []).filter((x): x is string => typeof x === 'string').map((id) => ({ id, computers: usage[id]?.computers }));
    },
  };
  let start = await resolveStartRealm(input);
  if (!start.ok) return start;
  if (opened.kind !== 'token') return { ...start, client };
  if (keyRealms.length) {
    // Nothing asked and no listed last realm (a last run in All realms included): the key's first realm, as the key's.
    if (start.realm === 'all' && (start.source === 'first-run' || start.source === 'saved')) start = await resolveStartRealm({ ...input, keyRealm: keyRealms[0]! });
    if (!start.ok) return start;
    if (!keyRealms.includes(start.realm)) {
      return { ok: false, exit: 2, lines: [`error: this access key is limited to realms ${keyRealms.join(', ')}; pass one of them (--realm <id>).`] };
    }
  }
  // All realms needs a key on no realm that may work outside one (core's check would end the mount 'realm').
  if (start.realm === 'all' && !(opened.realms?.length === 0 && opened.allowNoRealm === true)) {
    return { ok: false, exit: 2, lines: ['error: this access key cannot use All realms; pass a realm (--realm <id>).'] };
  }
  return { ...start, client: start.realm === 'all' ? client : boundTo(client, start.realm) };
}
