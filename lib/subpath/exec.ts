/**
 * Subpath entry for `hoody-sdk/exec`.
 *
 * Runs exec-namespace prototype patches as a side-effect on module load, then
 * re-exports the raw generated surface. Without this wrapper, subpath
 * consumers who do `import { ScriptsService } from 'hoody-sdk/exec'`
 * would get the un-patched surface and miss `patchExecScriptsServicePrototype`
 * helpers and `patchExecDynamicClientPrototype`'s `callScript` / dynamic
 * discovery wiring.
 */

// Bare side-effect imports so TypeScript declaration emit preserves the
// `declare module` augmentations inside exec-scripts.ts + exec-dynamic-client.ts
// (added methods on ScriptsService / ScriptExecutionService). Without these
// the subpath .d.ts drops the imports and consumers see the raw generated types.
import '../exec-scripts.js';
import '../exec-script-execution.js';
import '../exec-dynamic-client.js';

import { patchExecScriptsServicePrototype } from '../exec-scripts.js';
import { patchExecScriptExecutionPrototype } from '../exec-script-execution.js';
import { patchExecDynamicClientPrototype } from '../exec-dynamic-client.js';

// Module-load side effects. Idempotent: each patcher guards against re-patching.
// Load ALL exec prototype patches (including ScriptExecutionService) so
// subpath consumers see the same augmented surface as HoodyClient-based consumers.
patchExecScriptsServicePrototype();
patchExecScriptExecutionPrototype();
patchExecDynamicClientPrototype();

export * from '../../generated/exec/index.js';
