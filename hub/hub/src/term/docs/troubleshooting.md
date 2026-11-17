# Troubleshooting

Find the code or the symptom. Each entry gives the cause and the fix.

Every code on this page occurs in the source. `bun scripts/term/docs-check.ts` fails if one stops existing.

## While loading a file

| Code | Cause | Fix |
|---|---|---|
| `TERM_UNSUPPORTED` | Code used a non-visual export of a stand-in: it called a function or read a property of something from a web-only file. The message names the export, the module, the operation and the importer. | Port the module with a sibling, or stop the importer from using it in the terminal. If the feature will never exist in a terminal, show a `Handoff`. |
| `TERM_WEB_ONLY` | `strict` flavour: a file imports a browser-only package and has no sibling. | Write the sibling. |
| `TERM_SIBLING_PARTIAL` | `strict` flavour: a sibling lacks value exports its web file has. The message lists them. | Export them. |
| `TERM_WEB_ONLY_SIBLING` | A sibling imports a browser-only package. | Remove the import. Use prims. |
| `TERM_TWIN_VALUE_IMPORT` | A sibling imports a value from its own web file. | `import type * as Web from './X'`. Move a shared value to `X.pure.ts`. |
| `TERM_IMPORT_FORM` | `require()` of a Hub file, a dynamic `import()` with a computed path, or `import.meta.glob` without a literal pattern. The loader cannot rewrite these. | Use a static import or a literal pattern. |
| `TERM_UNRESOLVED` | An import resolves to no file. | Fix the path. |
| `TERM_LOADER_OPTIONS` | The loader was given an unknown flavour. | `fixture` or `strict`. |
| `TERM_LOADER_INSTALLED` | The loader was installed twice in one process with different options. | Install once. A test must not install its own loader: the preload did. |
| `TERM_RESOLVER_CONFIG` | The resolver could not read the tsconfig. | Run from `hub/`. |
| `TERM_ALLOWANCE_FILE` | `scripts/term/placeholder.allow.json` is unreadable. | Restore the file. |
| `TERM_FORK_DELTA` | A loader edit no longer matches the TanStack source it rewrites. The package changed shape. | See [fork.md](fork.md). Never make a delta a silent no-op. |

## While drawing

| Code | Cause | Fix |
|---|---|---|
| `TERM_UNSAFE_OUTPUT` | OpenTUI's React host has no text filter. The prims were loaded without the terminal loader and without the patched engine. Nothing is drawn, on purpose. | Run through `scripts/term/loader.ts` (every script and the test preload do). |
| `TERM_GLOBAL` | Strict mode: code read a DOM global (`window`, `document`, `localStorage`, ...). The message names it. | Go through `hostEnv()` in `src/core/host-env.ts`, or move the read into `X.web.ts` with an `X.web.term.ts`. |
| `TERM_DOM_MEMBER` | Code asked an element ref for a member the terminal does not answer. The message lists what is answered. | Port the caller with a sibling. See [compat.md](compat.md). |
| `TERM_DOM_SELECTOR` | `querySelector`, `matches` or `closest` got a selector outside the supported subset. | Use a simpler selector, or port the caller. |
| `TERM_POPUP_CLIPPED` | Logged, not thrown: an absolutely placed `Box` is cut by an enclosing box. | Put the popup on a `Layer`. See [overlays.md](overlays.md). |

## Mounting and sessions

