type TemplateVars = {
    projectId?: string;
    computerId?: string;
    serviceIndex?: string | number;
    server?: string;
};
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
/**
 * Start a notebook export and return the raw streaming `Response` (the caller reads or saves the body). `query`
 * carries only the settings the caller set. Throws a ValidationError, before any request, when `notebookId` is
 * empty or a `.` / `..` path segment.
 */
export declare function exportStream(svc: ServiceInternals, notebookId: string, query?: NotesExportQuery, templateVars?: TemplateVars, options?: NotesExportOptions): Promise<Response>;
/** Install `exportStream()` on the notebooks service. Runs once when this module loads; a second call does nothing. */
export declare function patchNotesExportExtensions(): void;
export {};
