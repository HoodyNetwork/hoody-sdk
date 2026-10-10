/**
 * Raw-response discovery adapter.
 *
 * For callers that have only the raw `openapi.listScripts` HTTP response (no
 * ScriptsService handle — e.g. anything using the bare HttpClient), this
 * module extracts the script array out of the various response shapes the
 * API emits and delegates to the shared `parseRawScriptEntries` parser.
 * Companion `.schema.json` enrichment is NOT performed here — callers with
 * a ScriptsService should use `discoverScripts()` from
 * `exec-dynamic-discovery.ts` instead.
 */
import type { DiscoveredScript } from './exec-dynamic-discovery.js';
/**
 * Parse a raw API response from openapi.listScripts into DiscoveredScript[].
 * The script array is found by `extractRawScriptList`, which accepts the
 * client envelope around the kit body as well as a bare array or `scripts`
 * list at any of the first `data` levels.
 */
export declare function discoverScriptsFromRawResponse(response: unknown): DiscoveredScript[];
