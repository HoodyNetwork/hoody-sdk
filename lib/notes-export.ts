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

type TemplateVars = { projectId?: string; computerId?: string; serviceIndex?: string | number; server?: string };

export interface NotesExportQuery {
  /** Section, folder, page or database to export; the whole notebook when omitted. */
  nodeId?: string;
  /** Default `md`. */
  format?: 'md' | 'html';
  /** Include file attachments (default true). */
  attachments?: boolean;
  /** Default `none`; `appendix` adds each page's comment threads. */
  comments?: 'none' | 'appendix';
  /** HTML only (default `light`). */
  themeMode?: 'light' | 'dark';
  /** Scope checks and planning limits only: `204` with no body, or the error planning gives. A later download can still be cut off. */
  dryRun?: boolean;
}

export interface NotesExportOptions {
  /** Aborts the request, or the body read once headers arrived. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

declare module '../generated/notes/notebooks.service.js' {
  interface NotebooksService {
    /**
     * Start a ZIP export and return the raw Response (body unread).
     * 200: `application/zip` stream with a `Content-Disposition` filename.
     * 204: dry run passed planning. Any other status rejects with ApiError.
     */
    exportStream(notebookId: string, query?: NotesExportQuery, templateVars?: TemplateVars, options?: NotesExportOptions): Promise<Response>;
  }
}

interface StreamingHttp {
  stream(method: string, path: string, data?: Record<string, unknown>): Promise<Response>;
}

interface ServiceInternals {
  http: StreamingHttp;
  buildTemplateUrl(path: string, vars: Record<string, string | number | undefined>): string;
}

/** The query in the server's string form; only keys the caller set. */
function wireQuery(query: NotesExportQuery): Record<string, string> {
  const out: Record<string, string> = {};
  if (query.nodeId !== undefined) out.nodeId = query.nodeId;
  if (query.format !== undefined) out.format = query.format;
  if (query.attachments !== undefined) out.attachments = query.attachments ? 'true' : 'false';
  if (query.comments !== undefined) out.comments = query.comments;
  if (query.themeMode !== undefined) out.themeMode = query.themeMode;
  if (query.dryRun !== undefined) out.dryRun = query.dryRun ? 'true' : 'false';
  return out;
}

/**
 * Start a notebook export and return the raw streaming `Response` (the caller reads or saves the body). `query`
 * carries only the settings the caller set. Throws a ValidationError, before any request, when `notebookId` is
 * empty or a `.` / `..` path segment.
 */
export async function exportStream(
  svc: ServiceInternals,
  notebookId: string,
  query: NotesExportQuery = {},
  templateVars?: TemplateVars,
  options: NotesExportOptions = {},
): Promise<Response> {
  if (!notebookId) throw new ValidationError('notebookId is required', 'notebookId');
  let decoded = notebookId;
  try { decoded = decodeURIComponent(notebookId); } catch { /* malformed escape cannot decode to a dot segment */ }
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

function exportStreamMethod(
  this: ServiceInternals,
  notebookId: string,
  query?: NotesExportQuery,
  templateVars?: TemplateVars,
  options?: NotesExportOptions,
): Promise<Response> {
  return exportStream(this, notebookId, query, templateVars, options);
}

const PATCHED = Symbol.for('hoody.notes-export.patched');

/** Install `exportStream()` on the notebooks service. Runs once when this module loads; a second call does nothing. */
export function patchNotesExportExtensions(): void {
  const proto = NotebooksService.prototype as unknown as Record<string | symbol, unknown>;
  if (proto[PATCHED]) return;
  proto[PATCHED] = true;
  proto.exportStream = exportStreamMethod;
}

patchNotesExportExtensions();
