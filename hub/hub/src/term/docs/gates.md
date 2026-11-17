# Gates

A gate is a check that must pass before terminal code is merged. One command runs them all:

```
bun scripts/term/check.ts
```

Run from `hub/` with `NODE_ENV=test`. It exits 1 when any gate fails.

## The command

| Flag | Does |
|---|---|
| `--page <id>` | Runs the page gate for one page. Skips the other gates unless `--only` names them. |
| `--affected` | Runs the page gate only for pages whose last run, green or red, loaded a file that has changed since, plus pages never run. A page red at its last run and unchanged since is named, not re-run. |
| `--changed [a,b]` | Checks only what a change touches (`scripts/term/changed.ts`): the files named, else every file whose content differs from the record. `contract` and `types` take those files and their importers (two levels, never through a barrel), `tests` the terminal tests among them or beside them, `pages` works as `--affected`, `kit` and `icons` run only when a kit file is in scope; `graph` runs whole. A gate with nothing in scope prints `skip`. With no list and no record: exit 2. Naming files does not narrow `pages`: it selects by what changed since each page's last golden run (`affectedPages`, `scripts/term/goldens.ts`), whoever changed it. Any change to a global input (a JSON table under `scripts/term`, a global stylesheet, the lockfile) selects all 25 pages, which is about a whole run: `--changed` on one kit file can take 50 min to reach the pages gate and then stop there at its 3000 s limit. Add `--skip pages,secrets` or `--only` when you want the short answer. |
| `--record` | A whole run (no `--changed`, `--page`, `--affected`, `--only`, `--skip`) that writes its failures as the record (`.term-cache/check-red.json`). Run it on the tree before your change. |
| `--jobs N` | Draws N pages at once. Default 1. Frames are the same for any N. |
| `--only a,b` | Runs only the named gates. |
| `--skip a` | Skips the named gates. |
| `--update` | The only switch that writes. It writes new frames, shrinks page allowances and shrinks the kit list. It never accepts a layout fault, an unsettled render or new debt. |
| `--json out.json` | Writes every result to a file. |
| `--scenario a,b` | Limits `scenarios`, `web-scenarios` and `mutants` to these scenario files, matched as `scripts/term/scenarios.ts` matches them: a component name, a path, or a path ending. Used alone it runs only those three gates; with `--only` it narrows the gates named (`check.ts --only web-scenarios --scenario SegmentedControl`). A name that matches no `src/**/*.scenario.ts` file: exit 2. |

check.ts reads every argument as a known flag or a known flag's value (`scripts/term/check-args.ts`). A bare word, an
unknown flag or a value flag with no value is refused with exit 2 before any gate runs:
`check.ts --only web-scenarios SegmentedControl` says `a scenario filter is --scenario SegmentedControl`. That bare
word and an unmatched `--scenario` both exit 2; test `scripts/term/check-args.term.test.ts`.

Gate names, in run order: `graph`, `contract`, `types`, `tests`, `scenarios`, `web-scenarios`, `mutants`, `pages`,
`secrets`, `kit`, `icons`. `web-scenarios` and `mutants` have their own section below. `scenarios` runs
`scripts/term/scenarios.ts` (with `--page`: the page's own scenario files; with `--changed`: those in scope or beside a
changed file). `secrets` runs `scripts/term/secrets.ts` on the same pages as the page gate.

**New versus already red** (`scripts/term/red-record.ts`). Every run prints the failures that are not in the record
first, under `NEW since the record`, then the ones that are, under `Already red at the record`. A failure is matched
by its signature: gate, rule, file without the line, and message with numbers blanked. The record is a view, never an
allowance: a recorded failure still fails its gate and the exit code. A whole run writes the record when there is none;
`--record` replaces it. Without a record every failure is listed as before, with a note.

Every gate child, and every child of the `hub:check` term step, runs with a minimal environment
(`scripts/term/child-env.ts`): `PATH`, `HOME`, `TMPDIR`, `TZ`, `LANG`, `LC_ALL`, `TERM`, `NO_COLOR`, `CI`,
`UPDATE_GOLDEN`, `SECRETS_PAGE_TIMEOUT_MS`, `GRAPH_FIXTURES_DIR`, `TERMSHOT`, any `TERM_*` or `HUB_*` setting, and `NODE_ENV=test`.
Nothing else from your shell or a `.env` reaches a gate.

A gate that checked nothing fails (`scripts/term/fail-closed.ts`, one test per case in
`scripts/term/fail-closed.term.test.ts`):

