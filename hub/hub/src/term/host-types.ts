// host-types.ts: the SEAM surface of mountTerminalHub (names SEAM's). No SDK import: the CLI
// hands in an object of this shape. HoodyClient is the v0 shape of what the Hub needs from the CLI's client (the
// signed-in identity, one API call, one kit/agent fetch); the CLI owns the credentials, which never reach the Hub.

import type { LiveStoreHandoff } from './app/live-wiring';

export const SEAM_VERSION = 1 as const;

/** The CLI's signed-in client, as the Hub uses it. */
export interface HoodyClient {
  /** Who is signed in. `sid` names the session (the CLI's own id for it); a token session carries its pinned realm. */
  readonly identity: {
    readonly kind: 'account' | 'token'; readonly uid: string; readonly sid: string; readonly realm?: string;
    /** What this session is, for the account menu: the CLI's stored login, an access key, or a key minted for this
     *  Hub (`--new-token`). A label only: never a credential byte, a prefix or a file path. */
    readonly source?: 'login' | 'key' | 'new-key';
  };
  /** The base API origin the client is signed in to (scheme + host + optional port, no path). A live mount checks
   *  it once at boot (app/live-seam.ts apiOriginOf) and refuses to boot without a valid one (TERM_API_ORIGIN). */
  readonly apiOrigin?: string;
  /** The domain computers are served under, from GET /api/v1/hub/config (`proxy_domain`): a bare host name. Checked
   *  at boot like realmApiDomain (TERM_PROXY_DOMAIN). The host reads it before the mount (app/hub-config.ts). The
   *  live boot builds every computer address from it; absent: no computer address is built. */
  readonly proxyDomain?: string;
  /** The realm API domain the client talks to (core builds realm hosts from it). */
  readonly realmApiDomain: string;
  /** One Hoody API call (path under /api/v1, query included). Resolves with the answer's JSON; rejects with
   *  `{status, code?, data?, retryAfter?, traceId?}` for an answered refusal, `{status: 0, notSent: true}` when nothing
   *  was sent. `base` is the realm host core addressed (absent: the client's own). `ifMatch` is sent as If-Match on
   *  the call and every retry, `ifNoneMatch` as If-None-Match: * the same way; `onEtag` gets a success answer's ETag. */
  request(method: string, path: string, body: unknown, o: ClientCallControls & { base?: string; ifMatch?: string; ifNoneMatch?: '*'; onEtag?: (etag: string | null) => void; timeoutMs?: number }): Promise<unknown>;
  /** Optional: tells the Hub that the client's credential for session `sid` ended (refresh failed, signed out by
   *  another command, revoked). The Hub purges that session's state and ends the mount ('expired' / 'signed-out').
   *  Returns the unsubscribe. */
  onAuthEnded?(cb: (e: { sid: string; reason: 'expired' | 'signed-out' | 'revoked' }) => void): () => void;
  /** Optional: takes the pair the API answered a change of two-factor sign-in with (turning it on or off ends every
   *  session of the account and answers the one that made the change a new pair). The client takes it only when it
   *  is this session's own (same account, same session), signs its calls with it from then on and keeps it wherever
   *  it keeps its sign-in. True when taken. Handed over once: the Hub keeps no copy. Absent, or false: the session
   *  ends at its next call ('expired'). */
  adoptSession?(pair: { readonly token?: unknown; readonly refreshToken?: unknown; readonly session_id?: unknown }): boolean;
  /** A kit or agent call to an absolute https URL the Hub built for one computer. The client
   *  sends exactly the headers and body it is handed to exactly that URL and adds NOTHING of its own: no account
   *  credential, no profile header, no cookie (`init.credentials` 'include' is sent as 'omit': there is no cookie jar).
   *  It never follows a redirect, never retries, and never runs its 401 recovery here: a computer's 401/403 is that
   *  computer's answer. It refuses unsent (`{status: 0, notSent: true, code: 'TERM_DESTINATION'}`) a host that is not
   *  under `proxyDomain` (or its family twin, core/hosts.ts) and every API place; a header it will not send is a
   *  refusal (`{status: 0, notSent: true}`), never a silent strip. Same controls as request. */
  fetch(url: string, init: RequestInit, o?: ClientCallControls): Promise<Response>;
}

/**
 * What the Hub hands every call so the client cannot send for a context that ended. A
 * conforming client:
 * - calls `beforeWire()` IMMEDIATELY before every wire attempt (the first send, each permitted retry, the resend after
 *   a token refresh) and sends nothing when it answers false, rejecting `{status: 0, notSent: true, stale: true}`;
 *   `beforeWire` is also the Hub's send notification, so a refresh that failed before the request went out was never
 *   "sent";
 * - stops at once when `signal` aborts (the mount ended, the caller's context died): no refresh, no retry, no send;
 * - refuses (`{status: 401, superseded: true, notSent: true}`) when its own signed-in session is no longer `session.sid`
 *   (a login, logout or profile switch since the call began): it never sends as another identity, never falls back to
 *   a password login, never replaces the identity during a mount;
 * - never retries a mutation after an ambiguous outcome (sent, no answer), and keeps host, body, If-Match and the
 *   operation's identity across a permitted retry.
 */
