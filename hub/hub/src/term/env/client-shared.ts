// client-shared.ts: core's shared.js seam (core/session.ts Shared) for the terminal, served by the CLI's client.
// Names and semantics follow shared.js and its fixture twin (core/transport.ts fixtureShared), with three differences:
// - The CLI holds the credentials. The stored session's bearer is an in-memory marker naming this session, never a
//   token; every API call goes through client.request, which authenticates it.
// - A purge runs the purge hooks and clears the registered keys of the session stores, which are memory. It never
//   signs the CLI out: that is the CLI's own command.
// - There is no frame and no other tab: never framed, no supersession. A reissued session (2FA turned on or off) is
//   the client's to take (HoodyClient.adoptSession): the pair goes straight to it and is never kept here.
// - Liveness reaches the wire: every call hands the client ClientCallControls (host-types.ts):
//   the captured session generation, the mount's abort signal, and beforeWire(), which the client runs right before
//   EACH wire attempt (first send, retry, resend after refresh). beforeWire re-checks liveness, then is core's onSend,
//   then re-checks the signal and liveness (onSend may end the session or close the gate); false = the client
//   sends nothing. The client's signal joins the mount's, the call's own (boot.live.ts fence.run: aborted at its deadline
//   or the trip, before core hears of it) and this adapter's.
//   Caller cancellation (core's `input.signal` / `still`) is NOT propagated as an abort: core's apiCall contract carries
//   no signal, only `alive` (core's combined wire liveness: context alive AND signal not aborted AND still()). A cancelled
//   caller is refused at its next wire check (first send or retry: beforeWire runs that `alive`). A request already on
//   the wire runs to its answer (or the call's deadline / the mount's end), and core's success handler checks only
//   alive(ctx), not the caller's signal or still(): while the context is alive, api() RESOLVES that answer to the caller
//   (scrubbed as usual), so caller cancellation alone does NOT suppress a successful Hoody answer that was already sent
//   (pinned by boot.live.term.test 'cancel after send still answers'). Only a dead context makes it stale
//   (a read) or pending (a change). The kit/fetch leg differs: there the caller's signal is init.signal, joined into the
//   client's controls and the fence (boot.live.ts), so the call settles at the abort and a later answer is wiped.
// - NOT DESIGNED: endOutgoingSession (core's sign-out revocation step) is a no-op that revokes nothing; sign-out in the
//   terminal is the CLI's own command. Its type says so.
// - Account expiry after boot: an ANSWERED 401 about the credential on an account session (the client's own refresh
//   already failed; not a 401 that refuses a typed code or password, session-401.ts) purges with reason 'expiry',
//   which runs core's purge followers: core leaves for sign-in and the mount ends 'expired'. So does the client's session-bound auth-ended notice (HoodyClient.onAuthEnded, matched on sid). A token
//   session's 401 is left to core's introspection flow; a 403 ACCOUNT_BANNED is core's suspend path, untouched here.
// - Ends keep their provenance: `ends.purged` hears the reason of every purge (core's own
//   sign-out = 'signout', token or account expiry = 'expiry'), and the auth-ended notice calls `ends.authEnded` with the
//   client's own reason ('signed-out', else 'expired') for EVERY identity kind, after the purge. Core's purge follower
//   skips token sessions, so the mount owner must end the mount from authEnded, not wait for core to navigate.
// - It belongs to one mount session (owner): once that session ends it is signed out for good, sends nothing, and a
//   purge through it runs no hook and touches no store, so a kept Shared can never reach the next mount.
import { registryEntry } from '../../core/registry';
import type { ApiCallOpts, AuthPurgeInfo, HubErrorBase, PageIdentity, Shared, StoredSession } from '../../core/session';
import type { ClientCallControls, HoodyClient, WireAttempt } from '../host-types';
import type { TermSession } from './session';
import { carriesTyped, sessionRefusal } from '../session-401';

/** core's endOutgoingSession here: resolves having revoked NOTHING (not designed; see the header). */
export const endOutgoingSessionNotDesigned = (): Promise<void> => Promise.resolve();