| Case | Result |
|---|---|
| An unknown name in `--only` or `--skip` (`--only tsts`) | Exit 2 before any gate runs, naming the unknown name. |
| `--only` and `--skip` leave no gate | Exit 2. |
| The tests gate finds no test file | `tests` fails. |
| A test file with no tests, whose tests are all skipped, that stops before its tests finish (no `Ran N tests` line), or that reports fewer tests than it declares | That file fails, even though `bun test` exited 0. |
| `contract.ts` with no sibling that has a web twin, `scenarios.ts` with no scenario file or no case (a name that matches no file), `secrets.ts` with no page or no drawn case | That script exits 1. |

## Reading the output

Each gate prints one line when it ends. Problems follow, each with the file, the gate and rule, what happened, and
what to do:

```
… pages
     schedules        42 cases   84 frames   184 s  2191 ms/frame  [settle 145 s in 2935 renders; mount 1.2 s; boot 4.0 s]  problems 86  layout: cut 2, offscreen 5, overdraw 3  crashes strict
FAIL pages (185.1 s): 1 pages, 84 frames in 185 s (jobs 1); zero placeholders and no crash: 1/1

Problems (file  rule  what  -> do):
src/pages/schedules/term-golden/many.80x24.txt  [pages/golden]  frame of "schedules" case "many" at 80x24 changed:
  line 5 want: " / Search schedules     ⚲ Filters       15 schedules  ↻ Refresh  ⚙ View options"
  line 5 got:  " / Search schedules     Filters           15 schedules  ↻ Refresh  View options"
    -> If intended: `bun scripts/term/check.ts --page schedules --update` and review ...

FAIL pages
```

The last line lists every gate that ran: `ok graph · FAIL pages`.

A step that fails (any non-zero exit, a time-out included) keeps its whole output in a log file:
`hub/.term-cache/check-logs/<gate>-<UTC time>-<pid>.log`. The file holds the command, the exit code (with `(timed out)`
when the step hit its limit) and every line the step printed. The problem line still shows the exit code and the last 3
lines, and ends with `(full output: .term-cache/check-logs/….log)`. Read the log before re-running: a long step (the
secrets sweep, the pages gate) may already hold the result of every page it reached. If the log could not be written, the
problem says `(log not written: <reason>)` and the step's own failure still counts. Only the newest 50 logs are kept:
each new log removes the oldest `.log` files in that directory, so a log named in an old problem line may be gone. Code: `scripts/term/step-log.ts` (`writeStepLog`, `exitMessage`), test
`scripts/term/step-log.term.test.ts`.

## What each gate catches

### `graph`

Runs `scripts/term/graph.ts --check`. It builds the import graph of the terminal entry, the shell and every page,
through siblings, and applies six rules (`scripts/term/graph/rules.ts`).

| Rule | Fails when | Fix |
|---|---|---|
| R1 | A sibling has no web file beside it, or value-imports its own web file. Warns when a sibling's web file would run as it is. | Add the web file or delete the sibling. Import types only. |
| R2 | A sibling's value export names differ from the web file's. | Export the same names. |
| R3 | A new import edge reaches a web-only module, or a listed edge is gone. Also, with no baseline: a shared (not `.web`, not `.term`) file that value-imports a web-only module or package only to pass it as `<Handoff>` children (the terminal Handoff never draws its children, the import still loads the module). | New edge: port the target or split the importer. Gone edge: record the decrease (below). Hand-off children: move the import and its JSX into a `.web.tsx` file with a `.web.term.tsx` neighbour, or give the part its own component with a `.term` sibling. |
| R4 | A new raw HTML element site appears in a module the terminal runs, or a listed site is gone. | New site: use a kit component or a prim. Gone site: record the decrease. |
| R5 | A file outside `src/term/prim` imports OpenTUI, uses an OpenTUI tag (`<box>`, or `createElement('box')` from React), or imports `src/term/prim/otui.ts` at run time (`el()`; a type-only import is fine). | Use a prim. If none fits, the prim is missing: add one to `src/term/prim`. |
| R6 | An import does not resolve, a sibling imports a web-only package, the handoff list is inconsistent, or the generated contract names drifted. | As the message says. |
| R7 | Code from a string (`new Function`, `Function()`, `eval()`), `import()` or `require()` of a computed specifier, or a non-`.web` module that re-exports `react-aria`, `react-aria-components`, `react-stately` or an `@react-aria/*`, `@react-stately/*`, `@react-types/*` package. No baseline: every site fails. A local name that shadows `eval`, `Function` or `require` is not counted. | Write literal imports (a map of literal `import()` calls for a choice). Import the aria hook where it is used, in a `.web.ts` file or a component with a `.term` sibling. |

R3 and R4 are ratchets over named sites, not totals. Removing one offender and adding another fails. The list is
`scripts/term/graph/baseline.json`. To record a decrease:

```
bun scripts/term/graph.ts --update-baseline
```

