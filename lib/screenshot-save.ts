/**
 * Screenshot save — capture + save to container filesystem in one call.
 *
 * Architecture:
 *   This module extends HoodyClient with four convenience methods:
 *
 *   - `saveScreenshot(options)` — generic: specify source + options
 *   - `saveDisplayScreenshot(path?, options?)` — capture display + save
 *   - `saveBrowserScreenshot(path?, options?)` — capture browser + save
 *   - `saveTerminalScreenshot(path?, options?)` — capture terminal + save
 *
 *   All methods require a container-scoped client (via `withContainer()`).
 *   They compose: capture API call → decode → validate → putFile → chmod.
 *
 *   Data flow:
 *     Display:  captureScreenshot({base64:true}) → Buffer.from(base64)
 *     Browser:  takeScreenshot({format})                → Buffer.from(base64)
 *     Terminal: captureTerminalScreenshot({save:false})  → Buffer.from(arrayBuffer)
 *
 *   Path validation (17 checks):
 *     typeof, mutual exclusivity, raw length, NFKC, '..' pre/post normalize,
 *     absolute, null, control, invisible, URL-reserved, dangerous, trailing dots,
 *     component length, empty basename, recheck after extension, recheck total.
 *
 */

import { posix as pathPosix } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HoodyClient } from './hoody-client.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SCREENSHOT_DIR = '/hoody/storage/hoody-sdk/screenshots';
const MAX_SCREENSHOT_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PATH_BYTES = 4096;
const MAX_COMPONENT_LENGTH = 255;

/** PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JPEG magic bytes: FF D8 */
const JPEG_MAGIC = [0xff, 0xd8];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScreenshotSource = 'display' | 'browser' | 'terminal';
export type ScreenshotFormat = 'png' | 'jpeg';

export interface SaveScreenshotOptions {
  /** Which kit to capture from */
  source: ScreenshotSource;
  /** Full file path (mutually exclusive with dir) */
  path?: string;
  /** Directory only — filename auto-generated (mutually exclusive with path) */
  dir?: string;
  /** Image format. Display always produces png. Default: 'png'. */
  format?: ScreenshotFormat;
  /** Display-specific capture options */
  displayOptions?: DisplayScreenshotCaptureOptions;
  /** Browser-specific capture options */
  browserOptions?: BrowserScreenshotCaptureOptions;
  /** Terminal-specific capture options */
  terminalOptions?: TerminalScreenshotCaptureOptions;
}

export interface DisplayScreenshotCaptureOptions {
  displayId?: number;
}

export interface BrowserScreenshotCaptureOptions {
  browser_id?: string;
  url?: string;
  tabId?: number;
  fullPage?: boolean;
  quality?: number;
}

export interface TerminalScreenshotCaptureOptions {
  terminal_id?: string;
  foreground?: string;
  background?: string;
  fontsize?: number;
}

export interface SaveScreenshotResult {
  /** Final absolute path where the screenshot was saved */
  path: string;
  /** File size in bytes */
  size: number;
  /** ISO 8601 timestamp of capture */
  timestamp: string;
  /** Which source the screenshot came from */
  source: ScreenshotSource;
  /** Actual image format written */
  format: ScreenshotFormat;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export type ScreenshotSaveErrorCode =
  | 'CAPTURE_FAILED'
  | 'WRITE_FAILED'
  | 'UNSUPPORTED_ENV'
  | 'INVALID_PATH'
  | 'FORMAT_MISMATCH'
  | 'INVALID_IMAGE_DATA'
  | 'PAYLOAD_TOO_LARGE';

export class ScreenshotSaveError extends Error {
  readonly code: ScreenshotSaveErrorCode;
  readonly source: ScreenshotSource | undefined;
  readonly path: string | undefined;
  override readonly cause: Error | undefined;