| Code | Cause | Fix |
|---|---|---|
| `TERM_SESSION_ACTIVE` | A second mount started while one is open. One Hub per process at a time. | End the first mount (await its receipt) before the next. In a test: destroy the renderer of the previous test. |
| `TERM_NO_SESSION` | A store, the vault or a lock was read with no mount open: at module load, or after the mount ended. | Read it inside a component or an effect, not at the top of a module. |
| `TERM_SESSION_ENDED` | A handle kept from an ended session was used. | Do not keep stores across mounts. Read them again. |
| `TERM_FIXTURES_OFF` | A fixture boot was asked of a build without fixtures. | Use the live entry, or a fixture build. |
| `TERM_FIXTURE_CLIENT_REQUIRED` | `mountFixtureHub` was called without a fixture client. | Pass `fixtureClient()`. |
| `TERM_BOOT_<STATE>` | The live boot did not reach `ready`. The suffix is the state it reached: `TERM_BOOT_BANNED` (the account is suspended), `TERM_BOOT_OFFLINE` (no network or the API did not answer), `TERM_BOOT_PURGE_FAILED` (a sign-out cleanup did not finish), `TERM_BOOT_FAILED` (any other refusal of the first account read), `TERM_BOOT_LEAVING` (the session ended or was replaced while booting: a 401 or another sign-in). | `BANNED`: the account must be reinstated. `OFFLINE`: check the network, mount again. `PURGE_FAILED`: mount again. `FAILED`: the receipt's boot record names the code. `LEAVING`: sign in again in the CLI. |
| `TERM_TRAP_UNDECLARED` | A terminal test read a DOM global, caught or not, without declaring it. Raised at the end of the test by the preload. | Remove the read. In a test that traps on purpose, call `expectTraps('<name>')` first (`src/term/env/strict-globals.ts`). |
| `TERM_STYLES_REQUIRED` | `startTermHub` (or a mount entry) got no `styles`. | Pass `stylesFromBands(...)`; in a test that draws no class styles, `UNSTYLED_FOR_TESTS`. |
| `TERM_GLOBAL` | A strict-global trap ended the mount (receipt reason `crashed`, first problem `kind: 'trap'`). | Route the read through host-env or the session; a library probe gets a rule in `src/term/env/strict-probes.ts`. Never an allowance. |
| `TERM_PROBE_STALE` | A library changed: a probe rule in `src/term/env/strict-probes.ts` found a different count. | Re-read the library file and correct the rule's count or pattern by hand. Never widen it. |
| `TERM_NET_DENIED` | A terminal test reached for the network (fetch, socket, WebSocket) outside a listener it opened. | Open a loopback listener in the test and call that. |
| `TERM_SPAWN_DENIED` | A terminal test started a subprocess. | Do the work in-process. |
| `TERM_REALM_REFUSED` | The live boot could not pin the realm the host asked for. | Mount with a realm the session may use. |

## Scripts

| Code | Cause | Fix |
|---|---|---|
| `TERM_NO_PAGE` | `render.ts --page` got an unknown id. The message lists the ids. | Use a listed id. |
| `TERM_BAD_PATH` | `render.ts --path` is not a path of the page: a bare search (`?sel=a`) or another page's path. The router would draw another page. | Give the whole path: `/schedules?sel=a`. |
| `TERM_TYPECHECK_TYPES` | `typecheck.ts` cannot find a type library, usually Bun's. The message lists every directory it looked in. | Install `@types/bun@1.4.4` into one of them, or set `HUB_TERM_BUN_TYPES` to a directory that holds it. |
| `TERM_TYPECHECK_ALLOW_INVALID` | An entry of `scripts/term/typecheck.allow.json` lacks a file, a `TS` code or a reason of 10 characters. | Fix the entry. |
| `TERM_TYPECHECK_ALLOW_STALE` | An allowed type error no longer occurs. | Remove the entry. |
| `TERM_BASELINE_FORMAT` | `scripts/term/graph/baseline.json` is not format v2. | `bun scripts/term/graph.ts --update-baseline`. |

## The ship build

| Code | Cause | Fix |
|---|---|---|
| `TERM_ENGINE_VERSION` | The engine packages are not all one `0.8.4-hoody.N` version. | Rebuild the packed engine from the full patch series. |
| `TERM_ENGINE_UNPATCHED` | At start: the bundle runs on an engine without the host text filter or the link check. | Ship the bundle with the patched engine. |
| `TERM_REFUSED` | The bundle reached a module the build refused (web-only, partial sibling). | Port it. |
| `TERM_WEB_NEIGHBOUR` | Strict load or ship build: an `X.web.ts` reached the terminal, so its `X.web.term.ts` is missing. | Write `X.web.term.ts` beside it (same exports). |
| `TERM_WEB_ONLY_PACKAGE` | A file in the bundle imports a browser package. | Port the file. |
| `TERM_FIXTURE_INPUT` | A fixture-only file is an input of the ship build. Fixture-only means fixture or test code is the only thing that reaches it in the import graph, whatever its name (architecture.md, ship build). | Remove the run-time import of it. A shared helper that live code needs: import it from the live module, so the web app or the terminal entry reaches it. |
| `TERM_STUB_INPUT` | Ship build: a sibling still holds a `// term-stub: <Name>` marker from `new.ts`. | Port the stub, then delete its marker. |
| `TERM_LOAD` | A module failed to load during the build. | Read the message. |

## Symptoms without a code

**The page shows `‹Name›`.** A stand-in. The component's file imports a browser-only package and has no sibling.
Port it ([porting.md](porting.md)).

**"Text must be created inside of a text node".** A string was rendered outside a `Text` on stock OpenTUI without
the loader's delta. Run through the loader. In a sibling, wrap strings in `Text`.