It only lowers the ratchet: gone entries are dropped, new ones are never recorded (they keep failing and are printed).
Recording growth needs `--allow-growth` on top, which prints each added entry for review: an exception, never routine.
After writing it judges the tree against the new baseline and prints that check, then `baseline written: ...: lowered
by N entries; remaining: M errors`; it exits 1 while errors remain. New R3 edges are reported once per edge, naming the
pages that reach it and what makes the target web-only (a global read and its line, a package); a target that is
itself a `.term` sibling is fixed in place. `check.ts --update` does not touch the baseline.

Other `graph.ts` flags: `--json`, `--md <file>`, `--rules R1,R2`, `--no-R3` (any rule), `--baseline <file>`,
`--handoff <file>`, `--seams <file>`, `--hub <dir>`, `--top <n>`, `--quiet` (still prints errors on failure).

### `contract`

Runs `scripts/term/contract.ts`: every sibling matches its web file in exports, types, props read and scenario
coverage. Explained in [scenarios.md](scenarios.md). To see why one component fails:

```
bun scripts/term/contract.ts --explain Band
```

`--only a,b` judges only those siblings (hub-relative paths) or components: the output and the exit code are theirs
alone (exit 1 when a name matches no sibling). Every failing obligation is followed by a `->` line saying what to do.

### `types`

Runs `scripts/term/typecheck.ts`: the terminal files under the web's TypeScript settings, with terminal
resolution. A problem is `src/file.tsx:line  [types/types]  message`.

It needs Bun's type package. It reads it from the directory named by `HUB_TERM_BUN_TYPES`, else from a
`types-bun/node_modules/@types` beside any directory above the hub (so a copy of the Hub finds the install beside it),
else from the hub's `node_modules`. Without it the script stops with `TERM_TYPECHECK_TYPES` and lists every directory
it looked in. Flags: `--json out.json`, `--quiet`, `--roots a,b` (check those files and what they import; used by
`check.ts --changed`). Declarations for untyped packages the scripts use live in `scripts/term/types/`.

### `tests`

Every `*.term.test.ts(x)` under `src` and `scripts`, one `bun test` process per file with a 300 second limit. A
wedged file fails alone. To run one:

```
bun test --preload ./scripts/term/test-preload.ts src/kit/states/States.term.test.tsx
```

To run tests against older or changed copies of files without touching the working files (to show a test fails on older code, or to compare two versions), add the shared
overlay preload, given FIRST: `OVERLAY_DIR=<dir> OVERLAY_SRC=<hub>/src NODE_ENV=test bun test --preload
./scripts/term/overlay-preload.ts --preload ./scripts/term/test-preload.ts <files>`. It fails with these refusals: `TERM_OVERLAY_NOT_SET`, `_DIR`, `_SRC`, `_EMPTY`,
`TERM_OVERLAY_NO_TARGET` (an OVERLAY_DIR file stands for no live file) and `TERM_OVERLAY_LATE` (overlay not first), all
exit 3 before any test; `TERM_OVERLAY_UNUSED` (no overlay file was read) fails the run at its end. OVERLAY_DIR has two valid
layouts: the same tree, or flat with `/` written as `_`.

One of these tests guards the gate tools themselves: `scripts/term/goldens-entry.term.test.ts`. A tool in
`scripts/term` that awaits a dynamic import at top level (`import('./x')` or `import(path.join(import.meta.dir,
'x.ts'))`) hangs for ever when the module it loads reaches the tool again through static imports: the tool waits on
its own evaluation. The test follows the static imports of every such target, from every `scripts/term` entry, and fails
when it reaches that entry. Type-only imports do not count. To fix one, load the module that closes the cycle lazily
inside the function that needs it, or move the shared code into a third module. Example: `golden-guard.ts` loads
`./secrets` lazily, because `goldens.ts` → `golden-guard.ts` → `secrets.ts` would otherwise close a cycle. The test reads
the import graph from source, without running anything, through `scripts/term/static-imports.ts`. `goldens.ts` uses the
same helper to find its global inputs (see [goldens-shots.md](goldens-shots.md), `--affected`).

The preload (`scripts/term/test-preload.ts`) sets up every terminal test the same way, in this order:

