# Prims reference

A prim is an export of a file under `src/term/prim`. Prims are what siblings draw with. Nothing outside that
directory may use an OpenTUI tag or import an OpenTUI package.

`bun scripts/term/docs-check.ts` fails when an export of a prim file is missing from this page, or when this page
lists a name that no prim file exports.

## How to import

Kit and shell siblings have two ways. Both are in use. A page's terminal file has one (below the barrel list).

```ts
import { Box, Text, Pressable, FocusRoot, useKeys } from '../../term/prim';      // the barrel
import { Layer, useAnchor } from '../../term/prim/Overlay';                       // a file not in the barrel
```

The barrel (`src/term/prim/index.ts`) exports only these names:

<!-- barrel:start -->
`Box`, `Spacer`, `BoxProps`, `Text`, `Br`, `OneLine`, `useOneLine`, `useInText`, `TextProps`, `Scroll`, `ScrollProps`, `Pressable`,
`PressableProps`, `TextInput`, `TextInputProps`, `FocusRoot`, `FocusRegion`, `useFocusable`, `useFocusChange`, `useFocusControl`,
`useFocusedNode`, `useFocusWithin`, `useKeys`, `isPressKey`, `Key`, `KeyHandler`, `Focusable`, `FocusId`,
`FocusControl`, `useClipboard`, `captureCopy`, `CopyFn`, `CapturedCopy`, `SecretInput`, `describeSecret`, `SecretInputProps`, `cols`, `rows`,
`colour`, `colourTier`, `setColourTier`, `tierFromEnv`, `ground`, `themeMode`, `setThemeMode`, `themeFromEnv`,
`TONE_COLOUR`, `TONE_MARK`, `Colour`, `ColourTier`, `Gap`, `ThemeMode`, `Tone`, `Mark`, `markSizeFor`, `MARK_SIZE`,
`MarkProps`, `useBoxSize`, `useTerminalSize`, `usePaneSize`, `PaneSize`, `TermSize`, `PaneDims`, `PaneSizeProps`, `Sem`,
`Role`, `ScreenRoot`, `DefaultInk`, `useDefaultInk`, `useTerminalBlur`, `useTerminalFocus`
<!-- barrel:end -->

Everything else on this page is imported from its own file: `FieldInput` from `prim/FieldInput`, `Layer` from
`prim/Overlay`, `useListWindow` from `prim/ListWindow`, `ClipText` from `prim/TableClip`, the semantics queries
from `prim/semantics`, `drawTest` from `prim/testing`.

### What a page may import: `@term/prim`

A page's terminal file (`src/pages/**/*.term.*`) imports prims only as `import { Box, Text } from '@term/prim'`,
which is `src/term/prim/page.ts`: layout and text only. Deep and relative paths are lint errors there. Rules and
tests: [porting.md](porting.md), "A page sibling imports prims only as `@term/prim`". This is the one list of what
`page.ts` exports; the docs check fails when it differs from the file (rule `list`):

<!-- exports-of: src/term/prim/page.ts -->
`Box`, `Spacer`, `BoxProps`, `Text`, `Br`, `OneLine`, `useInText`, `TextProps`, `useBoxSize`, `TermSize`,
`cellWidth`, `clipCells`, `padCells`, `widestCells`, `FieldSwatch`, `dataColourAtTier`, `FieldSwatchProps`,
`REALM_HEX`, `realmHex`, `RealmColourName`
<!-- exports-of:end -->

## A first example

```tsx
import { useState } from 'react';
import { Box, Text, Spacer, Pressable, FocusRoot, useKeys, cols, TONE_COLOUR, TONE_MARK } from '../../term/prim';

function Counter() {
  const [n, setN] = useState(0);
  useKeys((k) => { if (k.name === 'r') { setN(0); return true; } return false; });
  return (
    <Box dir="column" gap={1} padX={1}>
      <Box dir="row" gap={cols(2)}>
        <Text bold>Schedules</Text>
        <Spacer />
        <Text colour={TONE_COLOUR.warn}>{TONE_MARK.warn} 2 failed</Text>
      </Box>
      <Pressable autoFocus onPress={() => setN(n + 1)} sem={{ name: 'Add' }}>
        <Text>[ Add ]</Text>
      </Pressable>
      <Text colour="muted" truncate>{`Pressed ${n} times`}</Text>
    </Box>
  );
}

// Hooks that use focus or keys must be called UNDER a FocusRoot, so the root wraps the component.
const app = <FocusRoot><Counter /></FocusRoot>;
```

Enter or Space on the focused `Pressable` adds one. `r` resets, because the `Pressable` did not take that key.

The app already mounts a `FocusRoot`. A sibling never adds one. Tests add their own.

## Layout: `Box.ts`, `Scroll.ts`, `ScreenRoot.ts`, `size.ts`

