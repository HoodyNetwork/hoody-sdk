/**
 * Files service extensions — prototype patches for FilesService, ArchivesService,
 * ImageProcessingService (files namespace) and FilesService (notes namespace).
 *
 * Architecture:
 *   This module extends the auto-generated service classes with convenience
 *   helpers (classifyFile, getFileUrl, getDirectoryZipUrl, getThumbnailUrl)
 *   and JSON-default overrides (search, listDirectory) without
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
import { FilesService as NotesFilesService } from '../generated/notes/files.service.js';
import { ArchivesService } from '../generated/files/archives.service.js';
import { ImageProcessingService } from '../generated/files/image-processing.service.js';

// ---------------------------------------------------------------------------
// Idempotency guards (Symbol.for survives HMR / duplicate imports)
// ---------------------------------------------------------------------------

const FILES_PATCH_MARKER = Symbol.for('hoody.sdk.files.service.extensions');
const ARCHIVES_PATCH_MARKER = Symbol.for('hoody.sdk.archives.service.extensions');
const IMAGE_PATCH_MARKER = Symbol.for('hoody.sdk.image-processing.service.extensions');

// ---------------------------------------------------------------------------
// Template variable type (shared)
// ---------------------------------------------------------------------------

type TemplateVars = {
  projectId?: string;
  containerId?: string;
  serviceIndex?: string | number;
  server?: string;
};

// ---------------------------------------------------------------------------
// Module augmentation — files namespace
// ---------------------------------------------------------------------------

declare module '../generated/files/files.service.js' {
  interface FilesService {
    classifyFile(filepath: string): 'renderable' | 'binary' | 'text';
    getFileUrl(
      absPath: string,
      options?: { download?: '' },
      templateVars?: TemplateVars,
    ): string;
  }
}

// ---------------------------------------------------------------------------
// Module augmentation — notes namespace
// ---------------------------------------------------------------------------

declare module '../generated/notes/files.service.js' {
  interface FilesService {
    classifyFile(filepath: string): 'renderable' | 'binary' | 'text';
    getFileUrl(
      absPath: string,
      options?: { download?: '' },
      templateVars?: TemplateVars,
    ): string;
  }
}

// ---------------------------------------------------------------------------
// Module augmentation — archives
// ---------------------------------------------------------------------------

declare module '../generated/files/archives.service.js' {
  interface ArchivesService {
    getDirectoryZipUrl(directory: string, templateVars?: TemplateVars): string;
  }
}

// ---------------------------------------------------------------------------
// Module augmentation — image processing
// ---------------------------------------------------------------------------

declare module '../generated/files/image-processing.service.js' {
  interface ImageProcessingService {
    getThumbnailUrl(
      imagePath: string,
      options?: { width?: number; height?: number; format?: string; quality?: string },
      templateVars?: TemplateVars,
    ): string;
  }
}

// ---------------------------------------------------------------------------
// Pure helper — file classification
// ---------------------------------------------------------------------------

function classifyFile(filepath: string): 'renderable' | 'binary' | 'text' {
  const dot = filepath.lastIndexOf('.');
  const lastSlash = filepath.lastIndexOf('/');
  if (dot === -1 || dot === filepath.length - 1 || dot <= lastSlash) return 'text';
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

  if (RENDERABLE.has(ext)) return 'renderable';
  if (BINARY.has(ext)) return 'binary';
  return 'text';
}

// ---------------------------------------------------------------------------
// Prototype patching
// ---------------------------------------------------------------------------

function patchFilesService(proto: any, includeJsonOverrides: boolean): void {
  if (proto[FILES_PATCH_MARKER]) return;

  proto.classifyFile = classifyFile;

  proto.getFileUrl = function (
    absPath: string,
    options?: { download?: '' },
    templateVars?: TemplateVars,
  ): string {
    const cleanPath = absPath.startsWith('/') ? absPath.slice(1) : absPath;
    const encoded = cleanPath.split('/').map(encodeURIComponent).join('/');
    let requestUrl = this.buildTemplateUrl('/api/v1/files/{path}', templateVars || {});
    requestUrl = requestUrl.replace('{path}', () => encoded);
    if (options && 'download' in options) {
      requestUrl += (requestUrl.includes('?') ? '&' : '?') + 'download';
    }
    return requestUrl;
  };

  if (includeJsonOverrides) {
    const origSearch = proto.search;
    if (typeof origSearch === 'function') {
      proto.search = function (...args: any[]) {
        const mutableArgs = [...args];
        const optionsIndex = 1;
        const options = (mutableArgs[optionsIndex] ?? {}) as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(options, 'json')) {
          mutableArgs[optionsIndex] = { ...options, json: '' };
        }
        return origSearch.apply(this, mutableArgs);
      };
    }

    const origList = proto.listDirectory;
    if (typeof origList === 'function') {
      proto.listDirectory = function (...args: any[]) {
        const mutableArgs = [...args];
        const optionsIndex = 1;
        const options = (mutableArgs[optionsIndex] ?? {}) as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(options, 'json')) {
          mutableArgs[optionsIndex] = { ...options, json: '' };
        }
        return origList.apply(this, mutableArgs);
      };
    }
  }

  proto[FILES_PATCH_MARKER] = true;
}

function patchArchivesService(proto: any): void {
  if (proto[ARCHIVES_PATCH_MARKER]) return;

  proto.getDirectoryZipUrl = function (
    directory: string,
    templateVars?: TemplateVars,
  ): string {
    if (!directory) {
      throw new Error('directory is required');
    }
    const cleanDir = directory.startsWith('/') ? directory.slice(1) : directory;
    const encoded = cleanDir.split('/').map(encodeURIComponent).join('/');
    let requestUrl = this.buildTemplateUrl('/{directory}?zip', templateVars || {});
    requestUrl = requestUrl.replace('{directory}', () => encoded);
    return requestUrl;
  };

  proto[ARCHIVES_PATCH_MARKER] = true;
}

function patchImageProcessingService(proto: any): void {
  if (proto[IMAGE_PATCH_MARKER]) return;

  proto.getThumbnailUrl = function (
    imagePath: string,
    options?: { width?: number; height?: number; format?: string; quality?: string },
    templateVars?: TemplateVars,
  ): string {
    const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
    const encoded = cleanPath.split('/').map(encodeURIComponent).join('/');
    let requestUrl = this.buildTemplateUrl('/{image}', templateVars || {});
    requestUrl = requestUrl.replace('{image}', () => encoded);
    const params: string[] = ['thumbnail'];
    if (options?.width !== undefined) params.push(`width=${options.width}`);
    if (options?.height !== undefined) params.push(`height=${options.height}`);
    if (options?.format !== undefined) params.push(`format=${encodeURIComponent(options.format)}`);
    if (options?.quality !== undefined) params.push(`quality=${encodeURIComponent(options.quality)}`);
    requestUrl += (requestUrl.includes('?') ? '&' : '?') + params.join('&');
    return requestUrl;
  };

  proto[IMAGE_PATCH_MARKER] = true;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function patchFilesServiceExtensions(): void {
  patchFilesService(FilesService.prototype, true);
  patchFilesService(NotesFilesService.prototype, false);
  patchArchivesService(ArchivesService.prototype);
  patchImageProcessingService(ImageProcessingService.prototype);
}

// Auto-run on import (idempotent via Symbol.for guards)
patchFilesServiceExtensions();
