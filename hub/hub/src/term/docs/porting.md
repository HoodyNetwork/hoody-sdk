# Writing a terminal sibling

This page ports one real component from nothing to green gates. The component is `Band` in
`src/kit/states/Band.tsx`: one sentence about a page or a table, with a tone, optional actions and an optional
close button. Its sibling is `src/kit/states/Band.term.tsx` (56 lines). Read both files next to this page.

All commands run from `hub/` with `NODE_ENV=test`.

## 0. Decide whether you need a sibling

You need one when any of these is true:

- The page shows `‹Name›` where the component should be. `render.ts` lists it under "placeholder components drawn".
- The compat runtime draws the component, but wrongly: things overlap, a control cannot be reached, a state has no
  mark.
- The web file reads a DOM global or an element member the terminal refuses.

You do not need one when the web file already draws correctly through the compat runtime. A sibling of a file that
already runs is a graph warning (rule R1).

### A CSS value that is right for the web but wrong for the terminal

Never edit the web stylesheet to change what the terminal draws. Add a row to
`scripts/term/css-translate/term-decls.ts`; it is the only place the terminal takes a value different from a
stylesheet's. Typical case: a pixel size the web tuned to icon buttons, where the terminal draws words. A row has five
fields, all required:

| Field | Holds |
|---|---|
| `cls` | Module path and class, `pages/computers/parts/parts.module.css#useGrid`. |
| `prop` | The property. |
| `web` | The stylesheet's value it replaces, as written there. |
| `term` | The terminal's value. |
| `why` | The reason. |

The row applies to the class's own base rule only (no media query, no state rule). When the stylesheet no longer says
`web`, the row is stale: it is not applied, and `scripts/term/css-translate/term-decls.term.test.ts` (in the `tests`
gate) fails until someone
reviews the row against the new web value. First row: computers `#useGrid` `minmax(min(168px, 100%), 1fr)`
becomes `320px`, so a use tile keeps its 40-cell actions row whole. To run it alone: `bun test --preload ./scripts/term/test-preload.ts
scripts/term/css-translate/term-decls.term.test.ts`.

### A `typeof` check does not protect a DOM-global read

In the terminal the DOM globals are getters that throw. `typeof navigator === 'undefined'`,
`typeof document !== 'undefined'` and `typeof ResizeObserver === 'function'` read the global, so each one raises
`TERM_GLOBAL`. A test still fails at its end with `TERM_TRAP_UNDECLARED` when the code caught the throw. A web file
needs no sibling for this if one of these is used instead:

- Ask `hostEnv().browserPage` first, so the read never runs in the terminal:
  `hostEnv().browserPage !== true || typeof navigator === 'undefined' ? undefined : navigator` (or
  `hostEnv().browserPage === true && …`).
- Use a `hostEnv()` seam: `visible`, `onVisibilityChange`, `onLifecycle`, `openExternal`, `facts`.
- Write a `.term` sibling.

`src/core/host-env.ts` is the one place where `typeof window` is read: it decides `browserPage`. Fixed this way on
the kit side: `kit/data/Steps.tsx` (`firstSystem`), `kit/voice/devices.ts`, `kit/ask.ts` (`focusAskDock`) and
`kit/widgets/AskAgent.tsx` (`window.requestAnimationFrame` in an effect after a press). Regression test:
`src/kit/crashSweep.term.test.tsx`.

A selector the compat `querySelector`/`querySelectorAll` cannot evaluate also ends the mount, like a trap:
`TERM_DOM_SELECTOR` (for example `:scope > span > :first-child`). Supported: tag, `#id`, `.class`, `[attr]` and the
`=`, `~=`, `|=`, `^=`, `$=`, `*=` attribute forms, `:scope`, `:not(simple)`, descendant and child combinators, and
comma lists (`src/term/jsx/element.ts`). A web file that needs more gets a sibling: `kit/controls/buttonMetrics.term.tsx`.

