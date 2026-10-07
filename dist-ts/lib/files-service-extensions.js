/**
 * Files service extensions — prototype patches for FilesService, ImagesService
 * (files namespace) and FilesService (notes namespace).
 *
 * Architecture:
 *   This module extends the auto-generated service classes with convenience
 *   helpers (classify, getUrl, getZipUrl, images.getThumbnailUrl, list),
 *   value readers (readText, readJson, readBytes), a boolean `exists` over
 *   the generated HEAD call, and a JSON-default override (search) without
 *   modifying the generated code.
 *
 *   It uses the same declare-module + prototype-patch pattern as
 *   lib/exec-scripts.ts and lib/terminal-exec.ts.
 *
 *   1. `declare module` augmentation: adds new method signatures so callers
 *      see them with full type safety.
 *   2. Prototype patching: `patchFilesServiceExtensions()` attaches the
 *      implementations to each service prototype, guarded by Symbol.for()
 *      for idempotency.
 */
import { FilesService } from '../generated/files/files.service.js';
import { UiService as FilesUiService } from '../generated/files/ui.service.js';
import { ValidationError, isApiError } from '../generated/errors.js';
import { FilesService as NotesFilesService } from '../generated/notes/files.service.js';
import { ImagesService } from '../generated/files/images.service.js';
// Notes TUS upload helpers (upload / resumeUpload / uploads.getOffset /
// uploads.cancel) live in their own module; patched with the rest so every
// entry that loads the files extensions gets them.
import { patchNotesUploadExtensions } from './notes-upload.js';
// ---------------------------------------------------------------------------
// Idempotency guards (Symbol.for survives HMR / duplicate imports)
// ---------------------------------------------------------------------------
const FILES_PATCH_MARKER = Symbol.for('hoody.sdk.files.service.extensions');
const IMAGE_PATCH_MARKER = Symbol.for('hoody.sdk.images.service.extensions');
// ---------------------------------------------------------------------------
// Pure helper — file classification
// ---------------------------------------------------------------------------
function classifyFile(filepath) {
    const dot = filepath.lastIndexOf('.');
    const lastSlash = filepath.lastIndexOf('/');
    if (dot === -1 || dot === filepath.length - 1 || dot <= lastSlash)
        return 'text';
    const ext = filepath.slice(dot + 1).toLowerCase();
    const RENDERABLE = new Set([
        // Images
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif',
        // Video
        'mp4', 'webm', 'ogg', 'ogv', 'mov',
        // Audio
        'mp3', 'wav', 'flac', 'aac', 'oga', 'weba', 'opus',
        // PDF
        'pdf',
    ]);
    const BINARY = new Set([
        // Archives
        'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
        // Executables / shared libs
        'exe', 'dll', 'so', 'dylib', 'bin', 'wasm',
        // Fonts
        'ttf', 'otf', 'woff', 'woff2',
        // Databases
        'sqlite', 'db',
    ]);
    if (RENDERABLE.has(ext))
        return 'renderable';
    if (BINARY.has(ext))
        return 'binary';
    return 'text';
}
// ---------------------------------------------------------------------------
// Path encoding
// ---------------------------------------------------------------------------
/**
 * Percent-encode a filesystem path per segment, REFUSING relative segments.
 *
 * Separators must survive — whole-value encoding turns `/tmp/f.txt` into one
 * opaque segment and the server answers `400 Invalid path`. But preserving them
 * lets a caller-supplied value introduce segments, and dots are unreserved, so
 * `encodeURIComponent('..') === '..'` passes straight through. These helpers
 * build `/api/v1/files/<path>` URLs, so without this guard a caller-supplied
 * value resolves out of the route before the request is even sent:
 *
 *     /api/v1/files/../../elsewhere   ->   /api/elsewhere
 *
 * hoody-files DOES reject dot segments server-side, but that check never runs —
 * `new URL()` normalises the traversal during URL construction, so the request
 * arrives at a different endpoint entirely and the file-path validator is never
 * consulted. Same mechanism as the pipe traversal fixed in lib/pipe-stream.ts.
 *
 * Checked after percent-decoding, since `%2e%2e` normalises identically.
 */
