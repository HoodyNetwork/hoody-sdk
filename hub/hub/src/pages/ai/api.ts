// What the page's flows need from a computer, as one interface. Every call settles ({ok, body} or
// {ok:false, err}) and never rejects, so a flow reads each answer once and decides. data.ts builds the
// real one (over core) and the fixture one; tests build fakes. The flows in flows-*.ts are plain async
// functions over this interface and an Env (timers, hashing, visibility), which is what makes the
// C9 rules (read back a lost answer, never resend blindly) testable without a browser.
import { providers, type CallInput } from '@core';
import type { Settled } from './types';

// The provider part (Env, Stop, the provider reads and changes, the outcome tests) lives in @core's
// providers; the page's Api adds its own agent, realm and terminal calls.
export type Stop = providers.Stop;
export type Env = providers.Env;
export const { GONE, isStale, isUnknown, isRefused } = providers;

export interface TermOwned {
  n: number;
  inc: string;
}

export interface Api extends providers.ProvidersApi {
  // ── reads (always fresh) ──
  agents(realm: string): Promise<Settled<unknown>>;
  /** realm: one realm, 'global' or 'all'. */
  bots(realm: string, page?: { page: number; limit: number }): Promise<Settled<unknown>>;
  acp(realm: string): Promise<Settled<unknown>>;
  acpDefault(realm: string): Promise<Settled<unknown>>;
  jev(realm: string | null, guard: { realm: string; realmSettings: boolean }): Promise<Settled<unknown>>;
  jevModels(): Promise<Settled<unknown>>;

  // ── changes (never retried by the api; a flow replays only with the same key and body) ──
  customCreate(body: Record<string, unknown>, idem: string): Promise<Settled<unknown>>;
  customPatch(pid: string, body: Record<string, unknown>): Promise<Settled<unknown>>;
  customDelete(pid: string): Promise<Settled<unknown>>;
  agentModel(realm: string, agent: string, model: string, guard: { defaultAgent: string }): Promise<Settled<unknown>>;
  acpEnabled(realm: string, enabled: boolean): Promise<Settled<unknown>>;
  acpDefaultPut(realm: string, agent: '' | 'claude'): Promise<Settled<unknown>>;
  jevPut(realm: string | null, guard: { realm: string; realmSettings: boolean }, body: { enabled?: boolean; model?: string }): Promise<Settled<unknown>>;

  // ── the computer's terminal program (Claude Code setup) ──
  termCaps(): Promise<Settled<unknown>>;
  termSessions(): Promise<Settled<unknown>>;
  termCreate(n: number, user: string): Promise<Settled<unknown>>;
  termWait(owned: TermOwned): Promise<Settled<unknown>>;
  /** Types `input` without pressing Enter. */
  termWrite(owned: TermOwned, input: string): Promise<Settled<unknown>>;
  termDelete(owned: TermOwned): Promise<Settled<unknown>>;
  /** The terminal calls of one setup press, all sent to `target` (the computer the pressed section draws; without one,
   *  the computer shown at THIS call), whatever is shown when each goes out (the page's other calls go to the computer
   *  shown at the send). An api without it has one computer only. */
  termOn?(target?: TermTarget | null): TermApi;
}

export type TermTarget = NonNullable<CallInput['target']>;
export type TermApi = Pick<Api, 'termCaps' | 'termCreate' | 'termWait' | 'termWrite' | 'termDelete'>;