export interface ClientCallControls {
  readonly session: { readonly sid: string; readonly generation: number };
  readonly signal: AbortSignal;
  /** `attempt`: what the client is about to put on the wire, THIS attempt (the first send and every retry). A mount
   *  that binds sends to their admission (app/live-seam.ts boundBeforeWire) answers false to a call without it or
   *  with one that differs from what was admitted: a client that passes none sends nothing there. */
  beforeWire(attempt?: WireAttempt): boolean;
}

/** One wire attempt as the client built it. Digests are lower-case hex sha256; no value itself crosses the seam. */
export interface WireAttempt {
  readonly method: string;
  /** The absolute URL, query included. */
  readonly url: string;
  /** sha256 of the exact body bytes, or null when there is no body. */
  readonly bodyDigest: string | null;
  /** Kit and agent attempts: every header that will be sent, final: [lower-case name, sha256 of its value]. */
  readonly headers?: ReadonlyArray<readonly [name: string, valueDigest: string]>;
  /** Kit and agent attempts: true when a cookie would be attached. */
  readonly cookie?: boolean;
}

export interface HubRoute { page: string; path: string; search?: Record<string, string> }

export interface TermInputSource {
  /** Delivers the terminal's input bytes; returns the unsubscribe. */
  onData(cb: (chunk: string) => void): () => void;
}

export interface HubTermContext {
  profile: string;
  realmId: string;
  realmAlias?: string;
  projectId?: string;
  containerId?: string;
  pinnedBy?: 'flag' | 'env' | 'profile';
}

export interface HubTermOptions {
  client: HoodyClient;
  context: HubTermContext;
  /** The account's local store, opened by the host (scripts/term/build/hub-store-open.ts
   *  openAccountStore: its `area` and `openedAt`, plus `notice` from storeNoticeToast); the host closes it after the
   *  mount resolves. The Hub never opens a file or reads a path from the environment. Absent, or `area` null: nothing
   *  is kept and every change is refused unsent. The demo mount refuses one. */
  store?: LiveStoreHandoff;
  /** The host client's per-request deadline in ms (the boot-token cleanup's clock); absent: 60 s. */
  requestDeadlineMs?: number;
  route?: HubRoute;
  io: {
    cells: { write(s: string): void };
    input: TermInputSource;
    size(): { cols: number; rows: number };
    onResize?(cb: () => void): () => void;
    colourTier: 'truecolor' | 'ansi16' | 'mono';
    /** Puts text on the clipboard (OSC 52 or the OS's); called only on an explicit user action, text already bounded. */
    copy?(text: string): void;
    /** Opens a checked http(s) address in the user's browser; absent = the Hub shows the address instead. */
    openExternal?(url: string): void;
    /** Called after every paint with its count (the frame-ack a test or pty driver waits on); never needed to run. */
    onFrame?(n: number): void;
  };
  /** The only write-back: the CLI stores this realm (and computer) as the profile's default. */
  onSetDefault(realmId: string, containerId?: string): Promise<void>;
  runCommand?(argv: string[]): Promise<{ code: number }>;
  /** Abort = a forced close: nothing is asked. */
  signal?: AbortSignal;
  /** The web Hub's origin (exactly `https://host`), for share links that open on the web; absent = none are offered. */
  webOrigin?: string;
}

/** A placeholder for the seam's outcome kinds: no Hub type names them yet, and no actions are recorded yet (when they
 *  are, this takes the Hub's outcome vocabulary). */
export type ReceiptOutcome = 'done' | 'refused' | 'failed' | 'unknown';

export interface Receipt {
  /** False when the mount failed (a crash, a failed boot, a strict-global trap, a failed teardown step). */
  ok: boolean;
  /** What the host process should exit with: 0 when ok, else the end's own code (128 + signal) or 1. */
  exitCode: number;
  /** Why the mount ended, safe to print: quit, closed (abort/signal), expired (the account session ended: sign in
   *  again), signed-out (signed out in the Hub), suspended (the account is suspended), crashed, boot-failed. */
  reason: 'quit' | 'closed' | 'expired' | 'signed-out' | 'suspended' | 'crashed' | 'boot-failed';
  /** What went wrong, as allowlisted records: a kind, a fixed code, a standard class name, component names, a page id;
   *  never a message, error object, body or configuration. Traps first, then crash, boot, teardown, console. */
  problems: Array<{ kind: 'page' | 'crash' | 'trap' | 'boot' | 'dispose' | 'console'; code: string; name: string; where?: string[]; page?: string; what?: string }>;
  lastView: { page: string; screen: string; tab?: string; params: Record<string, string> };
  actions: Array<{
    label: string;
    /** The equivalent CLI command; '' for an action with none. */
    command: string;
    http: { method: string; path: string };
    outcome: ReceiptOutcome;
    via: 'command' | 'http';
    realmId: string;
    containerId?: string;
    at: string;
  }>;
}