**A key handler never fires.** In order of likelihood:
1. `useKeys` or `useFocusable` was called outside a `FocusRoot`. It registers nothing and says nothing. In a test,
   the component that calls the hook must be rendered under the root, not render the root itself.
2. A layer is open. The page gets no key.
3. The focused control took the key. A text field takes every printable key.
4. The terminal sends other bytes for that chord. See "What a terminal cannot tell apart" in
   [focus-keys.md](focus-keys.md).

**Tab skips a control.** It is disabled, has `tabStop={false}`, is under an invisible ancestor, or is scrolled out
of a `Scroll` that does not follow focus.

**Tab order looks random.** Tab order is drawn position, top to bottom then left to right. Two controls on the same
row are ordered by column.

**The frame is empty or one row.** The root has no height. Draw under `ScreenRoot` (the app does), or give the test
a size: `drawTest(node, { width, height })`.

**Text is cut with no ellipsis.** Every box clips. The text's box is narrower than the text and the text does not
truncate. Use `truncate`, `ClipText`, or let the row wrap. See [layout.md](layout.md).

**Two things are drawn on top of each other.** A row whose fixed parts are wider than the row. The gate calls it
`layout-overdraw`. Let one part shrink.

**A popup is cut off.** It is an absolute `Box` inside the page. Use a `Layer`.

**The page gate says `unsettled`.** The app never became idle within the time limit, or the frame kept changing. A
fixture state that loads for ever always does this. Otherwise look for a query without an answer, a timer of one
second or less that re-arms, or a render loop: `bun scripts/term/render.ts --page <id> --fx <state>`.

**The page gate says `golden` but I changed nothing on that page.** A shared component changed. Read the diff
lines. `--affected` selects pages by the files their last run loaded.

**A frame differs between two runs.** Something reads the real clock or real randomness. Frames are drawn on a
frozen clock (`scripts/term/clock.ts`). `performance.now()` and timers are not frozen.

**Colours are missing.** `NO_COLOR` is set, or `TERM=dumb`. Both give the mono tier and win over
`HUB_TERM_COLOUR`. Under `dev.ts` only `NO_COLOR` is read.

**A test passes alone and fails in the gate, or the reverse.** The `tests` gate runs one process per file. State
that leaks between files cannot be the cause. Look for a mount left open (`TERM_SESSION_ACTIVE`) or a renderer that
was not destroyed within the file.

**`diagnostic.term.test.ts` fails with "vocabulary current".** A code string (`'TERM_X'`, `new Error('X: …')`, a
route's `codes`) was added to Hub source and `src/term/app/diagnostic-codes.gen.ts` was not regenerated. Run
`bun scripts/term/diagnostic-codes.ts`. A code not in that file is reported as `UNHANDLED` by a mount.

**`diagnostic-codes.ts` stops with "a TERM_ code built at run time".** The scan reads whole literals only, so a code
put together at run time (`'TERM_X_' + state`) would never be in the vocabulary and every value of it would be
reported as `UNHANDLED`. Write each code out as its own literal, as `src/term/app/boot-code.ts` does for the boot
states. The scan refuses any bare `TERM_` prefix as a value in Hub source, whatever completes it, so a prefix test
(`code.startsWith(…)` on such a prefix) or a literal type of one is refused too: compare against the whole codes.

**`new.ts` prints "exists already".** The sibling exists. Edit it.

**`check.ts` on one page takes minutes.** It does: about 2 seconds per frame, two frames per
case. Use `render.ts` while you work and the full check before you commit.

**A file loads as it was before I edited the loader or a neighbour.** It should not: the dev loader keeps each
file's transform on disk (`scripts/term/transform-cache.ts`, one `transform.<hash>.jsonl` per loader version and
context in the cache directory, `HUB_TERM_CACHE` or `hub/.term-cache`) and serves it only while the file's text, its
web twin and every import's resolution are unchanged. To rule the cache out, run once with `HUB_TRANSFORM_CACHE=0`.
If the frame differs, that is a cache bug: report the file. Deleting the `transform.*.jsonl` files is always safe.
The cache is on by default. A pack file that grows past 64 MB is started again from empty, and pack files not used for
a day are removed. A cold process spends about 8 s of CPU transforming; a warm one about 1.5 s. The ship build and a
compiled `hoody hub` binary never use the cache, so a shipped Hub writes nothing beside itself.

**The contract says "cannot tell".** The sibling passes its props object whole to a helper or spreads it. The
check cannot follow that. It is a report, not a failure.

**The type check fails with `TS2307` for a `.module.css` import in a sibling.** A sibling does not import CSS.
Remove the import.
