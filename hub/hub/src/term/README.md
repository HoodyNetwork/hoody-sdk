# The Hub in a terminal

The terminal build draws the same Hub pages as the web build, in a terminal, from the same source files.
It runs under Bun on OpenTUI (React binding, version 0.8.4).

This page is the entry point. The topic pages are in [docs/](docs/).

## The mental model

1. **One source tree.** Pages, `core` and the kit barrel are the web's. Nothing is copied.
2. **A sibling replaces a web file.** `X.term.tsx` beside `X.tsx` is loaded instead of `X.tsx` by every importer in
   the terminal build. The web build never sees it. A sibling has the same exports with the same types.
3. **Prims are the only drawing vocabulary.** A sibling draws with the components in `src/term/prim` (`Box`, `Text`,
   `Pressable`, ...). OpenTUI's own tags and imports are allowed only inside that directory. A page's terminal
   file gets them only as `@term/prim` (`src/term/prim/page.ts`, layout and text); see
   [docs/porting.md](docs/porting.md).
4. **Code without a sibling still runs.** Raw HTML tags in shared code are drawn by the compat runtime
   (`src/term/jsx`). Class names from CSS modules are turned into terminal styles by the CSS translator
   (`scripts/term/css-translate`). The result is approximate. A sibling is how you make it exact.
5. **What cannot run is visible.** A file that imports a browser-only package and has no sibling is replaced by a
   stand-in: its components draw `‹Name›`, its other exports throw `TERM_UNSUPPORTED` when used. Every stand-in is
   counted. The gates fail when the count grows.
6. **Behaviour is part of the contract.** A scenario file `X.scenario.ts` states what a component does. The same file
   runs against the web component and against its sibling.
7. **Gates hold what is done.** Each page has golden frames at 80x24 and 120x40 and a debt file that can only
   shrink. One command runs every gate.

### Words used in these pages

| Word | Meaning |
|---|---|
| web file | `X.tsx` or `X.ts`: what the web build loads. Also called the base. |
| sibling | `X.term.tsx` or `X.term.ts` beside a web file: what the terminal build loads in its place. |
| shared code | A file both builds load unchanged. |
| split | A file cut out of a web file so that part of it can be shared: `X.pure.ts`, `X.hooks.ts`, `X.web.ts`. See [docs/naming.md](docs/naming.md). |
| prim | A component or hook exported from `src/term/prim`. |
| compat runtime | The JSX runtime in `src/term/jsx` that draws raw HTML tags with prims. |
| stand-in | What the loader puts in place of a file that cannot run and has no sibling. The code calls it a placeholder. |
| cell | One character position. A cell counts as 8 px wide and 16 px tall when web code asks a pixel question. |
| frame | The whole screen as text, one line per row. |
| case | One thing a page gate draws: a fixture state of the page, or a shot from its `shots.ts`. |
| golden | The stored frame of a case at one size, under `src/pages/<id>/term-golden/`. |
| allowance | A page's reviewed debt, `allowance.json` in the same directory. It only shrinks. |
| gate | A check that fails the build. `scripts/term/check.ts` runs all of them. |
| layer | Something drawn above the page: a dialog, drawer, popover, menu or tip. |
| pane | A measured box that tells its content how wide it is (`PaneSize`). |
| semantics tree | What is on screen as roles, names and states. Tests and agents read it. |
| flavour | How the loader treats what cannot run: `fixture` makes stand-ins, `strict` fails the load. |

## Map