| Step | Effect on your test |
|---|---|
| DOM-global traps (`src/term/env/install-strict.ts`) | A read of `window`, `document`, `localStorage` and the like throws `TERM_GLOBAL`, also while files load. The same traps the ship build has. |
| The outside-world fence (`scripts/term/test-net-guard.ts`; rules in `scripts/term/net-policy.mjs`, one module for every guard) | No network except a numeric loopback address (`127.0.0.1`, `::1`) on a port of a listener the test itself opened and still holds; a listener's permission ends when `close()` is called, not at its later `close` event. `localhost` and every other name are refused and no DNS is asked: every `dns` lookup, resolve and `reverse`, on the module, its promises API and every `Resolver` instance, throws (`TERM_NET_DENIED`). A listen with no host is pinned to `127.0.0.1`. No subprocess (`TERM_SPAWN_DENIED`). The gate runners are fenced too: every gate child gets `BUN_OPTIONS=--preload=<hub>/scripts/term/net-guard-runner.ts` and `NODE_OPTIONS=--import <hub>/scripts/term/net-guard-node.mjs` (`scripts/term/child-env.ts`), so Bun and Node children at any depth, Bun Workers, worker threads and vitest run behind the same rules; a runner may start only Bun or Node children, directly or through `nice`, `flock`, `bash` or `sh`. `nice` and `flock` take only the options on their allowlists (`flock -c` and `--command` are refused: they run a shell string). A shell may run only a script in `SHELL_ENTRIES` (`net-policy.mjs`): `scripts/term/vitest-narrow.sh`, or `scripts/term/gate-slot.sh`, whose forwarded command is judged by the same rules. Bun and Node may not start a package script or binary: `bunx`, `bun x`, `bun run <script name>`, `bun install`, a bare `bun <word>` and `node --run` are refused; a file, `test`, `build`, `run <file>` or eval code is accepted. A child is judged by the real file it would run, never its name (`scripts/term/net-exec.mjs`): the program is resolved with the child's own `PATH` and working directory, symlinks followed, then compared with sets fixed when the guard installed, from the guard's own `PATH`. Runtimes are this process's runtime and the `bun` and `node` that `PATH` names; tools are its `nice`, `flock`, `bash` and `sh`. A `node` in some other directory is not Node. `fork` is judged by its `execPath` when one is given. Any spawn `shell` option is refused (a shell command line cannot be judged), and so are `exec` and `execSync`. UDP is refused too: `dgram.createSocket`, `new dgram.Socket` and the network methods of its socket prototype throw `TERM_NET_DENIED`. `scripts/term/vitest-narrow.sh` installs the fence itself, so a caller with a clean environment gets the same fence. A `BUN_OPTIONS` or `NODE_OPTIONS` of your own does not reach a gate child. Tests: `scripts/term/net-policy.term.test.ts`, `scripts/term/net-exec.term.test.ts`, `scripts/term/child-env.term.test.ts`; proof across processes: `scripts/term/net-guard-proof.ts`. From the environment only these survive: `PATH`, `NODE_ENV`, `TZ`, `LANG`, `LC_ALL`, `TERM`, `FORCE_COLOR`, `NO_COLOR`, `TMPDIR`, `CI`, the tooling's own settings `UPDATE_GOLDEN`, `SECRETS_PAGE_TIMEOUT_MS` and `GRAPH_FIXTURES_DIR`, and every name starting `TERM_`, `HUB_` or `BUN_`. Anything else set in the shell or a `.env` (a token, a profile, a URL) does not reach the test. A setting named in these pages as `NAME=` must survive: the test "tooling knobs kept" in `scripts/term/test-net-guard.term.test.ts` checks it. `HOME` and the config directories point at a fresh empty directory. |
| The terminal loader, `fixture` flavour, fixtures on | Siblings resolve. A test must not install its own loader. |
| The terminal host environment and the router's globals | `hostEnv()` answers as a terminal. |
| A trap check around every test | A DOM-global read that the code under test caught and swallowed still fails the test, at its end, with `TERM_TRAP_UNDECLARED` naming the global and the reading line. A test that traps on purpose says so first: `expectTraps('document')`, or `expectTraps('*')` for a test of the traps themselves (from `src/term/env/strict-globals.ts`). |

A test that mounts the Hub must pass `styles`: band tables through `stylesFromBands(...)`, or
`UNSTYLED_FOR_TESTS` when it draws no class styles (both from `src/term/app/styles.ts`). Without it the mount stops
with `TERM_STYLES_REQUIRED`.

A stored frame that changed on purpose: tests that use `toMatchSnapshot` rewrite with `bun test --update-snapshots`.
Review the diff.

`src/term/test/schedules.golden.term.test.ts` keeps its own golden files and rewrites them when `UPDATE_GOLDEN=1`
is set (the variable reaches a test under the preload). Review the
diff.

The root script `hub:term-test` runs this gate alone.

### `pages`

The page gate. For every page it draws every case at 80x24 and 120x40 and compares each frame to a stored text
file. Details of cases, files and allowances are in [goldens-shots.md](goldens-shots.md).

Every case runs with the fixed web origin `https://hub.example.test` (`scripts/term/fixture-origin.ts`), so a
hand-off draws its link form. The first case of a page whose frame shows that origin also runs once with no origin, as
`<case>-no-origin`, so the path form a host without an origin gets has its golden too.

