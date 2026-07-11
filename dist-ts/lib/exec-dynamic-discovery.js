/**
 * Exec Dynamic Discovery — SDK-side runtime discovery of user scripts on exec
 * containers. Fetches the script inventory via `listUserScripts()` and parses
 * each entry's metadata (HTTP method, parameters, tags) into
 * `DiscoveredScript` objects consumed by SDK callers and agent surfaces.
 *
 * Security:
 *   - Script names sanitized to [a-z0-9-], max 64 chars
 *   - Schema bombs rejected: max 20 params, max 10KB schema
 *   - No .md companion content is included (prompt injection vector)
 *   - Path traversal prevented via assertBasePath
 */
import { parseRawScriptEntries } from './exec-dynamic-parse.js';
// ─── Constants ───────────────────────────────────────────────────────────────
export const MAX_PARAMS_PER_SCRIPT = 20;
export const MAX_SCHEMA_SIZE_BYTES = 10_240;
export const MAX_TOOL_NAME_LENGTH = 64;
const TOOL_NAME_RE = /^[a-z0-9-]+$/;
// ─── Name Sanitization ───────────────────────────────────────────────────────
/**
 * Convert a script file path to a CLI-friendly kebab-case name.
 * Examples:
 *   "api/users.ts" -> "api-users"
 *   "api/users/[id].ts" -> "api-users-id"
 *   "health.ts" -> "health"
 */
export function scriptPathToName(path) {
    let name = path
        .replace(/\.(ts|js|mjs|cjs)$/i, '') // strip extension
        .replace(/\[([^\]]+)\]/g, '$1') // [id] -> id
        .replace(/[/\\]+/g, '-') // separators to dashes
        .replace(/[^a-zA-Z0-9-]/g, '-') // non-alphanumeric to dashes
        .replace(/-+/g, '-') // collapse dashes
        .replace(/^-|-$/g, '') // trim dashes
        .toLowerCase();
    if (name.length > MAX_TOOL_NAME_LENGTH) {
        name = name.slice(0, MAX_TOOL_NAME_LENGTH);
        // Don't end on a dash after truncation
        name = name.replace(/-$/, '');
    }
    return name;
}
/**
 * Validate a tool name against the allowed pattern.
 */
export function isValidToolName(name) {
    return name.length > 0 && name.length <= MAX_TOOL_NAME_LENGTH && TOOL_NAME_RE.test(name);
}
// ─── Schema Parsing ──────────────────────────────────────────────────────────
function jsonSchemaTypeToParamType(type) {
    if (type === 'integer' || type === 'number')
        return 'number';
    if (type === 'boolean')
        return 'boolean';
    return 'string';
}
function camelToKebab(str) {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase();
}
/**
 * Extract parameters from a JSON Schema `properties` object.
 * Respects the MAX_PARAMS_PER_SCRIPT limit.
 */
export function extractParamsFromSchema(schema, httpMethod) {
    if (!schema)
        return [];
    // Check schema size
    const schemaStr = JSON.stringify(schema);
    if (schemaStr.length > MAX_SCHEMA_SIZE_BYTES)
        return [];
    const properties = schema.properties;
    if (!properties || typeof properties !== 'object')
        return [];
    const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);
    const params = [];
    const entries = Object.entries(properties);
    for (const [propName, propSchema] of entries) {
        if (params.length >= MAX_PARAMS_PER_SCRIPT)
            break;
        if (!propSchema || typeof propSchema !== 'object')
            continue;
        const paramType = jsonSchemaTypeToParamType(propSchema.type);
        const flag = `--${camelToKebab(propName)}`;
        params.push({
            name: propName,
            flag,
            type: paramType,
            required: requiredSet.has(propName),
            description: typeof propSchema.description === 'string' ? propSchema.description : undefined,
            defaultValue: propSchema.default,
            choices: Array.isArray(propSchema.enum) ? propSchema.enum.map(String) : undefined,
            isPathParam: false,
            // GET → query, everything else → body. PUT/PATCH/DELETE semantically
            // take bodies in the script dispatch model.
            isQueryParam: httpMethod === 'GET',
            isBodyParam: httpMethod === 'POST' || httpMethod === 'PUT' || httpMethod === 'PATCH' || httpMethod === 'DELETE',
        });
    }
    return params;
}
/**
 * Extract path parameters from file-based routing patterns.
 * Example: "api/users/[id].ts" yields a path param "id".
 */
