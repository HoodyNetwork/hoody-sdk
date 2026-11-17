// Types of the computer's AI providers and models, shared by the AI page, the Bots page and the kit's
// model picker. Raw answers (what the computer's agent returns)
// stay loose on purpose: catalogue.ts reads them defensively and never trusts a shape.
export type Obj = Record<string, unknown>;

// ── Raw agent answers ─────────────────────────────────────────────────────────────────────

export type Via = 'included' | 'stored_key' | 'external_key' | 'signin';

export interface ProviderStatus {
  state?: string;
  via?: string;
  methods?: string[];
  alternatives?: { signin?: boolean; stored_key?: boolean; external_key?: boolean };
  shares_with?: string[];
  output_cap?: boolean;
}

export interface RawProvider {
  id: string;
  prefix?: string;
  display_name?: string;
  custom?: boolean;
  status?: ProviderStatus;
  definition_rev?: string;
  custom_definition?: { base_url?: string; wire_format?: string; auth_scheme?: string; header_names?: string[] };
  models?: Array<{ spec?: string }>;
}

export interface RawModel {
  spec: string;
  display_name?: string;
  source?: string;
  members?: string[];
}

/** GET /providers/:id/auth: the stored-credential probe. */
export interface AuthBody {
  auth?: {
    ready?: boolean;
    default?: string;
    oauth_stored?: boolean;
    api_key_stored?: boolean;
    no_auth_ready?: boolean;
    api_key_fingerprint?: string;
  };
}

export interface VersionBody {
  capabilities?: Array<{ name?: string; supported?: boolean; available?: boolean }>;
}

// ── Projections ───────────────────────────────────────────────────────────────────────────

export type Ready = 'ready' | 'needs_key' | 'unknown';
export type Pay = 'included' | 'own_key' | 'plan' | 'ai_credit' | 'unknown';

export interface CatProvider {
  id: string;
  prefix: string;
  label: string | null;
  custom: boolean;
  status: ProviderStatus | null;
}

export interface Catalogue {
  byPrefix: Record<string, CatProvider>;
  byId: Record<string, CatProvider>;
  models: RawModel[];
  bySpec: Record<string, RawModel>;
  readySpecs: Record<string, 1> | null;
  /** The agent reports provider status itself. */
  am1: boolean;
  auth: Record<string, AuthBody>;
}

export interface ProviderState {
  state: Ready;
  pay: Pay;
  completion: boolean;
}

export interface Model {
  spec: string;
  label: string;
  provider: string;
  providerLabel: string;
  providerId: string;
  source: 'provider' | 'fusion';
  ready: Ready;
  pay: Pay;
  completion: boolean;
  recommended?: boolean;
}

/** A settled call: its answer, or a normalised outcome. Never rejects. */
export type Settled<T> = { ok: true; body: T } | { ok: false; err: Outcome };

/** A normalised outcome (the core's C9 kinds plus the few details a flow may read). */
export interface Outcome {
  kind: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale';
  code: string;
  status: number;
  retryAfter: number | null;
  details: { field?: string; reason?: string; definition?: string; api_key?: string; job_id?: string };
}
