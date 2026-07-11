/**
 * Subpath entry for `@hoody-ai/hoody-sdk/files`.
 *
 * Runs `patchFilesServiceExtensions()` as a side-effect on module load, then
 * re-exports the raw generated surface. Consumers who import a FilesService
 * directly via the subpath (without instantiating HoodyClient) still receive
 * the extension methods (`classifyFile`, `getFileUrl`, `getDirectoryZipUrl`,
 * `getThumbnailUrl`, JSON-default `searchDirectory`/`listDirectory`, …).
 *
 * Without this wrapper, `package.json.exports['./files']` would map straight
 * to `generated/files/index.js`, and subpath consumers would silently miss
 * every lib/files-service-extensions.ts augmentation.
 */
import '../files-service-extensions.js';
export * from '../../generated/files/index.js';
