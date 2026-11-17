# How the terminal build is put together

Read this when you need to know why something loads the way it does. To port a component you need only
[porting.md](porting.md).

## The pieces

| Where | What |
|---|---|
| `scripts/term/resolve.ts` | The one set of resolution rules. Used by the loader, the type check, the graph tool and the ship build. |
| `scripts/term/loader.ts` | A Bun runtime plugin. It transpiles each Hub file, rewrites its imports by the resolver's rules, expands `import.meta.glob`, sets build-time constants, applies the TanStack edits (`fork-deltas.ts`) and answers library probes (`strict-probes.ts`). It never edits the engine. |
| `scripts/term/placeholder.ts` | Builds the source of a stand-in for a web-only file, and the fill for a partial sibling. |
| `src/term/placeholder.ts` | The run-time side of stand-ins: what was loaded, drawn and touched. |
| `src/term/prim/` | The prims. The only code that names OpenTUI. |
| `src/term/jsx/` | The compat runtime: raw HTML to prims, class names to styles. |
| `scripts/term/css-translate.ts`, `scripts/term/css-translate/`, `scripts/term/style-table.ts` | CSS modules to a terminal style table. |
| `src/term/app/` | Boot, router (memory history, the same page manifests as the web), lifecycle, idle signal. |
| `src/term/shell/` | The terminal shell: top bar, sidebar, page host, key hint line, palette, key sheet, menus, prompts. |
| `src/term/env/` | The host environment of a terminal, the session, the trapped DOM globals. |
| `src/term/entry.ts`, `src/term/entry.live.ts`, `src/term/entry.fixture.ts`, `src/term/host-types.ts` | The public entries and the contract with the host program. |
| `src/term/scenario/` | The scenario runner and its two drivers. |
| `src/term/test/` | Terminal tests that belong to no single component. |

`src/term/kit/` and `src/term/manifest.json` are kept for the tools that read them: the graph tool reads
`src/term/manifest.json` and `src/term/kit/contract.names.gen.ts`. Put nothing new there.

## Resolution rules

For every import in a Hub file, in order:

1. Resolve it as the web build would (TypeScript rules, the `@core`, `@kit`, `@app` aliases).
2. If a sibling `X.term.ts(x)` sits beside the result, use the sibling.
3. A sibling importing its own web file gets it for types only. A value import is `TERM_TWIN_VALUE_IMPORT`.
4. The JSX runtime is `src/term/jsx/jsx-runtime.ts`, except for files in `src/term/jsx` and `src/term/prim`.
5. A CSS module becomes a table of class ids of the form `<path under src>#<class>`. Any other stylesheet is
   nothing. A `?raw` import is the file's text. Any other asset is an empty stub.
6. A package is left to Bun, except the packages in `WEB_ONLY_PACKAGES`.

A CSS import does not make a file web-only. If it did, whole pages would become stand-ins.

Bun's runtime plugin is not asked to resolve imports (Bun 1.4.4), so the loader rewrites every import specifier to
an absolute path while loading the importing file. Consequences:

- `require()` of a Hub file, a dynamic `import()` with a computed path, and `import.meta.glob` without a literal
  pattern cannot be rewritten. The loader throws `TERM_IMPORT_FORM`.
- An import that resolves to nothing throws `TERM_UNRESOLVED`.

## Flavours

The loader runs in one of two flavours:

| Flavour | Used by | A web-only file without a sibling | A partial sibling |
|---|---|---|---|
| `fixture` | `render.ts`, `dev.ts`, tests, the page gate | Becomes a stand-in. | Missing exports are filled with stand-ins. |
| `strict` | `dev.ts --strict`, the ship build | Throws `TERM_WEB_ONLY`. | Throws `TERM_SIBLING_PARTIAL`. |

`'dev'` is accepted as another name for `fixture`.

Installing the loader twice with different options throws `TERM_LOADER_INSTALLED`.

## Stand-ins

A file is replaced by a stand-in when it imports a package in `WEB_ONLY_PACKAGES` and has no sibling. The stand-in
has the same export names:

- An export used as a component draws `‹Name›`.
- Any other use of an export (calling it, reading a property) throws `TermUnsupportedError`, code
  `TERM_UNSUPPORTED`, naming the export, the module, the operation and the importer.

`scripts/term/placeholder.allow.json` could list non-visual exports allowed to answer nothing. Its limit is 0 and
its list is empty. Keep it so.

Stand-ins exist so a page can be drawn while it is being ported. A stand-in on screen is debt, listed in the
page's allowance or in the kit list. The ship build has none.

## Entries

| Export | File | For |
|---|---|---|
| `mountTerminalHub(options)` | `src/term/entry.live.ts` (re-exported by `src/term/entry.ts`) | The host program: a real session. |
| `mountFixtureHub(options)`, `fixtureClient({ fx })` | `src/term/entry.fixture.ts` | Runners and tests: fixtures instead of a server. |
| `startTermHub(options)` | `src/term/app/lifecycle.ts` | What both call. |

