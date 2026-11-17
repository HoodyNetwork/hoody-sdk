# Scenarios

Matching types between a web component and its sibling does not prove matching behaviour. A scenario file states
what a component does, once. The same file runs against the web component and against the sibling. Both must pass.

## Where the pieces are

| Piece | File |
|---|---|
| The types you write against | `src/kit/scenario-types.ts` (`src/term/scenario/types.ts` re-exports it for the runners only: a plain scenario file importing the term path is refused by scripts/lint/term-imports.cjs, `termRelative`) |
| A scenario file | `X.scenario.ts` beside `X.tsx` |
| The platform-neutral runner | `src/term/scenario/run.ts` |
| Terminal driver (semantics tree, 80x24) | `src/term/scenario/term-driver.ts` |
| Web driver (happy-dom, testing-library) | `src/term/scenario/web-driver.ts` |
| Terminal command | `scripts/term/scenarios.ts` |
| Web entry for vitest | `src/term/scenario/scenarios.web.test.ts` |
| Helpers `loose` and `atRoute` | `src/kit/layouts/scenarioRoute.tsx` |

The scenario file imports `./X`. Under vitest that is the web file. Under the terminal loader it is the sibling.

## A scenario file

```ts
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../scenario-types';
import { Band } from './Band';

export default scenarios('Band', loose(Band), {
  ignored: {},
  unsupported: { attach: 'layout: the band sits under the attached node; its role is covered below (status)' },
  cases: [
    {
      name: 'a dismissable band closes through its Close button, once',
      props: (s) => ({ tone: 'danger', children: 'Could not reach atlas.', onDismiss: s.fn('onDismiss') }),
      steps: [{ press: { role: 'button', name: 'Close' } }],
      expect: { calls: { onDismiss: 1 } },
    },
  ],
});
```

- `scenarios(component, impl, body)`: `component` is the export name in the web file.
- `loose(C)` loosens the component's prop types so cases can pass partial props.
- A file may export one scenario or an array (`export default [prose, folded]`) for a file with several components.
- Both drivers mount the component under a memory router at `/page` with a query client.

### A case

| Field | Meaning |
|---|---|
| `name` | A sentence saying what must hold. |
| `props` | The props, or `(s) => props` to make callbacks spies: `s.fn('onPress')`. |
| `mount` | Optional wrapper around the component. Receives `(C, props, s, html)`. Build raw tags with `html('div', ...)`, not `createElement`. |
| `control` | `{ value: 'isSelected', onChange: 'onChange' }` keeps the value in a stateful parent. |
| `steps` | What a person does. |
| `expect` | What must be true at the end. |
| `only` | `{ platform: 'web' \| 'term', why }`: run on one platform, with the reason. |
| `covers` | Props this case exercises that the static check cannot see (set inside `mount`, or built dynamically). A claim: the case must assert something, and `--mutants` checks that the case fails when that prop is dropped or flipped. |
| `at` | The router's starting path and search (default `/page`), for a component that reads the route. |
| `webOrigin` | Terminal only: the web Hub's origin the host reports as its page address (as `HubTermOptions.webOrigin`), for a component that builds a web address or offers Open (Handoff). Default none: the path form, no Open. The web page keeps its own location. |

### Targets

A step finds a thing as a person would:

```ts
{ role: 'button', name: 'Close' }            // role and name; name may be a RegExp
{ role: 'checkbox', checked: true, nth: 1 }  // states and position
{ text: 'Two schedules failed today.' }      // visible text
'focused'                                    // whatever has the focus
```

### Steps