To find what has no sibling yet, across the whole Hub (about 23 s each):

```
bun scripts/term/graph.ts --md <a file outside the tree>
bun scripts/term/board.ts
```

- `graph.ts --md` writes a report. Its "Work-list" table is the list: one row per file that cannot run in the
  terminal, the lines that stop it (`why web-only`), the kit names it exports, and how many page imports it blocks.
  The top rows unblock the most. `--top N` sets how many rows (default 40). Without `--md` the tool prints one
  summary line and no list. A row marked `[split]` needs a split (`.pure.ts`, `.web.ts`), not a whole sibling.
- `board.ts` prints one row per page: states with goldens, crashes, the stand-ins drawn (by name), traps, and the
  count of web-only files the page still reaches. It reads each page's last `check.ts` run, so a page showing `?`
  has not been through the page gate. It ends with the count of kit exports per class.

See what one page does today:

```
bun scripts/term/render.ts --page schedules --cols 80 --rows 24
```

It prints the frame, then a report. This is real output, with the frame cut:

```
placeholder modules loaded: 5
placeholder components drawn: none
unsupported exports used: none
allowance holes used: none
page failures: none
settled: yes
class styles: 0 partial, 0 untranslatable, 0 colour tokens without a role
```

"placeholder modules loaded" counts stand-in files that were imported. "placeholder components drawn" names the
ones that reached the screen. The second line is your work list.

## 1. Read the web file for its contract

Open `src/kit/states/Band.tsx` and write down three things.

**Value exports.** `Band` and `Notice`. The sibling must export exactly these.

**Types.** `BandProps`, `BandTone`, `NoticeLevel`, `NoticeProps`. The sibling re-exports them from the web file.

**What each prop does.** For `Band`: `tone` picks the look and the role (`status` for neutral, `alert` otherwise),
`size`, `icon`, `children` (the sentence), `actions`, `onDismiss` (a close button), `error` (adds a Details
button and can turn the band into a pending note), `errorWords`, `pendingActions`, `flush`, `attach`, `className`.

Then list what the web file imports and sort each import:

| Import in `Band.tsx` | In the terminal |
|---|---|
| `IconButton`, `cx` from `../controls/Button` | `Button` has a sibling, so `IconButton` works. `cx` is for class names: not needed. |
| `Icon` from `../icons` | Has a sibling: draws a glyph. |
| `useStrings`, the `strings.en.json` files | Shared code. Use them unchanged. |
| `ErrorDetails`, `errorSentence`, `pendingFacts`, `useErrorInfo` from `./ErrorDetails` | `ErrorDetails` has a sibling. The three helpers are pure and live in `errorDetails.pure.ts`. |
| `./Band.module.css` | Not used. A sibling draws with prims, not class names. |

The fourth row is the common obstacle. If a helper you need is defined inside a web-only file, you cannot import
it from there. Move it to a split first. See [naming.md](naming.md).

## 2. Scaffold

```
bun scripts/term/new.ts src/kit/states/Band.tsx
```

For a web file with no sibling this writes three files, each only if it is absent, and prints what to run next:

| File | Holds |
|---|---|
| `X.term.tsx` | One stub per value export, each under a `// term-stub: <Name>` marker. Every type export re-exported from the web file. |
| `X.scenario.ts` | One `scenarios(...)` per component with no cases. A comment splits the web props into behavioural (each needs a case) and other. |
| `X.term.test.tsx` | A `drawTest` import and four `test.todo` lines per component: frame, keys, callback arguments, mono tier. |

`--print` writes nothing and prints the three files. `--page <id>` puts that page in the printed check command.
For `Band`, which is already ported, it prints:

```
exists already: src/kit/states/Band.term.tsx (edit it; nothing written)
```

A stub looks like this (from `bun scripts/term/new.ts src/kit/states/StatusLine.tsx --print`, 0.6 s):

