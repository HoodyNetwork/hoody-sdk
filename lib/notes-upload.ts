/**
 * Notes file upload — `box.notes.files.upload()` and friends.
 * Browser-safe (no Node imports). Maintained in lib/, not generated.
 *
 * A notes file is two things: a file node (createNode, type `file`, status
 * pending) and its bytes, sent over TUS 1.0.0 to
 * `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` (the hoody-notes
 * server's TUS upload route):
 *
 *   POST  (tusCreateUpload)  Tus-Resumable: 1.0.0, Upload-Length (must equal
 *                            the node's size), [Upload-Metadata] → 201; a
 *                            0-byte upload finishes here: 200 {uploadId}
 *   PATCH (tusUploadChunk)   Tus-Resumable, Upload-Offset, body typed
 *                            application/offset+octet-stream → 204 + Upload-Offset,
 *                            or 200 {uploadId} on the final chunk (file ready)
 *   HEAD  (uploads.getOffset) → Upload-Offset / Upload-Length. A finished
 *                            upload keeps answering offset == length.
 *   DELETE (uploads.cancel) abandons an unfinished upload
 *
 * Every error is a JSON NotesApiError, raised here as ApiError with its
 * `code`: file_already_uploaded (400, a create or chunk on a finished file),
 * file_upload_not_found (404/410), file_upload_offset_conflict (409),
 * file_size_mismatch (400 on create, 413), file_upload_unsupported (501),
 * file_upload_failed (5xx), file_upload_invalid_request (other 4xx). Only a
 * 409 is recovered here (re-read the offset with HEAD); when the server holds
 * every byte, one empty chunk at the end makes it record the upload (or says
 * it is recorded), and the file node confirms it; every other error surfaces
 * unchanged — no request is retried blindly.
 *
 * The server's Location header is not followed: every request goes to the
 * same URL, built from the service's template, and carries the caller's
 * identity the way every other kit request does (middleware / kitAuth). The
 * Location's `?username=&role=` query exists for tus-js-client, which does
 * follow it.
 *
 * The generated tus* methods cannot drive this: they return an ApiResponse
 * envelope that hides the Upload-Offset header, and the chunk body must carry
 * its own content type. So each TUS request goes through `http.stream()` —
 * the same seam the generated streaming methods use (injected fetch, request
 * middleware incl. kitAuth under the `notes` namespace, Authorization stripped
 * on kit URLs, non-2xx raised as ApiError) — and the offset is tracked here.
 * Chunk bodies are Blobs typed application/offset+octet-stream, because the
 * HTTP client drops its own Content-Type for a Blob and lets the Blob's type
 * go on the wire.
 */
import { FilesService as NotesFilesService } from '../generated/notes/files.service.js';

const TUS_VERSION = '1.0.0';
const CHUNK_TYPE = 'application/offset+octet-stream';
/** The notes web client's part size (hoody-notes core FILE_UPLOAD_PART_SIZE). */
export const NOTES_UPLOAD_CHUNK_BYTES = 20 * 1024 * 1024;
/**
 * 409 (offset mismatch) resyncs that find the server offset no further than
 * the furthest it has reported, allowed before giving up. Only a new furthest
 * offset (a lost chunk response, another caller uploading the same file, or
 * our own chunk landing) resets the count — so every run of requests is
 * bounded, even against a server whose offset moves backwards.
 */
const MAX_OFFSET_RESYNCS = 3;

export type NotesUploadData = Blob | ArrayBuffer | ArrayBufferView | string;

type TemplateVars = { projectId?: string; containerId?: string; serviceIndex?: string | number; server?: string };

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
    resumeUpload(notebookId: string, fileId: string, data: NotesUploadData, options?: NotesChunkOptions & { metadata?: Record<string, string> }, templateVars?: TemplateVars): Promise<NotesUploadResult>;
  }
}

interface StreamingHttp {
  stream(method: string, path: string, data?: Record<string, unknown>): Promise<Response>;
  post<T>(path: string, data?: Record<string, unknown>): Promise<T>;
  get<T>(path: string, data?: Record<string, unknown>): Promise<T>;
}

