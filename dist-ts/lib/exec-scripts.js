/**
 * Exec scripts service extensions — module augmentation + prototype patching.
 *
 * Architecture:
 *   This module extends the auto-generated ScriptsService with high-level
 *   helpers (listFiles, readFile, writeFile, deleteFile) without modifying
 *   the generated code. It uses two TypeScript mechanisms:
 *
 *   1. `declare module` augmentation: adds new method signatures to
 *      ScriptsService's type so callers see them with full type safety.
 *   2. Prototype patching at import time: `patchExecScriptsServicePrototype()`
 *      is called as a side-effect of importing this module, attaching the
 *      actual implementations to ScriptsService.prototype.
 *
 * One action, one name; the content family is an option, `kind`:
 *   - 'file' (default) — a generic file, path used as given
 *   - 'markdown' — .md, auto-appends the extension, skips validation
 *   - 'schema' — .schema.json, auto-appends the extension, parses/serializes JSON
 *   - 'openapi' — .openapi.json, same as schema with a different extension
 *
 * All path arguments pass through assertBasePath (from exec-path-utils.ts) to
 * prevent directory traversal before reaching the generated service layer.
 */
import { ScriptsService } from '../generated/exec/scripts.service.js';
import { assertBasePath } from './exec-path-utils.js';
/**
 * Idempotency guard for prototype patching.
 *
 * Uses `Symbol.for` (global symbol registry) rather than a plain `Symbol()` so the
 * marker survives HMR (Hot Module Replacement) and duplicate import scenarios where
 * the module body runs multiple times with different module identity. `Symbol.for`
 * always returns the same symbol for the same string key across all module instances.
 */
const EXEC_SCRIPTS_PATCH_MARKER = Symbol.for('hoody.sdk.exec.scripts.patch');
function parseBooleanLike(value, fallback) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true')
            return true;
        if (normalized === 'false')
            return false;
    }
    return fallback;
}
/**
 * Normalize user-provided list options into the shape expected by the generated
 * listScripts method.
 *
 * Supplies safe defaults for all required query parameters so the generated
 * base validation does not reject the request. Notably:
 *   - dir: defaults to '' (root) and validates via assertPath if non-empty
 *   - filter: defaults to '*' (match all)
 *   - metadata: coerced to boolean (false by default)
 *   - label, tags, mode, enabled, websocket: left out when unset or empty
 *     (no constraint). They are never sent empty: the server reads a
 *     recursive listing's `enabled=` as enabled=false and drops every
 *     enabled script.
 *   - recursive, include_comments: default to 'false'
 *
 * An exhaustive listing (exhaustive true or 'true') gets none of these defaults,
 * not even the empty dir: the server refuses it with any option that could hide
 * an entry. The caller's own options are still sent, and still refused.
 */
