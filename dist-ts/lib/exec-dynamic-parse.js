/**
 * Exec Dynamic Parse — Shared script-entry parsing logic.
 *
 * Used by both `exec-dynamic-discovery.ts` (service-backed) and
 * `exec-dynamic-discovery-cli.ts` (raw-response adapter) so tag parsing,
 * method resolution, dual-method variant generation, path-param merging,
 * and deduplication live in one place.
 */
import { scriptPathToName, isValidToolName, extractParamsFromSchema, extractPathParams, sanitizeDescription, MAX_PARAMS_PER_SCRIPT, MAX_TOOL_NAME_LENGTH, } from './exec-dynamic-discovery.js';
import { assertBasePath } from './exec-path-utils.js';
// ─── Single-entry parser ─────────────────────────────────────────────────────
/**
 * Parse a single raw script entry into zero or more DiscoveredScript objects.
 *
 * Returns an empty array if the entry is invalid (missing path, invalid name,
 * path traversal detected, etc.). Returns multiple entries when the script
 * declares dual-method support (both GET and POST).
 */
export function parseRawScriptEntry(raw) {
    if (!raw || typeof raw !== 'object')
        return [];
    const scriptPath = typeof raw.path === 'string' ? raw.path : '';
    if (!scriptPath)
        return [];
    // HTTP method is server-authoritative (metadata.method wins over the
    // top-level `method` field). Falls through to POST for anything unknown —
    // matches the default `callScript` dispatch when no override is given.
    const serverMethod = raw.metadata?.method || raw.method;
    const normalizedServer = typeof serverMethod === 'string' ? serverMethod.toUpperCase() : '';
    const httpMethod = normalizedServer === 'GET' ? 'GET'
        : normalizedServer === 'PUT' ? 'PUT'
            : normalizedServer === 'PATCH' ? 'PATCH'
                : normalizedServer === 'DELETE' ? 'DELETE'
                    : 'POST';
    // Build name from label or path
    const label = typeof raw.label === 'string' ? raw.label.trim() : undefined;
    const name = label
        ? label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, MAX_TOOL_NAME_LENGTH)
        : scriptPathToName(scriptPath);
    if (!isValidToolName(name))
        return [];
    // Parse tags
    const rawTags = raw.tags;
    let tags;
    if (Array.isArray(rawTags)) {
        tags = rawTags.filter((t) => typeof t === 'string');
    }
    else if (typeof rawTags === 'string') {
        tags = rawTags.split(/[,\s]+/).filter(Boolean);
    }
    // Extract parameters from inline schema
    const schema = raw.schema;
    let parameters = [];
    let requestBodySchema;
    // GET is query-only; POST/PUT/PATCH/DELETE carry a body. Same classification
    // extractParamsFromSchema uses, mirrored here so discovery reports hasRequestBody
    // and requestBodySchema consistently with the live dispatcher.
    const isBodyMethod = httpMethod === 'POST' || httpMethod === 'PUT' || httpMethod === 'PATCH' || httpMethod === 'DELETE';
    if (schema && typeof schema === 'object') {
        parameters = extractParamsFromSchema(schema, httpMethod);
        if (isBodyMethod && Object.keys(schema).length > 0) {
            requestBodySchema = schema;
        }
    }
    // Add path params from file-based routing
    const pathParams = extractPathParams(scriptPath);
    if (pathParams.length > 0) {
        const existingNames = new Set(parameters.map((p) => p.name));
        for (const pp of pathParams) {
            if (!existingNames.has(pp.name)) {
                parameters.unshift(pp);
            }
        }
    }
    // Enforce param limit
    if (parameters.length > MAX_PARAMS_PER_SCRIPT) {
        parameters = parameters.slice(0, MAX_PARAMS_PER_SCRIPT);
    }
    // Strip the file extension from the script path for execution
    const execPath = scriptPath.replace(/\.(ts|js|mjs|cjs)$/i, '');
    // Validate path to prevent directory traversal
    try {
        const pathWithoutParams = execPath.replace(/\[[^\]]+\]/g, '_placeholder_');
        assertBasePath(pathWithoutParams, 'parseRawScriptEntry');
    }
    catch {
        return []; // Skip scripts with invalid paths
    }
    const description = sanitizeDescription(typeof raw.description === 'string' ? raw.description : label);
    const results = [];
    results.push({
        name,
        path: scriptPath,
        label,
        description,
        tags,
        httpMethod,
        scriptPath: execPath,
        parameters,
        hasRequestBody: isBodyMethod,
        requestBodySchema,
    });
    // Dual-method support: if the script declares both GET and POST,
    // create variant entries (<name>-get / <name>-post).
    const rawMethods = raw.metadata?.methods || raw.methods;
    if (Array.isArray(rawMethods) && rawMethods.length > 1) {
        const normalizedMethods = rawMethods
            .map((m) => typeof m === 'string' ? m.toUpperCase() : '')
            .filter((m) => m === 'GET' || m === 'POST');
        for (const variantMethod of normalizedMethods) {
            if (variantMethod === httpMethod)
                continue; // primary already added
            const variantName = `${name}-${variantMethod.toLowerCase()}`;
            if (!isValidToolName(variantName))
                continue;
            // Re-extract params for the variant method from schema
            let variantParams = schema
                ? extractParamsFromSchema(schema, variantMethod)
                : [];
            // Merge path params into variant (fix: don't lose them)
            if (pathParams.length > 0) {
                const variantExistingNames = new Set(variantParams.map((p) => p.name));
                for (const pp of pathParams) {
                    if (!variantExistingNames.has(pp.name)) {
                        variantParams.unshift(pp);
                    }
                }
            }
            // If still no params after schema + path, fall back to primary params
            if (variantParams.length === 0 && parameters.length > 0) {
                variantParams = parameters;
            }
            results.push({
                name: variantName,
                path: scriptPath,
                label,
                description,
                tags,
                httpMethod: variantMethod,
                scriptPath: execPath,
                parameters: variantParams,
                hasRequestBody: variantMethod === 'POST',
                requestBodySchema: variantMethod === 'POST' ? requestBodySchema : undefined,
            });
        }
    }
    return results;
}
// ─── Batch parser with deduplication ─────────────────────────────────────────
/**
 * Parse an array of raw script entries, deduplicate by name (first wins).
 */
export function parseRawScriptEntries(rawScripts) {
    const discovered = [];
    for (const raw of rawScripts) {
        const entries = parseRawScriptEntry(raw);
        discovered.push(...entries);
    }
    // Deduplicate by name (first wins)
    const seen = new Set();
    return discovered.filter((s) => {
        if (seen.has(s.name))
            return false;
        seen.add(s.name);
        return true;
    });
}
