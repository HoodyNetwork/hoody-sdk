// The engine handle for the two places that need the engine itself, not a drawn prim: the lifecycle (app/run.ts makes
// the renderer and the React root, ends both) and the shell's key capture (shell/TermShell.tsx reads the focused
// renderable and the key input before any control). Everything else draws through the prims. Graph rule R5: only src/term/prim/
// imports OpenTUI (prim/otui).
export { useRenderer, createCliRenderer, createRoot, type CliRenderer, type KeyEvent } from './otui';
// The engine's scroll box class: identify one by `instanceof`, never by `constructor.name` (minified in the ship bundle).
export { ScrollBoxClass } from './otui';
