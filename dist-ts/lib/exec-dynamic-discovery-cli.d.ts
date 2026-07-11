/**
 * Raw-response discovery adapter.
 *
 * For callers that have only the raw `listUserScripts` HTTP response (no
 * ScriptsService handle — e.g. anything using the bare HttpClient), this
 * module extracts the script array out of the various response shapes the
 * API emits and delegates to the shared `parseRawScriptEntries` parser.
 * Companion `.schema.json` enrichment is NOT performed here — callers with
 * a ScriptsService should use `discoverScripts()` from
 * `exec-dynamic-discovery.ts` instead.
 */
import type { DiscoveredScript } from './exec-dynamic-discovery.js';
/**
 * Parse a raw API response from listUserScripts into DiscoveredScript[].
 * Works with both `{ data: [...] }` and `{ data: { data: [...] } }` shapes.
 */
export declare function discoverScriptsFromRawResponse(response: unknown): DiscoveredScript[];
