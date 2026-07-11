/**
 * Subpath entry for `@hoody-ai/hoody-sdk/code`.
 *
 * Runs `patchCodeServiceExtensions()` as a side-effect on module load, then
 * re-exports the raw generated surface. Consumers who import a CodeService
 * directly via the subpath (without instantiating HoodyClient) still receive
 * the extension methods.
 *
 * Without this wrapper, `package.json.exports['./code']` would map straight
 * to `generated/code/index.js`, and subpath consumers would silently miss
 * every lib/code-service-extensions.ts augmentation — the same drift that
 * was fixed for `./files` and `./exec`.
 */
import '../code-service-extensions.js';
export * from '../../generated/code/index.js';