  constructor(
    code: ScreenshotSaveErrorCode,
    message: string,
    details?: { source?: ScreenshotSource; path?: string; cause?: Error },
  ) {
    super(message);
    this.name = 'ScreenshotSaveError';
    this.code = code;
    this.source = details?.source;
    this.path = details?.path;
    this.cause = details?.cause;
  }
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

/**
 * Characters forbidden in screenshot paths.
 *
 * Control: 0x00-0x1F, 0x7F
 * Invisible/spoofing: bidi, zero-width, BOM, soft hyphen, word joiner
 * URL-reserved: ? # %
 * Dangerous: \ : * < > | "
 */
const CONTROL_RE = /[\x00-\x1f\x7f]/;
const INVISIBLE_RE =
  /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u200b-\u200d\ufeff\u00ad\u2060]/;
const URL_RESERVED_RE = /[?#%]/;
const DANGEROUS_RE = /[\\:*<>|"]/;

function rejectChars(value: string, label: string): void {
  if (CONTROL_RE.test(value)) {
    throw new ScreenshotSaveError('INVALID_PATH', `${label} contains control characters`);
  }
  if (INVISIBLE_RE.test(value)) {
    throw new ScreenshotSaveError('INVALID_PATH', `${label} contains invisible/spoofing characters`);
  }
  if (URL_RESERVED_RE.test(value)) {
    throw new ScreenshotSaveError('INVALID_PATH', `${label} contains URL-reserved characters (? # %)`);
  }
  if (DANGEROUS_RE.test(value)) {
    throw new ScreenshotSaveError('INVALID_PATH', `${label} contains dangerous characters (\\ : * < > | ")`);
  }
}

function rejectTraversalSegments(segments: string[], label: string): void {
  for (const seg of segments) {
    if (seg === '..') {
      throw new ScreenshotSaveError('INVALID_PATH', `${label} contains ".." path traversal`);
    }
  }
}

function rejectTrailingDots(segments: string[], label: string): void {
  for (const seg of segments) {
    if (seg.length > 0 && seg.endsWith('.')) {
      throw new ScreenshotSaveError('INVALID_PATH', `${label} contains a segment ending with "."`);
    }
  }
}

function checkComponentLengths(segments: string[], label: string): void {
  for (const seg of segments) {
    if (Buffer.byteLength(seg, 'utf8') > MAX_COMPONENT_LENGTH) {
      throw new ScreenshotSaveError('INVALID_PATH', `${label} has a component exceeding ${MAX_COMPONENT_LENGTH} bytes`);
    }
  }
}

/**
 * Validate and normalize a screenshot destination path.
 *
 * 17 checks, all POSIX. Returns the normalized absolute path.
 */
function validateScreenshotPath(raw: string, label: string): string {
  // 0. Type check
  if (typeof raw !== 'string') {
    throw new ScreenshotSaveError('INVALID_PATH', `${label} must be a string`);
  }

  // 2. Raw byte-length check BEFORE any processing
  if (Buffer.byteLength(raw, 'utf8') > MAX_PATH_BYTES) {
    throw new ScreenshotSaveError('INVALID_PATH', `${label} exceeds ${MAX_PATH_BYTES} byte limit`);
  }

  // 3. Unicode NFKC normalization (converts fullwidth chars to ASCII)
  let normalized = raw.normalize('NFKC');

  // 4. Reject raw '..' segments BEFORE posix normalization
  const rawSegments = normalized.split('/');
  rejectTraversalSegments(rawSegments, label);

  // 5. path.posix.normalize()
  normalized = pathPosix.normalize(normalized);

  // 6. Re-check '..' after posix normalization (belt & suspenders)
  const normalizedSegments = normalized.split('/').filter(Boolean);
  rejectTraversalSegments(normalizedSegments, label);

  // 7. Must start with /
  if (!normalized.startsWith('/')) {
    throw new ScreenshotSaveError('INVALID_PATH', `${label} must be an absolute path`);
  }

  // 8-12. Character class rejections
  rejectChars(normalized, label);

  // 13. Reject trailing dots on segments
  rejectTrailingDots(normalizedSegments, label);

  // 14. Component length check
  checkComponentLengths(normalizedSegments, label);

  // 15. Reject empty basename (trailing /)
  const basename = pathPosix.basename(normalized);
  if (!basename) {
    throw new ScreenshotSaveError('INVALID_PATH', `${label} has empty basename (trailing slash)`);
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Extension / format helpers
// ---------------------------------------------------------------------------

const VALID_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

function extToFormat(ext: string): ScreenshotFormat {
  const lower = ext.toLowerCase();
  if (lower === '.png') return 'png';
  if (lower === '.jpg' || lower === '.jpeg') return 'jpeg';
  throw new ScreenshotSaveError('INVALID_PATH', `Unsupported extension "${ext}". Allowed: .png, .jpg, .jpeg`);
}

function formatToExt(format: ScreenshotFormat): string {
  return format === 'png' ? '.png' : '.jpeg';
}

/**
 * Resolve the target path and format from user inputs.
 *
 * Rules:
 *   - No path → default dir + auto-generated filename
 *   - Bare filename (no dir component or just /filename) → default dir + filename
 *   - Full absolute path → use as-is
 *   - Extension must match format; if both given, must agree
 *   - Display source only supports png
 */
function resolvePathAndFormat(
  source: ScreenshotSource,
  userPath?: string,
  userDir?: string,
  userFormat?: ScreenshotFormat,
): { resolvedPath: string; resolvedFormat: ScreenshotFormat; needsMkdir: boolean; mkdirPath: string } {
  // 1. Mutual exclusivity
  if (userPath !== undefined && userDir !== undefined) {
    throw new ScreenshotSaveError('INVALID_PATH', 'path and dir are mutually exclusive');
  }

  // Display only supports png
  if (source === 'display' && userFormat === 'jpeg') {
    throw new ScreenshotSaveError(
      'FORMAT_MISMATCH',
      'Display screenshots only support PNG format',
      { source },
    );
  }

  let resolvedFormat: ScreenshotFormat = userFormat ?? 'png';
  let resolvedPath: string;
  let needsMkdir = false;
  let mkdirPath = DEFAULT_SCREENSHOT_DIR;

  if (userPath !== undefined) {
    if (typeof userPath !== 'string') {
      throw new ScreenshotSaveError('INVALID_PATH', 'path must be a string');
    }

    const trimmed = userPath.trim();
    if (!trimmed) {
      throw new ScreenshotSaveError('INVALID_PATH', 'path must not be empty');
    }

    // Reject trailing slash (directory-like path)
    if (trimmed.endsWith('/')) {
      throw new ScreenshotSaveError('INVALID_PATH', 'path must not end with "/" (looks like a directory, not a file)');
    }

    // Check if it's a bare filename (no real directory component)
    // "foo.png", "/foo.png" → place in default dir
    // "/some/dir/foo.png" → use as-is
    const dir = pathPosix.dirname(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
    const isBareFilename = dir === '/' || dir === '.';

    if (isBareFilename) {
      // Place in default screenshots directory
      const filename = pathPosix.basename(trimmed);
      if (!filename || filename === '.' || filename === '/') {
        throw new ScreenshotSaveError('INVALID_PATH', 'path has no filename');
      }
      resolvedPath = `${DEFAULT_SCREENSHOT_DIR}/${filename}`;
      needsMkdir = true;
    } else {
      resolvedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
      // For user-provided full paths, don't auto-create dirs
      needsMkdir = false;
    }

    // Handle extension
    const ext = pathPosix.extname(resolvedPath).toLowerCase();
    if (ext && VALID_EXTENSIONS.has(ext)) {
      const pathFormat = extToFormat(ext);
      // If user also specified format, must agree
      if (userFormat !== undefined && userFormat !== pathFormat) {
        throw new ScreenshotSaveError(
          'FORMAT_MISMATCH',
          `Path extension "${ext}" does not match format "${userFormat}"`,
          { source },
        );
      }
      resolvedFormat = pathFormat;
      // Display check again with derived format
      if (source === 'display' && resolvedFormat === 'jpeg') {
        throw new ScreenshotSaveError(
          'FORMAT_MISMATCH',
          'Display screenshots only support PNG format. Cannot save as .jpg/.jpeg.',
          { source },
        );
      }
    } else if (!ext) {
      // No extension: append based on format
      resolvedPath += formatToExt(resolvedFormat);
    } else {
      // Has extension but not valid
      throw new ScreenshotSaveError('INVALID_PATH', `Unsupported extension "${ext}". Allowed: .png, .jpg, .jpeg`);
    }
  } else if (userDir !== undefined) {
    if (typeof userDir !== 'string') {
      throw new ScreenshotSaveError('INVALID_PATH', 'dir must be a string');
    }
    if (!userDir.trim()) {
      throw new ScreenshotSaveError('INVALID_PATH', 'dir must not be empty');
    }
    const dir = userDir.trim().startsWith('/') ? userDir.trim() : `/${userDir.trim()}`;
    mkdirPath = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    const filename = generateFilename(source, resolvedFormat);
    resolvedPath = `${mkdirPath}/${filename}`;
    needsMkdir = true;
  } else {
    // No path, no dir → default
    const filename = generateFilename(source, resolvedFormat);
    resolvedPath = `${DEFAULT_SCREENSHOT_DIR}/${filename}`;
    needsMkdir = true;
  }

  // Validate the resolved path (17 checks)
  resolvedPath = validateScreenshotPath(resolvedPath, 'Screenshot path');

  // 16-17. Recheck total path length after construction
  if (Buffer.byteLength(resolvedPath, 'utf8') > MAX_PATH_BYTES) {
    throw new ScreenshotSaveError('INVALID_PATH', `Final path exceeds ${MAX_PATH_BYTES} byte limit`);
  }

  return { resolvedPath, resolvedFormat, needsMkdir, mkdirPath };
}

function generateFilename(source: ScreenshotSource, format: ScreenshotFormat): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '');
  const uuid = randomUUID();
  return `${source}-${dateStr}-${uuid}${formatToExt(format)}`;
}

// ---------------------------------------------------------------------------
// Magic byte validation
// ---------------------------------------------------------------------------

function validateMagicBytes(buffer: Buffer, format: ScreenshotFormat): void {
  if (format === 'png') {
    if (buffer.length < PNG_MAGIC.length) {
      throw new ScreenshotSaveError('INVALID_IMAGE_DATA', 'Buffer too small to be a valid PNG');
    }
    for (let i = 0; i < PNG_MAGIC.length; i++) {
      if (buffer[i] !== PNG_MAGIC[i]) {
        throw new ScreenshotSaveError('INVALID_IMAGE_DATA', 'Buffer does not contain valid PNG data (magic bytes mismatch)');
      }
    }
  } else {
    if (buffer.length < JPEG_MAGIC.length) {
      throw new ScreenshotSaveError('INVALID_IMAGE_DATA', 'Buffer too small to be a valid JPEG');
    }
    for (let i = 0; i < JPEG_MAGIC.length; i++) {
      if (buffer[i] !== JPEG_MAGIC[i]) {
        throw new ScreenshotSaveError('INVALID_IMAGE_DATA', 'Buffer does not contain valid JPEG data (magic bytes mismatch)');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Container-scoped assertion
// ---------------------------------------------------------------------------

function assertContainerScoped(client: HoodyClient): void {
  const c = client as any;
  const hasTemplates = c.urlTemplates && Object.keys(c.urlTemplates).length > 0;
  if (!hasTemplates) {
    throw new ScreenshotSaveError(
      'CAPTURE_FAILED',
      'saveScreenshot requires a container-scoped client. Call withContainer() first.',
    );
  }
}

// ---------------------------------------------------------------------------
// Capture implementations
// ---------------------------------------------------------------------------

async function captureDisplay(client: any, options?: DisplayScreenshotCaptureOptions): Promise<Buffer> {
  const response = await client.display.screenshots.captureScreenshot({
    base64: true,
    ...options,
  });
  const data = response?.data ?? response;
  const base64String = data?.image?.data;
  if (!base64String || typeof base64String !== 'string') {
    throw new ScreenshotSaveError('CAPTURE_FAILED', 'Display screenshot returned no image data');
  }
  // Check payload size BEFORE decode
  const estimatedBytes = base64String.length * 0.75;
  if (estimatedBytes > MAX_SCREENSHOT_BYTES) {
    throw new ScreenshotSaveError('PAYLOAD_TOO_LARGE', `Screenshot payload (~${Math.round(estimatedBytes / 1024 / 1024)}MB) exceeds ${MAX_SCREENSHOT_BYTES / 1024 / 1024}MB limit`);
  }
  return Buffer.from(base64String, 'base64');
}

async function captureBrowser(client: any, format: ScreenshotFormat, options?: BrowserScreenshotCaptureOptions): Promise<Buffer> {
  const response = await client.browser.interaction.takeScreenshot({
    ...options,
    format: format === 'jpeg' ? 'jpeg' : 'png',
  });
  const data = response?.data ?? response;

  // The generated HTTP client may return ArrayBuffer for image/* content types
  if (data instanceof ArrayBuffer) {
    if (data.byteLength > MAX_SCREENSHOT_BYTES) {
      throw new ScreenshotSaveError('PAYLOAD_TOO_LARGE', `Screenshot payload (~${Math.round(data.byteLength / 1024 / 1024)}MB) exceeds ${MAX_SCREENSHOT_BYTES / 1024 / 1024}MB limit`);
    }
    return Buffer.from(data);
  }
  if (Buffer.isBuffer(data)) {
    if (data.byteLength > MAX_SCREENSHOT_BYTES) {
      throw new ScreenshotSaveError('PAYLOAD_TOO_LARGE', `Screenshot payload exceeds ${MAX_SCREENSHOT_BYTES / 1024 / 1024}MB limit`);
    }
    return data;
  }

  // Base64 string response
  const base64String = typeof data === 'string' ? data : data?.data;
  if (!base64String || typeof base64String !== 'string') {
    throw new ScreenshotSaveError('CAPTURE_FAILED', 'Browser screenshot returned no image data');
  }
  // Check payload size BEFORE decode
  const estimatedBytes = base64String.length * 0.75;
  if (estimatedBytes > MAX_SCREENSHOT_BYTES) {
    throw new ScreenshotSaveError('PAYLOAD_TOO_LARGE', `Screenshot payload (~${Math.round(estimatedBytes / 1024 / 1024)}MB) exceeds ${MAX_SCREENSHOT_BYTES / 1024 / 1024}MB limit`);
  }
  return Buffer.from(base64String, 'base64');
}

async function captureTerminal(client: any, format: ScreenshotFormat, options?: TerminalScreenshotCaptureOptions): Promise<Buffer> {
  const response = await client.terminal.sessions.captureScreenshot({
    ...options,
    // Wrapper-controlled fields always win (prevent caller override)
    save: false,
    format: format === 'jpeg' ? 'jpeg' : 'png',
    responseType: 'arrayBuffer' as const,
  });

  // Terminal may return binary data directly or wrapped in an envelope
  let buffer: Buffer;
  const data = response?.data ?? response;
  if (data instanceof ArrayBuffer) {
    if (data.byteLength > MAX_SCREENSHOT_BYTES) {
      throw new ScreenshotSaveError('PAYLOAD_TOO_LARGE', `Screenshot payload (~${Math.round(data.byteLength / 1024 / 1024)}MB) exceeds ${MAX_SCREENSHOT_BYTES / 1024 / 1024}MB limit`);
    }
    buffer = Buffer.from(data);
  } else if (Buffer.isBuffer(data)) {
    if (data.byteLength > MAX_SCREENSHOT_BYTES) {
      throw new ScreenshotSaveError('PAYLOAD_TOO_LARGE', `Screenshot payload exceeds ${MAX_SCREENSHOT_BYTES / 1024 / 1024}MB limit`);
    }
    buffer = data;
  } else if (typeof data === 'string') {
    // Fallback: base64 encoded
    const estimatedBytes = data.length * 0.75;
    if (estimatedBytes > MAX_SCREENSHOT_BYTES) {
      throw new ScreenshotSaveError('PAYLOAD_TOO_LARGE', `Screenshot payload exceeds ${MAX_SCREENSHOT_BYTES / 1024 / 1024}MB limit`);
    }
    buffer = Buffer.from(data, 'base64');
  } else {
    throw new ScreenshotSaveError('CAPTURE_FAILED', 'Terminal screenshot returned unexpected data type');
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// Core save implementation
// ---------------------------------------------------------------------------

async function saveScreenshotImpl(
  this: HoodyClient,
  options: SaveScreenshotOptions,
): Promise<SaveScreenshotResult> {
  assertContainerScoped(this);

  const { source, displayOptions, browserOptions, terminalOptions } = options;

  // Resolve path and format
  const { resolvedPath, resolvedFormat, needsMkdir, mkdirPath } =
    resolvePathAndFormat(source, options.path, options.dir, options.format);

  // 1. Capture screenshot
  let buffer: Buffer;
  try {
    switch (source) {
      case 'display':
        buffer = await captureDisplay(this, displayOptions);
        break;
      case 'browser':
        buffer = await captureBrowser(this, resolvedFormat, browserOptions);
        break;
      case 'terminal':
        buffer = await captureTerminal(this, resolvedFormat, terminalOptions);
        break;
      default:
        throw new ScreenshotSaveError('CAPTURE_FAILED', `Unknown source: ${source as string}`);
    }
  } catch (err) {
    if (err instanceof ScreenshotSaveError) throw err;
    throw new ScreenshotSaveError('CAPTURE_FAILED', `Screenshot capture failed: ${(err as Error).message}`, {
      source,
      cause: err as Error,
    });
  }

  // 2. Validate magic bytes
  validateMagicBytes(buffer, resolvedFormat);

  // 3. Create directory if needed
  if (needsMkdir) {
    try {
      const filesService = (this as any).files;
      if (filesService?.postFileOperation) {
        await filesService.postFileOperation(mkdirPath, { mkdir: '' });
      }
    } catch {
      // mkdir may fail if dir exists — that's OK
    }
  }

  // 4. Write file
  const filesService = (this as any).files;
  if (!filesService?.putFile) {
    throw new ScreenshotSaveError('WRITE_FAILED', 'Files service not available on this client');
  }

  try {
    await filesService.putFile(resolvedPath, buffer);
  } catch (err) {
    throw new ScreenshotSaveError('WRITE_FAILED', `Failed to write screenshot: ${(err as Error).message}`, {
      source,
      path: resolvedPath,
      cause: err as Error,
    });
  }

  // 5. chmod 0600 (best-effort hardening with rollback)
  try {
    if (filesService.chmodFile) {
      await filesService.chmodFile(resolvedPath, { chmod: '0600' });
    }
  } catch (chmodError) {
    // Rollback: delete the file to prevent exposure with wrong permissions
    let deleted = false;
    try {
      if (filesService.deleteFile) {
        await filesService.deleteFile(resolvedPath);
        deleted = true;
      }
    } catch {
      // Cleanup failed
    }
    const msg = deleted
      ? 'Failed to set file permissions, file deleted for safety'
      : `Failed to set file permissions AND failed to delete file. Manual cleanup required: ${resolvedPath}`;
    throw new ScreenshotSaveError('WRITE_FAILED', msg, {
      source,
      path: resolvedPath,
      cause: chmodError as Error,
    });
  }

  return {
    path: resolvedPath,
    size: buffer.byteLength,
    timestamp: new Date().toISOString(),
    source,
    format: resolvedFormat,
  };
}

// ---------------------------------------------------------------------------
// Module augmentation
// ---------------------------------------------------------------------------

declare module './hoody-client.js' {
  interface HoodyClient {
    /**
     * Capture a screenshot and save it to the container filesystem.
     *
     * Requires a container-scoped client (call `withContainer()` first).
     */
    saveScreenshot(options: SaveScreenshotOptions): Promise<SaveScreenshotResult>;

    /**
     * Capture a display screenshot and save it to the container filesystem.
     *
     * @param path - File path or filename. If omitted, auto-generates in /hoody/storage/hoody-sdk/screenshots/.
     *               Bare filenames (e.g. "foo.png") are placed in the default directory.
     */
    saveDisplayScreenshot(
      path?: string,
      options?: Omit<SaveScreenshotOptions, 'source' | 'path'>,
    ): Promise<SaveScreenshotResult>;

    /**
     * Capture a browser screenshot and save it to the container filesystem.
     *
     * @param path - File path or filename. If omitted, auto-generates in /hoody/storage/hoody-sdk/screenshots/.
     */
    saveBrowserScreenshot(
      path?: string,
      options?: Omit<SaveScreenshotOptions, 'source' | 'path'>,
    ): Promise<SaveScreenshotResult>;

    /**
     * Capture a terminal screenshot and save it to the container filesystem.
     *
     * @param path - File path or filename. If omitted, auto-generates in /hoody/storage/hoody-sdk/screenshots/.
     */
    saveTerminalScreenshot(
      path?: string,
      options?: Omit<SaveScreenshotOptions, 'source' | 'path'>,
    ): Promise<SaveScreenshotResult>;
  }
}

// ---------------------------------------------------------------------------
// Prototype patching
// ---------------------------------------------------------------------------

const SCREENSHOT_SAVE_PATCH_MARKER = Symbol.for('hoody.sdk.screenshot.save.patch');

export function patchScreenshotSavePrototype(HoodyClientClass: { prototype: unknown }): void {
  const prototype = HoodyClientClass.prototype as Record<string | symbol, unknown>;
  if (prototype[SCREENSHOT_SAVE_PATCH_MARKER]) return;

  prototype.saveScreenshot = saveScreenshotImpl;

  prototype.saveDisplayScreenshot = function saveDisplayScreenshot(
    this: HoodyClient,
    path?: string,
    options?: Omit<SaveScreenshotOptions, 'source' | 'path'>,
  ): Promise<SaveScreenshotResult> {
    const opts: SaveScreenshotOptions = { ...options, source: 'display' };
    if (path !== undefined) opts.path = path;
    return this.saveScreenshot(opts);
  };

  prototype.saveBrowserScreenshot = function saveBrowserScreenshot(
    this: HoodyClient,
    path?: string,
    options?: Omit<SaveScreenshotOptions, 'source' | 'path'>,
  ): Promise<SaveScreenshotResult> {
    const opts: SaveScreenshotOptions = { ...options, source: 'browser' };
    if (path !== undefined) opts.path = path;
    return this.saveScreenshot(opts);
  };

  prototype.saveTerminalScreenshot = function saveTerminalScreenshot(
    this: HoodyClient,
    path?: string,
    options?: Omit<SaveScreenshotOptions, 'source' | 'path'>,
  ): Promise<SaveScreenshotResult> {
    const opts: SaveScreenshotOptions = { ...options, source: 'terminal' };
    if (path !== undefined) opts.path = path;
    return this.saveScreenshot(opts);
  };

  prototype[SCREENSHOT_SAVE_PATCH_MARKER] = true;
}

// NOTE: Do NOT auto-invoke here — circular import with hoody-client.js causes
// TDZ ReferenceError in Bun.  Instead, index.ts calls patchScreenshotSavePrototype()
// after all modules are loaded.
