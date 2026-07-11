/**
 * Provider Resolver — shared between `hoody chat` and `ai-fix.ts`.
 *
 * Resolves an OpenAI-compatible chat-completions provider config from env vars,
 * atomically per tier. No cross-tier fallback: if any var in a tier is set, that
 * tier is selected and only that tier's defaults fill missing slots.
 *
 * Tiers, highest precedence first:
 *   Tier 1 — Hoody chat-dedicated (preferred):
 *     HOODY_CHAT_KEY, HOODY_CHAT_URL, HOODY_CHAT_MODEL
 *   Tier 2 — Shared with ai-fix.ts:
 *     HOODY_CLI_AI_KEY, HOODY_CLI_AI_URL, HOODY_CLI_AI_MODEL
 *   Tier 3 — Plain OpenAI-compatible (last resort):
 *     OPENAI_API_KEY, OPENAI_BASE_URL (REQUIRED), OPENAI_MODEL (REQUIRED)
 *
 * Keyless allowed only when URL origin matches localhost/RFC1918.
 *
 * Endpoint acceptance for non-allowlisted origins handled separately in
 * chat/docs-search-tool.ts and (in later phases) chat/endpoint-accept.ts.
 */

export type ProviderTier = 'chat' | 'cli-ai' | 'openai';

export interface ProviderConfig {
  tier: ProviderTier;
  key: string | undefined; // undefined allowed only for localhost/RFC1918 URLs
  url: string;
  model: string;
}

export interface ResolverError {
  error: string;
  message: string;
  hint?: string;
}

export type ProviderResolution = ProviderConfig | ResolverError;

export function isResolverError(r: ProviderResolution): r is ResolverError {
  return (r as ResolverError).error !== undefined;
}

// Defaults follow the OpenAI-compatible BASE URL convention (ending at /v1).
// The openai-client auto-appends /chat/completions if the URL doesn't already
// end with it — so users can set either the base URL or the full endpoint.
const TIER1_DEFAULT_URL = 'https://api.minimax.io/v1';
const TIER1_DEFAULT_MODEL = 'MiniMax-M2.7-highspeed';
const TIER2_DEFAULT_URL = 'https://ai.hoody.com/api/v1';
const TIER2_DEFAULT_MODEL = 'openai/gpt-5.4-nano';

// RFC1918 + loopback — no acceptance prompt needed, keyless allowed.
const LOCAL_ORIGIN_REGEX =
  /^(https?):\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+|192\.168\.[0-9.]+)(:[0-9]+)?$/i;

/**
 * Normalize a URL to a canonical origin (scheme://host[:port]) for comparison.
 * Lowercases host, strips default ports (80 for http, 443 for https),
 * drops trailing slashes and any path component.
 *
 * Throws if the URL is invalid or uses a non-http(s) scheme.
 */
export function normalizeOrigin(raw: string): string {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Only http(s) schemes supported, got ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase();
  const isDefaultPort =
    (u.protocol === 'https:' && (u.port === '' || u.port === '443')) ||
    (u.protocol === 'http:' && (u.port === '' || u.port === '80'));
  const portSuffix = isDefaultPort ? '' : `:${u.port}`;
  return `${u.protocol}//${host}${portSuffix}`;
}

/**
 * True if the origin is a local/RFC1918 URL for which we allow keyless auth
 * and never prompt for acceptance.
 */
export function isLocalOrigin(origin: string): boolean {
  return LOCAL_ORIGIN_REGEX.test(origin);
}

/**
 * Read a tier's three env vars. Returns the partial config if any of them is
 * set (non-empty string), otherwise null so the caller can fall through.
 */
function readTier1(env: Record<string, string | undefined>) {
  const key = env.HOODY_CHAT_KEY || undefined;
  const url = env.HOODY_CHAT_URL || undefined;
  const model = env.HOODY_CHAT_MODEL || undefined;
  if (!key && !url && !model) return null;
  return {
    tier: 'chat' as const,
    key,
    url: url ?? TIER1_DEFAULT_URL,
    model: model ?? TIER1_DEFAULT_MODEL,
  };
}

function readTier2(env: Record<string, string | undefined>) {
  const key = env.HOODY_CLI_AI_KEY || undefined;
  const url = env.HOODY_CLI_AI_URL || undefined;
  const model = env.HOODY_CLI_AI_MODEL || undefined;
  if (!key && !url && !model) return null;
  return {
    tier: 'cli-ai' as const,
    key,
    url: url ?? TIER2_DEFAULT_URL,
    model: model ?? TIER2_DEFAULT_MODEL,
  };
}

function readTier3(env: Record<string, string | undefined>) {
  const key = env.OPENAI_API_KEY || undefined;
  const url = env.OPENAI_BASE_URL || undefined;
  const model = env.OPENAI_MODEL || undefined;
  if (!key && !url && !model) return null;
  return {
    tier: 'openai' as const,
    key,
    url,
    model,
  };
}

/**
 * Resolve provider config for the given profile.
 *
 *   profile='chat'    → cascade tier1 → tier2 → tier3 → no-config error.
 *   profile='ai-fix'  → lock to tier 2 defaults (matches existing ai-fix.ts behavior).
 *
 * On success returns a ProviderConfig. On failure returns a ResolverError.
 * Never throws.
 */
