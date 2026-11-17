# Goldens and screenshots

Two different things:

- A **golden** is a frame stored as plain text. The page gate compares against it. It lives in the working copy and
  is reviewed like code.
- A **shot** is a PNG of the app running in a real pseudo-terminal. It is for people to look at. It is not a gate.

## Goldens

### Cases

A case is one thing the page gate draws. The cases of a page come from the files the web already has:

| Source | Case name | Drawn |
|---|---|---|
| Each fixture state in the page's `fixtures.ts` | The state's name (`many`, `empty`, `loading`) | The page at that state. |
| Each entry in the page's `shots.ts` that has a `path` or steps (`click`, `keys`, `act`) | `shot-<name>` | The page at that state and path (`?sel=...`), after its steps. |
| The first case whose frame shows the fixture web origin (a hand-off) | `<case>-no-origin` | The same case with no web origin, once per page, so the path form of a hand-off has a golden too. |

The steps are replayed on the terminal before the frame is judged; a shot with a step the terminal cannot replay is
listed as skipped ([gates.md](gates.md)). Also no case: a shot with a `realm`, a shot with `computer: false`, and a
shot with neither steps nor a `path` (its state is already a case).

Each case is drawn at 80x24 and at 120x40. `schedules` has 42 cases, so 84 frames.

A wide case is drawn at two more sizes:
- `WIDE_SIZE` (200x50), stored like the others;
- `LAYOUT_SIZE` (240x67), judged for layout faults only and never stored.

Wide cases are the page's default state plus its main states. A page names its main states with `wideStates` in its
`fixtures.ts`. Without that list, the main states are `many` and `long` where the page has them. The sizes live in
`scripts/term/goldens.ts` (`SIZES`, `WIDE_SIZE`, `LAYOUT_SIZE`, `sizesOf`); the test is
`scripts/term/goldens-wide.term.test.ts`. A page with no 200x50 files reports one `golden-missing` at 200x50.

### Files

```
src/pages/<id>/term-golden/<case>.80x24.txt
src/pages/<id>/term-golden/<case>.120x40.txt
src/pages/<id>/term-golden/<case>.200x50.txt   (wide cases only)
src/pages/<id>/term-golden/allowance.json
```

A frame file is the screen as text, trailing spaces trimmed. Colour is not stored.

### The allowance

`allowance.json` is the page's reviewed debt. Real file, `src/pages/schedules/term-golden/allowance.json`:

```json
{
  "crashes": ["strict"],
  "placeholders": [],
  "holes": [],
  "traps": ["document"],
  "domRefused": [],
  "domUnsupported": [],
  "consoleErrors": [],
  "untranslatable": 0
}
```

| List | Holds |
|---|---|
| `crashes` | Cases that throw while drawing. `strict` is the strict pass. |
| `placeholders` | Stand-in components the page draws. |
| `holes` | Missing non-visual exports the page read or called. |
| `traps` | DOM globals the page read. |
| `domRefused` | Element members shared code asked for that the terminal does not answer. |
| `domUnsupported` | Events on raw HTML the compat runtime does not honour. |
| `consoleErrors` | Errors logged while drawing. |
| `untranslatable` | A count: CSS classes on the page that could not be translated. |

The allowance only shrinks. `--update` drops what is gone and never adds. Adding an entry is a hand edit that shows
in the diff. A layout fault and an unsettled render have no list: they can never be allowed.

The goal for a page is an allowance with every list empty and `untranslatable` 0.

### A state that never settles

A case that is still busy at its deadline (20 s) fails as `unsettled: <what is pending>` (the query, timer or view
still under way). A state that loads for ever on purpose (a spinner state) is declared in the page's `fixtures.ts`:

```ts
export const loadingStates = ['loading'];
```

The gate draws such a state after 3 s and does not fail it as unsettled; if it settles, it fails as `loading-settled`
(take it out of the list). A page run still going after 30 min is stopped and reported as `timeout`.

### What is never a golden

`scripts/term/golden-guard.ts` decides it:

- **A crash frame:** an error screen ("This page could not be drawn.", the router's error, a stack) or the
  `hoody hub: stopped …` line. `--update` never stores it, and removes a stored crash frame of that case; the crash
  is judged by the `crashes` list of the allowance. A stored golden that is a crash frame fails the check
  (`golden-crash-stored`) until `--update` refreshes it.
- **A frame holding a fixture secret** of the page (the secrets gate's `pageNeedles` and `hitOf`): never stored, and
  the case fails (`golden-secret`); a stored one fails (`golden-secret-stored`). Fix it in the page, never in the
  golden.
- **A reveal case:** a case that shows a fixture secret on purpose (a reveal flow), listed by page in `REVEAL_CASES`
  (`scripts/term/golden-guard.ts`; today `vault`: `shot-value-shown`). It is judged by every gate but never stored or
  compared: no golden and no identity copy. A frame that no longer shows the secret fails (`reveal-missing`), and a
  stored golden of the case fails (`golden-reveal-stored`). Any other frame holding a secret still fails
  (`golden-secret`).
- Problem text is passed through the secrets gate's redaction, so a diff line never prints a secret.

### Commands

```
bun scripts/term/check.ts --page schedules             # compare
bun scripts/term/check.ts --page schedules --update    # write changed frames, shrink the allowance
```

`check.ts` calls `scripts/term/goldens.ts`. You can run it directly:

| Flag | Does |
|---|---|
| `--page <id>`, `--pages a,b` | Which pages. |
| `--affected` | Only pages whose last green run loaded a changed file, CSS modules included. A global input selects every page. The global inputs are:
- a global stylesheet: plain `.css`, or a module with `:global` / `composes … from`;
- a JSON table of `scripts/term` that a page run reads: one named in a string literal by a module that `goldens.ts`
  loads (`pageRunJson`, through `static-imports.ts`);
- the lockfile.

A gate's own data (`graph/baseline.json`, kit classes, typecheck allowances, translator fixtures) selects no page. State is in `.term-cache/goldens-green.json`. |
| `--jobs N` | Pages drawn at once. |
| `--update` | Write. |
| `--no-strict` | Skip the strict pass. |
| `--frames-out <dir>` | Also write every drawn frame to a directory. |
| `--json <file>` | Results as JSON. |

Its last line of output is `GOLDEN_RESULT <json>`.

### Reviewing a golden change

A changed frame prints its changed lines:

```
src/pages/schedules/term-golden/many.80x24.txt  [pages/golden]  frame of "schedules" case "many" at 80x24 changed:
  line 5 want: " / Search schedules     ⚲ Filters       15 schedules  ↻ Refresh  ⚙ View options"
  line 5 got:  " / Search schedules     Filters           15 schedules  ↻ Refresh  View options"
```

Ask of every changed line: did I mean to change this? Here two icons vanished. That is a regression, not something
to accept with `--update`.

After `--update`, read the `.txt` diff in full. A golden records what is drawn, right or wrong.

### What makes frames repeatable

- **Seeded randomness.** Goldens seed `Math.random`, `crypto.getRandomValues` and `crypto.randomUUID`, reseeded per
  case: a generated name is the same in every run.
- **A frozen clock.** `scripts/term/clock.ts` fixes `Date.now()` at 2026-11-11 09:00 UTC and sets `TZ=UTC`. "In 3
  minutes" never changes. Short timers run in real time.
- **Held fixture delays.** In fixture runs a fixture answer delay over 1 second (`src/app/fixtures.ts`,
  `src/core/transport.ts`: slow answers, a 60-second "loading" answer) never fires until `session.releaseHeld()`.
  Other long timers (a toast's dismissal, the crypt store's ready timeout) run. The frame shows the in-flight state on any host,
  however loaded. `TERM_HOLD_LONG=0` turns this off. A live mount never holds.
- **Settling.** A frame is taken only when the app is idle and the frame has stopped changing.
  - Idle (`src/term/app/idle.ts`): no query fetching or paused, no mutation running, no lazy view loading, no timer
    of 1 second or less from Hub code pending, no `setImmediate` pending (React's scheduler).
  - The renderer's input parser holding bytes (a lone ESC waits for its timeout to become the Escape key) also
    counts as busy.
  - Timers count only when Hub code set them itself (the caller of `setTimeout` is a `hub/src` frame); a library's
    timer (React's scheduler, TanStack, the renderer) never counts and is never held. `TERM_IDLE_DEBUG=1` names the
    callers of a pending timer.
  - With long timers held, a query still fetching once nothing short is left is `held`, not waited on: a state that
    never answers settles as its loading frame.
  - Then the frame must be identical for `TERM_SETTLE_STILL` renders in a row. Default 3.
- **Identity across job counts.** `bun scripts/term/goldens-identity.ts --out <dir>` draws pages with different `--jobs` and
  fails when a frame differs. Reference: jobs 1, 10 still frames; candidate: `--jobs` (2), `--still` (3). Flags:
  `--out <dir>` (required), `--pages a,b`, `--jobs 2`, `--still 3`.

A case that never becomes idle is reported `unsettled` after its time limit (20 s), naming the pending query keys,
timers (first `src/` line that set each) and immediates. Usual causes: a short timer that re-arms itself, a render
loop, a very slow host.

Across processes (`shots.ts` drives `dev.ts` in a pty), `TERM_IDLE_FILE=<path>` makes `dev.ts` write
`{gen, idle, pending}` there; `gen` rises each time the app goes idle and stops writing for 150 ms. Read `gen` before
an action, then wait for a higher one.

### Test goldens are a different thing

Some `*.term.test.tsx` files keep their own snapshots in a `__snapshots__` directory beside them. Those belong to
the `tests` gate. See [gates.md](gates.md).

## Looking at one render

```
bun scripts/term/render.ts --page schedules --fx many --cols 80 --rows 24
```

| Flag | Does |
|---|---|
| `--page <id>` | The page. Default `schedules`. Unknown id: `TERM_NO_PAGE`. |
| `--fx <state>` | A fixture state. Default: the page's default. |
| `--cols`, `--rows` | Size. Default 120x40. |
| `--path <path>` | A whole Hub path with its search, such as `'/schedules?sel=a'`. Default: the page's own path. It is not added to the page's path. A path that is not the page's route or below it (`--path '?sel=a'`, another page's path) is refused with `TERM_BAD_PATH`, naming the path and the whole path to give. |
| `--web-origin <https://host>` | The web Hub origin the host gives. Default `https://hub.example.test` (`scripts/term/fixture-origin.ts`, a reserved name, never a real host), so a hand-off draws its link form. |
| `--no-web-origin` | No origin: the path form a host without one gets. |
| `--bare` | Draws the page without the shell. |
| `--no-css` | Draws without translated class styles. |
| `--sem`, `--sem-only` | Print the semantics tree. |
| `--layout` | Print layout faults. |

It prints the frame, then the report. It exits 1 when the page failed, did not settle, used an unsupported export
or touched an allowance hole. The first form takes about 6 seconds.

From a script, `renderPage({ page, fx, cols, rows, path, webOrigin })` (`webOrigin: null` = none) in `scripts/term/render.ts` returns a session with
`frame`, `keys.press(name)`, `keys.type(text)`, `click(x, y)`, `resize(cols, rows)`, `settle()` and `close()`.

## Running it for real

```
bun scripts/term/dev.ts --page schedules --fx many
```

This runs the Hub in your terminal on fixtures, through the same mount the CLI uses (`mountFixtureHub`, see
"The mount contract" in [architecture.md](architecture.md)). Ctrl+C leaves. The root script is `hub:term-dev`.
It needs a real terminal.

| Flag | Does |
|---|---|
| `--page <id>` | The page to open. Default `schedules`. |
| `--fx <state>` | The fixture state. |
| `--path <route>` | The route to open, for example `"/schedules?sel=a"`. Default: the page's own path. |
| `--strict` | Loads with the ship rules: any stand-in, browser-only file or partial sibling fails the load and names the file. |
| `--lax-globals` | Turns the DOM-global traps off. Only for chasing one read at a time. It prints the banner `hoody hub dev: LAX GLOBALS (--lax-globals): ...` to stderr before the frame and after exit, adds a `receipt: lax` line to the diagnostics, and exits 3 when the run would otherwise exit 0. A lax run never passes for a clean one. |
| `--web-origin <https://host>` | The web Hub's origin, as the host program would give it. Default `https://hub.example.test` (`scripts/term/fixture-origin.ts`): a hand-off shows a whole address and its QR key ([handoff.md](handoff.md)). |
| `--no-web-origin` | No origin: a hand-off shows the path form. |
| `--log <file>` | Writes diagnostics there. Without it they are held and printed after exit, so they never land on the frame. |

It draws with the class styles built from the stylesheets (`scripts/term/style-table.ts`), the same tables the
ship build packs, so a shot shows the same class styles as the ship build; a shot with no class
styles must be taken again.

The DOM-global traps are on by default, as in the tests and the ship build. They are installed before any Hub
module loads, so a read made while files load is caught too, and they stay on through the mount.

The exit code comes from the mount's receipt: a trap, a crash or a dropped error exits non-zero.

`dev.ts` picks its colour tier as mono when `NO_COLOR` is set and truecolor otherwise. It does not call
`tierFromEnv`, so `HUB_TERM_COLOUR` and `TERM` have no effect there.

## Shots

The PNG shots are made by a script, `shots.ts`, that needs a pseudo-terminal renderer (`TERMSHOT`) that is not
published, so the script is not in the published package either. The text goldens above and `scripts/term/render.ts`
need neither. Where the script exists, it works as follows.

It runs each page in a pseudo-terminal at 120x40, resizes to 80x24 in the same session, and writes a PNG and a text
file per state and size, plus `index.html`: a contact sheet with the web shot of the same page and state beside
each terminal shot when one exists.

A page that stopped is never written as a shot. "Stopped" means the app exited, or the screen shows the
`hoody hub: stopped …` or `could not start` line. For such a case `shots.ts` (`scripts/term/shot-guard.ts`):

- writes `<state>.<size>.crash.txt` instead of the PNG;
- removes any earlier PNG and text of that case;
- reports the case as failed and exits 1.

| Flag | Does |
|---|---|
| `--page a,b` | Pages. Default: all. |
| `--states all\|default\|a,b` | States. Default: all. |
| `--out <dir>` | Output directory. |
| `--web <dir>` | Where web PNGs are looked up, read-only. |

Know before you run it:

- It needs a `termshot` tool, which is not in this repository. The path comes from the `TERMSHOT`
  environment variable, which must be set: there is no default.
- `--out` is required. `--web` has no usable default: pass it.
- One session at a time.