function normalizeListScriptsOptions(options) {
    const source = typeof options === 'object' && options !== null
        ? options
        : {};
    const normalized = {
        ...source,
    };
    const exhaustive = parseBooleanLike(normalized.exhaustive, false);
    if (normalized.dir === undefined || normalized.dir === null) {
        // A null dir would be sent as the text "null".
        if (exhaustive)
            delete normalized.dir;
        else
            normalized.dir = '';
    }
    else if (typeof normalized.dir === 'string') {
        const trimmedDir = normalized.dir.trim();
        normalized.dir = trimmedDir ? assertPath(trimmedDir, 'listFiles') : '';
    }
    else {
        normalized.dir = '';
    }
    if (exhaustive)
        return normalized;
    if (normalized.filter === undefined
        || normalized.filter === null
        || normalized.filter === '') {
        normalized.filter = '*';
    }
    normalized.metadata = parseBooleanLike(normalized.metadata, false);
    // An unset filter is left out of the query rather than sent empty.
    for (const key of ['label', 'tags', 'mode', 'enabled', 'websocket']) {
        if (normalized[key] === undefined || normalized[key] === null || normalized[key] === '') {
            delete normalized[key];
        }
    }
    normalized.recursive ??= 'false';
    normalized.include_comments ??= 'false';
    return normalized;
}
function normalizeConfirmQuery(confirm) {
    if (typeof confirm === 'boolean')
        return confirm ? 'true' : 'false';
    if (typeof confirm === 'string' && confirm.trim().length > 0)
        return confirm;
    return 'true';
}
function assertPath(path, helperName) {
    return assertBasePath(path, helperName);
}
function normalizePathWithExtension(path, extension, helperName) {
    const normalized = assertPath(path, helperName);
    if (normalized.toLowerCase().endsWith(extension.toLowerCase()))
        return normalized;
    const fileName = normalized.split('/').pop() || normalized;
    if (fileName.includes('.')) {
        throw new Error(`${helperName} expects a ${extension} path. Received "${path}"`);
    }
    return `${normalized}${extension}`;
}
const KIND_EXTENSION = {
    markdown: '.md',
    schema: '.schema.json',
    openapi: '.openapi.json',
};
/** The path a helper sends for a kind: a generic file as given, the others with their extension. */
function pathForKind(path, kind, helperName) {
    if (kind === undefined || kind === 'file')
        return assertPath(path, helperName);
    const extension = KIND_EXTENSION[kind];
    if (extension === undefined) {
        throw new Error(`${helperName}: unknown kind ${JSON.stringify(kind)}; expected file, markdown, schema or openapi`);
    }
    return normalizePathWithExtension(path, extension, helperName);
}
function isJsonKind(kind) {
    return kind === 'schema' || kind === 'openapi';
}
function normalizeJsonSpace(options) {
    const requested = options?.space;
    if (typeof requested === 'number' && Number.isFinite(requested)) {
        return Math.max(0, Math.floor(requested));
    }
    return options?.pretty === false ? 0 : 2;
}
function stringifyJson(value, options) {
    const space = normalizeJsonSpace(options);
    const serialized = JSON.stringify(value, null, space);
    if (serialized === undefined) {
        throw new Error('JSON payload is not serializable');
    }
    return space > 0 ? `${serialized}\n` : serialized;
}
function parseJsonContent(content, path, helperName) {
    if (typeof content === 'object' && content !== null) {
        return content;
    }
    if (typeof content !== 'string') {
        throw new Error(`${helperName} expected string or object content for "${path}"`);
    }
    try {
        return JSON.parse(content);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${helperName} could not parse JSON at "${path}": ${message}`);
    }
}
function asAnyRecord(value) {
    return (value || {});
}
/**
 * Attach all extension methods to ScriptsService.prototype.
 *
 * This function is called as a side-effect at the bottom of this module
 * (auto-invoked at import time). The EXEC_SCRIPTS_PATCH_MARKER guard
 * ensures it only runs once even if the module is imported multiple times.
 *
 * It also monkey-patches the original `listScripts` and `writeScript` to
 * inject normalization (safe defaults, path validation) transparently.
 */
export function patchExecScriptsServicePrototype() {
    const prototype = ScriptsService.prototype;
    if (prototype[EXEC_SCRIPTS_PATCH_MARKER])
        return;
    const originalList = prototype.list;
    const originalWrite = prototype.write;
    prototype.list = function patchedList(options, templateVars) {
        return originalList.call(this, normalizeListScriptsOptions(options), templateVars);
    };
    // Patched write: validates path, applies default behaviors:
    //   - createDirs defaults to true (auto-create parent directories)
    //   - validate defaults to true, as on the server, except forced false for .md files
    //     (Markdown files should not go through script validation)
    prototype.write = function patchedWrite(data, requestOptions, templateVars) {
        const source = asAnyRecord(data);
        // Validate path to prevent traversal through the base writeScript method
        if (typeof source.path === 'string' && source.path.trim()) {
            assertPath(source.path, 'writeScript');
        }
        const normalizedPath = typeof source.path === 'string'
            ? source.path.trim().toLowerCase()
            : '';
        const isMarkdown = normalizedPath.endsWith('.md');
        const normalizedPayload = {
            ...source,
            createDirs: source.createDirs ?? true,
            validate: isMarkdown ? false : parseBooleanLike(source.validate, true),
        };
        return originalWrite.call(this, normalizedPayload, requestOptions, templateVars);
    };
    prototype.listFiles = function listFiles(options, templateVars) {
        const { kind, ...rest } = options ?? {};
        const filter = rest.filter
            ?? (kind === undefined || kind === 'file' ? undefined : `*${KIND_EXTENSION[kind]}`);
        return this.list({ ...rest, ...(filter !== undefined ? { filter } : {}) }, templateVars);
    };
    prototype.readFile = async function readFile(path, options, templateVars) {
        const { kind, ...rest } = options ?? {};
        const target = pathForKind(path, kind, 'readFile');
        const response = await this.read({ ...rest, path: target }, templateVars);
        if (!isJsonKind(kind))
            return response;
        const parsed = parseJsonContent(response.data?.content, target, 'readFile');
        return { ...response, data: { ...response.data, content: parsed } };
    };
    prototype.writeFile = function writeFile(path, data, options, requestOptions, templateVars) {
        const kind = options?.kind;
        const target = pathForKind(path, kind, 'writeFile');
        let content;
        if (isJsonKind(kind)) {
            if (typeof data !== 'object' || data === null) {
                throw new Error(`writeFile with kind "${kind}" takes an object, not ${typeof data}`);
            }
            content = stringifyJson(data, options);
        }
        else {
            if (typeof data !== 'string') {
                throw new Error(`writeFile with kind "${kind ?? 'file'}" takes a string of content, not ${typeof data}`);
            }
            content = data;
        }
        const payload = {
            path: target,
            content,
            createDirs: options?.createDirs ?? true,
            // Only a generic file may ask for script validation; every other kind is data.
            validate: kind === undefined || kind === 'file'
                ? parseBooleanLike(options?.validate, true)
                : false,
        };
        return this.write(payload, requestOptions, templateVars);
    };
    prototype.deleteFile = function deleteFile(path, options, templateVars) {
        const { kind, ...rest } = options ?? {};
        const request = {
            ...rest,
            path: pathForKind(path, kind, 'deleteFile'),
            // The spec admits only "true"; any other value a caller passes is sent as given and the
            // server refuses it, rather than being silently turned into a confirmation.
            confirm: normalizeConfirmQuery(options?.confirm),
        };
        return this.delete(request, templateVars);
    };
    prototype[EXEC_SCRIPTS_PATCH_MARKER] = true;
}
// Auto-invoke at import time: importing this module patches ScriptsService.prototype.
patchExecScriptsServicePrototype();