| Where | What |
|---|---|
| `src/term/prim/` | The prims. The only place that names OpenTUI. Reference: [docs/prims.md](docs/prims.md). |
| `src/term/jsx/` | The compat runtime: tag table, element refs, class styles. [docs/compat.md](docs/compat.md). |
| `src/term/app/` | Lifecycle, router, fixture and live boot, idle signal. [docs/architecture.md](docs/architecture.md). |
| `src/term/shell/` | The terminal shell: top bar, sidebar, keymap, palette, menus, prompts, Ask dock. [docs/shell.md](docs/shell.md). |
| `src/term/env/` | Host environment, the mount session, strict DOM globals. |
| `src/term/scenario/` | Scenario types, runner and the two drivers. [docs/scenarios.md](docs/scenarios.md). |
| `src/term/test/` | Tests of the prims and the compat runtime. |
| `src/term/entry.live.ts`, `src/term/entry.fixture.ts` | The two entries. `src/term/entry.ts` re-exports the live one. |
| `src/term/placeholder.ts` | Run-time side of stand-ins and the ledger of which were used. |
| `src/term/kit/contract.names.gen.ts`, `src/term/manifest.json` | Lists the graph gate reads. Do not edit by hand. The contract names come from `scripts/term/contract-names.ts --write`. |
| `src/term/app/diagnostic-codes.gen.ts` | The error codes a mount may report. Generated: after adding a code string to Hub source, run `bun scripts/term/diagnostic-codes.ts`. |
| `src/term/prim/widths.gen.ts` | Cell widths for a runtime without Bun (`width.ts`). Generated from `Bun.stringWidth`: run `bun scripts/term/widths.ts` when `src/term/prim/width.term.test.ts` says it is stale. |
| `scripts/term/` | Loader, resolver, gates and tools. [docs/gates.md](docs/gates.md). |
| `src/**/X.term.tsx` | Siblings, beside their web files (kit, shell, pages, core). |
| `src/**/X.scenario.ts` | Scenario files, beside their components. |
| `src/pages/<id>/term-golden/` | Golden frames and the allowance of a page. |

## Daily commands

Run every command from `hub/` with `NODE_ENV=test` set in the shell. Run them from plain bash. Do not spawn them
from a bun script in a tree that has a `.env` file: the child would inherit its settings.


| What | Command |
|---|---|
| One headless frame and a report (default size 120x40) | `bun scripts/term/render.ts --page schedules --cols 80 --rows 24` |
| The same, with the semantics tree | `bun scripts/term/render.ts --page schedules --sem` |
| Interactive, on fixtures | `bun scripts/term/dev.ts --page schedules --fx many --log dev.log` |
| One test file | `bun test --preload ./scripts/term/test-preload.ts src/kit/states/States.term.test.tsx` |
| Scenarios of one component, terminal side | `bun scripts/term/scenarios.ts states/Band` |
| Sibling contract, with reasons for one component | `bun scripts/term/contract.ts --explain Band` |
| Golden frames of one page (about 3 min, 84 frames) | `bun scripts/term/check.ts --page schedules` |
| Accept changed frames of one page | `bun scripts/term/check.ts --page schedules --update` |
| Only what your change touches, new failures first | `bun scripts/term/check.ts --changed` (after one `--record` on the tree before your change) |
| Every gate | `bun scripts/term/check.ts` |
| List files with no sibling, most blocking first (about 23 s) | `bun scripts/term/graph.ts --md <file outside the tree>` (the Work-list table) |
| Coverage per page: stand-ins, crashes, traps (about 22 s) | `bun scripts/term/board.ts` |
| Scaffold a sibling | `bun scripts/term/new.ts src/kit/states/Band.tsx` (refuses: `Band` already has one) |
| Docs against the code | `bun scripts/term/docs-check.ts` |

The same gates are wired in the Hub package (the folder above `hub/`, which holds `package.json`): `bun run hub:term-check`, `bun run hub:term-test` (the tests gate
only), `bun run hub:term-dev`, `bun run hub:term-build`.

More commands, every flag and how to read each failure: [docs/gates.md](docs/gates.md) and
[docs/goldens-shots.md](docs/goldens-shots.md).

## Rules that apply everywhere

1. **OpenTUI only in `src/term/prim`.** No OpenTUI tag or import anywhere else (graph rule R5). Tests take the
   renderer from `src/term/prim/testing.ts`.