The contract with the host program is `src/term/host-types.ts` (`SEAM_VERSION` 1):

- `HoodyClient`: how the Hub reaches the API. The host supplies it.
- `HubTermOptions`: `io` (`cells`, `input`, `size`, `onResize`, `colourTier`, `copy`, `openExternal`, `onFrame`),
  `onSetDefault`, `runCommand`, `signal`, `webOrigin`.
- `Receipt`: what a mount returns when it ends.

A fixture entry in a build with fixtures compiled out throws `TERM_FIXTURES_OFF`. `mountFixtureHub` without a
fixture client throws `TERM_FIXTURE_CLIENT_REQUIRED`.

## The session

Shared code keeps module-level state: stores, the vault, locks. The web has one page per process. A terminal host
may mount the Hub more than once. `src/term/env/session.ts` scopes that state to a mount:

| Code | Cause |
|---|---|
| `TERM_SESSION_ACTIVE` | A second mount while one is open. One at a time. |
| `TERM_NO_SESSION` | Session state was read outside a mount (at module load, or after the mount ended). |
| `TERM_SESSION_ENDED` | A handle kept from an ended session was used. |

## The mount contract

What every way in (ship bundle, `dev.ts`, `render.ts`, goldens, shots, scenarios, tests) gets from `startTermHub`
(`src/term/app/lifecycle.ts`), so they all run one configuration:

- **Styles are required.** `styles` (`src/term/app/styles.ts`: `stylesFromBands(...)`, or `UNSTYLED_FOR_TESTS` by
  name in a test that draws no class styles). Missing = `TERM_STYLES_REQUIRED`, nothing started. Installed at start,
  re-selected on resize, removed on dispose.
- **One renderer setup.** `RENDERER_FLAGS` (`src/term/app/run.ts`) for terminal and test renderers alike; the engine's
  debug console never opens. `createRenderer` is the test-renderer seam.
- **A failure is never hidden.** A strict-global trap while the mount lives ends it as a crash at once (a swallowed
  read too). `TermHubEnd.ok` / `Receipt.ok` is false and `exitCode` non-zero for a crash, a failed boot, a trap or a
  failed teardown step; the live entry writes one line to the host's cells after the terminal is restored.
