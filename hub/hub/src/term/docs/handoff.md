# Hand-offs

A hand-off is a part of the Hub the terminal does not draw. In its place the terminal says why, shows the web
address of the same place, and offers keys to open, copy or scan that address.

Use a hand-off only for something a terminal cannot do: a live browser frame, a microphone, a file chooser, a
picture, a code too big for the pane. "Not ported yet" is not a hand-off. That is a stand-in, and it is debt.

## There is one mechanism

The kit component `Handoff`, exported from the `@kit` barrel:

| File | Role |
|---|---|
| `src/kit/states/Handoff.tsx` | The web file. On the web `Handoff` draws its children and nothing of its own. |
| `src/kit/states/Handoff.term.tsx` | The sibling. In the terminal it draws the hand-off and never renders its children. |
| `src/kit/states/handoff.pure.ts` | The address rule: `hubWebAddress(route, origin, place, declared)`, with `declaredRoute` and `declaredPaths`. Not in the `@kit` barrel; the barrel's `webAddress` is a different function, for outside addresses. |
| `src/kit/states/Handoff.term.strings.en.json` | Every word the sibling itself says ("Copy link", "Open it on the web:"). |
| `src/kit/states/termCopy.ts` | The copy key. |
| `src/kit/qr/termQrDialog.tsx` | The QR dialog behind the `r` key. |
| `src/term/app/pageHandoff.tsx` | The shell's view for a page handed off as a whole: the page title and the `Handoff` block. |
| `scripts/term/graph/handoffs.ts` | The one list of hand-offs, derived from the code: kit names whose sibling's own declaration draws `Handoff`, the files that draw it, and the pages handed off whole. No list to edit. |

Props:

| Prop | Meaning |
|---|---|
| `reason` | Required. One plain sentence saying why it is not here. Always drawn, in both sizes. |
| `what` | Short name of the thing, for the action line ("Board", "chart"). Default "this". |
| `to` | A Hub route to open on the web (`/schedules`). Default: the current page's path. Only the longest page path the router declares that the route falls under travels; its search, fragment and any deeper sub-path are dropped (see "The address carries only a declared page" below). Anything that is not a Hub route (a full URL, `//host`) is drawn as the Hub's root. |
| `size` | `'block'` (default) stands in for an area. `'line'` is one row in a form, a cell or a toolbar. |
| `children` | What the web draws. |

Every hand-off in the tree goes through this component: `BoardView`, `ProgramView`, `MicButton`, `TalkBar`,
`FileButton`, `DatePickButton`, `PathField` (browse), `SshKeyHelp`, and a QR code too big for its pane.

Other things carry the word and are not ways to wire one. See "Things that look like a mechanism" below.

## What the person sees

Block, real frame of the Board page at 80x24, opened at `/board?add=x` (run with
`bun scripts/term/render.ts --page board --cols 80 --rows 24 --path '/board?add=x'`, 20 s). The `?add=x` does not
travel:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⇗ The Board shows live programs and web pages side by side in browser        │
│ frames, which a terminal cannot draw.                                        │
│ Open the Board on the web:                                                   │
│ https://hub.example.test/auth/home?                                          │
│ realm=f1f1f1f1f1f1f1f1f1f1f1f1&computer=c0a7150000000000000000a1#/board      │
│ [c Copy link] [r QR code]                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Line, real frames. First on a host that can open a browser, then with no opener and no origin:

```
⇗ Talk needs a microphone.  [o Open] [c Copy link] [r QR code]
https://hub.example.com/auth/home#/ai

⇗ Talk needs a microphone. (on your Hub's web address)  [c Copy link]
/auth/home#/ai
```

- **The reason is always drawn**, in the block and in the line.
- **The address is always printed, never cut** (it wraps), with every 24-hex id masked to its first and last 4
  (`shownAddress`). The whole address goes only to the actions: Open, Copy link, the QR
  code and, when the origin is known, the terminal's own link (OSC 8), so terminals that have links open it on a
  click. Selecting the drawn text copies the masked form, so it is offered as a fallback only when nothing is masked.
