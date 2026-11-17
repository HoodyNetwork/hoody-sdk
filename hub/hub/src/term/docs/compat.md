# The compat runtime and class styles

Shared code is full of raw HTML: `<div className={s.row}>`, `<button onClick>`, `<input>`. The terminal does not
port each such file. The compat runtime draws raw HTML with prims, and the CSS translator turns class names into
terminal styles. The result is an approximation. A sibling replaces it where the approximation is not good enough.

You need this page when a file without a sibling draws wrongly and you must decide: fix it through the runtime, or
port it.

## How raw HTML reaches a prim

1. The resolver points every JSX import at `src/term/jsx/jsx-runtime.ts`, except inside `src/term/jsx` and
   `src/term/prim`.
2. A component type is passed through unchanged. A string tag (`'div'`) goes to `src/term/jsx/dom.ts`.
3. `src/term/jsx/tags.ts` is the tag table. Each tag has a kind:

| Kind | Tags such as | Drawn as |
|---|---|---|
| `block` | `div`, `section`, `form`, `ul`, `li`, `table` | A column `Box`. |
| `inline` | `span`, `b`, `em`, `code`, `a` | A `Text` span. |
| `para` | `p`, `h1`-`h6`, `pre`, `dt`, `dd` | A text block. Headings are bold. |
| `row` | `tr`, `menu` | A row `Box`. |
| `cell` | `td`, `th` | A cell in a row. |
| `press` | `button`, `summary` | A `Pressable`. |
| `field` | `input`, `textarea` | A `FieldInput`. A password input is a `SecretInput`. |
| `select` | `select` | A control that steps through its options. |
| `br` | `br` | A line break. |
| `rule` | `hr` | A divider line. |
| `nothing` | `svg` and its children, `img`, `canvas`, `iframe`, `video`, `style`, `script` | Nothing. An `img alt` keeps its meaning in the semantics tree. |

The table in the source is the authority. An unknown tag draws as a block and is counted.

## What works

- **Events**: `onClick` (with x and y), `onKeyDown`, `onKeyUp` (DOM `key` names), `onChange`, `onInput`
  (`target.value`, `target.checked`), `onFocus`, `onBlur`, `onSubmit`, `onToggle`. `preventDefault` and
  `stopPropagation` work. Keys bubble. The list is `SUPPORTED_EVENTS` in `src/term/jsx/dom.ts`.
- **Forms**: `input` and `textarea` edit. Checkboxes and radios toggle. `label htmlFor` forwards focus. Enter in a
  field submits the enclosing `form`. `details` and `summary` open and close.
- **Clickable non-buttons**: a `div` or `span` with `onClick`, a `role` or a `tabIndex` is a tab stop pressed by
  Enter and Space.
- **Links**: `a href="/x"` navigates inside the Hub. A web link becomes a terminal hyperlink.
- **Lists and tables**: unstyled `ul` and `ol` mark items `•` and `1.`. `th` is bold with a divider.
- **Semantics**: `role`, `aria-*`, `alt`, `title` and labels become the node's semantics.
- **Inert states**: disabled and read-only fields take no focus, edit, paste or callback.
- **Text runs**: a component between pieces of text (`Hello <Name/>!`) stays on that line.

## Element refs

A `ref` on a raw tag gets an object that answers a subset of the DOM element (`src/term/jsx/element.ts`):

- `focus`, `blur`, `click`, `scrollIntoView`;
- `getBoundingClientRect` and the client and offset sizes, as cells × 8 px wide and × 16 px tall;
- attributes: get, set, has, remove, toggle. Writes re-render. Writing `class`, `style` or an `on*` attribute is
  refused;
- `dataset`, `tagName`, `id`, `value`, `checked`, `disabled`, `hidden`, `contains`;
- the element tree: `parentElement`, `children`, siblings;
- `matches`, `closest`, `querySelector`, `querySelectorAll` on a selector subset: tag, `#id`, `.class`,
  `[attr op value]`, `:not`, `:scope`, descendant and child. Another selector throws `TERM_DOM_SELECTOR`.

Any other member throws `TERM_DOM_MEMBER: <tag>.<member>` and is counted. The page gate reports it as
`new-domRefused`. The fix is to port the caller, not to widen the element.

## What does not work