| Step | Does |
|---|---|
| `{ press: target }` | Focus it, then Enter (Space for a checkbox, switch or radio). |
| `{ click: target }` | Primary mouse button down and up on it. |
| `{ type: [target, 'text'] }` | Focus it and type. Appends. |
| `{ setValue: [target, 'text'] }` | Clear, then type. |
| `{ clear: target }` | Clear it. |
| `{ focus: target }` | Focus it. |
| `{ key: 'tab' }` | A key to whatever has the focus: `'tab'`, `'shift+tab'`, `'enter'`, `'space'`, `'escape'`, `'up'`, `'down'`, `'home'`, `'end'`, `'ctrl+a'`, `'x'`. |
| `{ rerender: { value: 'b' } }` | New props, merged over the case's props. |
| `{ releaseHeld: true }` | Fires the long timers the terminal driver holds (a slow fixture answer, a toast's dismissal), then settles. The web side only settles. |
| `{ expect: { ... } }` | A check in the middle of the steps. |

`force: true` on `press`, `click`, `type`, `setValue` or `clear` sends the input even though the node does not
offer the action. Use it to prove that a disabled control is inert.

### Expectations

| Field | Checks |
|---|---|
| `calls` | Spy name to a call count, or to exact argument lists: `{ onChange: [['b']] }`. Loose matchers: `M.any`, `M.type('string')`, `M.partial({ id: 1 })`, `M.match(/re/)`. |
| `nodes` | A list of `{ target, absent?, name?, description?, value?, states? }`. Only the states you name are compared. |
| `focused` | The target that has the focus, or `null` for nothing. |
| `neverShown` | Strings that must appear nowhere: frame, DOM text, semantics tree, attributes. |
| `treeNever` | Strings that must not be in the agent-readable tree (terminal: semantics text and JSON; web: accessible name, description and value), even where the frame may show them (a revealed secret). |
| `copied` | What went to the clipboard, in order: `['hdy_…']`, or `0` for nothing (terminal: OSC 52 copies; web: `navigator.clipboard.writeText`). |
| `opened` | What was handed outside the Hub to be opened, in order, or `0` for nothing (terminal: the host's `openExternal`, which `openOutside` and the hand-off's Open use: a case that checks `opened` or sets `webOrigin` mounts inside a terminal session, fresh memory stores as in a real mount, whose host records each address and opens nothing; web: `window.open` and a followed `target="_blank"` link, recorded, never opened). With `neverShown` it proves a masked address still opens whole. |
| `location` | Where the router is after the steps: pathname plus search, a string or RegExp. |

After the steps and `expect`, the terminal side checks the case settled: every settle waits (default 3 s,
`SCENARIO_SETTLE_MS`) until the component is idle by the app's own signal (`src/term/app/idle.ts`: queries, mutations,
short timers) and draws still frames. Work still under way at the deadline fails the case as
`unsettled: <what is pending>` (for example `unsettled: timers src/kit/x/Y.term.tsx:40:12`). A frame that keeps changing with
nothing pending is an animation and passes. Ctrl+C is an ordinary key in a case: the test renderer does not exit on it.

### `ignored`, `unsupported`, `behavioural`

These three maps are how a sibling declares what it does not do. The contract gate reads them.

| Map | Entry | Meaning |
|---|---|---|
| `ignored` | `{ prop: 'reason' }` | The sibling does not read this prop at all. A key may end in `*` (`'aria-*'`). An entry for a prop the sibling does read fails as stale. |
| `unsupported` | `{ prop: 'reason' }` | A behavioural prop that no case exercises. |
| `behavioural` | `['prop']` | Extra props to treat as behavioural for this component. |

Web plumbing (`className`, DOM events, most `aria-*`) needs no entry: see `DOM_PLUMBING` in
`scripts/term/contract.ts`.

### Page proof

A component whose mount needs the whole page's data (a signed-in session, account fixtures) cannot be driven in a
scenario: any case would pass without proving anything. Prove each behavioural prop on the page instead:

```ts
export default scenarios('SecuritySummary', SecuritySummary, {
  pageProof: { onOpen: 'account/twofa-turn-on' },
  cases: [],
});
```