- **Keys.** Each is a key while any of the hand-off's keys has the focus, and each can be pressed with Enter, Space
  or a click.

  | Key | Does | Shown when |
  |---|---|---|
  | `o` Open | Opens the address in the host's browser. Then reads `[✓ Opened]` or `[! Couldn't open a browser: copy the address]`. | The host program gave a browser opener and the origin is known. |
  | `c` Copy link | Copies the address through the terminal (OSC 52). Then reads `[✓ Copied]`, or on a failure points at an action that still carries the whole address: `[! Copy failed: press r for the QR code]`, else `[! Copy failed: press o to open it]`, else `[! Copy failed: select the address]` when nothing in it is masked, else `[! Copy failed]`. | Always. |
  | `r` QR code | Shows the address as a QR code in a dialog, for a phone. The code is shown at once: an address is not a secret. In a pane too small for the code the dialog says how many cells it needs; the address and the copy key stay right below. | The origin is known and the address fits a QR code. |

  The QR key is `r`, never `q`: the shell quits on a `q` that no control took, so a `q` pressed with the focus
  elsewhere would leave the Hub. Do not give a sibling of your own a `q` key for the same reason.
- **The place is carried.** The address is `<origin>/auth/home?realm=<id>&computer=<id>#<page path>`.
- **The address carries only a declared page.** The part after `#` is the longest page path the router declares
  (`declaredPaths`: each route's full path, a splat stripped, a path with a parameter left out) that the route falls
  under (`declaredRoute`, case-insensitive match). Everything below it is dropped: search, fragment and any deeper
  sub-path. No match is `/`. Outside a router (an isolated render, a component's own scenario) there is no declared
  page, so the address is the Hub root even with `to`. Why: a search value or a sub-path can hold anything, a secret
  included, and an address is shown, copied and drawn as a QR code. The secret gate's `handoff` attack
  (`scripts/term/secrets.attacks.ts`) puts a secret in a sub-path, a search and a fragment and expects no leak.
  - The place before the `#` keeps only two names, `realm` and `computer` (`placeQuery`).
  - The realm and the active computer are put before the `#`. A value of the wrong shape is left out. The realm is
    left out until the shell knows the realms. **The web Hub does not read these two**: the browser opens the right route
    in whatever realm and computer it last used.
- **No origin known**: the address is the path form, `/auth/home#/board`, the words "(on your Hub's web address)"
  are added, and there is no `o`, no `r` and no link. The origin comes only from the host program: `webOrigin` in
  `src/term/host-types.ts`, a bare `https://host`. It is never guessed and no environment variable sets it.
  - A real host passes its own.
  - The fixture runners (`render.ts`, `dev.ts`, the page gate) pass `https://hub.example.test` by default
    (`scripts/term/fixture-origin.ts`; a reserved name, never a real host). `--web-origin <https://host>` sets
    another, `--no-web-origin` gives none.
  - The page gate also draws one `<case>-no-origin` case per page that shows a hand-off, so the path form has a
    golden too.
  - A test passes one with `beginTermSession({ webOrigin })`, as `src/kit/states/Handoff.term.test.tsx` does.

### Over SSH

A hand-off never fails silently on a machine without a browser:

- With no opener from the host there is no `[o Open]` key at all. The address is printed and `c` copies it.
- With an opener that fails, the key says so in words and points at copying.
- OSC 52 travels through SSH when the person's terminal allows it. When it does not, the copy key says so and the
  address is on screen to select.
- `r` gives a phone the address when the origin is known.

## Wiring one

Pick the row that fits. All four end in the same component.

Whichever you pick, there is nothing to record: the graph derives every hand-off from the code
(`scripts/term/graph/handoffs.ts`), so the diff that adds it is the reviewed record.

| Scope | Do this | Terminal file needed |
|---|---|---|
| A section of a page whose code loads in the terminal | Wrap it in `Handoff` in the shared file. | None. |
| One control, or a section whose file imports a browser-only package | Write a sibling of that file that returns `Handoff`. | `X.term.tsx` |
| A whole page with nothing the terminal can usefully draw | Set `handoff` in the page's `page.ts`. | None. |
| A whole page where the terminal can still draw something (names, counts) | Write a sibling of the page's view part. Draw what it can, then `Handoff`. | `View.term.tsx` |

Import it as a page imports any kit component:

```tsx
import { Handoff } from '@kit';
```

A page file must not import it by relative path: the web lint refuses that (`hub/page-boundaries`: "Reach the kit,
core and app through @kit / @core, never by relative path"). A file inside `src/kit` imports it by relative path,
as kit files do (`'../states/Handoff'`).

### A section, from the web side only

```tsx
import { Handoff } from '@kit';

<Handoff reason={t('usage.chartReason')} what={t('usage.chartWhat')}>
  <UsageChart points={points} />
</Handoff>
```

On the web this draws `UsageChart` as before. In the terminal it draws the hand-off and `UsageChart` is never
rendered. The terminal sibling (`src/kit/states/Handoff.term.tsx`) never reads `children`.

Two conditions:

1. The file that defines the wrapped part is still imported, so it must load in the terminal. Raw HTML, CSS modules
   and canvas code load. A wrapped part that is web-only (it imports `react-aria-components` or `react-dom`, or
   reads a DOM global) does not: the `graph` gate fails with R3, "imports X (web-only) only to pass it as
   `<Handoff>` children". Then give the part its own component with a `.term` sibling that returns `Handoff`, or
   move the import and its JSX into a `.web.tsx` file with a `.web.term.tsx` neighbour.
2. `reason` and `what` come from the page's `strings.en.json`, as all Hub text does.

No shared file in the tree uses this form. It works in the terminal. The `hub/anatomy` lint rule may warn
"authored text in the what prop / reason prop, which the rule does not know": if you see that, the rule needs to
learn the two props.

### One control: the worked example

`MicButton` starts Talk on the web. A terminal has no microphone. Its sibling is the whole of
`src/kit/voice/MicButton.term.tsx`:

```tsx
import type * as Web from './MicButton';
import { Handoff } from '../states/Handoff';
import { Text } from '../../term/prim';
import { useStrings } from '../strings';
import strings from './Voice.strings.en.json';
import termStrings from './MicButton.term.strings.en.json';
export type { MicReason, MicButtonProps } from './MicButton';

export const MicButton: typeof Web.MicButton = ({ reason }) => {
  const t = useStrings(strings);
  const tt = useStrings(termStrings);
  if (reason && reason !== 'ownTab') return <Text colour="muted">{t('mic.label') + ': ' + t(`mic.why.${reason}`)}</Text>;
  return <Handoff size="line" what={tt('mic.term.what')} reason={tt('mic.term.reason')} />;
};
```

(The file also exports `useMicAction`; see the source.)

What to copy:

- Same exports as the web file, typed `typeof Web.Name`. The rules of any sibling apply ([porting.md](porting.md)).
- The reason and the name are strings in `MicButton.term.strings.en.json`, not literals.
- A state the web also shows (here a reason the page gave) is drawn as the web draws it. The hand-off replaces only
  what the terminal cannot do.
- The handler is never called. A hand-off must not half-run the feature.

The scenario file `src/kit/voice/MicButton.scenario.ts` then says so, for both platforms:

```ts
ignored: {
  onPress: 'terminal: Talk cannot start in a terminal (no audio device); the entry is a hand-off to the web, so the press is never run',
  busy: 'terminal: no press, so nothing is ever starting',
},
cases: [
  { name: 'web: a press starts Talk', only: { platform: 'web', why: '…' }, … },
  { name: 'terminal: hands off to the web, and a key press starts nothing', only: { platform: 'term', why: '…' },
    props: (s) => ({ onPress: s.fn('onPress') }),
    steps: [{ key: 'enter' }, { key: 'c' }],
    expect: { calls: { onPress: 0 }, nodes: [{ target: { text: /Talking needs a microphone/ } },
                                             { target: { role: 'button', name: 'Copy link' } }] } },
],
```

The terminal case proves three things: the handler is never called, the reason is on screen, and the copy key is
there. The `ignored` reasons are where a hand-off's reason is recorded for the gates. (The excerpt is shortened:
the real file builds the reason's pattern from the strings file.)

### A whole page

Two ways. Pick by whether the terminal has anything useful to show.

**Nothing to show: the manifest field.** In `src/pages/<id>/page.ts`, inside `definePage`:

```ts
handoff: { reason: 'term.handoffReason', what: 'term.handoffWhat' },
```

- Both values are keys of the page's `strings.en.json`. `what` is optional.
- `definePage` throws `bad handoff` when the reason, or a given `what`, is not a key with text. So an empty reason
  cannot be written.
- The web ignores the field.
- In the terminal the page's view is never loaded. The shell draws the page title and the `Handoff` block for the
  current route, with the same keys (`src/term/app/pageHandoff.tsx`).

No page sets the field yet, so this path is built and tested by its gate test, and not yet proven on a
real page. The page still appears in the terminal's navigation; nothing there marks it as handed off.

**Something to show: a sibling of the view part.** `src/pages/board/parts/BoardView.term.tsx` is the model. The
page's `page.ts` and `view.tsx` stay shared. The sibling replaces the part that needs browser frames. It lists the
realm's Boards and the open Board's tiles by name, because the terminal can do that, and puts one `Handoff` above
them. The route's `?add=…` is not acted on in the terminal and does not travel: the address opens `/board`.

## Checks that pass afterwards

Run from `hub/` with `NODE_ENV=test`:

```
bun scripts/term/scenarios.ts voice/MicButton
  ok   MicButton (src/kit/voice/MicButton.scenario.ts) term 2/3
  1 components, 3 cases, 0 failing, 6.0 s

bun scripts/term/contract.ts --explain MicButton
  info MicButton (src/kit/voice/MicButton.term.tsx)  scenario: src/kit/voice/MicButton.scenario.ts  read 1/3 props
       read: reason   unread: none   uncovered behavioural: none

bun scripts/term/scenarios.ts states/Handoff
  ok   Handoff (src/kit/states/Handoff.scenario.ts) term 2/3

bun test --preload ./scripts/term/test-preload.ts src/kit/states/Handoff.term.test.tsx
  10 pass, 0 fail

bun scripts/term/render.ts --page board --cols 80 --rows 24
  placeholder components drawn: none   page failures: none   settled: yes

bun scripts/term/graph.ts --check
```

The last one checks every `<Handoff>` in the tree (graph R6): a missing or empty literal reason, or a reason key
whose English text is empty, fails with the file and line.

`contract.ts --explain <Name>` prints every component and takes about 30 s; find your component's lines in it.

Then the page gate for each page that shows it: `bun scripts/term/check.ts --page <id>`. A hand-off is part of the
frame, so it is in the page's goldens like anything else.

## What the gates require of a hand-off

| Requirement | Enforced by | Enforced today |
|---|---|---|
| The sibling has the web file's exports and types. | `contract`, graph R2 | yes |
| Each web prop is read, or `ignored` with a reason. | `contract` | yes |
| A behavioural prop has a case or an `unsupported` reason. | `contract` | yes |
| The frame with the hand-off is reviewed. | `pages` (golden) | yes |
| A part wrapped in `Handoff` in a shared file loads in the terminal. | Graph R3. | yes |
| `reason` is given and not empty. | TypeScript: the prop is required; graph R6 fails a missing or empty literal reason and a key with empty English text. | yes, statically; a computed reason is not checked |
| The reason is shown to the person. | The component draws it in both sizes; `src/kit/states/Handoff.term.test.tsx`. | yes, for the component |
| The address opens the same route, with the place. | The same test file. Nothing per page. | yes, for the component |
| Open, copy and QR never fail silently. | The same test file (a refusal says so in words). | yes, for the component |
| A page imports `Handoff` from `@kit`. | Web lint `hub/page-boundaries`. | yes on the web side; no terminal gate runs lint |
| The reason and name are strings, not literals. | Nothing in the terminal gates. Every sibling in the tree passes strings today. | not enforced |
| The handler behind a handed-off control is never called. | A terminal-only scenario case, if you write one. | not enforced |
| A hand-off is on record. | Derived from the code (`scripts/term/graph/handoffs.ts`); `graph.ts --md` prints the names, pages and file count. `handoff-list.term.test.ts` fails if a hand list comes back. | yes |
| A whole-page hand-off has a reason with text. | `definePage` throws; graph R6 checks the key in the page's strings. | yes |

## Things that look like a mechanism and are not

- **The `handoff` class of a kit name** (kit gate, graph report) is a label derived from the code: a name whose
  sibling's own declaration draws `Handoff`, even for part of what it shows (`PathField`'s browse, the QR family with
  no room). It does not make anything draw a hand-off; the code does.
- **`openOutside(url)`** from `@kit` (`src/kit/states/openOutside.ts`) is for a link to another site (a guide, a
  payment page), not for a hand-off. It opens the address in the host's browser. Where the host cannot, it copies
  the address when it can and shows it whole in a toast. It is never silent. A Hub route is never passed to it.
- **`hostEnv().openExternal`** is what both `Handoff` and `openOutside` call underneath. Do not call it yourself: on
  a host that cannot open a browser it is absent and the call does nothing, with no message.
- **A soft-disabled control with a reason** (`useMicAction` returns `disabledReason`) tells the person why a
  control does nothing. It gives no address. Use it only beside a real `Handoff` for the same feature.

## Gaps

| Gap | Effect | Smallest fix |
|---|---|---|
| The web Hub does not read `?realm=` and `?computer=` from the address. | The browser opens the right route in its own last realm and computer. | Read both once at load on the web side. |
| `[o Open]` opens the plain address. | A hand-off does not arrive signed in: the person signs in on the web if the browser has no session. | None planned. |
| No fixture host gives a browser opener. | No golden shows the `[o Open]` key. Only `src/kit/states/Handoff.term.test.tsx` covers it. | Give the fixture mount an opener that records. |
| A reason computed at run time is not checked. | Graph R6 reads only literals and strings keys, so a computed reason could be empty. | Pass a strings key. A run-time check in the component would close it. |
| Nothing in the navigation marks a page handed off whole, and no page uses the field yet. | The person learns it only after opening the page. | None for now: the mark waits until a page sets the field. Board stays a section hand-off. |