/** How the owner hears that the session ended. */
export interface SharedEnds {
  /** Every purge that ran on the live session, with its reason. */
  purged?(reason: AuthPurgeInfo['reason']): void;
  /** The client said this session's credential ended (any identity kind): the mount must end with this reason. */
  authEnded?(why: 'signed-out' | 'expired'): void;
  /** Asked for every call that did not come through the mount's send policy (no `wire`: a caller that used core's
   *  Shared directly), before anything is sent. A refusal is the call's answer and nothing leaves; null lets it go. */
  unwired?(method: string, path: string): HubErrorBase | null;
}

/** apiCall's options as the terminal transport passes them: core's, plus the call's own ended signal (boot.live.ts,
 *  fence.run), joined into the client's signal. */
export type TermCallOpts = ApiCallOpts & {
  signal?: AbortSignal;
  /** The mount's send policy for this call (app/live-wire.ts): given the client's own wire attempt, right before
   *  it leaves and before core's send note; false = nothing is sent and the call was never "sent". */
  wire?: (attempt?: WireAttempt) => boolean;
};

export function clientShared(client: HoodyClient, owner: TermSession, mountSignal: AbortSignal = new AbortController().signal, ends: SharedEnds = {}): Shared {
  const id = client.identity;
  const marker = 'term-session:' + id.sid;
  let signed = true;
  // Bumped by every purge: a call captured under an older generation never reaches the wire.
  let generation = 0;
  // Signed in only while the owning mount session lives: a Shared kept past its session reports nothing and sends nothing.
  const signedIn = (): boolean => signed && owner.live();
  const hooks: Array<(info?: AuthPurgeInfo) => void> = [];
  const session = (): StoredSession | null => {
    if (!signedIn()) return null;
    return Object.freeze(id.kind === 'token' && id.realm !== undefined
      ? { kind: 'token' as const, uid: id.uid, sid: id.sid, bearer: marker, realm: id.realm }
      : { kind: id.kind, uid: id.uid, sid: id.sid, bearer: marker });
  };
  const held = (p: PageIdentity | null): boolean => !!p && signedIn() && p.kind === id.kind && p.uid === id.uid && p.sid === id.sid;
  const purge = (reason: AuthPurgeInfo['reason']): void => {
    // An ended owner: its core is disposed, and the hooks (core's process-wide purge followers) would act on the next mount.
    if (!owner.live()) { signed = false; return; }
    const info: AuthPurgeInfo = { reason, uid: signedIn() ? id.uid : null };
    try { ends.purged?.(reason); } catch { /* the owner's */ }
    for (const h of hooks) { try { h(info); } catch { /* the hook's own */ } }
    signed = false;
    generation++;
    // Only the owning session's own stores, never whichever session is current.
    const own = owner.stores();
    for (const [area, box] of [['local', own.local], ['session', own.session]] as const) {
      const doomed: string[] = [];
      for (let i = 0; i < box.length; i++) { const k = box.key(i); if (k !== null && registryEntry(area, k)?.purge) doomed.push(k); }
      for (const k of doomed) box.removeItem(k);
    }
  };
  // The client's own notice that its credential for this session ended (refresh failed in the background, a logout in
  // another process): bound to this session's sid, dropped when the mount ends.
  if (client.onAuthEnded) {
    const off = client.onAuthEnded((e) => {
      if (e.sid !== id.sid || !signedIn()) return;
      purge(e.reason === 'signed-out' ? 'signout' : 'expiry');
      try { ends.authEnded?.(e.reason === 'signed-out' ? 'signed-out' : 'expired'); } catch { /* the owner's */ }
    });
    if (mountSignal.aborted) off();
    else mountSignal.addEventListener('abort', () => off(), { once: true });
  }
  return {
    storedSession: session,
    holdsIdentity: held,
    holdsSession: held,
    sessionTokenUid: (t) => (signedIn() && t === marker ? id.uid : null),
    sessionTokenSid: (t) => (signedIn() && t === marker ? id.sid : null),
    readAccessToken: () => (signedIn() ? marker : null),
    apiCall(method, path, body, _bearer, _retried, opts) {
      const refusal = (): HubErrorBase | null => {
        if (!signedIn() || (opts.session && !held(opts.session))) return { status: 401, superseded: true, notSent: true };
        if (opts.alive && !opts.alive()) return { status: 0, notSent: true, stale: true };
        return null;
      };
      const before = refusal();
      if (before) return Promise.reject(before);
      // The mount's policy never saw this call: the mount still has its say (a read-only Hub sends no change).
      if (!(opts as TermCallOpts).wire) {
        const no = ends.unwired?.(method, path);
        if (no) return Promise.reject(no);
      }
      const gen = generation;
      const ac = new AbortController();
      const own = (opts as TermCallOpts).signal;
      const signal = AbortSignal.any(own ? [mountSignal, ac.signal, own] : [mountSignal, ac.signal]);
      let sentOnce = false;
      const controls: ClientCallControls = {
        session: Object.freeze({ sid: id.sid, generation: gen }),
        signal,
        // Run by the client right before each wire attempt: liveness, core's send note (first attempt), liveness again.
        beforeWire: (attempt) => {
          if (signal.aborted || gen !== generation || refusal()) { ac.abort(); return false; }
          const wire = (opts as TermCallOpts).wire;
          if (wire && !wire(attempt)) { ac.abort(); return false; }
          if (!sentOnce) { sentOnce = true; opts.onSend?.(); }
          // onSend may end or purge the session, make the caller stale, or close the mount's gate, so the signal is checked again.
          if (signal.aborted || gen !== generation || refusal()) { ac.abort(); return false; }
          return true;
        },
      };
      return client.request(method, path, body, { ...controls, ...(opts.base !== undefined ? { base: opts.base } : {}), ...(opts.ifMatch !== undefined ? { ifMatch: opts.ifMatch } : {}), ...(opts.ifNoneMatch === '*' ? { ifNoneMatch: '*' as const } : {}), ...(opts.onEtag ? { onEtag: opts.onEtag } : {}), ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}) }).catch((e: unknown) => {
        // Only for the generation that sent it: a late 401 of an older call never ends a newer state.
        // And only a 401 about the credential (session-401.ts): one that refuses a typed code or password is the
        // call's answer, and a call that carried one is judged by the client, never ended on that answer here.
        if (id.kind === 'account' && sessionRefusal(e) && !carriesTyped(body) && gen === generation && signedIn()) purge('expiry');
        throw e;
      });
    },
    isFramedPage: () => false,
    framedSensitiveRoute: () => null,
    framedRefusedError: () => ({ status: 403, code: 'FRAMED_ACTION_REFUSED', framed: true, notSent: true }),
    supersededAuthError: () => ({ status: 401, superseded: true }),
    isSupersededAuthError: (e) => !!e && typeof e === 'object' && (e as HubErrorBase).superseded === true && (e as HubErrorBase).status === 401,
    realmApiDomain: () => client.realmApiDomain,
    clearAuthTokens: (p) => { purge(p?.reason ?? 'cleanup'); },
    purgeOutgoingSession: (s, p) => {
      if (!held(s)) return 'kept';
      purge(p?.reason ?? 'expiry');
      return 'purged';
    },
    endOutgoingSession: endOutgoingSessionNotDesigned,
    onBeforeAuthPurge: (fn) => { hooks.push(fn); },
    authStorageEntry: registryEntry,
    authSessionSuperseded: () => false,
    adoptReissuedSession: (d, owner) => {
      // Only for the live account session this seam serves; the client checks the pair itself.
      if (!signedIn() || id.kind !== 'account' || String(owner) !== id.uid || !client.adoptSession) return false;
      if (!d || typeof d !== 'object') return false;
      try { return client.adoptSession(d as { token?: unknown; refreshToken?: unknown; session_id?: unknown }) === true; } catch { return false; }
    },
  };
}