| Thing | What happens | What to do |
|---|---|---|
| An event outside `SUPPORTED_EVENTS` (`onMouseEnter`, `onPointerDown`, `onScroll`, drag events) | Ignored and counted. Page gate: `new-domUnsupported`. | Port the component. |
| `dangerouslySetInnerHTML` | Draws nothing. Counted. | Port it. |
| A DOM global (`window`, `document`, `localStorage`, `matchMedia`) | The read throws `TERM_GLOBAL` and is recorded, and the mount ends as a crash. This holds in the ship build, in every terminal test, in `dev.ts` and in the page gate (`new-traps`). The one way out is `dev.ts --lax-globals`, which prints a banner and exits 3. | Go through `hostEnv()` (`src/core/host-env.ts`) or a `.web.ts` split. |
| A browser-only package (`react-aria-components`) | The importing file becomes a stand-in. | Port the file. |
| Hover | No hover state in class styles: a `:hover` rule is dropped. (Terminal parts draw their own hover ground through `useHover`, see `prims.md`.) | Show the thing always, or on focus. |
| CSS animation, transition, transform | Dropped. | Nothing. Motion is off in a terminal. |

## Class styles

`scripts/term/css-translate.ts` and `scripts/term/css-translate/` turn each CSS module into table entries.
`scripts/term/style-table.ts` builds the table, caches it in `.term-cache/` and installs it.
`src/term/jsx/css-table.ts` resolves the style of each raw element from the table.

### Units