| Rule | Means | Fix |
|---|---|---|
| `golden` | A frame differs from its file. The message shows the changed lines. | Intended: `--update`, then review the file. Else fix what moved. |
| `golden-missing` | A case has no file yet. | `--update`, then review the new file. |
| `golden-stale` | A file exists for a case that is gone. | `--update` removes it. |
| `golden-crash-stored` | A stored golden is a crash frame (an error screen or the `hoody hub: stopped …` line). | Fix the crash, then `--update`. A crash frame is never stored. |
| `golden-secret`, `golden-secret-stored` | A drawn frame, or a stored golden, holds one of the page's fixture secrets. | Fix it in the page, never in the golden. See "What is never a golden" in [goldens-shots.md](goldens-shots.md). |
| `reveal-missing` | A reveal case (a case that shows a fixture secret on purpose, listed in `REVEAL_CASES` in `scripts/term/golden-guard.ts`) no longer shows the secret. The reveal flow broke. | Fix the reveal in the page. If the case no longer reveals by design, remove its row from `REVEAL_CASES`. |
| `golden-reveal-stored` | A stored golden exists for a reveal case. A reveal case is judged by every gate but never stored. | `--update` removes it. |
| `golden-secrets-unreadable` | The page's fixture secrets could not be read, so no frame of the page can be judged for secrets. | Fix what the message names (the page's fixtures fail to load). |
| `allowance-missing` | The page has no `allowance.json`. | `--update` writes the first one. Review it. |
| `unsettled` | The page never stopped changing within the time limit. | Find the query that never answers, the timer that re-arms, the render loop: `render.ts --page <id> --fx <state>`. |
| `layout-overdraw`, `layout-cut`, `layout-text-cut`, `layout-offscreen`, `layout-popup-clipped`, `layout-explosion`, `layout-scrolled-open` | A layout fault. Never allowed. | See [layout.md](layout.md). |
| `new-crashes` | The page throws while drawing. | Fix the throw at its source. |
| `new-placeholders` | A stand-in component is drawn that the allowance does not list. | Port it, or keep the page off it. |
| `new-holes` | A missing non-visual export was read or called. | Port it. |
| `new-traps` | A DOM global was read while drawing. | Go through `hostEnv()` or a sibling. |
| `new-domRefused` | Shared code asked an element ref for a member the terminal does not answer. | Port the caller. |
| `new-domUnsupported` | Raw HTML carries an event the compat runtime does not honour. | Port the component. |
| `new-consoleErrors` | Something logged an error while drawing. | Fix it. |
| `untranslatable-grew` | More CSS classes on the page could not be translated than before. | Simplify the CSS or port the component. |
| `crash` | The page's child process died, or the strict pass failed. | `bun scripts/term/goldens.ts --page <id>` and read its last line. |
| `no-first-frame` | The page's child drew no first frame within `HUB_GOLDEN_FIRST_FRAME_MS` (default 120 s) and was stopped. The usual cause is an import deadlock: a module that awaits its own evaluation through a dynamic import. | Run `bun scripts/term/goldens.ts --page <id>` and look for a top-level `await import(…)` in what the page loads. The setting is a `HUB_*` one, so it also reaches `check.ts` children. |
| `shot-wait-text` | A shot's `waitForText` is not on its 120x40 frame: the terminal draws something else under the shot's name. The match collapses whitespace (line ends included) and also reads every strip between two vertical-border columns, so a line that wraps inside a card or beside the nav still matches (`frameShows`, `scripts/term/wait-text.ts`). | Draw that state in the `.term` sibling with the web's words, or correct the shot if the web changed. A new miss is never listed. |
| `wait-text-debt-stale` | A row in the page's `waitTextDebt` no longer misses (fixed, or the shot is gone). | `--update` drops the row. The list only shrinks. |
| `wait-text-debt-malformed` | A `waitTextDebt` row lacks `case`, `text`, `owner` or `reason`. | Correct the row (`scripts/term/wait-text.ts`). |

The strict pass draws the default case once more at 120x40 with DOM globals trapped. A failure there shows as
`crashes strict` in the page's summary row.

Known debt. `waitTextDebt` in each page's `allowance.json` lists the shots whose wait text the terminal
misses, each with an owner and a reason; it only shrinks.