export function resolveProvider(
  profile: 'chat' | 'ai-fix',
  env: Record<string, string | undefined> = process.env,
): ProviderResolution {
  if (profile === 'ai-fix') {
    // ai-fix never cascades; it uses tier 2 defaults with optional overrides.
    // This path is preserved for a future migration of ai-fix.ts onto the
    // shared resolver. Current ai-fix.ts still has its own defaults.
    const t2 = readTier2(env);
    if (t2) return finalizeTier(t2);
    return finalizeTier({
      tier: 'cli-ai',
      key: undefined,
      url: TIER2_DEFAULT_URL,
      model: TIER2_DEFAULT_MODEL,
    });
  }

  // profile === 'chat': try tier 1, then tier 2, then tier 3.
  const t1 = readTier1(env);
  if (t1) return finalizeTier(t1);
  const t2 = readTier2(env);
  if (t2) return finalizeTier(t2);
  const t3 = readTier3(env);
  if (t3) return finalizeTier(t3);

  return {
    error: 'no-config',
    message: 'No AI provider configured — set one of the three tiers below, then re-run.',
    hint: noConfigExamples(),
  };
}

/**
 * Produce a copy-pasteable example for each of the three supported tiers,
 * using the current shell's env-var syntax (bash/zsh vs PowerShell vs cmd).
 * Shown whenever resolveProvider() returns a 'no-config' error.
 */
function noConfigExamples(): string {
  const ex = (name: string, value: string) => {
    if (process.platform === 'win32') {
      if (process.env.PSModulePath) return `  $env:${name}="${value}"`;
      return `  setx ${name} ${value}`;
    }
    return `  export ${name}=${value}`;
  };
  return [
    '',
    '  Tier 1  — Hoody-dedicated MiniMax (recommended — fastest, tuned for Hoody):',
    ex('HOODY_CHAT_KEY', '<your-key>'),
    '',
    '  Tier 2  — Any OpenAI-compatible endpoint (OpenRouter, local llama.cpp, Ollama, etc.):',
    ex('HOODY_CLI_AI_KEY', '<your-key>'),
    ex('HOODY_CLI_AI_URL', 'https://api.openrouter.ai/v1/chat/completions'),
    ex('HOODY_CLI_AI_MODEL', 'meta-llama/llama-3.1-70b-instruct'),
    '',
    '  Tier 3  — OpenAI direct:',
    ex('OPENAI_API_KEY', '<your-key>'),
    ex('OPENAI_BASE_URL', 'https://api.openai.com/v1/chat/completions'),
    ex('OPENAI_MODEL', 'gpt-4o-mini'),
    '',
    '  Full docs: `hoody chat --help` (flag reference + tier resolution order).',
  ].join('\n');
}

/**
 * Validate a partial tier config and apply keyless-allowlist rules.
 * Returns a ResolverError if the config is invalid, otherwise a ProviderConfig.
 */
function finalizeTier(
  cfg: { tier: ProviderTier; key: string | undefined; url: string | undefined; model: string | undefined },
): ProviderResolution {
  if (cfg.tier === 'openai') {
    if (!cfg.url) {
      return {
        error: 'openai-missing-url',
        message:
          'OPENAI_API_KEY set but OPENAI_BASE_URL is missing. OPENAI_BASE_URL is REQUIRED for the OPENAI_* tier — no default is assumed to prevent accidental credential leak.',
        hint:
          'Either set OPENAI_BASE_URL explicitly, or use HOODY_CHAT_* / HOODY_CLI_AI_* instead.',
      };
    }
    if (!cfg.model) {
      return {
        error: 'openai-missing-model',
        message:
          'OPENAI_API_KEY set but OPENAI_MODEL is missing. OPENAI_MODEL is REQUIRED for the OPENAI_* tier.',
        hint: 'Set OPENAI_MODEL to a model ID your endpoint supports.',
      };
    }
  }

  if (!cfg.url) {
    return {
      error: 'missing-url',
      message: `URL missing for ${cfg.tier} tier (this should not happen — built-in defaults should cover).`,
    };
  }
  if (!cfg.model) {
    return {
      error: 'missing-model',
      message: `Model missing for ${cfg.tier} tier.`,
    };
  }

  let origin: string;
  try {
    origin = normalizeOrigin(cfg.url);
  } catch (e) {
    return {
      error: 'bad-url',
      message: `Invalid URL for ${cfg.tier} tier: ${cfg.url} (${(e as Error).message})`,
    };
  }

  // Keyless auth: only allowed for localhost/RFC1918.
  if (!cfg.key && !isLocalOrigin(origin)) {
    return {
      error: 'missing-key',
      message: `API key missing for ${cfg.tier} tier at ${origin}. Keys are required for non-local endpoints.`,
    };
  }

  return {
    tier: cfg.tier,
    key: cfg.key,
    url: cfg.url,
    model: cfg.model,
  };
}

/**
 * Format a ResolverError into a stderr-friendly message with a usage hint.
 * Returns the full text; caller writes to stderr and decides exit code.
 *
 * If the hint is a MULTI-LINE block (contains `\n`), it is appended as-is
 * with just a blank line in between — the "Hint:" label would look ugly
 * alongside a multi-line copy-pasteable snippet. Single-line hints keep
 * the "Hint:" prefix for scanability.
 */
export function formatResolverError(err: ResolverError): string {
  const lines = [`Error: ${err.message}`];
  if (err.hint) {
    if (err.hint.includes('\n')) {
      lines.push(err.hint);
    } else {
      lines.push(`Hint:  ${err.hint}`);
    }
  }
  return lines.join('\n') + '\n';
}
