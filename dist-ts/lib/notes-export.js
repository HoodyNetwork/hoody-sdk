/**
 * Notes ZIP export: `box.notes.notebooks.exportStream()`.
 * Browser-safe (no Node imports). Maintained in lib/, not generated.
 *
 * `GET /api/v1/notes/notebooks/{notebookId}/export` (the notes
 * kit) answers a
 * streamed `application/zip` (200), or `204` for `dryRun: true`. The
 * generated `export()` returns an ApiResponse envelope that buffers the whole
 * archive; this helper hands back the raw Response so the caller reads
 * `response.body` incrementally.
 *
 * The request goes through `http.stream()`, the seam the TUS upload helpers
 * use: injected fetch, request middleware incl. kitAuth under the `notes`
 * namespace, and a non-2xx raised as ApiError with the server's `code`
 * (export_unsupported_scope 400, notebook_no_access 403, not_found 404,
 * export_too_large 422, export_busy 429). After the first byte the server
 * can only cut the connection, so a failure mid-stream rejects a pending
 * read and the archive is incomplete.
 */
import { ValidationError } from '../generated/errors.js';
import { NotebooksService } from '../generated/notes/notebooks.service.js';
/** The query in the server's string form; only keys the caller set. */
function wireQuery(query) {
    const out = {};
    if (query.nodeId !== undefined)
        out.nodeId = query.nodeId;
    if (query.format !== undefined)
        out.format = query.format;
    if (query.attachments !== undefined)
        out.attachments = query.attachments ? 'true' : 'false';
    if (query.comments !== undefined)
        out.comments = query.comments;
    if (query.themeMode !== undefined)
        out.themeMode = query.themeMode;
    if (query.dryRun !== undefined)
        out.dryRun = query.dryRun ? 'true' : 'false';
    return out;
}
/**
 * Start a notebook export and return the raw streaming `Response` (the caller reads or saves the body). `query`
 * carries only the settings the caller set. Throws a ValidationError, before any request, when `notebookId` is
 * empty or a `.` / `..` path segment.
 */
export async function exportStream(svc, notebookId, query = {}, templateVars, options = {}) {
    if (!notebookId)
        throw new ValidationError('notebookId is required', 'notebookId');
    let decoded = notebookId;
    try {
        decoded = decodeURIComponent(notebookId);
    }
    catch { /* malformed escape cannot decode to a dot segment */ }
    if (notebookId === '.' || notebookId === '..' || decoded === '.' || decoded === '..') {
        throw new ValidationError('notebookId must not be a "." or ".." path segment', 'notebookId');
    }
    const url = svc.buildTemplateUrl(`/api/v1/notes/notebooks/${encodeURIComponent(notebookId)}/export`, templateVars ?? {});
    return svc.http.stream('GET', url, {
        query: wireQuery(query),
        ...(options.headers ? { headers: options.headers } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        middlewareContext: { _kitNamespace: 'notes' },
    });
}
function exportStreamMethod(notebookId, query, templateVars, options) {
    return exportStream(this, notebookId, query, templateVars, options);
}
const PATCHED = Symbol.for('hoody.notes-export.patched');
/** Install `exportStream()` on the notebooks service. Runs once when this module loads; a second call does nothing. */
export function patchNotesExportExtensions() {
    const proto = NotebooksService.prototype;
    if (proto[PATCHED])
        return;
    proto[PATCHED] = true;
    proto.exportStream = exportStreamMethod;
}
patchNotesExportExtensions();