Shots with `click`, `keys` or `act` are replayed (`scripts/term/shot-replay.ts`): the web runner's steps
(click, then keys, then act) run on the terminal's semantics tree before the frame is judged, so the golden is the page
AFTER the action (and `waitForText` is judged on that frame). Mapping: a plain name is a button, link, menuitem, tab,
switch, checkbox or radio whose name holds it (a text field for `fill`, shown text for `waitFor`); `role=R[name=...]`
with Playwright's name forms (`"x"` holds, `"x"s` exact, `/re/`), `[checked|selected|expanded|pressed|disabled]`,
`[level=n]`; `text=`; `nth=`; `A >> B`. Keys: Enter, Escape, Tab, Shift+Tab, Arrow*, Home, End, PageUp/Down,
Backspace, Delete, Space, Control+letter, one character. A click hits the middle of the node's box; a target drawn off
screen is wheeled into view first; `fill` replaces the value and checks the field then holds exactly the text.
What cannot be replayed is never guessed and never drawn without its action: `css=`, `xpath=` and other engines,
`hover`, Meta/Alt keys, another realm, no computer (no case, found when the cases are read); at run time a target the
terminal does not draw, a disabled target, a `waitFor` that never shows. Each is listed in the page result's `skipped`
(`skipped <case>: <why>` lines under the summary row); the reason names the selector part the terminal lacks
(`role=row[name=/OpenAI/] matches 5, nothing under it matches role=button[name="Row actions"]`). A DOM-global trap or
page failure during a replay is still a hard fail (`trap`), and the skip reason says it fired.

A fixture state that loads for ever is `unsettled` unless the page's `fixtures.ts` declares it in `loadingStates`.
A declared state that settles fails as `loading-settled`. See [goldens-shots.md](goldens-shots.md), "A state that
never settles".

### `kit`

Classifies every export of the kit (`scripts/term/kit-classes.ts`):

| Class | Meaning |
|---|---|
| `shared` | The web file runs in the terminal as it is. |
| `ported` | It has a sibling. |
| `auto` | No sibling. The compat runtime and the CSS translator draw it. An approximation. Recorded in `kit-classes.json` `auto`: a new one is a reviewed hand edit. |
| `placeholder-allowed` | Drawn as a stand-in (or its sibling still holds the `// term-stub: <Name>` marker of `new.ts`), and listed in `scripts/term/kit-classes.json`. |
| `handoff` | Never ported. The terminal shows where to open it on the web. |

| Rule | Means | Fix |
|---|---|---|
| `kit-placeholder-new` | An export became a stand-in and is not listed. | Port it. The list never grows. |
| `kit-placeholder-stale` | A listed export is no longer a stand-in. | `check.ts --only kit --update` shrinks the list. |
| `kit-classes-missing` | The list file is missing. | `check.ts --only kit --update`, then review. |
| `kit-auto-new` | A new export draws only approximated (no sibling, no hand-off) and is not in `auto`. | Write its sibling (`new.ts`), hand it off, or add it to `auto` by hand after reading its frame. `--update` never adds. |
| `kit-auto-stale` | A name in `auto` is no longer auto (ported, or gone). | `check.ts --only kit --update` drops it. |
| `kit-auto-missing` | `kit-classes.json` has no `auto` record. | `check.ts --only kit --update` writes the first one; review it. |

### `icons`

Runs `src/kit/icons.term.test.tsx`: every icon name has a terminal glyph of the right width. Fix: add the name to
the glyph table (`src/kit/icons.glyphs.ts`).

## What `hub:check` adds after `check.ts`

The whole-Hub check (`hub/scripts/check.ts`, term step) runs, in order and all of them, failing if any failed:
`scripts/term/check.ts` (its `scenarios` and `secrets` gates included), `scripts/term/test-runners.ts` (every
`*.test.*` / `*.spec.*` under `src` and `scripts` is matched by vitest, the term gate or Playwright, and by the one its
imports are written for), `scripts/term/docs-check.ts`, then
the ship gate `scripts/term/build/ship-gate.ts` (minified build, then the built bundle mounted with its defaults; see
[architecture.md](architecture.md)).

`hub:check --page <id>` runs, as its term step, `scripts/term/check.ts --page <id> --only
graph,contract,kit,types,tests,scenarios,web-scenarios,mutants,pages,secrets`: the static gates whole (about 35 s);
the page's own `*.term.test.*`; the typecheck of the page's terminal files and every `.term` file its last golden run
loaded; the scenario files beside what that run loaded, on the terminal and on the web; the mutants of the page's own
scenario files; its goldens; the secret gate. A page never run is scoped to its own folder (one line says so). `--skip
term` leaves it out. Measured on `keys`: types 25 s, scenarios 42 s (523 cases), web-scenarios 32-45 s.

### `web-scenarios` and `mutants`

`web-scenarios` runs the same scenario files against the WEB components (`src/term/scenario/scenarios.web.test.ts`
through `scripts/term/vitest-narrow.sh`, `HUB_SCENARIO=<files>`), inside a gate slot (`flock` on
`<base>.<0-5>.lock`, base from `HUB_GATE_SLOTS` or the host file `~/.config/hoody-hub-term/gate-slots`, see
`scripts/term/gate-slot.ts`; neither, or no slot directory, means no lock). A green run with no case
fails. `mutants` runs `scenarios.ts --mutants`: a prop whose handling can be removed without any case failing fails
the gate (`mutant X survived`). Mutants run only scoped (`--page`: the page's own scenario files; `--changed`: those in
scope) or with `--only mutants`; a whole run skips them with a line.