interface ServiceInternals {
  http: StreamingHttp;
  buildTemplateUrl(path: string, vars: Record<string, string | number | undefined>): string;
}

function toBlob(data: NotesUploadData, type: string): Blob {
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data;
  if (typeof data === 'string') return new Blob([data], { type });
  if (data instanceof ArrayBuffer) return new Blob([data], { type });
  if (ArrayBuffer.isView(data)) {
    return new Blob([new Uint8Array(data.buffer, data.byteOffset, data.byteLength) as BlobPart], { type });
  }
  throw new TypeError('notes upload: data must be a Blob, ArrayBuffer, typed array or string');
}

function randomHex22(): string {
  const bytes = new Uint8Array(11);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A notes file id: 22 lowercase hex + the File type suffix `18`. */
export function generateNotesFileId(): string {
  return `${randomHex22()}18`;
}

function generateVersionId(): string {
  return `${randomHex22()}03`;
}

function subtypeFor(mimeType: string): 'image' | 'video' | 'audio' | 'pdf' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('application/pdf')) return 'pdf';
  return 'other';
}

/** `.ext` when the name ends in one the notes schema accepts, else ''. */
function extensionOf(name: string): string {
  const m = /\.[A-Za-z0-9]{1,16}$/.exec(name);
  return m ? m[0] : '';
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function encodeTusMetadata(metadata: Record<string, string>): string {
  return Object.entries(metadata)
    .map(([k, v]) => {
      if (!/^[^\s,]+$/.test(k)) throw new Error(`notes upload: invalid Upload-Metadata key ${JSON.stringify(k)}`);
      return `${k} ${base64Utf8(v)}`;
    })
    .join(',');
}

function abortError(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const err = new Error('The upload was aborted');
  err.name = 'AbortError';
  return err;
}

function parseOffset(res: Response, header = 'Upload-Offset'): number | undefined {
  const raw = res.headers.get(header);
  if (raw === null || !/^\d+$/.test(raw.trim())) return undefined;
  return Number(raw.trim());
}

async function discard(res: Response): Promise<void> {
  try { await res.body?.cancel(); } catch { /* already closed */ }
}

/**
 * hoody-notes answers a create (POST) or a chunk (PATCH) on a finished file
 * with 400 `{ code: 'file_already_uploaded' }` (the server's uploads row has
 * `uploaded_at`). The other sign of a finished upload is a HEAD answering
 * Upload-Offset == Upload-Length (the TUS metadata is kept after the finish).
 * Neither says which bytes are there — the refusal is checked before the
 * size — so both lead to confirmFinishedUpload(), which reads the node.
 */
function isAlreadyUploaded(err: unknown): boolean {
  return statusOf(err) === 400 && (err as { code?: unknown } | null)?.code === 'file_already_uploaded';
}

/** Attach the file id to a thrown Error so a caller can resume or cancel. */
function withFileId(err: unknown, fileId: string): unknown {
  if (err instanceof Error && !('fileId' in err)) {
    try {
      Object.defineProperty(err, 'fileId', { value: fileId, enumerable: true, configurable: true });
    } catch { /* frozen error: the onFileId callback still has it */ }
  }
  return err;
}

/**
 * HEAD found no upload (yet, or any more) for this file: create one. A HEAD
 * response has no body, so a 404 cannot tell a missing upload from a missing
 * file node; the create then answers the latter with 404 file_not_found,
 * which surfaces.
 */
function isNoUpload(err: unknown): boolean {
  const status = statusOf(err);
  return status === 404 || status === 410;
}

/**
 * The server holds every byte: it reported offset == length (HEAD, or a
 * chunk response). Its finish step may still have failed — see
 * confirmFinished().
 */
const HELD = Symbol('notes-upload-held');
/** A create or chunk was refused as file_already_uploaded: the finish was recorded. */
const REFUSED = Symbol('notes-upload-refused');
type Finished = typeof HELD | typeof REFUSED;

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

class TusSession {
  constructor(
    private readonly svc: ServiceInternals,
    private readonly url: string,
  ) {}

  private send(method: string, headers: Record<string, string>, body?: Blob, signal?: AbortSignal): Promise<Response> {
    return this.svc.http.stream(method, this.url, {
      headers: { 'Tus-Resumable': TUS_VERSION, ...headers },
      ...(body !== undefined ? { body } : {}),
      ...(signal ? { signal } : {}),
      middlewareContext: { _kitNamespace: 'notes' },
    });
  }

  async create(size: number, metadata: Record<string, string> | undefined, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { 'Upload-Length': String(size) };
    if (metadata && Object.keys(metadata).length > 0) headers['Upload-Metadata'] = encodeTusMetadata(metadata);
    return this.send('POST', headers, undefined, signal);
  }

  async head(signal?: AbortSignal): Promise<{ offset: number; length: number | undefined }> {
    const res = await this.send('HEAD', {}, undefined, signal);
    await discard(res);
    const offset = parseOffset(res);
    if (offset === undefined) throw new Error('notes upload: the server did not report Upload-Offset');
    return { offset, length: parseOffset(res, 'Upload-Length') };
  }

  async cancel(signal?: AbortSignal): Promise<void> {
    await discard(await this.send('DELETE', {}, undefined, signal));
  }

  /**
   * One empty chunk at the end of a fully stored upload. @tus/server's
   * PatchHandler runs the finish step whenever the new offset equals the
   * length, so this re-runs a finish that failed or was interrupted after the
   * last byte was stored — whether the node is still pending or already
   * Ready — and records the upload (hoody-notes: one finish per file at a
   * time; a recorded upload is refused 400 file_already_uploaded). Returns the
   * uploadId of a 200.
   */
  async finishAgain(offset: number, signal?: AbortSignal): Promise<string | undefined> {
    const empty = new Blob([], { type: CHUNK_TYPE });
    return finalUploadId(await this.send('PATCH', { 'Upload-Offset': String(offset), 'Content-Type': CHUNK_TYPE }, empty, signal));
  }

  /**
   * PATCH from `offset` until the server reports the upload finished.
   * Returns the uploadId from the final chunk, HELD when the server reports
   * every byte stored without a final response, or REFUSED when a chunk is
   * refused as file_already_uploaded — the caller then confirms the file.
   * Never sends an empty chunk.
   */
  async sendFrom(offset: number, blob: Blob, opts: NotesChunkOptions): Promise<string | Finished> {
    const size = blob.size;
    const chunkSize = opts.chunkSize ?? NOTES_UPLOAD_CHUNK_BYTES;
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new Error('notes upload: chunkSize must be a positive integer');
    const { signal } = opts;
    let stalls = 0;
    let known = offset; // the furthest offset the server has reported
    for (;;) {
      if (signal?.aborted) throw abortError(signal);
      if (offset >= size) return HELD;
      const end = Math.min(offset + chunkSize, size);
      const chunk = new Blob([blob.slice(offset, end)], { type: CHUNK_TYPE });
      let res: Response;
      try {
        res = await this.send('PATCH', { 'Upload-Offset': String(offset), 'Content-Type': CHUNK_TYPE }, chunk, signal);
      } catch (err) {
        if (isAlreadyUploaded(err)) return REFUSED;
        if (statusOf(err) !== 409 || signal?.aborted) throw err;
        // The server holds a different number of bytes: an earlier chunk
        // landed but its response was lost, or another caller is uploading
        // the same file. Ask, and continue from there. The HEAD comes before
        // any give-up, so an upload finished meanwhile is still confirmed
        // (`known` < size here, so offset == length counts as progress and
        // the loop head returns HELD); only a resync that finds no progress
        // counts toward giving up.
        const server = (await this.head(signal)).offset;
        if (server > known) {
          known = server;
          stalls = 0;
        } else if (++stalls > MAX_OFFSET_RESYNCS) {
          throw err;
        }
        offset = server;
        continue;
      }
      if (res.status === 200) {
        const body = (await res.json().catch(() => ({}))) as { uploadId?: unknown };
        if (typeof body.uploadId !== 'string') throw new Error('notes upload: final chunk response has no uploadId');
        opts.onProgress?.({ offset: size, size });
        return body.uploadId;
      }
      await discard(res);
      const next = parseOffset(res) ?? end;
      if (next <= offset && end > offset) throw new Error(`notes upload: server offset did not advance (${next})`);
      offset = next;
      // Only a new furthest offset resets the stall count: a server whose
      // offset moves backwards would otherwise have a chunk re-sent forever
      // (chunk lands, 409, HEAD back at the start, chunk lands, …).
      if (next > known) {
        known = next;
        stalls = 0;
      }
      opts.onProgress?.({ offset, size });
      // offset >= size here: the loop head returns HELD rather than send an
      // empty chunk, and the caller confirms the file.
    }
  }
}

function tusSession(svc: ServiceInternals, notebookId: string, fileId: string, vars?: TemplateVars): TusSession {
  if (!notebookId) throw new Error('notes upload: notebookId is required');
  if (!fileId) throw new Error('notes upload: fileId is required');
  const url = svc.buildTemplateUrl(
    `/api/v1/notes/notebooks/${encodeURIComponent(notebookId)}/files/${encodeURIComponent(fileId)}/tus`,
    vars ?? {},
  );
  return new TusSession(svc, url);
}

/**
 * The uploadId of a 200 — the response that finishes an upload: the final
 * chunk, a zero-byte create, or finishAgain().
 */
async function finalUploadId(res: Response): Promise<string | undefined> {
  if (res.status !== 200) {
    await discard(res);
    return undefined;
  }
  const body = (await res.json().catch(() => ({}))) as { uploadId?: unknown };
  return typeof body.uploadId === 'string' ? body.uploadId : undefined;
}

async function uploadFile(
  this: ServiceInternals,
  notebookId: string,
  data: NotesUploadData,
  options: NotesUploadFileOptions,
  templateVars?: TemplateVars,
): Promise<NotesUploadFileResult> {
  if (!options?.parentId) throw new Error('notes upload: parentId is required');
  if (!options.name) throw new Error('notes upload: name is required');
  const blobType = typeof Blob !== 'undefined' && data instanceof Blob ? data.type : '';
  const mimeType = options.mimeType || blobType || 'application/octet-stream';
  const blob = toBlob(data, mimeType);
  const fileId = options.fileId ?? generateNotesFileId();
  options.onFileId?.(fileId);
  try {
    return await createAndUpload.call(this, notebookId, blob, mimeType, fileId, options, templateVars);
  } catch (err) {
    throw withFileId(err, fileId);
  }
}

async function createAndUpload(
  this: ServiceInternals,
  notebookId: string,
  blob: Blob,
  mimeType: string,
  fileId: string,
  options: NotesUploadFileOptions,
  templateVars?: TemplateVars,
): Promise<NotesUploadFileResult> {
  const { signal } = options;
  if (signal?.aborted) throw abortError(signal);

  const nodesUrl = this.buildTemplateUrl(`/api/v1/notes/notebooks/${encodeURIComponent(notebookId)}/nodes`, templateVars ?? {});
  const created = await this.http.post<{ data?: unknown }>(nodesUrl, {
    body: {
      id: fileId,
      type: 'file',
      parentId: options.parentId,
      attributes: {
        type: 'file',
        subtype: subtypeFor(mimeType),
        parentId: options.parentId,
        name: options.name,
        originalName: options.name,
        mimeType,
        extension: extensionOf(options.name),
        size: blob.size,
        version: generateVersionId(),
        status: 0,
      },
    },
    ...(signal ? { signal } : {}),
    retries: 0,
  });
  const node = (created as { data?: unknown } | undefined)?.data ?? created;

  const tus = tusSession(this, notebookId, fileId, templateVars);
  const createRes = await tus.create(blob.size, options.metadata, signal);
  const early = await finalUploadId(createRes);
  if (early) return { fileId, uploadId: early, size: blob.size, node, alreadyUploaded: false };
  const result = await sendAndConfirm(this, tus, notebookId, fileId, 0, blob, options, templateVars);
  return { ...result, node };
}

/** hoody-notes core FileStatus. */
const FILE_STATUS_PENDING = 0;
const FILE_STATUS_READY = 1;

/** An Error carrying the file id and a stable code, for recovery refusals. */
function uploadError(message: string, fileId: string, code: string): Error {
  const err = new Error(message) as Error & { code: string; fileId: string };
  err.code = code;
  err.fileId = fileId;
  return err;
}

interface FileNodeState { size: number; status: number; rawSize: unknown; rawStatus: unknown }

/**
 * Read the file node (getNode — attributes are spread onto the returned
 * object; a nested `attributes` is accepted too).
 */
async function readFileNode(
  svc: ServiceInternals,
  notebookId: string,
  fileId: string,
  signal: AbortSignal | undefined,
  templateVars: TemplateVars | undefined,
): Promise<FileNodeState> {
  const url = svc.buildTemplateUrl(
    `/api/v1/notes/notebooks/${encodeURIComponent(notebookId)}/nodes/${encodeURIComponent(fileId)}`,
    templateVars ?? {},
  );
  const res = await svc.http.get<{ data?: unknown }>(url, {
    ...(signal ? { signal } : {}),
    cache: false,
    retries: 0,
  });
  const node = ((res as { data?: unknown } | undefined)?.data ?? res) as Record<string, unknown> | null;
  const attrs = (node && typeof node.attributes === 'object' && node.attributes !== null
    ? node.attributes
    : node) as Record<string, unknown> | null;
  if (attrs?.type !== undefined && attrs.type !== 'file') {
    throw uploadError(`notes upload: node ${fileId} is not a file`, fileId, 'NOTES_UPLOAD_NOT_A_FILE');
  }
  return { size: Number(attrs?.size), status: Number(attrs?.status), rawSize: attrs?.size, rawStatus: attrs?.status };
}

function assertStoredSize(node: FileNodeState, fileId: string, blob: Blob): void {
  if (!Number.isFinite(node.size) || node.size !== blob.size) {
    throw uploadError(
      `notes upload: the upload of ${fileId} holds ${String(node.rawSize)} bytes, not the ${blob.size} being resumed — ` +
        'a finished upload cannot be overwritten; upload the new content under a new file id',
      fileId,
      'NOTES_UPLOAD_SIZE_MISMATCH',
    );
  }
}

/**
 * The server holds every byte (`how`: HELD) or refused a request as
 * file_already_uploaded (REFUSED). Neither says WHICH bytes are there — the
 * refusal is checked before the size — so read the node and accept only a
 * Ready file whose size is the size being resumed, reporting the server's
 * size. The server keeps no hash: same-size different bytes pass.
 *
 * HELD: the bytes are stored, but neither the node nor the HEAD says whether
 * the upload is RECORDED (uploaded_at) — and only a recorded file is listed,
 * downloadable, and kept by the server's cleanup. hoody-notes' finish marks
 * the node Ready and then records the upload, one finish per file at a time;
 * a failure or crash in between leaves a pending node, or a Ready node with
 * nothing recorded (a node's status can also be set by an editor). An empty
 * PATCH at offset == length runs the finish again: 200 {uploadId} when it
 * records the upload now, 400 file_already_uploaded when it was recorded
 * already. So HELD always sends exactly one (node Pending or Ready), then
 * re-reads the node. Status Error is reported, never finished.
 *
 * REFUSED: the upload is recorded, so an empty chunk would only be refused
 * again. A node that is not Ready there (an editor reset its status) is
 * reported, not retried.
 */
async function confirmFinished(
  svc: ServiceInternals,
  tus: TusSession,
  notebookId: string,
  fileId: string,
  blob: Blob,
  how: Finished,
  options: NotesChunkOptions,
  templateVars: TemplateVars | undefined,
): Promise<NotesUploadResult> {
  const { signal } = options;
  let node = await readFileNode(svc, notebookId, fileId, signal, templateVars);
  assertStoredSize(node, fileId, blob);
  let uploadId: string | undefined;
  let refinished = false;
  if (how === HELD && (node.status === FILE_STATUS_PENDING || node.status === FILE_STATUS_READY)) {
    refinished = true;
    try {
      uploadId = await tus.finishAgain(blob.size, signal);
    } catch (err) {
      // 400 file_already_uploaded: the upload is recorded (by an earlier
      // finish, or another caller's). Any other error — including another
      // 400 — surfaces.
      if (!isAlreadyUploaded(err)) throw err;
    }
    node = await readFileNode(svc, notebookId, fileId, signal, templateVars);
  }
  if (node.status !== FILE_STATUS_READY) {
    const state = `status ${String(node.rawStatus)}`;
    const message = refinished
      ? `notes upload: the server holds every byte of ${fileId}, but running its finish step again left the file not ready (${state})`
      : how === REFUSED
        ? `notes upload: the server refused ${fileId} as already uploaded, but the file is not ready (${state})`
        : `notes upload: the server holds every byte of ${fileId}, but the file is not ready (${state})`;
    throw uploadError(message, fileId, 'NOTES_UPLOAD_NOT_READY');
  }
  options.onProgress?.({ offset: node.size, size: node.size });
  return uploadId !== undefined
    ? { fileId, uploadId, size: node.size, alreadyUploaded: false }
    : { fileId, uploadId: undefined, size: node.size, alreadyUploaded: true };
}

/** Run sendFrom; a finished outcome is confirmed against the node. */
async function sendAndConfirm(
  svc: ServiceInternals,
  tus: TusSession,
  notebookId: string,
  fileId: string,
  offset: number,
  blob: Blob,
  options: NotesChunkOptions,
  templateVars: TemplateVars | undefined,
): Promise<NotesUploadResult> {
  const outcome = await tus.sendFrom(offset, blob, options);
  if (typeof outcome === 'string') return { fileId, uploadId: outcome, size: blob.size, alreadyUploaded: false };
  return confirmFinished(svc, tus, notebookId, fileId, blob, outcome, options, templateVars);
}

async function resumeUpload(
  this: ServiceInternals,
  notebookId: string,
  fileId: string,
  data: NotesUploadData,
  options: NotesChunkOptions & { metadata?: Record<string, string> } = {},
  templateVars?: TemplateVars,
): Promise<NotesUploadResult> {
  const blob = toBlob(data, 'application/octet-stream');
  const tus = tusSession(this, notebookId, fileId, templateVars);
  let offset: number;
  try {
    const status = await tus.head(options.signal);
    offset = status.offset;
    // A finished upload keeps answering offset == length. Confirm it against
    // the node (Ready, same size) instead of sending bytes — the length
    // check below would otherwise misreport a finished file of another size.
    if (status.length !== undefined ? offset >= status.length : offset >= blob.size) {
      return await confirmFinished(this, tus, notebookId, fileId, blob, HELD, options, templateVars);
    }
    // The length was fixed when the upload was created. A different blob
    // would otherwise fail late (a server refusal, or "every byte was sent")
    // after sending bytes that can never complete this upload.
    if (status.length !== undefined && status.length !== blob.size) {
      throw uploadError(
        `notes upload: the server's upload for ${fileId} is ${status.length} bytes long, but ${blob.size} bytes were given to resume it`,
        fileId,
        'NOTES_UPLOAD_LENGTH_MISMATCH',
      );
    }
  } catch (err) {
    if (!isNoUpload(err)) throw err;
    let createRes: Response;
    try {
      createRes = await tus.create(blob.size, options.metadata, options.signal);
    } catch (createErr) {
      if (isAlreadyUploaded(createErr)) {
        return confirmFinished(this, tus, notebookId, fileId, blob, REFUSED, options, templateVars);
      }
      throw createErr;
    }
    const early = await finalUploadId(createRes);
    if (early) return { fileId, uploadId: early, size: blob.size, alreadyUploaded: false };
    offset = 0;
  }
  if (offset > blob.size) throw new Error(`notes upload: server holds ${offset} bytes, more than the ${blob.size} given`);
  return sendAndConfirm(this, tus, notebookId, fileId, offset, blob, options, templateVars);
}

const PATCHED = Symbol.for('hoody.notes-upload.patched');

export function patchNotesUploadExtensions(): void {
  const proto = NotesFilesService.prototype as unknown as Record<string | symbol, unknown>;
  if (proto[PATCHED]) return;
  proto[PATCHED] = true;
  proto.upload = uploadFile;
  proto.resumeUpload = resumeUpload;
}

patchNotesUploadExtensions();