| Export | Purpose |
|---|---|
| `Box` | The layout container: a flexbox measured in cells. Column by default. Clips its children. |
| `BoxProps` | Props of `Box`: `dir`, `gap`, `gapX`, `gapY`, `padX`, `padY`, `pad`, `grow`, `shrink`, `basis`, sizes, `align`, `justify`, `alignSelf`, `wrap`, `border`, `borderColour`, `bg`, `title`, `clip`, `drops`, `absolute`, `z`, `hidden`, `onPress`, `onWheel`, `boxRef`, `raw`, `onSize`, `sem`. |
| `Spacer` | A `Box` with `grow={1}`: takes the room left in its row or column. |
| `layoutOf` | `BoxProps` to engine options. For prims only. |
| `pressHandlers` | The mouse press rule as engine handlers. For prims only. See [focus-keys.md](focus-keys.md). |
| `Scroll` | A `Box` whose content scrolls. `followFocus` keeps the focused thing in view. `stickBottom` follows new content. |
| `ScrollProps` | Props of `Scroll`. |
| `REVEAL_FRAME` | The flag (`hxRevealFrame`) that marks a box to bring into view whole when focus lands inside it. `FieldFrame` (`src/kit/forms/termField.tsx`) sets it, so a field's label, control and hint scroll in together. |
| `revealTarget` | `revealTarget(node, box)`: what a focus scroll brings into view. It is the nearest enclosing reveal frame when that frame fits the viewport, else the focused node. A field reached by Shift+Tab therefore shows its label, not only its control. `termScroll.tsx` measures the same target. Test: `src/term/test/focus-reveal-label.term.test.tsx`. |
| `ScreenRoot` | The one root box of a mount: exactly the terminal, clipping. The app mounts it. When the terminal loses the focus it drops the hover (`clearHover`). |
| `useBoxSize` | `[size, onSize]`: pass `onSize` to a `Box`, read its laid-out size. `size` is null before the first layout. |
| `useTerminalSize` | The terminal's `{ width, height }` in cells. Re-renders on resize. |
| `TermSize` | The type `useTerminalSize` returns. |
| `PaneSize` | A growing column `Box` that measures itself and tells its content its size. |
| `PaneSizeProps` | Props of `PaneSize` (`BoxProps` without `onSize`). |
| `usePaneSize` | `{ cols, rows, source }` of the nearest `PaneSize`, else of the terminal. |
| `PaneDims` | The type `usePaneSize` returns. |

```tsx
<Box dir="row" gap={2}>
  <Box width={24} shrink={0}><Text>fixed 24 cells</Text></Box>
  <Box grow={1} shrink={1}><Text truncate>takes the rest and cuts with an ellipsis</Text></Box>
</Box>
```

Defaults that differ from CSS: `dir` is `column`; `shrink` is 0 unless `grow` is set; `clip` is on.

## Text: `Text.ts`, `DefaultInk.ts`, `FocusInk.ts`, `FlatLine.ts`

