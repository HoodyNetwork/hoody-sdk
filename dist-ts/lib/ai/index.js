/**
 * hoody-sdk/ai — OpenAI-compatible LLM transport layer.
 *
 * Shared by the chat feature (`hoody chat`) and available for SDK consumers
 * who want to drive an OpenAI-compatible endpoint directly without shelling
 * out to the CLI. All functions here are side-effect-free at import time.
 */
// Provider resolution + origin helpers
export { resolveProvider, isResolverError, formatResolverError, normalizeOrigin, isLocalOrigin, } from './provider-resolve.js';
// Streaming + one-shot OpenAI-compatible client
export { streamCompletion, completeOnce, readSseFrames, buildRequestBody, buildHeaders, resolveChatUrl, createThinkStripper, } from './openai-client.js';