function encodeFilePathSegments(path, label) {
    const segments = path.split('/');
    // Drop LEADING empties. The call sites strip exactly ONE separator, so a
    // `//tmp/f.txt` input previously survived as `/tmp/f.txt` here and emitted
    // `/api/v1/files//tmp/f.txt` — hoody-files strips one separator then rejects
    // the remaining leading one as an absolute path, so it 400'd
    // where the CLI's encoder handled the same value. Interior and trailing empties
    // are preserved: hoody-code proxies on this path and hoody-pipe keys channels by
    // it, so a doubled separator names a DIFFERENT target.
    let start = 0;
    while (start < segments.length && segments[start] === '')
        start++;
    return segments
        .slice(start)
        .map(segment => {
        let decoded = segment;
        try {
            decoded = decodeURIComponent(segment);
        }
        catch {
            // Malformed escape cannot decode to a dot segment.
        }
        if (segment === '.' || segment === '..' || decoded === '.' || decoded === '..') {
            throw new Error(`Invalid ${label}: "${path}" contains a "${segment}" path segment. ` +
                'Relative segments are not allowed because they change which endpoint is called.');
        }
        return encodeURIComponent(segment);
    })
        .join('/');
}
/**
 * `get` with the decoding forced: set AFTER the caller's options, so a
 * `responseType` or `rawResponse` slipped in (plain JS has no type check)
 * cannot hand back the envelope or another representation.
 */
