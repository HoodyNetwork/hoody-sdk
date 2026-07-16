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
import { parseRawScriptEntries, type RawScriptEntry } from './exec-dynamic-parse.js';

/**
 * Parse a raw API response from listUserScripts into DiscoveredScript[].
 * Works with both `{ data: [...] }` and `{ data: { data: [...] } }` shapes.
 */
export function discoverScriptsFromRawResponse(response: unknown): DiscoveredScript[] {
  if (!response || typeof response !== 'object') return [];

  const rawData = (response as Record<string, unknown>).data;
  let rawScripts: RawScriptEntry[];

  if (Array.isArray(rawData)) {
    rawScripts = rawData as RawScriptEntry[];
  } else if (rawData && typeof rawData === 'object') {
    const nested = rawData as Record<string, unknown>;
    if (Array.isArray(nested.data)) {
      rawScripts = nested.data as RawScriptEntry[];
    } else if (Array.isArray(nested.scripts)) {
      rawScripts = nested.scripts as RawScriptEntry[];
    } else {
      return [];
    }
  } else {
    return [];
  }

  return parseRawScriptEntries(rawScripts);
}