The value is `<page>/<shot name>` in `src/pages/<page>/shots.ts`. The contract accepts it only when that shot drives the
page (`click`, `act` or `keys`) and waits for what the press opens (`waitForText`). A shot that only draws a state
proves the control is drawn, not that its callback works, and fails as
`pageProof X.p names no driving shot (account/twofa-off: shot twofa-off presses nothing …)`. A proved prop counts as
exercised. Zero cases pass only when every behavioural prop is proved.

## Run the terminal side

From `hub/`, with `NODE_ENV=test`:

```
bun scripts/term/scenarios.ts                  # every scenario file
bun scripts/term/scenarios.ts states/Band      # files whose path contains the name
bun scripts/term/scenarios.ts Button forms/fields
```

It runs under the strict DOM-global traps, as the ship process does: a sibling that reads `window.innerWidth` fails
with `TERM_GLOBAL: <global> is not available in the terminal Hub`, not a `ReferenceError`. When many cases fail with the
same first error line, the first prints in full and the rest say `same error as <component> "<case>"` (`--verbose`
prints every one).

Real output:

```
ok   Band (src/kit/states/Band.scenario.ts) term 5/5
1 components, 5 cases, 0 failing, 1.3 s
```

Flags, from the script's argument parsing.

| Flag | Does |
|---|---|
| `--verbose` | Prints each case. |
| `--case <name>` | Runs one case. |
| `--json` | Machine-readable result. |
| `--report` | The parity table: every component, terminal and web side by side. |
| `--web-results <file>` | A web result file to merge into the report. May repeat. |
| `--parity-md <file>` | Writes the report as Markdown. |
| `--mutants` | The mutant run. See below. |
| `--override <rel>=<file>` | Loads `<file>` in place of the source at `<rel>`, in memory. For trying a change to a file you do not own. |

## Run the web side

The web side needs vitest. `scripts/term/vitest-narrow.sh` runs it from any copy of the hub: it finds the repository root (the directory above `hub/`)
from its own path, keeps vite's cache and temp files beside the copy, and passes `--configLoader runner` (vite then
writes no bundled config into `node_modules`). It refuses a run with no test file named.
Example run (5 cases, about 16 s):

```
cd <repository root> && env HUB_VT_WORKERS=1 HUB_SCENARIO=states/Band HUB_SCENARIO_OUT=<out.json> \
  /bin/bash -p hub/scripts/term/vitest-narrow.sh hub/src/term/scenario/scenarios.web.test.ts
```

- `HUB_SCENARIO` is a substring of the scenario path. Several are comma-separated. Empty means every file.
- `HUB_SCENARIO_OUT` is the result file to pass to `--web-results`.
- `HUB_CACHE_DIR` moves vite's cache (default: `tmp/vite-cache` beside the repository root, in its parent directory).
- It needs `public/auth/` beside `hub/`: the web test env imports `public/auth/shared.js`.

## Mutants

```
bun scripts/term/scenarios.ts --mutants states/Band
```

Mutated props: every prop the sibling reads or hands on that a case exercises with an assertion, plus every safety
prop it reads (`SAFETY_PROPS` in `scripts/term/contract.ts`: `isDisabled`, `isReadOnly`, `type`, `onPress`, `onChange`,
`busy`, `onConfirm`, `disabledReason`, ...). A prop listed in `ignored` is not mutated unless it is a safety prop.

Each prop is first **dropped** (every read becomes `undefined`), then, if no case failed, **flipped** (a boolean
negated, an unset prop set to `true`, a string emptied, a callback removed). The scenarios run again in a child
process per mode. Killed means a case that passes unmutated fails mutated. A mutant that no case kills **survives** and
fails the run: no scenario would notice if the sibling stopped honouring that prop. Add a case.

`covers` is checked too: every case that names the prop in `covers` must be among the cases that kill it, in either
mode. Otherwise the run fails with `covers <prop> UNPROVEN in "<case>"`: assert what the prop changes there, or remove
it from `covers`.

Real output (`--mutants FileButton.scenario.ts Link.scenario.ts`, trimmed):

