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
export { runChat, type RunChatOptions } from './run.js';
export { runRepl, type ReplOptions } from './repl.js';
export { createSession, listSessions, readSession, findSessionById, findMatchingSessions, appendTurn, deleteSession, wipeAllSessions, truncateSessionTurns, saveEphemeralSession, titleFromUserMessage, type CreateSessionOptions, type SessionMeta, type SessionSummary, type SessionFull, type SessionTurn, type TurnRole, } from './sessions.js';
export { checkAcceptance, confirmAcceptance, readAcceptFile, acceptFilePath, BUILTIN_ACCEPTED_ORIGINS, type AcceptanceStatus, type AcceptFile, type AcceptFileEntry, } from './endpoint-accept.js';
export { askHoody, renderSources, RollingRateLimiter, computeBackoffMs, DEFAULT_SERVICE_URL, DOCS_SITE_BASE, DEFAULT_MAX_RESULT_BYTES, DEFAULT_TIMEOUT_MS, DEFAULT_FIRST_BYTE_MS, DEFAULT_CLIENT_RATE_LIMIT, MAX_MESSAGE_CHARS, MAX_HISTORY_TURNS, SERVICE_MODEL_LABEL, SERVICE_TIER_LABEL, type AskResult, type AskOptions, type ChatErrorCode, type DocsSource, type Turn, } from './service-client.js';
export { classifyShellBlock, DANGER_PATTERNS, REVIEW_PATTERNS, SHELL_LANG_TAGS, parseExtraPatterns, type PasteSeverity, type ClassifyOptions, type ClassificationResult, } from './paste-safety.js';
export { redactSecrets, redactForDisk, redactArgv, SECRET_PATTERNS, SENSITIVE_FLAGS, REDACTED, } from './redact.js';
export { showBannerIfNeeded, hasSeenBanner, getBannerText, type ShowBannerOptions, } from './first-run-banner.js';
export { hoodyHomeDir, platformEnvHint } from './home-dir.js';
export { createRenderer, type RendererOptions, type StreamingRenderer, } from './markdown-renderer.js';
export { prepareChatsDir } from './prepare-dir.js';