```tsx
import type { ReactNode } from 'react';
import type * as Web from './StatusLine';
import { Box, Text } from '../../term/prim';

export type { StatusLineProps } from './StatusLine';

// term-stub: StatusLine
export const StatusLine: typeof Web.StatusLine = ((p: { children?: ReactNode }) => (
  <Box dir="column">
    <Text dim>StatusLine</Text>
    {p.children}
  </Box>
)) as typeof Web.StatusLine; // contract-any: scaffold stub, replaced when the component is ported
```

A stub is not a port. While the marker stands, the kit gate counts the component as a stand-in and the ship build
refuses it (`TERM_STUB_INPUT`). The scenario file has no cases, so the contract gate stays red until you write them.
Draw the component, then delete its `// term-stub:` line and the cast with its `contract-any` comment.

## 3. Write the sibling

The finished file, shortened to `Band` (see the source for `Notice`):

```tsx
import type * as Web from './Band';
import { IconButton } from '../controls/Button';
import { Icon, type IconName } from '../icons';
import { OUTCOME_ICON } from '../outcome';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { Box, Text, type Colour } from '../../term/prim';
import { ErrorDetails } from './ErrorDetails';
import { errorSentence, pendingFacts, useErrorInfo } from './errorDetails.pure';
import { Inline } from '../layouts/termParts';
import stateStrings from './strings.en.json';

export type { BandProps, BandTone, NoticeLevel, NoticeProps } from './Band';

const ICON: Record<Web.BandTone, IconName> = { neutral: 'info', warn: 'warn', danger: 'error' };
const COLOUR: Record<Web.BandTone, Colour> = { neutral: 'blueText', warn: 'warn', danger: 'danger' };

export const Band: typeof Web.Band = ({ tone: given = 'neutral', size: givenSize = 'page', icon, children,
  actions: givenActions, onDismiss, error, errorWords, pendingActions, flush, attach }) => {
  const t = useStrings(kitStrings);
  const ts = useStrings(stateStrings);
  const info = useErrorInfo(error);
  const pending = pendingFacts(info);
  const tone: Web.BandTone = pending ? 'warn' : given;
  const size = attach ? 'table' : givenSize;
  const text = (pending ? undefined : children) ?? (info ? errorSentence(info, errorWords, ts) : null);
  const actions = pending ? pendingActions : givenActions;
  const band = (
    <Box dir="row" gap={1} shrink={0} padX={size === 'page' && !flush ? 1 : 0}
      sem={{ role: attach || tone === 'neutral' ? 'status' : 'alert' }}
      border={flush ? ['bottom'] : size === 'page' ? ['left'] : false} borderColour={flush ? 'line' : COLOUR[tone]}>
      <Text colour={COLOUR[tone]} bold><Icon name={pending ? OUTCOME_ICON.pending : (icon ?? ICON[tone])} label={tone} /></Text>
      <Box dir="column" grow={1} shrink={1}>{text !== null && text !== undefined && <Inline colour="ink">{text}</Inline>}</Box>
      {(actions || info) && <Box dir="row" gap={2} shrink={0}>{actions}{info && <ErrorDetails error={info} mode="button" />}</Box>}
      {onDismiss && !pending && <IconButton size="sm" icon="x" onPress={onDismiss} label={t('action.close')} />}
    </Box>
  );
  if (!attach) return band;
  return <Box dir="column" shrink={0}>{attach}{band}</Box>;
};
```

What to copy from it:

- **`import type * as Web from './Band'`** gives the types. `typeof Web.Band` makes the compiler hold the sibling
  to the web signature.
- **Types are re-exported** with `export type { ... } from './Band'`. A type-only import of the web file is allowed.
- **The logic is the web's, line for line.** The pending rule, the choice of text and the choice of actions are the
  same expressions as in `Band.tsx`. Only the drawing changed. When a rule is longer than a few lines, share it
  through a split instead of repeating it.
