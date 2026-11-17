// The settings session's pure part: scope keys, the create body, the failure words and the session types (split out of
// Session.ts so the terminal build shares them; the design is at the top of Session.ts). Session.ts re-exports every
// public name here and keeps liveApi (the gated create: create-gate.conformance pins gatedCreate( in Session.ts),
// createSettingsSessions (pagehide listener) and the shared instance. refOf, Live and HoldRec are for Session.ts.
import type { Target } from '@core';
import type { LeaseHandle, LeaseManager, LeaseRef } from '@kit';

/** Where a settings session lives: the computer, one realm, and the folder (none: the realm's profile only). */
export interface SettingsAt { target: Target; realm: string; cwd?: string }

export const SETTINGS_AGENT = 'chat';
export const scopeKeyOf = (a: SettingsAt): string => `${a.target.project.id}\u0000${a.target.container.id}\u0000${a.realm}\u0000${a.cwd ?? ''}`;
export const refOf = (a: SettingsAt, sid: string): LeaseRef => ({ computer: a.target.container.id, realm: a.realm, sid, target: a.target });

export interface CreateBody {
  agent: typeof SETTINGS_AGENT; realm: string; computer: string; cwd?: string;
  tool_mode: 'standard'; dir_scope: 'home'; approval: { mode: 'default' };
  expected_binding: { realm: string; computer: string };
}
export function createBody(a: SettingsAt): CreateBody {
  const container = a.target.container.id;
  return {
    agent: SETTINGS_AGENT, realm: a.realm, computer: container, ...(a.cwd !== undefined ? { cwd: a.cwd } : {}),
    tool_mode: 'standard', dir_scope: 'home', approval: { mode: 'default' }, expected_binding: { realm: a.realm, computer: container },
  };
}

/** The requests the session needs; every one may throw a HubError. */
export interface SessionApi {
  status(at: SettingsAt): Promise<unknown>;
  /** GET /version: a create names its computer only to a gateway that binds by it (computer_binding, session protocol 3 or later). */
  version(at: SettingsAt): Promise<unknown>;
  create(at: SettingsAt, body: CreateBody, key: string): Promise<unknown>;
  /** Best effort: the caller ignores a failure. */
  close(at: SettingsAt, sid: string, keepalive: boolean): Promise<void>;
}

export type SessionFailure =
  /** The scope is not one realm (All realms) or the folder is not an absolute path. */
  | 'scope'
  /** The agent is not signed in as this account, or its identity is not known: no session is made. */
  | 'not_ready'
  /** The agent refused the create (nothing was made), or the request never left. */
  | 'refused'
  /** The terminal demo (sample data) refused the create before sending it, as it refuses every change: nothing was made. */
  | 'demo'
  /** The create's answer was lost or unreadable: a draft may exist; it closes itself. A new key is used next time. */
  | 'unknown'
  /** The session the agent made is not the one asked for (another computer, realm or account). It was closed. */
  | 'binding'
  /** The lease that keeps the session open could not be taken. The session was closed. */
  | 'lease'
  /** The hold ended (the person left, or the scope changed) before the answer. */
  | 'superseded'
  /** The session was lost twice in one run. */
  | 'lost';

export class SessionError extends Error {
  constructor(readonly kind: SessionFailure, readonly code: string | null = null, readonly status: number | null = null) { super(`settings session ${kind}`); }
}

/** The agent says the session is not there: gone after a restart or an expiry. */
export function isLostSession(e: unknown): boolean {
  const x = e as { status?: unknown; code?: unknown } | null;
  return !!x && (x.status === 410 || (x.status === 404 && (x.code === 'not_found' || x.code === undefined || x.code === '' || x.code === 'attachment_expired')));
}

export interface SessionState {
  phase: 'idle' | 'opening' | 'open' | 'failed';
  scope: string | null;
  sid: string | null;
  /** Sessions made after the first for this scope (a lost one replaced). */
  replaced: number;
  failure: SessionFailure | null;
  /** The last session was ended by a page hide (and nothing opened since): the page went away, the session did not fail.
   *  A view that was showing it opens it again when the page shows again. */
  hidden: boolean;
}

export interface Hold {
  /** Ends this hold; the last hold of a scope closes its session. Idempotent. */
  release(): void;
  readonly scope: string;
}

export interface SettingsSessions {
  hold(at: SettingsAt): Hold;
  /** Runs `work` on the session. `alive()` says whether this hold and this session are still the ones in force; the answer of a
   *  `work` that ends after they were not is dropped (superseded), and `work` checks it before any step that must not start late.
   *  `has(name)`: whether the agent that made THIS session lists that capability (supported and available) in the GET /version the
   *  create read; a replaced session answers for its own agent. */
  run<T>(hold: Hold, work: (sid: string, alive: () => boolean, has: (name: string) => boolean) => Promise<T>): Promise<T>;
  state(): SessionState;
  subscribe(fn: () => void): () => void;
  /** pagehide: close now with keepalive requests. */
  closeNow(): void;
  /** Tests: forget everything without calling the agent. */
  reset(): void;
}

export interface SessionDeps {
  api?: SessionApi;
  leases?: LeaseManager;
  newKey?: () => string;
  account?: () => string;
}

export interface Live { at: SettingsAt; sid: string; handle: LeaseHandle; ref: LeaseRef; version: unknown }
export interface HoldRec { at: SettingsAt; key: string; gen: number; dead: boolean }