- **Diagnostics are records** (`src/term/app/diagnostic.ts`): kind, fixed code (the error's own, else `UNHANDLED`),
  standard class name, component names, page id. Never a message, error object, cause, body or configuration. Console
  output and page failures become records in `problems`; `diagnosticDetail` (a developer's own run only) also keeps a
  sanitised message, which never leaves the mount.
- **A safe end reason**: `quit`, `closed`, `expired`, `signed-out`, `suspended`, `crashed`, `boot-failed`
  (`TermHubEnd.reason`, `Receipt.reason`).
- **Late answers are wiped** (`src/term/app/fence.ts`): after the mount ends, a call still out settles stale for its
  consumer and its answer, when it comes, is cleared before it is dropped.
- **Per-mount module state** goes in `sessionSlot(name, make)` (`src/term/env/session.ts`), never a module-level
  `let` or `Map`: dropped with the session (outside a mount, at every session start and end).
- **Library probes are answered at load** (`src/term/env/strict-probes.ts`, after the TanStack edits): no allowance keyed
  on a stack. A changed library throws `TERM_PROBE_STALE`.

## DOM globals

`src/term/env/strict-globals.ts` replaces `window`, `document`, `localStorage`, `navigator` and the rest of
`STRICT_GLOBALS` with traps. A read throws `TERM_GLOBAL` and is recorded. There are no allowances: the probes
libraries make (`typeof document` and the like) are answered when the file loads, by `rewriteProbes` in
`src/term/env/strict-probes.ts`, which the loader and the ship bundler both run. A probe that changes in a library
update fails with `TERM_PROBE_STALE` until its rule is checked again.

Shared code reaches the host through `hostEnv()` in `src/core/host-env.ts`: visibility, lifecycle events, the page
address, storage. A terminal has its own implementation under `src/term/env/`.

## Fixtures and live code

Live modules import no fixture module; the ship build refuses one as an input (`TERM_FIXTURE_INPUT`). The fixture
world reaches live code only through the seam in `src/core/fixture-seam.ts`: `fixtureComputer(id)` and
`pageFixtures(pageId)` (both from `'@core'`). Each answers "none" when fixtures are compiled out. With fixtures on,
each throws `FIXTURES_NOT_INSTALLED` if its fixture side has not loaded. That side is `core/fixture-boot.ts` for
computers and `app/fixtures.ts` for page sources and the dev pages (demo, kit gallery). Fixture names (`fixtureWorld`,
`bootFixtureCore` and the rest) live in `src/core/index.fixtures.ts`. That is what `'@core'` resolves to in tsconfig,
vite and the dev/test loader; the ship build resolves `'@core'` to the live `src/core/index.ts`.
`src/core/fixture-ids.test.ts` pins both sides.

## Navigation

The router is TanStack Router on a memory history, with the same page manifests as the web. `src/term/app/history.ts`
wraps the history so navigation blockers (`useBlocker`: the leave guard, a drawer's unsaved-work guard) are asked
before every push and replace. TanStack's memory history skips blockers when there is no `document`.

A held `router.navigate()` promise settles only when a load runs. Do not await it.

The loader also carries a delta named `history-blockers` for the same problem. Both exist.

## The ship build

```
bun scripts/term/build.ts
```

It builds one ES module from `src/term/entry.live.ts` in the `strict` flavour with fixtures off, places OpenTUI's
native library beside it, then checks the built file: no fixture, test, stand-in or build-script module; exactly
one copy each of `react`, `react-reconciler` and `scheduler`; the native library present.

"Fixture" is decided by the import graph, not only by file names (`scripts/term/build/fixture-graph.ts`). The roots are
every file the name rules call a test, spec, fixture, world, shot, scenario or `*.vectors.ts`. Whatever only those roots
reach is fixture-only, whatever it is called (`mockKeys.ts`, `fixtureData.ts`). Live means reached from the web entry
(`src/app/main.tsx`) or from the terminal entry and its JSX runtimes without passing through a root. A fixture-only
module that is an input of the build is `TERM_FIXTURE_INPUT`; one that survives into the bundle is an artifact finding.
The graph takes about 40 seconds on the full Hub, once per build process.

| Flag | Does |
|---|---|
| `--out <dir>` | Output directory. Default `hub/.term-cache/term-ship` (ignored by version control). |
| `--json <file>` | Report as JSON. |
| `--minify` | Minify. |
| `--compile` | Also build a single executable of the measurement harness. |
| `--no-measure` | Skip the start-time and memory measurement. |
| `--stand-ins` | Measurement only. Allows stand-ins. Always exits 1. |

The engine is the one the Hub resolves (see [fork.md](fork.md)). Asset budgets: one native library up to 8 MB, one
style-table file (`css-tables-*.json`) up to 1 MB, no `.wasm`/`.scm`, no other asset over 64 KB.

Codes: `TERM_ENGINE_VERSION`, `TERM_ENGINE_UNPATCHED`, `TERM_REFUSED`, `TERM_WEB_ONLY`, `TERM_WEB_ONLY_PACKAGE`,
`TERM_FIXTURE_INPUT`, `TERM_WEB_NEIGHBOUR`, `TERM_LOAD`. See [troubleshooting.md](troubleshooting.md). The root script is `hub:term-build`.

### The ship gate

`bun scripts/term/build/ship-gate.ts [--out dir] [--pages home,billing,schedules,keys] [--update] [--json file]`
builds the bundle, then mounts the BUILT `hub-term.js` with its default options (strict globals on, installed as the bundle's first module so a top-level browser read fails the start; its own styles)
on a fake client, from an empty working directory in a pty (120x40), for each page. It fails on any build refusal or
artifact finding, a trap, crash or dropped error in the receipt, a blank page pane, a missing title, or a frame that
differs from `scripts/term/build/ship-golden/<page>.120x40.txt` (`--update` writes them, never for a page with
problems). `hub:check` runs it after the terminal gate.

## Root scripts

These are in the repository root's `package.json` (the directory above `hub/`):

| Script | Runs |
|---|---|
| `hub:term-check` | `scripts/term/check.ts` |
| `hub:term-test` | `scripts/term/check.ts --only tests` |
| `hub:term-dev` | `scripts/term/dev.ts` |
| `hub:term-build` | `scripts/term/build.ts` |
| `hub:term-ship-gate` | `scripts/term/build/ship-gate.ts`: builds, then mounts the built bundle in a pty and checks what it draws. |

Their exact command lines are in `package.json`.

## Decisions worth knowing

- **No `moduleSuffixes` in a tsconfig.** It would also rewrite a sibling's own `./X` import to itself. Siblings are
  checked under the web tsconfig with terminal resolution, plus the contract.
- **One keymap, no `@opentui/keymap`.** The shortcut declarations are already data shared with the web.
- **The Hub's focus is the prim store**, not the engine's focus. The engine's focus follows it.
- **Theme and Performance are not in the terminal menus.** The terminal draws the dark tokens only. Motion is
  always off (`src/kit/perf.term.ts`).

## Edits the terminal needed in shared files

| File | Change |
|---|---|
| `src/core/host-env.ts` | Optional `HostEnv.pageAddress`: absent in a terminal. |
| `src/core/alerts.ts` | A host without a page address reads as a browser without alerts. |
| `src/kit/forms/wipe.ts` | The page-hide listener goes through `hostEnv()`. |
| `src/pages/logs/view.tsx` | "Copy link" is built from `hostEnv().pageAddress` and left out where there is none. |

The list names examples; it is not complete.