function getRaw(service, method, path, responseType, options, templateVars) {
    if (typeof path !== 'string' || path === '') {
        throw new ValidationError(`files.${method}: path must be a non-empty string`, 'path');
    }
    return service.get(path, { ...options, responseType, rawResponse: true }, templateVars);
}
function describeValue(value) {
    if (value === null)
        return 'null';
    if (typeof value !== 'object')
        return typeof value;
    return value.constructor?.name ?? 'object';
}
async function getText(service, method, path, options, templateVars) {
    const body = await getRaw(service, method, path, 'text', options, templateVars);
    if (typeof body !== 'string') {
        throw new TypeError(`files.${method}(${path}): expected the file text, got ${describeValue(body)}`);
    }
    return body;
}
function readText(path, options, templateVars) {
    return getText(this, 'readText', path, options, templateVars);
}
async function readJson(path, options, templateVars) {
    const text = await getText(this, 'readJson', path, options, templateVars);
    try {
        return JSON.parse(text);
    }
    catch (err) {
        throw new SyntaxError(`files.readJson(${path}): the file is not valid JSON: ${err.message}`, { cause: err });
    }
}
async function readBytes(path, options, templateVars) {
    const body = await getRaw(this, 'readBytes', path, 'arrayBuffer', options, templateVars);
    // Brand checks, not instanceof: in a hoody-exec script the bytes may come
    // from another realm than this module's ArrayBuffer.
    if (Object.prototype.toString.call(body) === '[object ArrayBuffer]')
        return new Uint8Array(body);
    // A Buffer or another view (a transport or middleware that answers one):
    // the same bytes as a plain Uint8Array, so the result type never varies.
    if (ArrayBuffer.isView(body))
        return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    throw new TypeError(`files.readBytes(${path}): expected the file bytes, got ${describeValue(body)}`);
}
// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------
/** `exists` as a boolean over the generated HEAD call: 404 is the answer "no", not a failure. */
async function exists(path, options, templateVars) {
    try {
        await this.__exists(path, options, templateVars);
        return true;
    }
    catch (err) {
        if (isApiError(err) && err.status === 404)
            return false;
        throw err;
    }
}
// ---------------------------------------------------------------------------
// Prototype patching
// ---------------------------------------------------------------------------
function patchFilesService(proto, includeFilesKitHelpers) {
    if (proto[FILES_PATCH_MARKER])
        return;
    proto.classify = classifyFile;
    // Files-kit only: the URL and the JSON defaults below name files-kit routes.
    if (!includeFilesKitHelpers) {
        proto[FILES_PATCH_MARKER] = true;
        return;
    }
    proto.getUrl = function (absPath, options, templateVars) {
        const cleanPath = absPath.startsWith('/') ? absPath.slice(1) : absPath;
        const encoded = encodeFilePathSegments(cleanPath, 'file path');
        let requestUrl = this.buildTemplateUrl('/api/v1/files/{path}', templateVars || {});
        requestUrl = requestUrl.replace('{path}', () => encoded);
        if (options && 'download' in options) {
            requestUrl += (requestUrl.includes('?') ? '&' : '?') + 'download';
        }
        return requestUrl;
    };
    proto.getZipUrl = function (directory, templateVars) {
        if (!directory) {
            throw new Error('directory is required');
        }
        const cleanDir = directory.startsWith('/') ? directory.slice(1) : directory;
        const encoded = encodeFilePathSegments(cleanDir, 'directory');
        let requestUrl = this.buildTemplateUrl('/{directory}?zip', templateVars || {});
        requestUrl = requestUrl.replace('{directory}', () => encoded);
        return requestUrl;
    };
    // Inside a HoodyClient `ui` sits on the same `files` object (Object.assign in the client). A
    // FilesService built on its own (`hoody-sdk/files` subpath) has no `ui`, so `list` builds one from the
    // service's own transport, kit namespace and URL template, once per service.
    const standaloneUi = new WeakMap();
    proto.list = function (path, options, templateVars) {
        let ui = this.ui;
        if (!ui) {
            let own = standaloneUi.get(this);
            if (!own) {
                const self = this;
                own = new FilesUiService(self.http, self._kitNamespace, self.defaultUrlTemplateVariables, self.urlTemplatePattern);
                standaloneUi.set(this, own);
            }
            ui = own;
        }
        return ui.getPage(path, { ...(options ?? {}), json: '' }, templateVars);
    };
    proto.readText = readText;
    proto.readJson = readJson;
    proto.readBytes = readBytes;
    proto.exists = exists;
    {
        const origSearch = proto.search;
        if (typeof origSearch === 'function') {
            proto.search = function (...args) {
                const mutableArgs = [...args];
                const optionsIndex = 1;
                const options = (mutableArgs[optionsIndex] ?? {});
                if (!Object.prototype.hasOwnProperty.call(options, 'json')) {
                    mutableArgs[optionsIndex] = { ...options, json: '' };
                }
                return origSearch.apply(this, mutableArgs);
            };
        }
    }
    proto[FILES_PATCH_MARKER] = true;
}
function patchImagesService(proto) {
    if (proto[IMAGE_PATCH_MARKER])
        return;
    proto.getThumbnailUrl = function (imagePath, options, templateVars) {
        const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
        const encoded = encodeFilePathSegments(cleanPath, 'image path');
        let requestUrl = this.buildTemplateUrl('/{image}', templateVars || {});
        requestUrl = requestUrl.replace('{image}', () => encoded);
        const params = ['thumbnail'];
        if (options?.width !== undefined)
            params.push(`width=${options.width}`);
        if (options?.height !== undefined)
            params.push(`height=${options.height}`);
        if (options?.format !== undefined)
            params.push(`format=${encodeURIComponent(options.format)}`);
        if (options?.quality !== undefined)
            params.push(`quality=${encodeURIComponent(options.quality)}`);
        requestUrl += (requestUrl.includes('?') ? '&' : '?') + params.join('&');
        return requestUrl;
    };
    proto[IMAGE_PATCH_MARKER] = true;
}
// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export function patchFilesServiceExtensions() {
    patchFilesService(FilesService.prototype, true);
    patchFilesService(NotesFilesService.prototype, false);
    patchImagesService(ImagesService.prototype);
    patchNotesUploadExtensions();
}
// Auto-run on import (idempotent via Symbol.for guards)
patchFilesServiceExtensions();
