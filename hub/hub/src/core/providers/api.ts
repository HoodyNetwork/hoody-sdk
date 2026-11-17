// What the provider flows need from a computer, as one interface.
// Every call settles ({ok, body} or {ok:false, err}) and never rejects, so a flow reads each answer once and
// decides. call.ts builds the real one over core; tests build fakes. The flows in flows-*.ts are plain async
// functions over this interface and an Env (timers, hashing, visibility), which is what makes the C9 rules
// (read back a lost answer, never resend blindly) testable without a browser.
import type { Catalogue, Outcome, Settled } from './types';

/** Stop switch for a long wait (a poll): `wake` lets a sleeper end at once. */
export interface Stop {
  stopped: boolean;
  wake?: () => void;
}

export interface Env {
  sleep(ms: number): Promise<void>;
  now(): number;
  /** The page is hidden (a tab in the background). */
  hidden(): boolean;
  /** Resolves when the page shows again, or the stop is raised. */
  visible(stop: Stop): Promise<void>;
  /** A fresh Idempotency-Key, one per click, reused for replays of the same body. */
  newKey(): string;
  /** The key's fingerprint as the agent reports it (hex of the first 8 bytes of SHA-256); null without Web Crypto. */
  digest(secret: string): Promise<string | null>;
  /** The page's context (account, computer, realm) is still the one the flow began on. */
  alive(): boolean;
}

export interface ProvidersApi {
  // ── reads (always fresh) ──
  version(): Promise<Settled<unknown>>;
  providers(): Promise<Settled<unknown>>;
  provider(pid: string): Promise<Settled<unknown>>;
  auth(pid: string): Promise<Settled<unknown>>;
  /** GET /models (`ready`: only the models the agent reports ready). Optional so hand-made Apis stay valid; providersApi() has it. */
  models?(query?: { ready?: boolean }): Promise<Settled<unknown>>;
  /** Providers, models, the ready set and (older agents) the credential probes, as the projections read them. */
  catalogue(wanted?: readonly string[]): Promise<Settled<Catalogue>>;
  oauthPoll(job: string): Promise<Settled<unknown>>;
  /** A provider's own sign-in job (OpenRouter). */
  pkcePoll(pid: string, job: string): Promise<Settled<unknown>>;

  // ── changes (never retried by the api; a flow replays only with the same key and body) ──
  /** The key goes in `body.api_key`; the implementation clears it after the send. */
  keyPut(pid: string, body: { api_key: string; check: true; if_definition_rev?: string }): Promise<Settled<unknown>>;
  keyDelete(pid: string): Promise<Settled<unknown>>;
  authTest(pid: string): Promise<Settled<unknown>>;
  authDefault(which: 'api_key' | 'oauth'): Promise<Settled<unknown>>;
  oauthStart(another: boolean, idem: string): Promise<Settled<unknown>>;
  oauthCancel(job: string): Promise<Settled<unknown>>;
  signOut(): Promise<Settled<unknown>>;
  /** Starts a provider's own sign-in (no body field); one Idempotency-Key per click. */
  pkceStart(pid: string, idem: string): Promise<Settled<unknown>>;
  /** The pasted code goes in `body.code`; the implementation clears it after the send. */
  pkceCode(pid: string, job: string, body: { code: string }): Promise<Settled<unknown>>;
  pkceCancel(pid: string, job: string): Promise<Settled<unknown>>;
}

export const GONE: Outcome = { kind: 'stale', code: '', status: 0, retryAfter: null, details: {} };

/** A stale answer: the context ended while the call ran; flows end quietly. */
export function isStale<T>(r: Settled<T>): boolean {
  return !r.ok && r.err.kind === 'stale';
}

/** An outcome the flow may not treat as definite: the send may have gone through. */
export function isUnknown<T>(r: Settled<T>): boolean {
  return !r.ok && r.err.kind === 'pending';
}

/** A definite refusal, or a request that never left. */
export function isRefused<T>(r: Settled<T>): boolean {
  return !r.ok && (r.err.kind === 'failed' || r.err.kind === 'not_sent');
}
