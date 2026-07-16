/**
 * Provider Resolver — shared across the CLI's AI-powered code paths.
 *
 * Resolves an OpenAI-compatible chat-completions provider config from env vars,
 * atomically per tier. No cross-tier fallback: if any var in a tier is set, that
 * tier is selected and only that tier's defaults fill missing slots.
 *
 * Tiers, highest precedence first:
 *   Tier 1 — Hoody chat-dedicated (preferred):
 *     HOODY_CHAT_KEY, HOODY_CHAT_URL, HOODY_CHAT_MODEL
 *   Tier 2 — shared secondary tier:
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
    key: string | undefined;
    url: string;
    model: string;
}
export interface ResolverError {
    error: string;
    message: string;
    hint?: string;
}
export type ProviderResolution = ProviderConfig | ResolverError;
export declare function isResolverError(r: ProviderResolution): r is ResolverError;
/**
 * Normalize a URL to a canonical origin (scheme://host[:port]) for comparison.
 * Lowercases host, strips default ports (80 for http, 443 for https),
 * drops trailing slashes and any path component.
 *
 * Throws if the URL is invalid or uses a non-http(s) scheme.
 */
export declare function normalizeOrigin(raw: string): string;
/**
 * True if the origin is a local/RFC1918 URL for which we allow keyless auth
 * and never prompt for acceptance.
 */
export declare function isLocalOrigin(origin: string): boolean;
/**
 * Resolve provider config for the given profile.
 *
 *   profile='chat'    → cascade tier1 → tier2 → tier3 → no-config error.
 *   profile='ai-fix'  → lock to tier 2 defaults.
 *
 * On success returns a ProviderConfig. On failure returns a ResolverError.
 * Never throws.
 */
export declare function resolveProvider(profile: 'chat' | 'ai-fix', env?: Record<string, string | undefined>): ProviderResolution;
/**
 * Format a ResolverError into a stderr-friendly message with a usage hint.
 * Returns the full text; caller writes to stderr and decides exit code.
 *
 * If the hint is a MULTI-LINE block (contains `\n`), it is appended as-is
 * with just a blank line in between — the "Hint:" label would look ugly
 * alongside a multi-line copy-pasteable snippet. Single-line hints keep
 * the "Hint:" prefix for scanability.
 */
export declare function formatResolverError(err: ResolverError): string;
