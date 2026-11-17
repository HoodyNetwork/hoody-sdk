# Splits and file names

A web file often mixes three things: logic that runs anywhere, React hooks that run anywhere, and code that needs a
browser. The terminal can load the first two. A split moves each part into its own file so the terminal loads what
it can and replaces only what it must.

## The names

| Name | What is in it | Who loads it |
|---|---|---|
| `X.tsx`, `X.ts` | The web file (the base). | The web. The terminal too, when the file has no browser-only part. |
| `X.term.tsx`, `X.term.ts` | The sibling of `X`. Same value exports, same types. | The terminal, in place of `X`. |
| `X.pure.ts` | Constants, types, pure functions, stores and hooks moved out of `X` that touch no DOM. No JSX, no CSS import. | Both. |
| `X.hooks.ts` | React hooks moved out of `X` that depend on `X.pure.ts` and touch no DOM. Used when the hooks would make `X.pure.ts` too wide. | Both. |
| `X.web.ts` | The browser-only part of `X`: a visibility listener, a storage event, `window.open`. Small. | The web. |
| `X.web.term.ts` | The sibling of `X.web.ts`: what the terminal answers instead. | The terminal, in place of `X.web.ts`. |
| `X.scenario.ts` | The behaviour of `X`, for both platforms. | The scenario runners only. |
| `X.term.test.tsx` | A terminal test. | `bun test` with the terminal preload. |
| `termName.ts(x)` | Terminal-only helper code shared by several siblings (`termParts.tsx`, `termField.tsx`, `termBreaks.ts`). Not a sibling: it replaces nothing. | The terminal. |
| `X.term.strings.en.json` | Strings only the terminal shows. | The terminal. |


Two older names also exist and mean "shared by the web file and its sibling": `src/kit/overlays/Drawer.shared.ts`
and `src/kit/overlays/Menu.model.ts`. New code uses the names in the table. A file may have a second stem before
`.term`: `src/kit/states/Toast.queue.term.ts` is the sibling of `Toast.queue.ts`.

## How the resolver picks a file

One resolver (`scripts/term/resolve.ts`) serves the loader, the type check, the graph tool and the ship build.

1. An import is first resolved as the web build would resolve it.
2. If a file `X.term.tsx` or `X.term.ts` sits beside the result, the terminal loads that file instead. This applies
   to every importer, wherever it is.
3. `X.web.ts` to `X.web.term.ts` is the same rule. There is no special case.
4. A sibling with no web file beside it is never loaded. Graph rule R1 reports it.
5. A sibling may import its own web file for types only. A value import throws `TERM_TWIN_VALUE_IMPORT`.

Consequence: you never change an import to reach a sibling. `import { Band } from './Band'` gives the web `Band` on
the web and the terminal `Band` in the terminal.

## When to make which split

**The web file has a pure helper your sibling needs.** Move the helper to `X.pure.ts`. Import it from both `X.tsx`
and `X.term.tsx`. Keep `X.tsx` re-exporting it if other files import it from `X`.

**A whole file would be shared if not for one browser call.** Move that call to `X.web.ts` and write
`X.web.term.ts`. Example: `src/core/chat-attention.ts` needed the page's visibility. The reader moved to
`src/core/chat-attention.web.ts`. Its sibling `src/core/chat-attention.web.term.ts` reads the same fact from
`hostEnv().visible()`. `chat-attention.ts` is now shared.

**The browser call is a bare `window.setTimeout`.** Write `setTimeout`. No split is needed.

**An import pulls in a web-only file only for a type.** Write `import type { T } from './Bits'`, not
`import { type T } from './Bits'`. The second form still loads the file.

## Rules for a split

Each prevents a real bug.

1. **Move, never copy.** A store, a `createContext`, a `WeakMap`, a counter or a `defineQuery` object must exist
   once. Move it to the pure file and import it back into the web file.
2. **A `let` stays with its writer.** A module-level `let` can be assigned only in its own file. Functions that
   assign it stay together. Functions that only read it can move if the pure file owns the `let` and exports a
   setter.
3. **Module-level registrations move with their store.** `onBump(clear)` beside a store goes where the store goes,
   so it still runs once. If moving it would change its order among other registrations, leave it.
4. **Keep the public names.** The web file re-exports what moved, so importers and `vi.mock('./X')` calls keep
   working. A barrel may export the pure names from the pure file directly. Tests that mock the web file then no
   longer replace those names: check the tests that mock it.
5. **A pure file imports no CSS, no JSX and no browser-only package.** The graph tool then classes it
   `shared-clean`. `bun scripts/term/graph.ts --md graph.md` writes the class of every module.
6. **`@app/fixtures` may be imported only from a page's root `data.ts`** (an eslint rule). Such a file cannot have
   a pure split that needs fixtures. Give it a web neighbour instead.
7. **Do not guess from the name.** `X.pure.ts` is a convention. The graph tool decides what is shared by reading
   the imports and the globals each file touches.

## Sibling rules

- Same value export names as the web file. Missing or extra names fail graph rule R2 and the contract.
- Each value typed as `typeof Web.Name`, with `import type * as Web from './X'`.
- Types re-exported: `export type { Props } from './X'`.
- No import of a browser-only package (`react-dom`, `react-aria*`, `react-stately`, `@tanstack/react-virtual`; the
  list is `WEB_ONLY_PACKAGES` in `scripts/term/resolve.ts`). The loader throws `TERM_WEB_ONLY_SIBLING`.
- A sibling may be partial while you work. In the `fixture` flavour the loader fills each missing value export with
  a stand-in and records it. In the `strict` flavour and the ship build a partial sibling fails
  (`TERM_SIBLING_PARTIAL`). The contract gate fails on it too, unless run with `--lenient`.
- Terminal-only helpers do not belong in a sibling as extra exports. Put them in a `termName.ts(x)` file.

## Two meanings of "web-only"

The tools use the word for two different sets. Know which one you are reading.

| Tool | A file is web-only when |
|---|---|
| The loader (`scripts/term/loader.ts`) | It imports a package in `WEB_ONLY_PACKAGES` and has no sibling. Only these become stand-ins. |
| The graph tool (`scripts/term/graph.ts`) | It imports a CSS module, a web package, reads a browser global or uses a DOM member. This is the wider set. |

A file in the second set but not the first still loads: the compat runtime and the CSS translator draw it. The kit
gate calls such exports `auto`. They are approximations waiting for a sibling, not failures.

## Where the durable lists are

| List | File |
|---|---|
| Browser-only packages | `WEB_ONLY_PACKAGES` in `scripts/term/resolve.ts` |
| Trapped DOM globals | `STRICT_GLOBALS` in `src/term/env/strict-globals.ts` |
| Kit exports still drawn as stand-ins | `scripts/term/kit-classes.json` |
| Things handed off to the web ("open this on the web") | Derived from the code: `scripts/term/graph/handoffs.ts` (no list to edit) |
| Web-only import edges and raw HTML sites still reachable | `scripts/term/graph/baseline.json` |