| Export | Purpose |
|---|---|
| `Text` | One run of styled text. Inside another `Text` it is an inline span. Wraps by word unless `truncate`. With `truncate`, text that does not fit is cut at its end with one `…` cell, as the web's ellipsis does: plain text is cut to the box, styled children are clipped at the box edge with a `…` on each line that ran past it. Never the engine's middle `...`. |
| `TextProps` | Props of `Text`: `colour`, `bg`, `bold`, `dim`, `italic`, `underline`, `inverse`, `strike`, `truncate`, `width`, `grow`, `shrink`, `align`, `maxLines`, `href`, `sem`. |
| `Br` | A line break inside a `Text`. |
| `FlatLine` | Under it, every compat element that would stack its children in a column lays them on one line, with " · " between them. For a web card's two-line title that the terminal draws as a one-row list name (`kit/data/DataTable.term.tsx`). `off` ends it for a subtree. Not in the barrel: import it from `prim/FlatLine`. |
| `useFlatLine` | True under a `FlatLine`. |
| `useInText` | True under a `Text`: children there must be inline. |
| `OneLine` | Every root `Text` inside it that sets neither `truncate` nor `maxLines` is cut to one line with an end `…`, as a web table cell with `nowrap` and `text-overflow: ellipsis`. Kit tables wrap their cells in it. `truncate={false}` opts one `Text` out; `<OneLine off>` ends it for a subtree. |
| `useOneLine` | True under a `OneLine`. |
| `DefaultInk` | Sets the colour of every `Text` inside it that names none. |
| `useDefaultInk` | Reads that colour, or null. |
| `focusInk` | The text props of a focused control: `{ colour: 'bg', bg: 'focus' }`, or bold and underline in mono. |
| `focusMark` | Only the mono part of `focusInk` (bold and underline while focused), nothing on the colour tiers: for a control that keeps its own focus colours (the shell's blue chips). |
| `FocusInk` | The type `focusInk` returns. |
| `FocusInkCtx` | The context a focused `Pressable` gives the `Text`s inside it. |
| `useFocusInkCtx` | Reads that context, or null. |
| `setTextChildrenJoin` | Installs the separator rule for the direct children of a root `Text` (null removes it). Only the compat runtime (`jsx/dom.ts`) calls it, at load: prim knows no HTML tags. Page and kit code never call it. |

Raw HTML elements that a kit component puts straight into a `Text` keep the web's line breaks through
`setTextChildrenJoin`: a block child (a `div`, a `p`, or a `span` whose class makes it a block) gets a line of its
own. Home's quick-action tile hands its title and body spans to the kit `Link`, which draws one `Text`:

```tsx
<Link href="/bots"><span className={s.tileText}><span className={s.tileName}>New Bot</span><span className={s.tileBody}>Assistants…</span></span></Link>
// terminal: "New Bot" on one line, "Assistants that work on your …" under it (not "New BotAssistants…")
```

Inside the elements themselves, the compat runtime separates children as their layout does: one space in a flex row
or grid, a line break in a flex column. Tests: `src/term/test/run-together.term.test.tsx`.

`href` takes an `http` or `https` address without credentials. It becomes a terminal hyperlink where the terminal
has them. It is never opened by the Hub.

## Pressing and focus: `Pressable.ts`, `Hover.ts`, `focus.ts`, `terminalFocus.ts`

| Export | Purpose |
|---|---|
| `Pressable` | Something a click or Enter/Space activates. A Tab stop. Paints its own focus when its children are plain. |
| `PressableProps` | `BoxProps` plus `onPress`, `disabled`, `tabStop`, `onFocusChange`, `handle`, `onKey`, `autoFocus`, `focusPaint`, `hoverFill` (the box stands on the `hover` ground under the pointer, never while focused or disabled). `children` may be a function of `{ focused, hovered }`. |
| `useHover` | Whether the pointer is on this part, and the three handlers (move, out, over) for its `Box` `raw`. One part at a time; started only by a pointer move, never by a click or a wheel step; false for a part passed `off` (disabled) and off the truecolor tier. Under a pointer that does not move, a hovered part keeps its hover when one of its leaves changes, and a part that slides under the pointer takes it. `Pressable` uses it for a render-function child, which may draw the `hover` ground under itself and nothing else. |
| `Hover` | What `useHover` returns: `hovered`, `raw`. |
| `useHoverFill` | For a part that is a focusable `Box` of its own, not a `Pressable` (a tab, an entry of a section menu): the props to spread on that `Box`, the handlers and, while hovered and not focused, `bg: 'hover'` (never for a part passed `off`). |
| `clearHover` | No part is hovered. `ScreenRoot` calls it when the terminal loses the focus: a pointer that leaves the window sends nothing more. |
| `__resetHover` | Tests only: `clearHover`. |
| `FocusRoot` | A focus scope. `active={false}` makes it take no key and draw no focus. |
| `FocusRegion` | `order={n}`: a Tab region inside the scope. Tab and F6 go through regions by `order`, by drawn position only inside one. Draws nothing, lays nothing out; a `FocusRoot` inside it starts with no region. |
| `useFocusable` | Registers a focusable thing. Returns `Focusable`. For building a control that is not a `Pressable`. A thing under a hidden ancestor (`hidden`/`visible: false`, a size styled 0, or laid out at 0) never takes the focus (Tab, `auto`, `focus()`), and gives it to the nearest visible one (in its own region first, then reading order) when its ancestor is hidden while it holds it (checked after each frame). Test: `src/term/test/focus-hidden.term.test.tsx`. |
| `Focusable` | `{ focused, ref, focus(), blur() }`. Give `ref` to the `Box` that draws the thing. |
| `useKeys` | A shortcut handler: called for a key the focused thing did not take. Return true to stop the key. |
| `Key` | The engine's key event. `name` is `'return'`, `'escape'`, `'k'`, ...; with `ctrl`, `shift`, `meta`. |
| `KeyHandler` | `(k: Key) => boolean \| void`. True means taken. |
| `isPressKey` | True for Enter, Linefeed and Space. |
| `useFocusChange` | Calls back when a `focused` flag flips. |
| `useFocusControl` | Read and move the focus. Returns `FocusControl`. |
| `FocusControl` | `current()`, `restore(id)`, `moveFocus(±1)`, `moveRegion(±1)` (false with fewer than two regions), `focusFirst(within?, how?)` (`how` `'auto'`: no scroll to it, a layer's initial focus), `containsFocus(box)`, `blur()`, `inField()`. |
| `FocusId` | An opaque id from `current()`, for `restore`. |
| `useFocusWithin` | Calls back when the focus enters or leaves a box. |
| `useFocusedNode` | Calls back with the drawn node of whatever gets the focus. `Scroll` uses it. |
| `useTerminalBlur` | Calls back when the terminal window loses focus. A revealed secret masks itself on this. |
| `useTerminalFocus` | Calls back when the terminal window gets the focus back. |

Rules and the key order are in [focus-keys.md](focus-keys.md).

## Text entry: `TextInput.ts`, `FieldInput.ts`, `SecretInput.ts`, `Compose.ts`, `FieldPaste.ts`, `FieldSwatch.ts`, `Caret.ts`

| Export | Purpose |
|---|---|
| `TextInput` | The engine's one-line input with focus and semantics. The shell uses it. Kit fields use `FieldInput`. |
| `TextInputProps` | Props of `TextInput`. |
| `FieldInput` | The text-entry prim of kit fields: single line, multiline (`lines` > 1), masked (`mask`) or read-only. |
| `FieldInputProps` | `value`, `onChange`, `onSubmit`, `placeholder`, `width`, `grow`, `disabled`, `readOnly`, `autoFocus`, `mask`, `maxLength`, `lines`, `onKey`, `onFocusChange`, `handle`, `colour`, `sem`. |
| `FieldHandle` | `{ focus() }`: what a field's `handle` ref holds. |
| `SecretInput` | The secret-entry prim. One bullet per character. No copy. Wiped on unmount. |
| `SecretInputProps` | `FieldInput`'s entry props plus `wipeOn` and `keepOnUnmount`. `sem` may not carry a value. |
| `describeSecret` | `'[secret: set]'` or `'[secret: empty]'`: the only text form of a secret for logs. |
| `Compose` | The message editor of a chat: Enter sends, Alt+Enter or Ctrl+J is a new line. Grows with its lines. |
| `ComposeProps` | Props of `Compose`. |
| `ComposeHandle` | `focus`, `blur`, `insert`, `caret`, `setCaret`, `focused`. |
| `usePasteText` | Bracketed paste for a field drawn outside the engine's editors. |
| `FieldSwatch` | A block in a data colour (`#RRGGBB`), drawn at the current colour tier. Nothing in mono. |
| `FieldSwatchProps` | `value`, `cells`. |
| `dataHex` | A colour as `#rrggbb`, or null. |
| `dataColourAtTier` | What to draw a data colour with at the current tier, or undefined. |
| `REALM_HEX` | A realm colour name to its `#rrggbb` (`realmColour.ts`: the dark-theme `--hx-r-*` values of `src/kit/tokens.css`, pinned by `src/term/prim/realmColour.term.test.ts`). |
| `realmHex` | `REALM_HEX[colour]`, or undefined for no colour. |
| `RealmColourName` | The eight colour names, equal to the kit's display set (the test pins it). |

A realm colour is drawn as a `FieldSwatch` with `REALM_HEX[colour]` (or `realmHex(colour)`) beside the realm's name,
never the name or the swatch alone. All three come from `@term/prim` in a page.

`Caret.ts` is the pure editing model behind masked and read-only fields. You need it only to build a new kind of
field.

| Export | Purpose |
|---|---|
| `LineEdit` | `{ value, caret, anchor }`: a line being edited. |
| `CaretKey` | The parts of a key event the model reads. |
| `CaretAction` | A movement or deletion name (`'backspace'`, `'word-left'`, ...). |
| `edit` | Makes a `LineEdit` from a value. |
| `insert` | Inserts text at the caret. Drops line breaks and control characters. |
| `apply` | Applies a `CaretAction`. |
| `actionOf` | The action a key stands for, or null. |
| `printable` | The text a key types, or null. |
| `selection` | The selected range, or null. |
| `MUTATES` | The actions that change the value. A read-only field refuses them. |
| `History` | Undo and redo. |
| `boundaries` | Grapheme boundaries of a string. |
| `graphemes` | The graphemes of a string. |
| `cellWidth` | Cells a string takes. Wide characters count 2. Also exported by `TableCells.ts` with the same meaning. |
| `wordJump` | The offset a word jump lands on. |
| `scrollStart` | Which part of a long line to show so the caret stays in view. |
| `shownOf` | The drawn form of a value: itself, or bullets when masked. |

```tsx
import { SecretInput } from '../../term/prim';
import { FieldInput } from '../../term/prim/FieldInput';

<FieldInput value={name} onChange={setName} placeholder="Name" autoFocus sem={{ name: 'Name' }} />
<SecretInput value={pw} onChange={setPw} placeholder="Password" sem={{ name: 'Password' }} />
```

Typing `atlas`, Tab, `hunter2` draws this (real frame and semantics text):

```
atlas
•••••••

textbox "Name" ="atlas" {focus,type,setValue,clear}
textbox "Password" =<secret> focused {focus,type,setValue,clear}
```

More in [forms.md](forms.md).

## Layers: `Overlay.ts`

| Export | Purpose |
|---|---|
| `Layer` | A panel above the page. `kind` is `modal`, `popover` or `tip`. Mounted only while `open`. |
| `LayerProps` | `open`, `kind`, `place`, `onEscape`, `onOutside`, `frame`, `frameTitle`, `frameColour`, `bg`, `initialFocus`, `padX`, `onKeyFirst`, `sem`. |
| `LayerKind` | `'modal' \| 'popover' \| 'tip'`. |
| `Place` | Where the panel goes: `center`, `right`, `full`, `anchor` or `corner`. |
| `Placed` | The result of placement: `left`, `top`, `width`, `height`, `maxHeight`, `side`. |
| `placeLayer` | The pure placement function. Tests use it. |
| `Rect` | A screen rectangle in cells. |
| `rectOf` | The rectangle a drawn node was last laid out at. |
| `useAnchor` | `{ ref, rect }`: put `ref` on the `Box` around a trigger, pass `rect` as the layer's anchor. |
| `useLayer` | Inside a layer: `{ settled, width, height, tab }`. Null outside one. |
| `useLayerCount` | How many layers are open. |
| `useGlobalKey` | A key handler that runs before every layer and the page. |
| `OverlayHost` | Mounted once at the app root so the layer key gate is installed first. |
| `useEnteredKeys` | Keys for a surface that is always drawn but takes keys only while entered (the toast stack). |
| `Above` | A portal into the screen root for something that is not a layer. |
| `TOP_Z` | The z of things above every layer. |
| `opaqueRaw` | The `raw` fill that makes a surface opaque in every colour tier. |
| `isInside` | True when a node is a box or drawn inside it. |
| `centerWidth` | `centerWidth(width, cols)`: the width a centred panel is placed at. It is what the panel asks for, at most the terminal less 2 cells each side. Contents that size themselves (a modal, the `?` sheet's columns) take this, not the terminal's width. |

`Overlay.ts` also re-exports `useFocusWithin`. Usage is in [overlays.md](overlays.md).

## Long lists and cells: `ListWindow.ts`, `TableCells.ts`, `TableClip.ts`, `TableMark.ts`

| Export | Purpose |
|---|---|
| `useListWindow` | Scroll state for a long list: which items to draw so the cursor stays in view. |
| `ListWindow` | What it returns: `top`, `from`, `to`, `total`, `view`, `offsets`, `bar`, `scroll(by)`, `lineOf(i)`. |
| `ScrollThumb` | A one-cell scrollbar for a `ListWindow`. |
| `keepInView` | Pure: the first drawn line after a cursor move. |
| `scrollBy` | Pure: a clamped scroll. |
| `thumb` | Pure: the scrollbar thumb's start and size. |
| `lineOffsets` | Pure: prefix sums of item heights. |
| `windowOf` | Pure: the items drawn in a range of lines. |
| `ClipText` | One line that measures its own box and cuts itself by kind: at the end, the start, or keeping a path's tail. |
| `ClipTextProps` | `text`, `cut`, `colour`, `bold`, `grow`. |
| `ClipRow` | A one-line clipping box for element content (an icon, a name and a dim note) that may not fit its cell. It clips at the edge and draws one `…` at the end of what it lost, whether the words ran past the right edge or wrapped onto a line the cell does not show. The kit `DataTable` uses it for every element cell. Use it where `ClipText` cannot be used because the content is not one string. |
| `ClipRemeasure` | Context a part inside a `ClipRow` reads to ask the row to measure again, for a need that changes while no box of the row changes size (a tag that gives way learns its width only after the cell was measured without it). |
| `clipMarksOf` | Pure. Given a laid-out clipping box, where its `…` marks go: one per shown line that loses text. Empty when nothing is lost. Used by `ClipRow`; a test can call it directly. |
| `clipStateOf` | Pure. `clipMarksOf`'s marks plus `dropped` (a whole line below the box is cut off; `ClipRow` then keeps one cell for its mark) and `natural` (the cells the shown lines need from the box's left edge, plus the mark's cell when a line is dropped). The table reads `natural` as the column's wanted width. |
| `ClipMark` | One mark: `{ col, row }`, relative to the box. |
| `CellCut` | `'end' \| 'start' \| 'path' \| 'never'`. |
| `cutCells` | Fits a string to a width by its `CellCut`. |
| `clipCells` | Cuts at the end with `…`. Never splits a grapheme. |
| `clipStart` | Cuts at the start with `…`. |
| `clipPath` | Cuts a path keeping whole trailing segments. |
| `padCells` | Cuts and pads to an exact width. |
| `wrapCells` | Splits into lines at spaces. Never drops a character. |
| `widestCells` | The widest of some strings, in cells. |
| `cleanText` | A string without terminal control characters. |
| `oneLine` | The same, with tabs and line breaks folded to spaces. |
| `portableWidth` | Cells a string takes, counted as `Bun.stringWidth` counts them, for a runtime without Bun (the same bundle under Node). From `width.ts`; `TableCells.ts` and `Caret.ts` use it only when Bun is absent. |
| `TableMark` | Decoration that is not data (a cursor bar, a checkbox). Left out of a mouse selection. |
| `TableMarkProps` | `children`, `colour`, `bg`, `bold`, `width`. |

`width.ts` reads its table from `widths.gen.ts` (`ZERO`, `WIDE`, `PICTOGRAPHIC`, `JOINS`, `VS16_WIDE`, `SKIN_BASE`: ranges
of code points). The file is generated from Bun's own answers: run `bun scripts/term/widths.ts` after a Bun upgrade when
`src/term/prim/width.term.test.ts` says it is stale. Never edit it by hand.

Usage is in [lists-tables.md](lists-tables.md).

## Colour and spacing: `tokens.ts`

| Export | Purpose |
|---|---|
| `Colour` | A colour role. Grounds: `bg` (the page), `side` (the sidebar), `card` (bars, cards, what floats), `raised` (a tag's plate), `selected` (the current row), `hover` (under the part the pointer is on; truecolor only). Words: `ink`, `muted`, `faint`, `blueText`, `accText`, `ok`, `warn`, `danger`. Fills and the words on them: `acc` + `accInk` (the primary action, the current nav item), `blue` + `blueInk`, `danger` + `dangerInk`, `focus` + `bg`. Lines: `line`, `lineStrong`. The mark: `markPlate` + `markCut`. |
| `colour` | The value of a role at the current tier and theme. Undefined in mono. For prims and `raw` props. |
| `textColour` | The same for words and marks: `acc` named as a text colour is drawn as `accText` (yellow words cannot be read on a light ground). `Text` and `TableMark` use it. |
| `plainInk` | The colour of words that name none: `ink` in truecolor (the Hub paints the ground there), undefined otherwise (the terminal's own). |
| `ground` | A ground the Hub paints itself (`bg`, `side`): the role in truecolor, undefined in the other tiers (the terminal's own background stays). |
| `ThemeMode` | `'dark' \| 'light'`. |
| `themeMode` | The current theme. |
| `setThemeMode` | Sets it. The run does this once, before the first frame, from the terminal's own background (`src/term/app/run.ts`); a test renderer draws the theme that is set (dark). |
| `themeFromEnv` | The theme `COLORFGBG` names, or null. Asked only when the terminal did not answer for itself. |
| `ColourTier` | `'truecolor' \| 'ansi16' \| 'mono'`. |
| `colourTier` | The current tier. |
| `setColourTier` | Sets it. The mount does this. Tests do it to check mono. |
| `tierFromEnv` | The tier an environment asks for. See the table below. |
| `Tone` | `'neutral' \| 'ok' \| 'warn' \| 'danger' \| 'info'`. |
| `TONE_COLOUR` | The colour of each tone. |
| `TONE_MARK` | The mark of each tone: `·`, `✓`, `!`, `✗`, `i`. |
| `Gap` | A step of the web's spacing scale, 0 to 10. |
| `cols` | Columns between things side by side, for `--sp-n`. |
| `rows` | Rows between things stacked, for `--sp-n`. |
| `SP_PX` | `--sp-n` in pixels. |
| `SPACE` | The one spacing scale, px to cells. The CSS translator reads it too. |
| `spaceCells` | Spacing px to cells on one axis. |
| `TRUECOLOR` | Role values in the truecolor tier, per theme: `dark` from the dark block of `src/kit/tokens.css`, `light` from its `:root`. |
| `ANSI16` | Role values in the 16-colour tier, per theme: xterm's default palette values. |
| `TOKEN_OF` | The CSS custom property each colour stands for. The CSS table reads it. `tokens.contrast.term.test.ts` holds each value to `src/kit/tokens.css` in both themes, and every text/ground pair to 4.5:1. |

Adding or changing a role: put it in both themes of `TRUECOLOR` and `ANSI16`, and in `TEXT`, `GROUNDS` or `ON_FILL` of
`tokens.contrast.term.test.ts`, which fails on any pair under 4.5:1.

## The Hoody mark: `Mark.ts`

| Export | Purpose |
|---|---|
| `Mark` | The Hoody mark in cells: `size="sm"` (3 x 1, the top bar) or `"lg"` (14 x 7, the lock screen). Decoration: not in the semantics tree. Reads without colour. |
| `MarkProps` | `size`, `fit` (the room there is: `lg` falls back to `sm` when it does not fit). |
| `MARK_SIZE` | The box each size takes, in cells. |
| `markSizeFor` | The size that is drawn for a size asked for and a room. |
| `MARK_LG` | The large mark, row by row (full blocks and blanks). |
| `MARK_SM` | The small mark (three cells: a half block, a heavy bar, a heavy corner turning down). |

`tierFromEnv` decides in this order:

| Environment | Tier |
|---|---|
| If `NO_COLOR` is set and not empty, or `TERM=dumb` | `mono` |
| Else if `HUB_TERM_COLOUR` is `truecolor`, `ansi16` or `mono` | that value |
| Else if `COLORTERM` is `truecolor` or `24bit`, or `TERM` ends in `-direct` or `-truecolor` | `truecolor` |
| Else | `ansi16` |

`NO_COLOR` wins over `HUB_TERM_COLOUR`.

Spacing in cells (`cols(n)` / `rows(n)`):

| `--sp-n` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| px | 0 | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 |
| `cols` | 0 | 1 | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 | 5 |
| `rows` | 0 | 0 | 0 | 1 | 1 | 1 | 2 | 2 | 2 | 3 | 3 |

## Clipboard and safety: `clipboard.ts`, `safe.ts`

| Export | Purpose |
|---|---|
| `useClipboard` | `{ copy }` for a component. The copy goes through the terminal (OSC 52), at most 64 KiB, and never reads. It is bound to the renderer the component was drawn under: once that mount has ended it answers false and copies nothing. There is no global copy. Code with no component takes one with `captureCopy`. |
| `captureCopy` | The copy for code with no component (kit `copyWhenRead`), taken inside the press before any await: bound to the newest mounted host, it answers false once that mount has ended, never copying through a later one. Null when no host is mounted. |
| `CopyFn` | `(text) => boolean`. True when the terminal was asked. |
| `CapturedCopy` | What `captureCopy` returns: `copy`, and `screen`, that mount's secret-screen asking (asked at the write). |
| `ClipboardHost` | Makes the renderer the copy host. `FocusRoot` mounts it. |
| `safeText` | A string as it may be drawn: control characters replaced, invisible format characters removed. |
| `isSafeText` | True when `safeText` would change nothing. |
| `controlMark` | The visible mark that stands for a removed control character: its control picture (`␀` to `␟`, `␡`), else `\ufffd`. Used by `safeText` and `safeDiagnostic`. |
| `safeProp` | `safeText` for a prop value that may be a string. |
| `safeHostProp` | One engine prop made safe. For the host filter. |
| `TEXT_PROPS` | Engine props that hold drawn text. A new text-bearing prop on a prim must be added here. |
| `HOST_TEXT_FILTER` | The filter the React host calls for every string. |
| `safeLinkUrl` | The one link validator: a web URL, a Hub route, or null. |
| `MAX_LINK_URL` | The longest URL a link may carry: 2048. |
| `safeCopyText` | Text as it may be copied, or null when empty or too large. |
| `MAX_COPY_BYTES` | 64 * 1024. |
| `safeDiagnostic` | Any text made safe for a log or a report, cut to a length. |

Components never call `safeText`. The host does it for every string. Scripts that print page text call
`safeDiagnostic`.

## Semantics: `semantics.ts`, `semdom.ts`

| Export | Purpose |
|---|---|
| `Sem` | What a component says about itself: `role`, `name`, `id`, states, relations. The `sem` prop of prims. |
| `Role` | The role names (ARIA's). |
| `SemImplicit` | What a prim knows without being told (its default role, live state). |
| `SemNode` | A node of the tree: `ref`, `role`, `name`, `value`, `states`, `actions`, `box`, `children`. |
| `SemStates` | The states of a node. |
| `SemAction` | `'focus' \| 'press' \| 'click' \| 'type' \| 'setValue' \| 'clear' \| 'scroll' \| 'dismiss'`. |
| `useSem` | Registers a node's semantics. For prims. |
| `registerSem` | The same without a hook. For prims. |
| `registerInlineIdText` | Registers the text of an inline element that has an id. For the compat runtime. |
| `mergeRefs` | Merges React refs. |
| `textOf` | The plain text of React children. Use it for `sem.name` when you draw decoration around a label. |
| `semanticsOf` | The tree of a live renderer. |
| `SemRoot` | What `semanticsOf` takes: `{ root, stdin }`. |
| `InputSink` | The type of `stdin` there. |
| `semText` | The tree as text, one line per node. |
| `semJson` | The tree as JSON. |
| `RoleQuery` | Options of the role queries: `name`, states, `nth`. |
| `getByRole` | Exactly one node by role. Throws otherwise. |
| `queryByRole` | One node or null. |
| `getAllByRole` | One or more nodes. |
| `queryAllByRole` | Zero or more nodes. |
| `getByText` | One node by its text. |
| `queryAllByText` | Zero or more nodes by text. |
| `getByRef` | One node by its `ref` (`#id` or `role "name"~n`). |
| `within` | The children of a node, to query inside it. |
| `focusedNode` | The node that has the focus, or null. |
| `act` | Performs an action on a node through the real input path. |
| `sendKeys` | Writes named keys to the renderer's input. |
| `sendText` | Writes text to the renderer's input. |
| `keyBytes` | The bytes a named key sends. |
| `SemQueryError` | Thrown by a query that finds the wrong number of nodes. |
| `SemActionError` | Thrown by `act` on a node that does not offer the action. |
| `semOfDom` | The semantics of a raw HTML element. For the compat runtime. |
| `SemOnly` | A meaning that draws nothing (an `<img alt>`). |

The tree, its text form and the queries are explained in [semantics.md](semantics.md).

## QR codes: `Qr.ts`

| Export | Purpose |
|---|---|
| `Qr` | Draws a QR code with half-block characters. Never shrinks or wraps. |
| `QrProps` | `modules`, `quiet`. |
| `QrModules` | A code's modules: `size` and `dark(row, col)`. |
| `QR_QUIET` | Modules of quiet zone on every side: 4. |
| `qrCells` | The cells a code takes. |
| `qrRows` | The code as lines of text. |

## Layout checks: `layoutcheck.ts`

Used by the page gate and by `render.ts --layout`.

| Export | Purpose |
|---|---|
| `layoutFaults` | Every layout fault under a root at a terminal size. |
| `LayoutFault` | `{ kind, path, detail }`. Kinds: `overdraw`, `cut`, `text-cut`, `offscreen`, `popup-clipped`, `explosion`, `scrolled-open`. |
| `clippedAbsolute` | Why an absolutely placed box is cut, or null. |
| `scrolledBoxes` | Scroll boxes that are not at their top. |
| `topBarFault` | Null when the shell's top bar is laid out in flow at row 0, the full terminal width and one row tall; else what is wrong. Read from the layout, not the frame text, so a modal drawn over row 0 does not fail it. Test: `src/term/test/topbar-gate.term.test.tsx`. |
| `TOP_BAR_ID` | The top bar's box id (`hub-shell-topbar`), the same value as the shell's own constant; the test above checks they match. |

## The page's own table: `TableHome.ts`

| Export | Purpose |
|---|---|
| `TableHome` | Marks what it holds as the page-wide table area (one per page; for a layout such as the kit `TablePage`). The table inside takes the first focus even when the page body scrolls. |
| `useTableHome` | True inside a `TableHome`. The kit `DataTable` reads it. |

## Table checks: `TableCheck.ts`

Written for the page gate, beside the layout checks. The kit `DataTable` marks its nodes. A porter does not call
these. The page gate (`scripts/term/goldens.ts`) runs `tableFaults` on every frame it draws, through
`scripts/term/table-gate.ts`; a page lists the faults it accepts under `tableFaults` in its `term-golden/allowance.json`
(the list only shrinks). `src/kit/data/TableCheck.term.test.tsx` and `src/kit/data/DataTable.term.test.tsx` call it too.

| Export | Purpose |
|---|---|
| `tableFaults` | Every table fault under a root at a terminal size. |
| `TableFault` | `{ kind, path, detail }`. The six kinds are in the table below. |
| `tableMark` | A ref that marks a box as a table, a header cell, a body cell or the action column. |
| `TableRole` | `'table' \| 'head' \| 'cell' \| 'actions'`. |
| `TableMarkInfo` | `{ role, col }`: what a mark records. |

| Fault kind | Means |
|---|---|
| `table-misaligned` | A body cell does not start where its column's header does, or is not as wide. |
| `table-actions-clipped` | The action column reaches past what its table or the screen shows: an action is out of reach. |
| `table-ellipsis` | A cell text with `...` (three dots), or words cut with a `…` that is not their last character. One token with a `…` inside is an id shortened on purpose and is fine. |
| `table-wrap-cut` | A cell text wraps onto more lines than its cell, or a clipping box around it, shows. Its words end at a word break with no mark. A cell text is one line, cut with `…`. |
| `table-cut-unmarked` | A cell text is laid out wider than its cell or the screen shows, so its end is clipped with no `…`. |
| `table-no-gap` | Two cells of one row whose drawn words touch: no blank cell between the end of one cell's text and the start of the next. A cell keeps the column gap. |

`table-wrap-cut` and `table-cut-unmarked` do not fire under a box that draws its own `…` over the loss (`ClipRow`). The rule behind all of them:
a cut is always one `…` at its end.

## The engine seam: `otui.ts`

For prims only.

| Export | Purpose |
|---|---|
| `el` | Creates an engine element by tag. The only place a tag name is written. |
| `createCliRenderer` | Re-export from `@opentui/core`. |
| `createRoot` | Re-export from `@opentui/react`. |
| `useKeyboard` | Re-export. `FocusRoot` is the only caller. |
| `useRenderer` | Re-export. |
| `useTerminalDimensions` | Re-export. Components use `useTerminalSize` instead: it shares one listener. |
| `TextAttributes` | Re-export. |
| `CliRenderer` | Type re-export. |
| `KeyEvent` | Type re-export. `Key` is this type. |
| `MouseEvent` | Type re-export. |
| `BoxRenderable` | Type re-export. The type of a `boxRef`. |
| `ScrollBoxRenderable` | Type re-export. The type of a `scrollRef`. |
| `ScrollBoxClass` | The engine's scroll box class, also re-exported by `engine.ts`. Tell a scroll box by `instanceof ScrollBoxClass`, never by `constructor.name`: names are minified in the ship bundle. |

Importing `otui.ts` installs the host text filter. Without it the host refuses to draw (`TERM_UNSAFE_OUTPUT`).

## Centring, measuring and search presence: `centre.ts`, `measuring.ts`, `searchPresence.ts`

| Export | Purpose |
|---|---|
| `centreUp` | `centreUp(kids, content)`: the paint offset (0 or -1) for each kid of a row that centres its children. When a kid's centring leaves an odd number of rows, the engine puts the half row above it; this moves that kid one row up, so it sits on its line's first row. Pure. |
| `CentreKid` | The fields of a row's child that the centring pass reads. |
| `CentreRow` | The fields of a row that the centring pass reads and hooks. |
| `attachCentreUp` | `attachCentreUp(row, padTop, padBottom)`: runs the centring pass on each layout of `row`. Returns the unhook. |
| `useCentreUp` | `useCentreUp(node, on, padTop, padBottom)`: `attachCentreUp` while mounted and `on`. `padTop`/`padBottom` are the row's own padding plus border, in rows. |
| `MEASURE_DEBT_MAX_MS` | 2000. A measurement not committed within this time stops counting, so a component that never commits again cannot hold a settle forever. |
| `measurementsPending` | How many measurements were reported by the engine and not yet committed by React. Every settle waits for 0, so no golden, scenario or test records a frame drawn at the old size. |
| `oweMeasurement` | A component now owes a commit of a reported size. Returns the debt's id. |
| `paidMeasurement` | `paidMeasurement(id)`: that commit happened, or the component unmounted. |
| `__measuringSeams` | Tests only: `setClock(f)` sets the clock debts are aged on (null restores it). |
| `searchFieldMounted` | A search field is on screen until the returned function runs (call it from an effect, return the result as its cleanup). The kit's search field calls it. |
| `useSearchFieldPresent` | True while at least one search field is mounted. The `?` sheet and the key lists leave out the `/` row while it is false. |

## Tests: `testing.ts`

| Export | Purpose |
|---|---|
| `drawTest` | Draws a node headless at a size. Returns a `TestTerm`. |
| `TestTerm` | The engine's test renderer plus `settle()`. Has `mockInput`, `mockMouse`, `captureCharFrame()`, `resize()`, `renderer`. |
| `testRender` | The engine's own test renderer. `drawTest` wraps it. |
| `copiesOf` | Records what a test renderer is asked to copy. Call before the copy. |
| `inputHeld` | `inputHeld(renderer)`: true while the renderer's input parser holds bytes (a lone ESC waits there for the parser's timeout before it becomes Escape). A settle waits for it to be false. |

```tsx
const t = await drawTest(<FocusRoot><Counter /></FocusRoot>, { width: 40, height: 8 });
t.mockInput.pressEnter();
expect(await t.settle()).toContain('Pressed 1 times');
t.renderer.destroy();
```
