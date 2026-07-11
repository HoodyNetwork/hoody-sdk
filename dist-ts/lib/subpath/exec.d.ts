/**
 * Subpath entry for `@hoody-ai/hoody-sdk/exec`.
 *
 * Runs exec-namespace prototype patches as a side-effect on module load, then
 * re-exports the raw generated surface. Without this wrapper, subpath
 * consumers who do `import { ScriptsService } from '@hoody-ai/hoody-sdk/exec'`
 * would get the un-patched surface and miss `patchExecScriptsServicePrototype`
 * helpers and `patchExecDynamicClientPrototype`'s `callScript` / dynamic
 * discovery wiring.
 */
import '../exec-scripts.js';
import '../exec-script-execution.js';
import '../exec-dynamic-client.js';
export * from '../../generated/exec/index.js';