| CSS | Terminal |
|---|---|
| A length across | px / 8 columns |
| A length down | 1 row below 64 px, else px / 16 rows |
| Gap, padding, margin | The spacing scale: see `cols` and `rows` in [prims.md](prims.md) |
| `ch` | 1 column |
| `rem` | 16 px |
| `%` | Kept |
| `vh`, `dvh`, `svh`, `lvh` in a height (`height`, `min-height`, `max-height`, `block-size`; inside calc with lengths) | The rows of the region the page is mounted in (the nearest `PaneSize`: the shell's content pane, a drawer body), at run time; it never grows with the content. The translator writes `<n>vh±<rows>`, `jsx/dom.ts` (`resolveVh`) resolves it. Test: `src/term/test/viewport-height.term.test.tsx` |
| `vw`, `vh` on a width or mixed with `%`, container units | Not expressible |

### Media and container queries

Conditions are judged in real px: one cell is 8 px wide (`CELL_PX` in `scripts/term/style-table.ts`). `@media` width
conditions use the terminal's columns; `@container` width conditions use the page pane's columns (the shell's pane
box: the sidebar, an open Agent dock and a split take columns from it).

The runtime keeps one table per band. A band is the range between two neighbouring breakpoints found in the
stylesheets (`scripts/term/css-translate/breakpoints.ts`); its key names the lower px edge of the media band and of
the container band, with `e` when the width sits exactly on an edge: `m768c600`, `m600c640e`. A resize, the dock
opening or closing and the sidebar re-select the band (`setStyleWidth`, `setStylePane` in `src/term/jsx/style.ts`).
A band entered for the first time is translated then (only the modules whose own conditions or read globals changed)
and cached on disk. A page's terminal part that must follow a container condition asks the kit: `useContainerNarrow(px)` from `@kit`
(`src/pages/guide/parts/IndexList.term.tsx`, the Guide's index strip under 760 px).
Tests: `scripts/term/css-translate/breakpoints.term.test.ts`, `src/term/jsx/style.bands.term.test.ts`,
`src/term/test/style-bands.term.test.tsx`.

The shipped bundle draws by the same bands: the build translates every band a terminal of 1 to 480 columns can reach
(`everyBand`, `scripts/term/style-table.ts`) and packs them per module, one set of entries per band of that module
(`scripts/term/build/style-pack.ts`); the bundle rebuilds a band's table when a terminal first has that size.
Tests: `scripts/term/build/style-pack.term.test.ts`.

### What is translated

Flex direction, wrap, grow, shrink, basis, alignment; gaps and padding; width, height and their min and max; grid
tracks (items share a row and wrap in chunks past the track count); `display: none` and `display: contents`; text
align, weight, italic, `text-transform`; truncation (`text-overflow: ellipsis`) and line clamp; colours that are
tokens; `overflow: auto` on a box with a bounded height (it becomes a `Scroll` that follows focus); `position:
sticky` with a `top` or `bottom` inset (`src/term/jsx/sticky.ts`: the box is laid out in place, then held at its inset
inside the nearest scroll's viewport and never outside its own parent; a focused control is kept clear of it, see
[focus-keys.md](focus-keys.md)). Test: `src/term/test/pageflow.term.test.tsx`.

The cascade handles: base class rules; variants on attributes, `:not`, `:first-child`, `:last-child`, `nth`,
`:disabled`, `:checked`, `:empty`; ancestor conditions with descendant and child combinators; child rules (`> *`).
Equal specificity resolves by source order.

`:empty` holds as on the web, also when an element's children are components: the element is empty while they draw
nothing, matches again when they stop, and stops matching as soon as one draws (`src/term/jsx/dom.ts`,
`contentUnknown` and `watchEmpty`). So `.note:empty { display: none }` around a banner that renders `null` takes no
row. Test: `src/term/test/empty-pseudo.term.test.tsx`.

`::before` and `::after` are drawn when they carry text. A rule whose selector ends in one of them is kept as a rule
for that element's generated box (`scripts/term/css-translate/selectors.ts`, `pseudo.ts`, `module.ts`), with the same
conditions as any other rule (attributes, `:not`, position, ancestors, `.list li::before`). `content` may be strings;
`'·' / ''` draws the part before the slash; `none` removes the box. `src/term/jsx/dom.ts` puts the
box first or last among the element's children, so it joins the text run in inline flow or is an item in a flex row
or grid. It is no sibling for `:first-child`, `:nth-child` or list numbers.

| Generated box | Drawn |
|---|---|
| Text in flow (`content: '• '`, `"·"`) | Yes, in the rule's colour and weight. |
| Empty, in flow, with a size (`flex-basis: 100%; height: 0`, a spacer) | Yes, as an empty box of that size (it draws nothing itself). |
| Empty, in flow, no size | No. |
| `position: absolute`, empty or text (a hit area, a 1-2px bar, a dot, a sweep, a mark in the padding) | No. One cell would cover content. `styleLedger().pseudoSkipped` names the rule. Draw it in a sibling if it carries meaning. |
| `attr()`, `counter()`, `url()`, quotes | No. The rule is dropped, reason `pseudo-content` in the report. |
| Under `:hover`, `:focus`, `:has()` | No, as any rule under those. |
| On an `input`, `textarea`, `select`, `hr` | No, as on the web. |

A generated box's declarations never make its class `partial`: they place the box, not the class.
Tests: `scripts/term/css-translate/pseudo.term.test.ts`, `src/term/test/pseudo-elements.term.test.tsx`.

### Borders

A border is expensive in cells, so most vanish:

| CSS border on | Drawn |
|---|---|
| `table`, `fieldset`, `dialog`, or `role="dialog"` | A frame. |
| `header`, `thead`, `th`, or `role="separator"`, top or bottom | A divider line. |
| Anything, left or right | A rule. |
| Anything else | Nothing. Padding and gaps still separate. |

### What is not translated

A class the translator cannot express is still drawn as a readable block. It is recorded as `partial` or
`untranslatable`. `render.ts` prints the counts:

```
class styles: 0 partial, 0 untranslatable, 0 colour tokens without a role
```

The page gate fails when a page's `untranslatable` count grows.

Lossy on purpose: `opacity` of 0.05 or less and `visibility: hidden` hide the element and do not keep its space.

`scripts/term/css-translate.ts` has a command line (`--src`, `--out`, `--report`, `--width`).

## Fix through the runtime, or port?

Port (write a sibling) when:

- the component is a kit component. Kit components are drawn many times and deserve an exact terminal form;
- it needs hover, drag, measurement of text, or an event the runtime does not have;
- it has a layout fault that comes from the shape of its HTML;
- it shows or takes a secret.

Leave it to the runtime when it is page-level markup that reads correctly at 80x24 and 120x40 with no layout fault.

Change the runtime itself only for a rule that is wrong for every user of a tag or a CSS property. Change
`src/term/jsx` or `scripts/term/css-translate` only with a test for every tag it affects.

## Tests

`src/term/test/tags.term.test.tsx` draws every row of the tag table. `src/term/test/compat.term.test.tsx` and
`src/term/test/interaction.term.test.tsx` hold the event and form rules.
