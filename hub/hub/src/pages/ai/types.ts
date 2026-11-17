// Types of the AI models page. Raw answers (what the computer's agent returns) stay loose on
// purpose: logic.ts reads them defensively, and never trusts a shape.
import type { providers } from '@core';

// The provider and model shapes live in @core's providers, shared with the Bots page and the kit.
export type Obj = providers.Obj;
export type Via = providers.Via;
export type ProviderStatus = providers.ProviderStatus;
export type RawProvider = providers.RawProvider;
export type RawModel = providers.RawModel;
export type AuthBody = providers.AuthBody;
export type VersionBody = providers.VersionBody;
export type Ready = providers.Ready;
export type Pay = providers.Pay;
export type CatProvider = providers.CatProvider;
export type Catalogue = providers.Catalogue;
export type ProviderState = providers.ProviderState;
export type Model = providers.Model;
export type Settled<T> = providers.Settled<T>;
export type Outcome = providers.Outcome;

/** The sentence a user reads: a key in strings.en.json plus its variables. */
export interface Words {
  key: string;
  text: string;
}

// ── Raw agent answers ─────────────────────────────────────────────────────────────────────

export interface RawAgent {
  name: string;
  model?: string;
  is_configured_default?: boolean;
}

/** A list envelope: kit routes answer {items}, daemon-shaped bodies {<key>}. */
export type Envelope<T> = { items?: T[] } & Record<string, unknown>;

// ── Projections ───────────────────────────────────────────────────────────────────────────

export interface Defaults {
  helper: { agent: string; model: string; effective: string };
  bots: { model: string; effective: string };
  others: Array<{ agent: string; model: string }>;
  helperBackend?: 'hoody' | 'claude_code' | 'unknown';
}

export type ClaudeState =
  | 'unknown'
  | 'unavailable'
  | 'agent_update'
  | 'check_failed'
  | 'not_installed'
  | 'outdated'
  | 'signed_out'
  | 'sign_in_unknown'
  | 'signed_in';

export interface ClaudeCode {
  state: ClaudeState;
  enabled: boolean;
  /** Selected for new Hub conversations; null when that could not be read. */
  selected: boolean | null;
  startable: boolean;
  inUse: boolean;
  loginVerified: boolean;
  setupUser: string | null;
  installHint: string | null;
  loginHint: string | null;
}

export type Usable = 'yes' | 'no' | 'unknown';

export interface Checker {
  enabled: boolean | null;
  model: string | null;
  label: string | null;
  usable: Usable;
  reason: string;
  state: 'configured' | 'disabled' | 'unconfigured' | 'unknown';
}

