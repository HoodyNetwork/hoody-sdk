/**
 * Subpath entry for `hoody-sdk/files`.
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
// Bare side-effect import so TypeScript declaration emit preserves the
// `declare module` augmentations inside files-service-extensions.ts (added
// methods on FilesService/ArchivesService/ImageProcessingService/etc.).
// Without this bare form, the declaration-emit step would drop the import
// entirely and subpath consumers would see the raw generated types, missing
// every augmentation in the .d.ts surface.
import '../files-service-extensions.js';
// Explicit named import to actually invoke the runtime patcher. Imported
// separately from the side-effect import so one doesn't mask the other.
import { patchFilesServiceExtensions } from '../files-service-extensions.js';
// Module-load side effect. Idempotent by design — patchFilesServiceExtensions
// internally guards against double-patching.
patchFilesServiceExtensions();
export * from '../../generated/files/index.js';
