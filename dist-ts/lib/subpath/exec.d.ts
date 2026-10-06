/**
 * Subpath entry for `hoody-sdk/exec`.
 *
 * Runs exec-namespace prototype patches as a side-effect on module load, then
 * re-exports the raw generated surface. Without this wrapper, subpath
 * consumers who do `import { ScriptsService } from 'hoody-sdk/exec'`
 * would get the un-patched surface and miss the hand-written `exec.scripts`
 * file helpers, `exec.run`, `exec.call` / `exec.listCallableScripts` and the
 * dynamic discovery wiring.
 */
import '../exec-scripts.js';
import '../exec-script-execution.js';
import '../exec-dynamic-client.js';
export * from '../../generated/exec/index.js';