### Caution: when `node_modules` is a link

In a copy of the Hub whose `node_modules` is a symbolic link into another tree, a
write under `node_modules` is a write into that other tree. The Hub scripts avoid it by
default (read in `scripts/lib.ts`):

| What would write there | Default |
|---|---|
| The work directory (tsc build info, lint caches, vitest cache, Playwright output), once `node_modules/.cache/hub-work`. | `hub/.term-cache/cache/hub-work` when `node_modules` resolves outside the copy. `HUB_WORK_DIR` still overrides it. |
| Vite and vitest bundled their config into `node_modules/.vite-temp`. | Every vite and vitest call from `scripts/lib.ts` and `scripts/term/vitest-narrow.sh` gets `--configLoader runner`: the config loads in process and nothing is written. |
| Vite's own cache (`node_modules/.vite-hub`, `vite.config.mts`) and the production build's (`node_modules/.vite-hub-build`, `scripts/build.ts`). | `hub/.term-cache/vite-hub` and `hub/.term-cache/vite-hub-build`. `HUB_CACHE_DIR` still overrides both. |
| Playwright output and report (`playwright.config.ts`, `playwright.shots.config.ts`). | `hub/.term-cache/hub-playwright*`. `HUB_PW_OUT` and `HUB_PW_REPORT` still override them. |
| `bun run hub:vitest` and `hub:board-sync` (`package.json`). | Both pass `--configLoader runner`. |

`bun scripts/term/nm-write-guard.ts [--page <id>]` proves it for a copy: it runs one narrow web test and one page
gate with the defaults, then lists every path under the real `node_modules` cache directories that changed. Exit 1
when any did. Pinned by `scripts/term/nm-write-guard.term.test.ts`. Another process that shares the same `node_modules` can
write there at the same moment, so read the paths it prints.

On a machine shared with other test runs, run `hub:check` inside a gate slot, as any vitest run, and set `TMPDIR` to a directory beside
the copy. Take the slot with `scripts/term/gate-slot.sh`:

```
cd <repository root> && /bin/bash -p hub/scripts/term/gate-slot.sh bun hub/scripts/check.ts --page keys --skip e2e
```

It waits at most 300 s for one of the six slots and sets `HUB_GATE_SLOT_HELD=1` for everything below it. The
`web-scenarios` gate then takes no second slot (`scripts/term/gate-slot.ts`; with the marker unset it takes its own).
Already holding a slot from your own `flock`? Set `HUB_GATE_SLOT_HELD=1` yourself. No slot directory on the host: the command runs
directly. Tests: `scripts/term/gate-slot.term.test.ts`.

## Every entry runs inside the test boundary

Every test entry re-runs itself inside a kernel boundary before any of its own code: the `bun test` preload, every
runnable script under `scripts/term` (`check.ts`, `secrets.ts`, `scenarios.ts`, `render.ts`, ...), `vitest-narrow.sh`
and `gate-slot.sh` (`scripts/term/netns.sh`). Inside:

- the only network is loopback (fakes you start still answer; nothing else does);
- the environment is rebuilt from named keys (no token, no `BASH_ENV`), and descriptors above 2 are closed;
- the filesystem is the working copy's directory (read-write), `/usr` `/etc` `/bin` `/lib*` and the `node_modules` trees
  (read-only), and the sibling-tree source files listed in `scripts/term/netns-read.list` (read-only). `$HOME`, `/tmp`,
  `/run` and `/dev/shm` are fresh and empty. Nothing else of the host exists.

What this means for you:

- Start a shell entry with `/bin/bash -p` (or run it by its path: the first line carries `-p`). Plain `bash x.sh`
  refuses (`TERM_NETNS_NOT_PRIVILEGED_SHELL`).
- Keep `TMPDIR`, `HUB_WORK_DIR`, `HUB_CACHE_DIR` and `HUB_TERM_CACHE` inside the working copy's directory, or the entry refuses
  (`TERM_NETNS_PATH_OUTSIDE_TREE`).
- A test that reads another repository's source needs its path in `netns-read.list`, or, for a tree only one host has,
  in that host's `/etc/hoody-hub-term/read-list` (same format and checks). Source only: never a credential, database
  or whole repository. A missing line shows up as "file not found" inside the boundary.
  A line is `<root>:<path>`: `<root>` is a name of `READ_ROOT_NAMES` in `scripts/lib.ts` (`kit`, `sdk`, `docs`, `api`),
  `<path>` is relative to it, and may be a glob. Example: `sdk:lib/bot-label.ts`. Where each root is on this
  machine comes from the host file `/etc/hoody-hub-term/read-roots`, one `<name> <absolute path>` per line (letters,
  digits and `._/-` only; `#` at the start of a line or after a blank starts a comment); a root it does not name (or
  no file) shows nothing. An unknown root, or an absolute or `..` path, refuses
  (`TERM_NETNS_READ_LIST_BAD`); a read-roots line that is bad refuses (`TERM_NETNS_ROOTS_FAILED`).
