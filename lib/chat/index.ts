/**
 * hoody-sdk/chat — programmatic access to the hoody chat feature.
 *
 * The CLI (`hoody chat` / `hoody chatbot`) is a thin Commander wrapper
 * around the runners and primitives re-exported here. Any consumer of the
 * SDK can therefore drive the same chat flow without shelling out to the
 * binary — useful for embedding chat into other tools, for writing
 * integration tests against a real provider, or for building custom REPL
 * frontends.
 *
 * Import-time side effects are minimal: no filesystem touches and no
 * network. `./docs-singletons.js` reads `HOODY_CHAT_DOCS_RATE_LIMIT` ONCE
 * to seed the process-wide rate bucket — a cheap constructor, not an
 * async probe. Calling a runner is what kicks off real I/O.
 */

// ─── Main runners ─────────────────────────────────────────────────────────
export { runChat, type RunChatOptions } from './run.js';
export { runRepl, type ReplOptions } from './repl.js';

// ─── Session primitives (programmatic CRUD) ───────────────────────────────
export {
  createSession,
  listSessions,
  readSession,
  findSessionById,
  findMatchingSessions,
  appendTurn,
  deleteSession,
  wipeAllSessions,
  truncateSessionTurns,
  saveEphemeralSession,
  titleFromUserMessage,
  type CreateSessionOptions,
  type SessionMeta,
  type SessionSummary,
  type SessionFull,
  type SessionTurn,
  type TurnRole,
} from './sessions.js';

// ─── Endpoint acceptance (privacy gate) ───────────────────────────────────
export {
  checkAcceptance,
  confirmAcceptance,
  readAcceptFile,
  acceptFilePath,
  BUILTIN_ACCEPTED_ORIGINS,
  type AcceptanceStatus,
  type AcceptFile,
  type AcceptFileEntry,
} from './endpoint-accept.js';

// ─── Docs search tool (read-only web fetch + SSE aggregation) ─────────────
export {
  executeDocsSearch,
  validateToolArgs,
  RollingRateLimiter,
  computeBackoffMs,
  HOODY_DOCS_SEARCH_TOOL,
  DEFAULT_DOCS_URL,
  DEFAULT_MAX_RESULT_BYTES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_FIRST_BYTE_MS,
  DEFAULT_CLIENT_RATE_LIMIT,
  type DocsSearchResult,
  type DocsErrorCode,
  type ExecuteDocsSearchOptions,
  type ValidatedArgs,
} from './docs-search-tool.js';

// ─── Tool dispatch (turn loop: model → tool → model) ──────────────────────
export { dispatchTurn, MAX_TOOL_CALLS_PER_TURN } from './tool-dispatch.js';

// ─── Paste-safety classifier (fence-block danger detection) ───────────────
export {
  classifyShellBlock,
  DANGER_PATTERNS,
  REVIEW_PATTERNS,
  SHELL_LANG_TAGS,
  parseExtraPatterns,
  type PasteSeverity,
  type ClassifyOptions,
  type ClassificationResult,
} from './paste-safety.js';

// ─── Redaction (secret-pattern stripper) ──────────────────────────────────
export {
  redactSecrets,
  redactForDisk,
  redactArgv,
  SECRET_PATTERNS,
  SENSITIVE_FLAGS,
  REDACTED,
} from './redact.js';

// ─── Trigger / dedupe (for @hoody.com pre-parse) ──────────────────────────
export {
  detectTrigger,
  DedupeCache,
  escapeXmlLike,
  stripCodeContexts,
  type DetectTriggerOptions,
  type DetectTriggerResult,
} from './trigger-parse.js';

// ─── First-run banner ─────────────────────────────────────────────────────
export {
  showBannerIfNeeded,
  hasSeenBanner,
  getBannerText,
  type ShowBannerOptions,
} from './first-run-banner.js';

// ─── Home-dir helpers (HOME override + platform env-var hints) ────────────
export { hoodyHomeDir, platformEnvHint } from './home-dir.js';

// ─── Markdown renderer (streaming ANSI output) ────────────────────────────
export {
  createRenderer,
  type RendererOptions,
  type StreamingRenderer,
} from './markdown-renderer.js';

// ─── System prompt / product blurb / reference retriever ──────────────────
export { buildSystemPrompt } from './system-prompt.js';
export { PRODUCT_BLURB } from './product-blurb.js';
export {
  retrieveReference,
  type RetrievalOptions,
  type RetrievalResult,
} from './reference-retriever.js';
export {
  CLI_REFERENCE,
  type CliReference,
  type RefGroup,
  type RefCommand,
} from './ai-cli-reference.generated.js';

// ─── Prep helpers ─────────────────────────────────────────────────────────
export { prepareChatsDir } from './prepare-dir.js';
