/**
 * Exec scripts service extensions — module augmentation + prototype patching.
 *
 * Architecture:
 *   This module extends the auto-generated ScriptsService with high-level
 *   helpers (readFile, writeMarkdown, readSchemaJson, etc.) without modifying
 *   the generated code. It uses two TypeScript mechanisms:
 *
 *   1. `declare module` augmentation: adds new method signatures to
 *      ScriptsService's type so callers see them with full type safety.
 *   2. Prototype patching at import time: `patchExecScriptsServicePrototype()`
 *      is called as a side-effect of importing this module, attaching the
 *      actual implementations to ScriptsService.prototype.
 *
 * Four content-type families:
 *   - Generic files (readFile / writeFile / deleteFile / listFiles)
 *   - Markdown (.md) — auto-appends extension, skips validation
 *   - Schema JSON (.schema.json) — auto-appends extension, parses/serializes JSON
 *   - OpenAPI JSON (.openapi.json) — same as schema JSON with different extension
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
 *   - label, tags, mode, enabled, websocket: default to '' (no constraint)
 *   - recursive, include_comments: default to 'false'
 */
function normalizeListScriptsOptions(options) {
    const source = typeof options === 'object' && options !== null
        ? options
        : {};
    const normalized = {
        ...source,
    };
    if (normalized.dir === undefined || normalized.dir === null) {
        normalized.dir = '';
    }
    else if (typeof normalized.dir === 'string') {
        const trimmedDir = normalized.dir.trim();
        normalized.dir = trimmedDir ? assertPath(trimmedDir, 'listFiles') : '';
    }
    else {
        normalized.dir = '';
    }
    if (normalized.filter === undefined
        || normalized.filter === null
        || normalized.filter === '') {
        normalized.filter = '*';
    }
    normalized.metadata = parseBooleanLike(normalized.metadata, false);
    // Supply safe defaults for remaining required query params so the generated
    // base validation does not reject the request. These are pass-through filters
    // that the server treats as "no constraint" when empty or default-valued.
    normalized.label ??= '';
    normalized.tags ??= '';
    normalized.mode ??= '';
    normalized.enabled ??= '';
    normalized.websocket ??= '';
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
function normalizeMarkdownPath(path, helperName) {
    return normalizePathWithExtension(path, '.md', helperName);
}
function normalizeSchemaJsonPath(path, helperName) {
    return normalizePathWithExtension(path, '.schema.json', helperName);
}
function normalizeOpenApiJsonPath(path, helperName) {
    return normalizePathWithExtension(path, '.openapi.json', helperName);
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
    //   - validate defaults to false, except forced false for .md files
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
            validate: isMarkdown ? false : parseBooleanLike(source.validate, false),
        };
        return originalWrite.call(this, normalizedPayload, requestOptions, templateVars);
    };
    prototype.listFiles = function listFiles(options, templateVars) {
        return this.list(options, templateVars);
    };
    prototype.listMarkdown = function listMarkdown(options, templateVars) {
        const normalizedOptions = {
            ...(options || {}),
            filter: options?.filter ?? '*.md',
        };
        return this.list(normalizedOptions, templateVars);
    };
    prototype.listSchemaJson = function listSchemaJson(options, templateVars) {
        return this.listFiles({
            ...(options || {}),
            filter: options?.filter ?? '*.schema.json',
        }, templateVars);
    };
    prototype.listOpenApiJson = function listOpenApiJson(options, templateVars) {
        return this.listFiles({
            ...(options || {}),
            filter: options?.filter ?? '*.openapi.json',
        }, templateVars);
    };
    prototype.readFile = function readFile(path, options, templateVars) {
        const request = {
            ...(options || {}),
            path: assertPath(path, 'readFile'),
        };
        return this.read(request, templateVars);
    };
    prototype.readMarkdown = function readMarkdown(path, options, templateVars) {
        return this.readFile(normalizeMarkdownPath(path, 'readMarkdown'), options, templateVars);
    };
    prototype.readSchemaJson = async function readSchemaJson(path, options, templateVars) {
        const normalizedPath = normalizeSchemaJsonPath(path, 'readSchemaJson');
        const response = await this.readFile(normalizedPath, options, templateVars);
        const parsed = parseJsonContent(response.data?.content, normalizedPath, 'readSchemaJson');
        return {
            ...response,
            data: {
                ...response.data,
                content: parsed,
            },
        };
    };
    prototype.readOpenApiJson = async function readOpenApiJson(path, options, templateVars) {
        const normalizedPath = normalizeOpenApiJsonPath(path, 'readOpenApiJson');
        const response = await this.readFile(normalizedPath, options, templateVars);
        const parsed = parseJsonContent(response.data?.content, normalizedPath, 'readOpenApiJson');
        return {
            ...response,
            data: {
                ...response.data,
                content: parsed,
            },
        };
    };
    prototype.writeFile = function writeFile(path, content, options, requestOptions, templateVars) {
        const payload = {
            path: assertPath(path, 'writeFile'),
            content,
            createDirs: options?.createDirs ?? true,
            validate: parseBooleanLike(options?.validate, false),
        };
        return this.write(payload, requestOptions, templateVars);
    };
    prototype.writeMarkdown = function writeMarkdown(path, content, options, requestOptions, templateVars) {
        return this.writeFile(normalizeMarkdownPath(path, 'writeMarkdown'), content, {
            createDirs: options?.createDirs ?? true,
            validate: false,
        }, requestOptions, templateVars);
    };
    prototype.writeSchemaJson = function writeSchemaJson(path, schema, options, requestOptions, templateVars) {
        const normalizedPath = normalizeSchemaJsonPath(path, 'writeSchemaJson');
        return this.writeFile(normalizedPath, stringifyJson(schema, options), {
            createDirs: options?.createDirs ?? true,
            validate: false,
        }, requestOptions, templateVars);
    };
    prototype.writeOpenApiJson = function writeOpenApiJson(path, openapi, options, requestOptions, templateVars) {
        const normalizedPath = normalizeOpenApiJsonPath(path, 'writeOpenApiJson');
        return this.writeFile(normalizedPath, stringifyJson(openapi, options), {
            createDirs: options?.createDirs ?? true,
            validate: false,
        }, requestOptions, templateVars);
    };
    prototype.deleteFile = function deleteFile(path, options, templateVars) {
        const request = {
            ...(options || {}),
            path: assertPath(path, 'deleteFile'),
            confirm: normalizeConfirmQuery(options?.confirm),
        };
        return this.delete(request, templateVars);
    };
    prototype.deleteMarkdown = function deleteMarkdown(path, options, templateVars) {
        return this.deleteFile(normalizeMarkdownPath(path, 'deleteMarkdown'), options, templateVars);
    };
    prototype.deleteSchemaJson = function deleteSchemaJson(path, options, templateVars) {
        return this.deleteFile(normalizeSchemaJsonPath(path, 'deleteSchemaJson'), options, templateVars);
    };
    prototype.deleteOpenApiJson = function deleteOpenApiJson(path, options, templateVars) {
        return this.deleteFile(normalizeOpenApiJsonPath(path, 'deleteOpenApiJson'), options, templateVars);
    };
    prototype[EXEC_SCRIPTS_PATCH_MARKER] = true;
}
// Auto-invoke at import time: importing this module patches ScriptsService.prototype.
patchExecScriptsServicePrototype();