- **Meaning without colour.** The tone is an icon glyph (`i`, `!`, `✗`) and a colour. In the mono tier the colour is
  dropped and the glyph still tells the tone.
- **`sem` carries the role.** The web sets `role="status"` or `role="alert"` on its `div`. The sibling sets the same
  role on its `Box`. Scenarios find the band by that role.
- **`Inline`** (from `src/kit/layouts/termParts.tsx`) lays mixed text and controls out as one wrapping line. A plain
  `Text` cannot hold a control.
- **Props with no terminal meaning are not read.** `className` is dropped. The contract treats it as web plumbing.
  Any other prop you do not read must be listed in the scenario file with a reason (step 5).
- **Layout that must hold at 80 columns.** The sentence column has `grow={1} shrink={1}` so it wraps. The actions
  have `shrink={0}` so they are never cut.

Rules for the body are in [prims.md](prims.md), [layout.md](layout.md) and [focus-keys.md](focus-keys.md).

### A page sibling imports prims only as `@term/prim`

The example above is a kit sibling: kit files reach `src/term/prim` by relative path. A page's terminal file
(`src/pages/**/*.term.*`) does not. It imports prims only through the alias:

```tsx
import { Box, Text } from '@term/prim';
```

`@term/prim` is `src/term/prim/page.ts` (tsconfig `paths`): layout and text only. What it exports is listed once, in
[prims.md](prims.md#what-a-page-may-import-termprim). Focus, semantics, overlays and tables come through `@kit`,
whose components have terminal siblings.

| You write | Lint (`hub/page-boundaries`, `eslint.config.js`) |
|---|---|
| `@term/prim` in a web page file (`X.tsx`) | `termAliasWeb`: only a page's `.term` file imports it. |
| `@term/prim/<x>`, or any other `@term...` path | `termAliasDeep`. The alias is exact: `@term/prim/<x>` does not resolve either. |
| `'../../term/...'` from a page | `termRelative`. |

A page's `.term` TEST may also import by relative path `scripts/term/` helpers (render, clock and the like),
`src/term/prim/testing.ts` and `src/term/prim/semantics.ts`.

A page needs a prim that `page.ts` lacks: ask for it to be added to `page.ts` (the maintainers decide). Never a deep import.

Tests: `src/app/conformance.pageboundaries.test.ts` (the lint, vitest) and `scripts/term/page-prim-alias.term.test.ts`
(the resolver, the contents of `page.ts`, no relative prim import in pages).

## 4. Check the types

```
bun scripts/term/contract.ts --explain Band
```

It prints one line per sibling, then the behaviour section. For `Band` (real output):

```
info Band (src/kit/states/Band.term.tsx)  scenario: src/kit/states/Band.scenario.ts  read 10/11 props
       read: actions, attach, error, errorWords, flush, icon, onDismiss, pendingActions, size, tone
       unread: none
       uncovered behavioural: none
       stale ignored: none
```

"read 10/11" with "unread: none" means the eleventh prop (`className`) is web plumbing that needs no entry.
`children` and `key` are never counted.

The run fails when:

- the sibling exports a name the web file lacks, or lacks one the web file has;
- a shared name's type differs in either direction, or one side is `any`;
- the sibling has a type error, or an unannotated `as any` / `as never` inside an exported component;
- a prop is unread and not listed as `ignored`, or a behavioural prop has no scenario case (next step).

## 5. Write the scenario file

`src/kit/states/Band.scenario.ts` states the behaviour once for both platforms. Two of its five cases:

```ts
import { loose } from '../layouts/scenarioRoute';
import { scenarios } from '../../term/scenario/types';
import { Band } from './Band';

export default scenarios('Band', loose(Band), {
  ignored: {},
  unsupported: { attach: 'layout: the band sits under the attached node; its role is covered below (status)' },
  cases: [
    {
      name: 'a warning band is an alert and says its words',
      props: { tone: 'warn', children: 'Two schedules failed today.' },
      steps: [],
      expect: { nodes: [{ target: { role: 'alert' } }, { target: { text: 'Two schedules failed today.' } }] },
    },
    {
      name: 'a dismissable band closes through its Close button, once',
      props: (s) => ({ tone: 'danger', children: 'Could not reach atlas.', onDismiss: s.fn('onDismiss') }),
      steps: [{ press: { role: 'button', name: 'Close' } }],
      expect: { calls: { onDismiss: 1 } },
    },
  ],
});
```

The file imports `./Band`. Under the terminal loader that is the sibling. Under vitest it is the web file.

Run the terminal side:

```
bun scripts/term/scenarios.ts states/Band
```

Real output:

```
ok   Band (src/kit/states/Band.scenario.ts) term 5/5
1 components, 5 cases, 0 failing, 1.3 s
```

The web side needs vitest. The command is in [scenarios.md](scenarios.md).

## 6. Add a drawing test when the look matters

Scenarios check behaviour. A `*.term.test.tsx` beside the sibling checks what is drawn. `Band` is tested in
`src/kit/states/States.term.test.tsx`. The pattern:

```tsx
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Band } from './Band';

test('a warning band shows its mark and its sentence', async () => {
  const t = await drawTest(<FocusRoot><OverlayHost><Band tone="warn">Key expires soon.</Band></OverlayHost></FocusRoot>, { width: 70, height: 6 });
  const frame = await t.settle();
  expect(frame).toContain('!');
  expect(frame).toContain('Key expires soon.');
  t.renderer.destroy();
});
```

- Wrap in `FocusRoot`. Hooks such as `useKeys` and `useFocusable` do nothing outside one, without an error.
- Wrap in `OverlayHost` when anything inside may open a layer.
- Call `t.settle()` after every key, click or timer. It draws until the frame stops changing.
- Destroy the renderer at the end.

Run one file:

```
bun test --preload ./scripts/term/test-preload.ts src/kit/states/States.term.test.tsx
```

## 7. Re-render the pages that use it

```
bun scripts/term/render.ts --page schedules --fx many --layout
```

`--layout` adds the layout faults (overdraw, cut, offscreen). Then run the page gate for each page that uses the
component:

```
bun scripts/term/check.ts --page schedules
```

A frame that changed because of your sibling is a `golden` problem with a diff. Read every changed line. If the
new frame is right:

```
bun scripts/term/check.ts --page schedules --update
```

Review the changed `.txt` files as you would review code. `--update` never accepts a layout fault, an unsettled
render or new debt. Those you fix. See [gates.md](gates.md).

One page takes minutes: `schedules` has 42 cases and draws 84 frames in about 3 minutes.

## 8. Finish

Run, in this order, and fix what each prints:

```
bun scripts/term/contract.ts
bun scripts/term/scenarios.ts states/Band
bun scripts/term/check.ts --only graph,types,kit
bun scripts/term/check.ts --page schedules
```

If the component was on the stand-in list, `check.ts --only kit` fails until the list drops it:
`bun scripts/term/check.ts --only kit --update` shrinks `scripts/term/kit-classes.json`.

## Checklist

- [ ] Same value exports as the web file, each typed `typeof Web.Name`. Types re-exported.
- [ ] No value import from the web file. No import of a browser-only package.
- [ ] Every prop read, or listed in the scenario file's `ignored` with a reason.
- [ ] Every state has a mark or a word. Nothing depends on colour alone.
- [ ] Every interactive thing is a `Pressable` or a field, reachable by Tab, with a name in the semantics tree.
- [ ] A secret is a `SecretInput`.
- [ ] Popups are on a `Layer`.
- [ ] Holds at 80x24 and 120x40 with no layout fault.
- [ ] Scenario file with a case for each behavioural prop. Terminal side passes.
- [ ] Page goldens reviewed and updated.