```
    mutant busy: killed by 1 (FileButton: busy: says so and refuses presses)
    mutant label: killed by 3 (FileButton: its label names a button)
    mutant href: SURVIVED -> add a case to src/kit/controls/Link.scenario.ts that sets href and expects what it changes (calls, nodes or focus)
```

## The contract gate

`bun scripts/term/contract.ts` checks types and behaviour for every sibling. Strict is the default. There is no
`--strict` flag.

**Types**: extra or missing exports, each shared name assignable both ways, `any` on one side, type errors in the
sibling, and type escapes anywhere in the sibling file (`as any`, `as never`, `as unknown as T`, parameters or
variables typed `any`, a helper outside the component included). A reviewed escape carries
`// contract-any: <why>`; the reason must be at least three words and 12 characters (`x`, `todo`, `ok` are refused).

**Behaviour**, per exported component:

- (a) every web prop is read by the sibling, or listed in `ignored`;
- (b) a component with behavioural props has a scenario file, and each behavioural prop is set by some case or
  listed in `unsupported`. Behavioural means: callbacks (`on*`), and `disabled`, `readOnly`, `busy`, `invalid`,
  `selected`, `checked`, `expanded`, `open`, `value`, `type`, `autoFocus`, `pressed` and similar, plus the file's
  `behavioural` list.

| Flag | Does |
|---|---|
| `--explain A,B` | Prints read, unread and uncovered props for those components. |
| `--lenient` | Lists missing exports instead of failing on them. |
| `--types-only` | Skips behaviour. |
| `--json` | Machine-readable result. |
| `--update-debt` | Removes fixed entries from `scripts/term/contract.debt.json`. Adds none. |
| `--write-debt` | Rewrites the debt file. Refuses (exit 2, "would ADD N entries") when that adds an entry. |
| `--allow-growth` | With `--write-debt`: adds them anyway and prints each one (`DEBT ADDED (--allow-growth): …`). For maintainers only. |

Existing failures are named in `scripts/term/contract.debt.json`. Debt only shrinks: a new failure fails the run, and
so does a fixed one that is still listed.

Reading a failure (real output):

```
FAIL PickerTrigger (src/kit/pickers/ComputerPicker.term.tsx)  scenario: none  read 7/10 props
       no scenario for ...
       unread prop ComputerPicker.size
per owner (in debt / new): unowned 0/5
behaviour: 179 components, 5 open obligations (0 in debt), 5 new, 0 fixed-but-listed
```

Every failure prints its own `->` fix line. The kinds:

- "scenario: none" and "no scenario for": write `X.scenario.ts`.
- "unread prop": read the prop in the sibling, or add it to `ignored` with a reason. A read counts only when the value
  flows somewhere: `void x`, a bare `x;`, the left side of a comma, a hook dependency list, or `...rest` that is then
  only voided are not reads.
- "uncovered behavioural": add a case that sets the prop, or add it to `unsupported` with a reason.
- "stale ignored": the sibling reads a prop that `ignored` lists. Remove the entry.
- "reason too short": an `ignored` / `unsupported` / `contract-any` reason must be three words and 12 characters.
- "ignored prop X.p reaches a handler": a prop declared look-only is read in an `on*` handler, a `handle*` function,
  `useCallback` or `useEffect`. Remove it from `ignored` and add a case for what it does.
- "covers without an assertion": a case with `covers` whose `expect` and steps check nothing. Assert something.
- "any escape": remove the cast or type, or add `// contract-any: <why>`.

### How far to trust it

- **Unread props** are found by syntax: a destructured and used prop, `p.x`, `rest.x`, `p['x']`. A props object
  passed whole to a helper, or spread into another component, cannot be followed: the component is reported
  "cannot tell" and is not failed. A prop read only to be thrown away (`void x`) does not count as read.
- **Coverage** is static over the object literals in the scenario file. Props built dynamically need `covers`.
- **Mutants** replace reads inside the exported component and the local functions it hands the prop to. Handling in
  a helper that receives the whole props object is out of reach, so such a mutant survives.