export function extractPathParams(scriptPath) {
    const matches = scriptPath.matchAll(/\[([^\]]+)\]/g);
    const params = [];
    for (const match of matches) {
        const paramName = match[1];
        params.push({
            name: paramName,
            flag: `--${camelToKebab(paramName)}`,
            type: 'string',
            required: true,
            isPathParam: true,
            isQueryParam: false,
            isBodyParam: false,
        });
    }
    return params;
}
// ─── Description Sanitization ────────────────────────────────────────────────
/**
 * Sanitize text for use in tool descriptions.
 * Strips control characters, escape sequences, and HTML tags.
 * Max 200 chars.
 */
export function sanitizeDescription(text) {
    if (!text || typeof text !== 'string')
        return undefined;
    let clean = text
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // ANSI escapes (before control char strip)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
        .replace(/<[^>]+>/g, '') // HTML tags
        .trim();
    if (clean.length > 200) {
        clean = clean.slice(0, 197) + '...';
    }
    return clean || undefined;
}
// ─── Discovery ───────────────────────────────────────────────────────────────
/**
 * Discover user scripts from an exec container.
 *
 * Calls `listUserScripts()` to get the script inventory, then enriches
 * each entry with schema information where available.
 *
 * For scripts that declare `hasSchema: true` but don't include inline schema,
 * this function loads the companion `.schema.json` via the ScriptsService
 * before delegating to the shared parser. The raw-response adapter in
 * `exec-dynamic-discovery-cli.ts` is the variant used when only the raw
 * `listUserScripts` response is available (no ScriptsService handle) and
 * therefore skips this enrichment step.
 */
export async function discoverScripts(openapiService, scriptsService, options) {
    const templateVars = options?.templateVars;
    // listScripts is not paginated (spec returns oneOf with inline scripts
    // array); call it directly and extract the array from the response.
    const requestOptions = options?.signal ? { signal: options.signal } : undefined;
    const response = await openapiService.listScripts(requestOptions, templateVars);
    // Response shape is oneOf — look for `scripts` or `items` in .data.
    const data = response.data ?? response;
    const scriptsArr = data.scripts
        ?? data.items
        ?? data;
    const rawScripts = (Array.isArray(scriptsArr) ? scriptsArr : []);
    // Pre-enrich: load companion .schema.json for scripts that declare hasSchema
    // but don't include an inline schema. Skipped when no ScriptsService handle
    // is available (the raw-response adapter has no way to fetch companions).
    if (scriptsService) {
        for (const raw of rawScripts) {
            if (!raw || typeof raw !== 'object')
                continue;
            if (raw.schema || !raw.hasSchema)
                continue;
            const scriptPath = typeof raw.path === 'string' ? raw.path : '';
            if (!scriptPath)
                continue;
            try {
                const schemaResponse = await scriptsService.readSchemaJson(scriptPath.replace(/\.(ts|js|mjs|cjs)$/i, ''));
                const content = schemaResponse?.data;
                const schemaContent = typeof content === 'object' && content !== null
                    ? content.content
                    : content;
                if (schemaContent && typeof schemaContent === 'object') {
                    raw.schema = schemaContent;
                }
            }
            catch {
                // Schema file unavailable — continue without params
            }
        }
    }
    // Delegate to shared parser (handles name generation, tag parsing,
    // method resolution, dual-method variants, path params, dedup, and
    // path traversal validation).
    return parseRawScriptEntries(rawScripts);
}
