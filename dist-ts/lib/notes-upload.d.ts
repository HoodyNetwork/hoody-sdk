/** The notes web client's part size (hoody-notes core FILE_UPLOAD_PART_SIZE). */
export declare const NOTES_UPLOAD_CHUNK_BYTES: number;
export type NotesUploadData = Blob | ArrayBuffer | ArrayBufferView | string;
type TemplateVars = {
    projectId?: string;
    containerId?: string;
    serviceIndex?: string | number;
    server?: string;
};
export interface NotesUploadProgress {
    /** Bytes the server holds. */
    offset: number;
    /** Total bytes. */
    size: number;
}
export interface NotesChunkOptions {
    /** Bytes per PATCH (default 20 MiB). */
    chunkSize?: number;
    /** Stops before the next chunk and aborts the one in flight. */
    signal?: AbortSignal;
    onProgress?: (progress: NotesUploadProgress) => void;
}
export interface NotesUploadFileOptions extends NotesChunkOptions {
    /** Node the file is created under (section, page, message, …). */
    parentId: string;
    /** File name shown in the notebook; its extension becomes the node's extension. */
    name: string;
    /** Default: the Blob's type, else application/octet-stream. */
    mimeType?: string;
    /** File node id (22 hex + `18`); generated when omitted. */
    fileId?: string;
    /** TUS Upload-Metadata pairs; values are base64-encoded for you. */
    metadata?: Record<string, string>;
    /**
     * Called with the file id before anything is sent, so a caller holds the
     * handle `resumeUpload()` / `uploads.cancel()` need even if the upload fails
     * (the id is also set as `fileId` on a thrown Error).
     */
    onFileId?: (fileId: string) => void;
}
export interface NotesUploadResult {
    fileId: string;
    /**
     * Upload id the server returns with the final chunk. Undefined only when
     * `alreadyUploaded` is true: that response was lost, and the server does
     * not report the id again.
     */
    uploadId: string | undefined;
    size: number;
    /**
     * True when the server had already recorded the upload and the file node
     * was confirmed Ready at the given size — the final chunk's response was
     * lost, or another caller finished the same file. The file is ready.
     */
    alreadyUploaded: boolean;
}
export interface NotesUploadFileResult extends NotesUploadResult {
    /** The created file node, as createNode returned it. */
    node: unknown;
}
declare module '../generated/notes/files.service.js' {
    interface FilesService {
        /**
         * Create a file node under `parentId` and upload its bytes over TUS.
         * Resolves when the final chunk marks the file ready. If it rejects after
         * the node exists (network loss, abort), call `resumeUpload()` with the
         * same fileId (from `onFileId`, or `err.fileId`) and bytes, or
         * `uploads.cancel()`. Resolves with `alreadyUploaded: true` only when
         * another caller finished the same file id meanwhile.
         */
        upload(notebookId: string, data: NotesUploadData, options: NotesUploadFileOptions, templateVars?: TemplateVars): Promise<NotesUploadFileResult>;
        /**
         * Continue an interrupted upload with the same bytes, from the offset the
         * server reports (`uploads.getOffset`).
         *
         * - No upload on the server (HEAD 404/410): creates one and sends every
         *   byte. A missing file node surfaces from that create (404
         *   file_not_found).
         * - The server holds every byte (HEAD offset == length): sends one empty
         *   chunk, which runs the server's finish step again if it failed or was
         *   interrupted (200: resolves with its uploadId) or is refused because
         *   the upload is already recorded (resolves with `alreadyUploaded:
         *   true`); either way the file node must then be Ready at the size given.
         * - A create or chunk refused as file_already_uploaded: reads the file
         *   node and resolves with `alreadyUploaded: true` when it is Ready at the
         *   size given.
         * - 409 file_upload_offset_conflict: re-reads the offset and continues;
         *   gives up only after repeated conflicts that show no progress.
         *
         * Rejects with an Error carrying `code` and `fileId`:
         * NOTES_UPLOAD_LENGTH_MISMATCH (the unfinished upload has another length;
         * nothing is sent), NOTES_UPLOAD_SIZE_MISMATCH (the stored file has
         * another size), NOTES_UPLOAD_NOT_READY (the file did not become Ready),
         * NOTES_UPLOAD_NOT_A_FILE. Server errors surface as ApiError with the
         * notes `code` (file_not_found, file_upload_offset_conflict,
         * file_size_mismatch, file_upload_unsupported, file_upload_failed,
         * file_upload_invalid_request, …); none is retried.
         *
         * The server keeps no hash of the bytes: resuming a FINISHED file with
         * different bytes of the same size resolves with `alreadyUploaded: true`
         * and leaves the stored bytes unchanged.
         */
        resumeUpload(notebookId: string, fileId: string, data: NotesUploadData, options?: NotesChunkOptions & {
            metadata?: Record<string, string>;
        }, templateVars?: TemplateVars): Promise<NotesUploadResult>;
    }
}
/** A notes file id: 22 lowercase hex + the File type suffix `18`. */
export declare function generateNotesFileId(): string;
export declare function encodeTusMetadata(metadata: Record<string, string>): string;
export declare function patchNotesUploadExtensions(): void;
export {};
