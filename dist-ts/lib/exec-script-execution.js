/**
 * Exec script execution extension — runtime augmentation of the generated
 * ExecService.
 *
 * Architecture pattern: TypeScript "declare module" augmentation + prototype
 * patching. This file replaces the generated GET-only `exec.run(path, ...)` with
 * `exec.run(path, { method, query, body, headers })`: any method, a query, a
 * body and headers, through the service's own HttpClient (kitAuth, retries,
 * middleware, ApiError), with the script path percent-encoded exactly once.
 * The prototype is patched at module load time so the method exists at runtime.
 *
 * Callers can bind the response type from a companion .schema.json /
 * .openapi.json contract:
 *
 *   const result = await box.exec.run<MyResBody>('my-script', { method: 'POST', body: payload });
 *   // result is ApiResponse<MyResBody>
 *
 * The `as` casts are safe because the transport answers `unknown` payloads;
 * the generic merely narrows the type at the call-site.
 */
import { ExecService } from '../generated/exec/exec.service.js';
import { assertBasePath } from './exec-path-utils.js';
/**
 * Percent-encode a script path one segment at a time, exactly once.
 * One leading `/` is accepted and dropped: `/health` is the path as it appears
 * after the exec origin in a URL, and names the same script as `health`.
 * The rest is validated (no further leading `/`, no `.`/`..` segments, no
 * backslash or NUL, including percent-hidden forms).
 */
export function encodeExecScriptPath(path, helperName) {
    const trimmed = path.trim();
    const relative = trimmed.startsWith('/') && !trimmed.startsWith('//') ? trimmed.slice(1) : trimmed;
    const normalized = assertBasePath(relative, helperName);
    return normalized.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}
const REQUEST_OPTION_KEYS = [
    'signal', 'timeoutMs', 'retries', 'retryDelayMs', 'retryOnStatuses',
    'middlewareContext', 'authRetry', 'rawResponse', 'responseType', 'headers',
];
/**
 * Dispatch one request to an already-encoded script path through the
 * service's own (namespace-wrapped) HttpClient, so kit credentials,
 * retries, middleware and ApiError behave as for every generated method.
 */
export function dispatchExecScript(service, encodedPath, options = {}) {
    const method = String(options.method ?? 'GET').toUpperCase();
    const internals = service;
    const requestUrl = internals.buildTemplateUrl(`/${encodedPath}`, (options.templateVars ?? {}));
    const requestData = {};
    for (const key of REQUEST_OPTION_KEYS) {
        if (options[key] !== undefined)
            requestData[key] = options[key];
    }
    if (options.query !== undefined) {
        const query = {};
        for (const [k, v] of Object.entries(options.query)) {
            if (v !== undefined && v !== null)
                query[k] = v;
        }
        if (Object.keys(query).length > 0)
            requestData.query = query;
    }
    if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') {
        requestData.body = options.body;
    }
    return internals.http.request(method, requestUrl, requestData);
}
// Global Symbol used as a once-guard so the prototype patch is idempotent.
// Symbol.for ensures a single shared key even if the module is loaded multiple times.
const EXEC_SCRIPT_EXECUTION_PATCH_MARKER = Symbol.for('hoody.sdk.exec.run.patch');
export function patchExecScriptExecutionPrototype() {
    const prototype = ExecService.prototype;
    if (prototype[EXEC_SCRIPT_EXECUTION_PATCH_MARKER])
        return;
    prototype['run'] = async function run(path, options) {
        const encodedPath = encodeExecScriptPath(path, 'run');
        return dispatchExecScript(this, encodedPath, options ?? {});
    };
    prototype[EXEC_SCRIPT_EXECUTION_PATCH_MARKER] = true;
}
patchExecScriptExecutionPrototype();