2. **A sibling never imports a value from its own web file.** Types only: `import type * as Web from './X'`. Move
   what both need into a split. The loader throws `TERM_TWIN_VALUE_IMPORT` otherwise.
3. **A sibling exports the same value names as its web file**, each typed `typeof Web.Name`. No extra names.
   Terminal-only helpers go in a file without the `.term` suffix (`termParts.tsx`, `termField.tsx`).
4. **Colour by token, meaning by mark.** Pass `colour="muted"`, never a hex value. Every tone has a mark
   (`TONE_MARK`), because the mono tier draws no colour at all.
5. **Sizes are cells.** Use `cols(n)` and `rows(n)` for spacing from the web's `--sp-n` scale.
6. **No DOM globals.** `window`, `document`, `localStorage` and the rest throw `TERM_GLOBAL` under strict globals.
   Go through `hostEnv()` or write a sibling.
7. **Never write to stdout.** Every string reaches the engine through one filter (`src/term/prim/safe.ts`) that
   removes control characters. Diagnostics go through `safeDiagnostic`.
8. **Secrets use `SecretInput`.** Its value is never in a frame, the semantics tree or a log.
9. **Popups go on a `Layer`.** Every `Box` clips its children, so an absolutely placed child is cut
   (`TERM_POPUP_CLIPPED`).
10. **Both sizes must hold.** A page is accepted at 80x24 and 120x40: no overdraw, nothing cut that was not
    declared, the frame exactly the terminal.


## Topic pages

| Page | Read it when |
|---|---|
| [docs/porting.md](docs/porting.md) | You are writing a sibling. A worked example from start to green gates. |
| [docs/naming.md](docs/naming.md) | You need to move code so both builds can share it, or name a new file. |
| [docs/prims.md](docs/prims.md) | You need a prim. Every export, one line each, with examples. |
| [docs/layout.md](docs/layout.md) | Sizes, spacing, breakpoints, clipping, the layout faults. |
| [docs/focus-keys.md](docs/focus-keys.md) | Focus, Tab order, key handling, the shell keymap. |
| [docs/shell.md](docs/shell.md) | What surrounds a page: top bar, sidebar, status line, the Ask dock. |
| [docs/overlays.md](docs/overlays.md) | Dialogs, drawers, popovers, menus, tips. |
| [docs/handoff.md](docs/handoff.md) | A feature the terminal cannot do: how to send it to the web Hub. |
| [docs/forms.md](docs/forms.md) | Fields, validation, submission, secrets. |
| [docs/lists-tables.md](docs/lists-tables.md) | Long lists, the data table, cell text. |
| [docs/qr.md](docs/qr.md) | QR codes: how one is drawn, the smallest pane for a 2FA code, secret rules. |
| [docs/semantics.md](docs/semantics.md) | The semantics tree: roles, names, the text form, queries, actions. |
| [docs/scenarios.md](docs/scenarios.md) | Writing and running `X.scenario.ts`. |
| [docs/gates.md](docs/gates.md) | What each gate catches, how to read its failure, how to fix it. |
| [docs/goldens-shots.md](docs/goldens-shots.md) | Golden frames, allowances, PNG shots. |
| [docs/compat.md](docs/compat.md) | What unported code gets: the tag table, element refs, class styles. |
| [docs/architecture.md](docs/architecture.md) | Loader, resolver, flavours, stand-ins, entries, the session, the ship build. |
| [docs/troubleshooting.md](docs/troubleshooting.md) | An error code or a symptom, with cause and fix. |
| [docs/fork.md](docs/fork.md) | How OpenTUI is consumed, patched and upgraded. |
| [docs/not-built.md](docs/not-built.md) | What does not exist yet. |

## Adding to these pages

Put new facts in the topic page they belong to, not at the end of this file. After any edit run
`bun scripts/term/docs-check.ts`: it fails on a path, script flag, error code or prim export that does not exist.