- Both host files are used only when `/etc/hoody-hub-term` and the file are each not a link, owned by root and not
  group- or world-writable, and the file is a readable regular file (`host_file_state` in netns.sh, `hostFileState`
  in `scripts/lib.ts`). Otherwise the file counts as absent (no roots, no extra entries) and one `not used` line goes
  to stderr. netns.sh takes this verdict on the host before it enters its user namespace, because inside it real root
  and any other unmapped user show as the same id.
- A `node_modules` in `hub` or any directory above it that leads outside the working copy's directory (a link into
  another tree) is bound read-only only when its real path is a directory named `node_modules`, outside `/proc`,
  `/sys`, `/dev`, `/run`, `/boot` and `/etc`, not `$HOME` itself and not a directory holding the working copy.
  Anything else (a link to another repository, to `/run`, to `/proc`) refuses (`TERM_NETNS_NODE_MODULES_REFUSED`
  and the link's path, exit 3) instead of showing that directory inside.
- No user namespaces on the host: nothing runs (`TERM_NETNS_UNAVAILABLE`, exit 3). There is no fallback.

Proof: `NODE_ENV=test bun scripts/term/net-guard-proof.ts` (starts outside on purpose; exit 0 = proven). Tests:
`scripts/term/netns.term.test.ts`, `scripts/term/net-policy.term.test.ts`.

## Checks no gate runs

| Check | Command | When |
|---|---|---|
| Mutants, whole tree | `bun scripts/term/scenarios.ts --mutants [names]` | The `mutants` gate runs only in a scoped run (`--page`, `--changed`, `--only mutants`). Run this for a sibling that reads a safety prop when no scoped run covers it. |
| Frame identity across job counts | `bun scripts/term/goldens-identity.ts --out <dir>` | After changing the settle logic or the gate. |
| A page made from a template settles on its first run | `NODE_ENV=test bun scripts/term/template-proof.ts [--layout <l>] \| --all [--templates <dir>]` | After changing a page template (`hub/templates/page-*`). It fills the layout in as `src/pages/zzterm-<layout>/`, runs the page gate on it (nothing written beside the page) and removes it, signal or not; an existing directory of that name is refused. Fails on a crash, `unsettled`, `loading-settled` or a trap. It writes into the tree for its run, so other runs on the same copy see the page for a minute; `--templates` takes a staged copy of the templates. |
| The network fence follows children | `bun scripts/term/net-guard-proof.ts` | After changing `net-policy.mjs` or a guard. It checks that Bun and Node children, nested children, Bun Workers and worker threads are all refused, and also probes a command forwarded through `gate-slot.sh`, the UDP constructor and `createSocket`, and shell `spawn` options. |

## The docs check

`scripts/term/docs-check.ts` reads every `.md` file under `src/term` and `scripts/term`. It fails when:

| Rule | Means |
|---|---|
| `path` | A backticked path starting `src/`, `scripts/` or `hub/` does not exist. |
| `link` | A relative Markdown link points at nothing. |
| `script` | A named `scripts/term/<name>.ts` does not exist. |
| `flag` | A `--flag` written after a script's name does not occur in that script's source. |
| `code` | A `TERM_...` code occurs nowhere in `src` or `scripts/term`. |
| `absent` | A file the doc declares as not created yet now exists. |
| `prim` | An export of a prim file is missing from [prims.md](prims.md), a table row there names no real export, or the barrel list differs from `src/term/prim/index.ts`. |
| `list` | A written-out export list (`<!-- exports-of: <file> -->` ... `<!-- exports-of:end -->`) differs from that file's exports, or names a file that does not exist (`scripts/term/docs-lists.ts`). Write such a list once and link to it. |

Paths with placeholders (`<id>`, `X.tsx`, `*`) are skipped. A file that is created only when first needed is declared in the
doc with an HTML comment, `docs-check: absent` followed by the path; the check then accepts the name and fails once the file appears. `--json` prints the findings as JSON.

## Order that saves time

1. `contract.ts --explain <Component>`: seconds.
2. `scenarios.ts <name>`: seconds.
3. `bun test` on the one test file: seconds.
4. `render.ts --page <id> --layout`: about 6 seconds.
5. `check.ts --changed`: what your change touches, NEW failures first (after one `check.ts --record` on the tree
   before your change).
6. `check.ts --page <id>`: minutes per page.
7. `check.ts`, whole, before you commit.
