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
import { UiService as FilesUiService } from '../generated/files/ui.service.js';
import type { FilesServiceBase } from '../generated/files/files.service.generated.js';
type TemplateVars = {
    projectId?: string;
    containerId?: string;
    serviceIndex?: string | number;
    server?: string;
};
/**
 * Options of the file readers: the options of `files.get` (query parameters
 * such as `revision`, `at` or `lines`, and per-call request options) without
 * `responseType` / `rawResponse`, which each reader sets itself.
 */
export type FilesReadOptions = Omit<NonNullable<Parameters<FilesServiceBase['get']>[1]>, 'responseType' | 'rawResponse'>;
/** The per-call host overrides of the readers: the third argument of `files.get`. */
type FilesReadTarget = Parameters<FilesServiceBase['get']>[2];
/**
 * Options of `files.exists`: those of the HEAD request (the revision
 * selectors and per-call request options) without `responseType` /
 * `rawResponse`: the answer is a boolean.
 */
export type FilesExistsOptions = Omit<NonNullable<Parameters<FilesServiceBase['__exists']>[1]>, 'responseType' | 'rawResponse'>;
declare module '../generated/files/files.service.js' {
    interface FilesService {
        classify(filepath: string): 'renderable' | 'binary' | 'text';
        getUrl(absPath: string, options?: {
            download?: '';
        }, templateVars?: TemplateVars): string;
        /** URL that downloads a directory as a zip (the URL of `zip`, without sending the request). */
        getZipUrl(directory: string, templateVars?: TemplateVars): string;
        /**
         * List a directory as JSON: `files.ui.getPage(path, { json: '' })`. The root HTML listing
         * stays `files.ui.getPage`.
         */
        list(path: string, options?: Omit<NonNullable<Parameters<FilesUiService['getPage']>[1]>, 'json'>, templateVars?: Parameters<FilesUiService['getPage']>[2]): ReturnType<FilesUiService['getPage']>;
        /**
         * Read a file as text (UTF-8). Resolves to the string itself, no
         * `{ statusCode, message, data }` envelope. A missing file rejects with
         * the `ApiError` of `get` (`err.status === 404`). `path` names a file:
         * a directory path answers its listing.
         */
        readText(path: string, options?: FilesReadOptions, templateVars?: FilesReadTarget): Promise<string>;
        /**
         * Read a file and parse it as JSON. Resolves to the parsed value, no
         * envelope. The file is fetched as text and parsed here, so its content
         * is never taken for a response envelope. Content that is not JSON
         * rejects with a `SyntaxError` naming the path.
         */
        readJson<T = unknown>(path: string, options?: FilesReadOptions, templateVars?: FilesReadTarget): Promise<T>;
        /**
         * Read a file as bytes. Resolves to a `Uint8Array`, no envelope
         * (`Buffer.from(bytes)` when Buffer methods are needed).
         */
        readBytes(path: string, options?: FilesReadOptions, templateVars?: FilesReadTarget): Promise<Uint8Array>;
        /**
         * Whether a file or directory exists at `path`: true, or false when the
         * kit answers 404. Any other failure (a refused path, no access, the kit
         * unreachable) rejects with its `ApiError`. For the size and times of an
         * existing path use `stat`.
         */
        exists(path: string, options?: FilesExistsOptions, templateVars?: FilesReadTarget): Promise<boolean>;
    }
}
declare module '../generated/notes/files.service.js' {
    interface FilesService {
        classify(filepath: string): 'renderable' | 'binary' | 'text';
    }
}
declare module '../generated/files/images.service.js' {
    interface ImagesService {
        getThumbnailUrl(imagePath: string, options?: {
            width?: number;
            height?: number;
            format?: string;
            quality?: string;
        }, templateVars?: TemplateVars): string;
    }
}
export declare function patchFilesServiceExtensions(): void;
export {};
