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
import { parseRawScriptEntries } from './exec-dynamic-parse.js';
/**
 * Parse a raw API response from listUserScripts into DiscoveredScript[].
 * Works with both `{ data: [...] }` and `{ data: { data: [...] } }` shapes.
 */
export function discoverScriptsFromRawResponse(response) {
    if (!response || typeof response !== 'object')
        return [];
    const rawData = response.data;
    let rawScripts;
    if (Array.isArray(rawData)) {
        rawScripts = rawData;
    }
    else if (rawData && typeof rawData === 'object') {
        const nested = rawData;
        if (Array.isArray(nested.data)) {
            rawScripts = nested.data;
        }
        else if (Array.isArray(nested.scripts)) {
            rawScripts = nested.scripts;
        }
        else {
            return [];
        }
    }
    else {
        return [];
    }
    return parseRawScriptEntries(rawScripts);
}
